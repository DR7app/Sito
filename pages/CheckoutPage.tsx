import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { useCarrello } from '../hooks/useCarrello';
import { useTranslation } from '../hooks/useTranslation';
import { getUserCreditBalance } from '../utils/creditWallet';
import {
  carrelloPagabileACredito,
  etichettaTipo,
  euro,
  nuovoOrdineCarrello,
  ordineFiglio,
  type ArticoloCarrello,
} from '../utils/carrello';
import {
  FUNCTIONS_BASE,
  pagaArticoloACredito,
  preparaArticoloCarta,
} from '../utils/carrelloCheckout';

/**
 * Pagamento del carrello.
 *
 * Un ordine solo per il cliente, un ordine figlio per ogni servizio dentro.
 * A cambiare fra un lavaggio e un noleggio non e' il modo di comprare: e'
 * quello che succede dopo il pagamento, e quello resta dove e' sempre stato
 * (nexi-callback per la carta, la RPC del wallet per il credito).
 */

/** Se in ordine c'e' un abbonamento la carta va tokenizzata per i rinnovi. */
function tipoRicorrenza(articoli: ArticoloCarrello[]): { recurringType?: string; billingCycle?: string } {
  const abbonamento = articoli.find(a => a.tipo === 'club' || a.tipo === 'membership');
  if (abbonamento) {
    const d = abbonamento.dati as Record<string, Record<string, unknown> | undefined>;
    const ciclo = (d.subscription?.plan || d.purchase?.billing_cycle || 'annual') as string;
    return { recurringType: 'MIT_SCHEDULED', billingCycle: ciclo === 'monthly' ? 'monthly' : 'annual' };
  }
  // Ricarica wallet e tour tokenizzano la carta per gli addebiti successivi,
  // come fanno gia' oggi dalle loro pagine.
  if (articoli.some(a => a.tipo === 'wallet' || a.tipo === 'tour')) {
    return { recurringType: 'MIT_UNSCHEDULED' };
  }
  return {};
}

const CheckoutPage: React.FC = () => {
  const { t, lang } = useTranslation();
  const navigate = useNavigate();
  const { user, loading: caricamentoUtente } = useAuth();
  const { articoli, totaleCents, svuota, rimuovi, caricamento } = useCarrello();

  const [metodo, setMetodo] = useState<'nexi' | 'credit'>('nexi');
  const [saldo, setSaldo] = useState<number | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [passo, setPasso] = useState<string>('');

  const pagabileACredito = useMemo(() => carrelloPagabileACredito(articoli), [articoli]);
  const creditoBastante = saldo != null && saldo * 100 >= totaleCents;

  useEffect(() => {
    if (!user?.id) return;
    getUserCreditBalance(user.id).then(setSaldo).catch(() => setSaldo(null));
  }, [user?.id]);

  useEffect(() => {
    if (!pagabileACredito && metodo === 'credit') setMetodo('nexi');
  }, [pagabileACredito, metodo]);

  /** Disfa quello che il tentativo appena fallito aveva gia' scritto. */
  const annullaPreparazione = async (ordini: string[]) => {
    if (ordini.length === 0) return;
    await Promise.all([
      supabase.from('pending_nexi_bookings').delete().in('nexi_order_id', ordini),
      supabase.from('bookings').delete().in('nexi_order_id', ordini),
      supabase.from('credit_wallet_purchases').delete().in('nexi_order_id', ordini),
      supabase.from('dr7_club_subscriptions').delete().in('nexi_order_id', ordini),
      supabase.from('membership_purchases').delete().in('nexi_order_id', ordini),
    ]).catch(e => console.error('[checkout] pulizia tentativo fallito:', e));
  };

  const pagaConCarta = async () => {
    const ordinePadre = nuovoOrdineCarrello();
    const figli = articoli.map((a, i) => ({
      ordine: ordineFiglio(ordinePadre, i),
      // Serve al callback per togliere dal carrello SOLO quello che e' stato
      // pagato, lasciando li' quello aggiunto mentre pagava.
      articolo_id: a.id,
      tipo: a.tipo,
      titolo: a.titolo,
      prezzo_cents: a.prezzoCents,
    }));

    const { error: erroreOrdine } = await supabase.from('ordini_carrello').insert({
      nexi_order_id: ordinePadre,
      user_id: user!.id,
      totale_cents: totaleCents,
      metodo: 'nexi',
      articoli: figli,
      stato: 'in_attesa',
    });
    if (erroreOrdine) throw new Error(erroreOrdine.message);

    const preparati: string[] = [];
    for (let i = 0; i < articoli.length; i++) {
      const articolo = articoli[i];
      setPasso(t({ it: 'Preparazione', en: 'Preparing' }) + ` ${i + 1}/${articoli.length}: ${articolo.titolo}`);
      const esito = await preparaArticoloCarta(articolo, figli[i].ordine, ordinePadre, user!.id);
      if (!esito.ok) {
        await annullaPreparazione(preparati);
        await supabase.from('ordini_carrello').update({ stato: 'fallito' }).eq('nexi_order_id', ordinePadre);
        throw new Error(`${articolo.titolo}: ${esito.errore}`);
      }
      preparati.push(figli[i].ordine);
    }

    setPasso(t({ it: 'Apertura del pagamento…', en: 'Opening payment…' }));
    const risposta = await fetch(`${FUNCTIONS_BASE}/.netlify/functions/create-nexi-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: ordinePadre,
        amount: totaleCents,
        currency: 'EUR',
        description: articoli.length === 1
          ? articoli[0].titolo
          : `DR7 — ${articoli.length} ${lang === 'it' ? 'servizi' : 'services'}`,
        customerEmail: user?.email || '',
        customerName: user?.fullName || '',
        ...tipoRicorrenza(articoli),
      }),
    });
    const dati = await risposta.json();
    if (!risposta.ok || !dati?.paymentUrl) {
      await annullaPreparazione(preparati);
      await supabase.from('ordini_carrello').update({ stato: 'fallito' }).eq('nexi_order_id', ordinePadre);
      throw new Error(dati?.error || t({ it: 'Link di pagamento non ricevuto.', en: 'No payment link received.' }));
    }

    try {
      sessionStorage.setItem('dr7_pending_order', ordinePadre);
      sessionStorage.setItem('dr7_pending_type', 'carrello');
    } catch { /* browser senza memoria di sessione */ }
    window.location.href = dati.paymentUrl;
  };

  const pagaCredito = async () => {
    const falliti: string[] = [];
    for (let i = 0; i < articoli.length; i++) {
      const articolo = articoli[i];
      setPasso(`${i + 1}/${articoli.length}: ${articolo.titolo}`);
      const esito = await pagaArticoloACredito(articolo, user!.id);
      if (esito.ok) {
        await rimuovi(articolo.id);
      } else {
        falliti.push(`${articolo.titolo}: ${esito.errore}`);
      }
    }
    if (falliti.length > 0) {
      // Quello che e' passato e' gia' uscito dal carrello: resta solo il resto.
      throw new Error(falliti.join(' — '));
    }
    navigate('/booking-success', { state: { carrello: true } });
  };

  const paga = async () => {
    if (inCorso) return;
    setErrore(null);
    setInCorso(true);
    try {
      if (metodo === 'credit') await pagaCredito();
      else await pagaConCarta();
    } catch (e) {
      setErrore((e as Error).message);
      setInCorso(false);
      setPasso('');
    }
  };

  if (caricamentoUtente || caricamento) {
    return (
      <div className="min-h-screen bg-black pt-32 pb-16 px-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-black pt-32 pb-16 px-6">
        <div className="container mx-auto max-w-xl bg-gray-900 border border-gray-800 p-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-3">{t({ it: 'Accesso richiesto', en: 'Sign in required' })}</h1>
          <p className="text-gray-400 mb-8">
            {t({
              it: 'Entra nel tuo account per completare l\'ordine. Il carrello che hai riempito ti segue.',
              en: 'Sign in to complete your order. The cart you filled follows you.',
            })}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button onClick={() => navigate('/signin', { state: { from: '/checkout' } })} className="px-8 py-3 bg-white text-black font-bold">
              {t({ it: 'Accedi', en: 'Sign in' })}
            </button>
            <button onClick={() => navigate('/signup', { state: { from: '/checkout' } })} className="px-8 py-3 bg-gray-800 text-white font-bold">
              {t({ it: 'Registrati', en: 'Sign up' })}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (articoli.length === 0) {
    return (
      <div className="min-h-screen bg-black pt-32 pb-16 px-6">
        <div className="container mx-auto max-w-xl text-center">
          <h1 className="text-2xl font-bold text-white mb-3">{t({ it: 'Il carrello è vuoto', en: 'Your cart is empty' })}</h1>
          <button onClick={() => navigate('/')} className="mt-6 px-8 py-3 bg-white text-black font-bold">
            {t({ it: 'Torna al sito', en: 'Back to the site' })}
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-black pt-32 pb-20 px-6">
      <div className="container mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-white mb-8 uppercase tracking-[0.18em]">
          {t({ it: 'Riepilogo ordine', en: 'Order summary' })}
        </h1>

        <div className="space-y-3 mb-8">
          {articoli.map(articolo => (
            <div key={articolo.id} className="flex gap-4 bg-gray-900/50 border border-gray-800 p-4">
              {articolo.immagine && (
                <img src={articolo.immagine} alt="" className="w-24 h-20 object-cover border border-gray-800 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <span className="text-[10px] uppercase tracking-[0.22em] text-dr7-gold">
                  {etichettaTipo(articolo.tipo, lang === 'it' ? 'it' : 'en')}
                </span>
                <h3 className="text-white font-bold mt-1">{articolo.titolo}</h3>
                {articolo.sottotitolo && (
                  <p className="text-gray-400 text-sm mt-1 whitespace-pre-line">{articolo.sottotitolo}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-white font-bold">{euro(articolo.prezzoCents)}</div>
                {!inCorso && (
                  <button
                    onClick={() => void rimuovi(articolo.id)}
                    className="text-red-500 hover:text-red-400 text-xs uppercase tracking-[0.18em] mt-2"
                  >
                    {t({ it: 'Rimuovi', en: 'Remove' })}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-gray-900/50 border border-gray-800 p-6 mb-8">
          <h2 className="text-white font-bold mb-4 uppercase tracking-[0.18em] text-sm">
            {t({ it: 'Metodo di pagamento', en: 'Payment method' })}
          </h2>
          <div className="flex gap-3">
            <button
              onClick={() => setMetodo('nexi')}
              className={`flex-1 py-3 text-sm font-semibold border ${metodo === 'nexi' ? 'border-white text-white' : 'border-gray-700 text-gray-400'}`}
            >
              {t({ it: 'Carta', en: 'Card' })}
            </button>
            <button
              onClick={() => pagabileACredito && setMetodo('credit')}
              disabled={!pagabileACredito}
              className={`flex-1 py-3 text-sm font-semibold border disabled:opacity-40 ${metodo === 'credit' ? 'border-white text-white' : 'border-gray-700 text-gray-400'}`}
            >
              {t({ it: 'Credit Wallet', en: 'Credit Wallet' })}
              {saldo != null && <span className="block text-xs font-normal mt-1">€{saldo.toFixed(2)}</span>}
            </button>
          </div>
          {!pagabileACredito && (
            <p className="text-gray-500 text-xs mt-3">
              {t({
                it: 'Abbonamenti e ricariche del Credit Wallet si pagano solo con carta: con uno di questi nel carrello, tutto l\'ordine va a carta.',
                en: 'Subscriptions and Credit Wallet top-ups are card only: with one of them in the cart, the whole order goes on card.',
              })}
            </p>
          )}
          {metodo === 'credit' && !creditoBastante && (
            <p className="text-red-400 text-xs mt-3">
              {t({ it: 'Credito non sufficiente per questo ordine.', en: 'Not enough credit for this order.' })}
            </p>
          )}
        </div>

        <div className="flex justify-between items-center mb-6">
          <span className="text-lg text-white uppercase tracking-[0.18em]">{t({ it: 'Totale', en: 'Total' })}</span>
          <span className="text-3xl font-bold text-white">{euro(totaleCents)}</span>
        </div>

        {errore && (
          <div className="border border-red-500/40 bg-red-500/10 text-red-300 text-sm p-4 mb-6">{errore}</div>
        )}

        <button
          onClick={() => void paga()}
          disabled={inCorso || (metodo === 'credit' && !creditoBastante)}
          className="w-full bg-white text-black py-4 font-bold text-sm uppercase tracking-[0.2em] hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          {inCorso
            ? (passo || t({ it: 'Attendere…', en: 'Please wait…' }))
            : t({ it: 'Paga ora', en: 'Pay now' })}
        </button>

        {!inCorso && (
          <button onClick={() => void svuota()} className="w-full text-gray-500 hover:text-gray-300 text-xs uppercase tracking-[0.2em] mt-6">
            {t({ it: 'Svuota il carrello', en: 'Empty the cart' })}
          </button>
        )}
      </div>
    </motion.div>
  );
};

export default CheckoutPage;

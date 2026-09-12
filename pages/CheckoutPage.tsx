import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { useCarrello } from '../hooks/useCarrello';
import { useTranslation } from '../hooks/useTranslation';
import { getUserCreditBalance } from '../utils/creditWallet';
import { caricaDatiFatturaCliente } from '../utils/datiFatturaCliente';
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
  conDatiCliente,
  pagaArticoloACredito,
  preparaArticoloCarta,
  type DatiClienteOrdine,
} from '../utils/carrelloCheckout';

/**
 * Pagamento del carrello.
 *
 * Un ordine solo per il cliente, un ordine figlio per ogni servizio dentro.
 * A cambiare fra un lavaggio e un noleggio non e' il modo di comprare: e'
 * quello che succede dopo il pagamento, e quello resta dove e' sempre stato
 * (nexi-callback per la carta, la RPC del wallet per il credito).
 *
 * 12/09/2026 — il checkout e' a passi: Riepilogo, Dati cliente, Fatturazione,
 * Pagamento. E' qui che si chiedono anagrafica e fattura, UNA volta per
 * ordine: configurare un servizio non deve piu' far comparire moduli di
 * fatturazione a chi sta ancora scegliendo. Chi ha gia' i dati nel profilo li
 * trova pronti e passa oltre.
 */

type Passo = 'riepilogo' | 'cliente' | 'fattura' | 'pagamento';

const PASSI: Passo[] = ['riepilogo', 'cliente', 'fattura', 'pagamento'];

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

const campo = 'w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white text-sm focus:border-white focus:outline-none';
const etichetta = 'block text-xs uppercase tracking-[0.18em] text-gray-400 mb-2';

const CheckoutPage: React.FC = () => {
  const { t, lang } = useTranslation();
  const navigate = useNavigate();
  const { user, loading: caricamentoUtente } = useAuth();
  const {
    articoli, articoliSelezionati, totaleSelezionatiCents,
    selezionato, commutaSelezione, svuota, rimuovi, caricamento,
  } = useCarrello();

  const [passo, setPasso] = useState<Passo>('riepilogo');
  const [metodo, setMetodo] = useState<'nexi' | 'credit'>('nexi');
  const [saldo, setSaldo] = useState<number | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [avanzamento, setAvanzamento] = useState<string>('');
  const [erroriCampi, setErroriCampi] = useState<Record<string, string>>({});

  const [cliente, setCliente] = useState<DatiClienteOrdine>({
    fullName: '', email: '', phone: '', richiedeFattura: false,
    ragioneSociale: '', codiceFiscale: '', partitaIva: '',
    indirizzo: '', numeroCivico: '', codicePostale: '', citta: '', provincia: '',
    sdi: '', pec: '',
  });

  // Paga solo quello che ha la spunta: il resto resta nel carrello per dopo.
  const totaleCents = totaleSelezionatiCents;
  const pagabileACredito = useMemo(() => carrelloPagabileACredito(articoliSelezionati), [articoliSelezionati]);
  const creditoBastante = saldo != null && saldo * 100 >= totaleCents;
  const nessunaSpunta = articoliSelezionati.length === 0;

  useEffect(() => {
    if (!user?.id) return;
    getUserCreditBalance(user.id).then(setSaldo).catch(() => setSaldo(null));
  }, [user?.id]);

  /**
   * Anagrafica gia' data all'iscrizione: si legge dalla scheda cliente e, in
   * riserva, dai metadati dell'accesso (utils/datiFatturaCliente). Chi e'
   * gia' cliente non riscrive niente, controlla e va avanti.
   */
  useEffect(() => {
    if (!user?.id) return;
    let attivo = true;
    caricaDatiFatturaCliente(user.id).then(dati => {
      if (!attivo) return;
      setCliente(prec => ({
        ...prec,
        fullName: prec.fullName || dati.fullName || user.fullName || '',
        email: prec.email || dati.email || user.email || '',
        phone: prec.phone || dati.phone || '',
        codiceFiscale: prec.codiceFiscale || dati.codiceFiscale || '',
        indirizzo: prec.indirizzo || dati.indirizzo || '',
        numeroCivico: prec.numeroCivico || dati.numeroCivico || '',
        codicePostale: prec.codicePostale || dati.codicePostale || '',
        citta: prec.citta || dati.cittaResidenza || '',
        provincia: prec.provincia || dati.provinciaResidenza || '',
        ragioneSociale: prec.ragioneSociale || dati.fullName || '',
      }));
    }).catch(() => { /* profilo non leggibile: i campi restano da compilare */ });
    return () => { attivo = false; };
  }, [user?.id, user?.email, user?.fullName]);

  useEffect(() => {
    if (!pagabileACredito && metodo === 'credit') setMetodo('nexi');
  }, [pagabileACredito, metodo]);

  const scrivi = (chiave: keyof DatiClienteOrdine, valore: string | boolean) => {
    setCliente(prec => ({ ...prec, [chiave]: valore }));
    setErroriCampi(prec => ({ ...prec, [chiave]: '' }));
  };

  const validaCliente = (): boolean => {
    const e: Record<string, string> = {};
    if (!cliente.fullName.trim()) e.fullName = t({ it: 'Il nome è obbligatorio', en: 'Name is required' });
    if (!cliente.email.trim()) e.email = t({ it: "L'email è obbligatoria", en: 'Email is required' });
    if (!cliente.phone.trim()) e.phone = t({ it: 'Il telefono è obbligatorio', en: 'Phone is required' });
    setErroriCampi(e);
    return Object.keys(e).length === 0;
  };

  const validaFattura = (): boolean => {
    if (!cliente.richiedeFattura) return true;
    const e: Record<string, string> = {};
    const obbligatorio = (k: keyof DatiClienteOrdine, testo: string) => {
      if (!String(cliente[k] || '').trim()) e[k] = testo;
    };
    obbligatorio('ragioneSociale', t({ it: 'Obbligatorio per la fattura', en: 'Required for the invoice' }));
    if (!String(cliente.codiceFiscale || '').trim() && !String(cliente.partitaIva || '').trim()) {
      e.codiceFiscale = t({ it: 'Serve il codice fiscale o la partita IVA', en: 'Tax code or VAT number needed' });
    }
    obbligatorio('indirizzo', t({ it: 'Obbligatorio per la fattura', en: 'Required for the invoice' }));
    obbligatorio('codicePostale', t({ it: 'Obbligatorio per la fattura', en: 'Required for the invoice' }));
    obbligatorio('citta', t({ it: 'Obbligatorio per la fattura', en: 'Required for the invoice' }));
    setErroriCampi(e);
    return Object.keys(e).length === 0;
  };

  const avanti = () => {
    setErrore(null);
    if (passo === 'riepilogo') return setPasso('cliente');
    if (passo === 'cliente') return validaCliente() && setPasso('fattura');
    if (passo === 'fattura') return validaFattura() && setPasso('pagamento');
  };

  const indietro = () => {
    const i = PASSI.indexOf(passo);
    if (i > 0) setPasso(PASSI[i - 1]);
  };

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

  const pagaConCarta = async (daPagare: ArticoloCarrello[]) => {
    const ordinePadre = nuovoOrdineCarrello();
    const figli = daPagare.map((a, i) => ({
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
    for (let i = 0; i < daPagare.length; i++) {
      const articolo = daPagare[i];
      setAvanzamento(t({ it: 'Preparazione', en: 'Preparing' }) + ` ${i + 1}/${daPagare.length}: ${articolo.titolo}`);
      const esito = await preparaArticoloCarta(articolo, figli[i].ordine, ordinePadre, user!.id);
      if (!esito.ok) {
        await annullaPreparazione(preparati);
        await supabase.from('ordini_carrello').update({ stato: 'fallito' }).eq('nexi_order_id', ordinePadre);
        throw new Error(`${articolo.titolo}: ${esito.errore}`);
      }
      preparati.push(figli[i].ordine);
    }

    setAvanzamento(t({ it: 'Apertura del pagamento…', en: 'Opening payment…' }));
    const risposta = await fetch(`${FUNCTIONS_BASE}/.netlify/functions/create-nexi-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: ordinePadre,
        amount: totaleCents,
        currency: 'EUR',
        description: daPagare.length === 1
          ? daPagare[0].titolo
          : `DR7 — ${daPagare.length} ${lang === 'it' ? 'servizi' : 'services'}`,
        customerEmail: cliente.email || user?.email || '',
        customerName: cliente.fullName || user?.fullName || '',
        ...tipoRicorrenza(daPagare),
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

  const pagaCredito = async (daPagare: ArticoloCarrello[]) => {
    const falliti: string[] = [];
    for (let i = 0; i < daPagare.length; i++) {
      const articolo = daPagare[i];
      setAvanzamento(`${i + 1}/${daPagare.length}: ${articolo.titolo}`);
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
    if (!validaCliente()) { setPasso('cliente'); return; }
    if (!validaFattura()) { setPasso('fattura'); return; }
    setInCorso(true);
    try {
      // Anagrafica e fattura entrano negli articoli solo ora, e solo dove
      // manca qualcosa: quello che il servizio ha gia' raccolto (il
      // conducente di un noleggio) resta com'e'.
      const daPagare = articoliSelezionati.map(a => conDatiCliente(a, cliente));
      if (metodo === 'credit') await pagaCredito(daPagare);
      else await pagaConCarta(daPagare);
    } catch (e) {
      setErrore((e as Error).message);
      setInCorso(false);
      setAvanzamento('');
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

  const nomePasso: Record<Passo, { it: string; en: string }> = {
    riepilogo: { it: 'Riepilogo', en: 'Summary' },
    cliente: { it: 'Dati cliente', en: 'Your details' },
    fattura: { it: 'Fatturazione', en: 'Billing' },
    pagamento: { it: 'Pagamento', en: 'Payment' },
  };
  const indicePasso = PASSI.indexOf(passo);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-black pt-32 pb-20 px-4 sm:px-6">
      <div className="container mx-auto max-w-3xl">
        {/* Passi: sul telefono restano su una riga sola, senza andare a capo */}
        <div className="flex items-center gap-2 sm:gap-3 mb-8 overflow-x-auto">
          {PASSI.map((p, i) => (
            <button
              key={p}
              onClick={() => { if (i < indicePasso) setPasso(p); }}
              disabled={i > indicePasso || inCorso}
              className={`flex items-center gap-2 shrink-0 text-[10px] sm:text-xs uppercase tracking-[0.16em] ${
                i === indicePasso ? 'text-white' : i < indicePasso ? 'text-gray-400 hover:text-white' : 'text-gray-600'
              }`}
            >
              <span className={`w-6 h-6 flex items-center justify-center border ${i <= indicePasso ? 'border-white text-white' : 'border-gray-700'}`}>
                {i + 1}
              </span>
              <span className="hidden sm:inline">{t(nomePasso[p])}</span>
            </button>
          ))}
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-8 uppercase tracking-[0.18em]">
          {t(nomePasso[passo])}
        </h1>

        {passo === 'riepilogo' && (
          <div className="space-y-3 mb-8">
            <p className="text-gray-400 text-sm">
              {t({
                it: 'Paghi solo gli articoli con la spunta. Gli altri restano nel carrello per un\'altra volta.',
                en: 'You only pay for the ticked items. The rest stays in the cart for later.',
              })}
            </p>
            {articoli.map(articolo => (
              <div key={articolo.id} className={`flex gap-4 bg-gray-900/50 border p-4 ${selezionato(articolo.id) ? 'border-gray-800' : 'border-gray-900 opacity-50'}`}>
                <input
                  type="checkbox"
                  checked={selezionato(articolo.id)}
                  onChange={() => commutaSelezione(articolo.id)}
                  disabled={inCorso}
                  aria-label={articolo.titolo}
                  className="mt-1 h-4 w-4 accent-white shrink-0"
                />
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
        )}

        {passo === 'cliente' && (
          <div className="bg-gray-900/50 border border-gray-800 p-4 sm:p-6 mb-8 space-y-4">
            <p className="text-gray-400 text-sm">
              {t({
                it: 'Sono i dati del tuo account: controlla che siano giusti, li usiamo per la conferma.',
                en: 'These come from your account: check them, we use them for the confirmation.',
              })}
            </p>
            <div>
              <label className={etichetta}>{t({ it: 'Nome e cognome', en: 'Full name' })}</label>
              <input className={campo} value={cliente.fullName} onChange={e => scrivi('fullName', e.target.value)} />
              {erroriCampi.fullName && <p className="text-xs text-red-400 mt-1">{erroriCampi.fullName}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={etichetta}>Email</label>
                <input type="email" className={campo} value={cliente.email} onChange={e => scrivi('email', e.target.value)} />
                {erroriCampi.email && <p className="text-xs text-red-400 mt-1">{erroriCampi.email}</p>}
              </div>
              <div>
                <label className={etichetta}>{t({ it: 'Telefono', en: 'Phone' })}</label>
                <input type="tel" className={campo} value={cliente.phone} onChange={e => scrivi('phone', e.target.value)} />
                {erroriCampi.phone && <p className="text-xs text-red-400 mt-1">{erroriCampi.phone}</p>}
              </div>
            </div>
          </div>
        )}

        {passo === 'fattura' && (
          <div className="bg-gray-900/50 border border-gray-800 p-4 sm:p-6 mb-8 space-y-4">
            <label className="flex items-center gap-3 cursor-pointer text-white">
              <input
                type="checkbox"
                checked={cliente.richiedeFattura}
                onChange={e => scrivi('richiedeFattura', e.target.checked)}
                className="h-4 w-4 accent-white"
              />
              <span className="text-sm">{t({ it: 'Ho bisogno della fattura', en: 'I need an invoice' })}</span>
            </label>
            {!cliente.richiedeFattura ? (
              <p className="text-gray-500 text-sm">
                {t({
                  it: 'Senza fattura non serve altro: ricevi comunque la conferma e la ricevuta del pagamento.',
                  en: 'Nothing else is needed: you still get the confirmation and the payment receipt.',
                })}
              </p>
            ) : (
              <div className="space-y-4 pt-2">
                <div>
                  <label className={etichetta}>{t({ it: 'Nome o ragione sociale', en: 'Name or company' })}</label>
                  <input className={campo} value={cliente.ragioneSociale} onChange={e => scrivi('ragioneSociale', e.target.value)} />
                  {erroriCampi.ragioneSociale && <p className="text-xs text-red-400 mt-1">{erroriCampi.ragioneSociale}</p>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={etichetta}>{t({ it: 'Codice fiscale', en: 'Tax code' })}</label>
                    <input className={`${campo} uppercase`} value={cliente.codiceFiscale} onChange={e => scrivi('codiceFiscale', e.target.value.toUpperCase())} />
                    {erroriCampi.codiceFiscale && <p className="text-xs text-red-400 mt-1">{erroriCampi.codiceFiscale}</p>}
                  </div>
                  <div>
                    <label className={etichetta}>{t({ it: 'Partita IVA', en: 'VAT number' })}</label>
                    <input className={campo} value={cliente.partitaIva} onChange={e => scrivi('partitaIva', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className={etichetta}>{t({ it: 'Indirizzo', en: 'Address' })}</label>
                    <input className={campo} value={cliente.indirizzo} onChange={e => scrivi('indirizzo', e.target.value)} />
                    {erroriCampi.indirizzo && <p className="text-xs text-red-400 mt-1">{erroriCampi.indirizzo}</p>}
                  </div>
                  <div>
                    <label className={etichetta}>{t({ it: 'Civico', en: 'No.' })}</label>
                    <input className={campo} value={cliente.numeroCivico} onChange={e => scrivi('numeroCivico', e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={etichetta}>CAP</label>
                    <input className={campo} value={cliente.codicePostale} onChange={e => scrivi('codicePostale', e.target.value)} />
                    {erroriCampi.codicePostale && <p className="text-xs text-red-400 mt-1">{erroriCampi.codicePostale}</p>}
                  </div>
                  <div>
                    <label className={etichetta}>{t({ it: 'Città', en: 'City' })}</label>
                    <input className={campo} value={cliente.citta} onChange={e => scrivi('citta', e.target.value)} />
                    {erroriCampi.citta && <p className="text-xs text-red-400 mt-1">{erroriCampi.citta}</p>}
                  </div>
                  <div>
                    <label className={etichetta}>{t({ it: 'Provincia', en: 'Province' })}</label>
                    <input className={`${campo} uppercase`} maxLength={2} value={cliente.provincia} onChange={e => scrivi('provincia', e.target.value.toUpperCase())} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={etichetta}>{t({ it: 'Codice SDI', en: 'SDI code' })}</label>
                    <input className={`${campo} uppercase`} value={cliente.sdi} onChange={e => scrivi('sdi', e.target.value.toUpperCase())} />
                  </div>
                  <div>
                    <label className={etichetta}>PEC</label>
                    <input type="email" className={campo} value={cliente.pec} onChange={e => scrivi('pec', e.target.value)} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {passo === 'pagamento' && (
          <div className="bg-gray-900/50 border border-gray-800 p-4 sm:p-6 mb-8">
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
        )}

        <div className="flex justify-between items-center mb-6">
          <span className="text-base sm:text-lg text-white uppercase tracking-[0.18em]">
            {t({ it: 'Totale', en: 'Total' })}
            {articoliSelezionati.length !== articoli.length && (
              <span className="block text-[11px] tracking-normal text-gray-500 normal-case">
                {articoliSelezionati.length}/{articoli.length} {t({ it: 'articoli selezionati', en: 'items selected' })}
              </span>
            )}
          </span>
          <span className="text-2xl sm:text-3xl font-bold text-white">{euro(totaleCents)}</span>
        </div>

        {errore && (
          <div className="border border-red-500/40 bg-red-500/10 text-red-300 text-sm p-4 mb-6">{errore}</div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          {indicePasso > 0 && !inCorso && (
            <button
              onClick={indietro}
              className="sm:w-40 border border-gray-700 text-gray-300 py-4 font-bold text-xs uppercase tracking-[0.2em] hover:border-white hover:text-white transition-colors"
            >
              {t({ it: 'Indietro', en: 'Back' })}
            </button>
          )}
          {passo !== 'pagamento' ? (
            <button
              onClick={avanti}
              disabled={nessunaSpunta}
              className="flex-1 bg-white text-black py-4 font-bold text-sm uppercase tracking-[0.2em] hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {t({ it: 'Continua', en: 'Continue' })}
            </button>
          ) : (
            <button
              onClick={() => void paga()}
              disabled={inCorso || nessunaSpunta || (metodo === 'credit' && !creditoBastante)}
              className="flex-1 bg-white text-black py-4 font-bold text-sm uppercase tracking-[0.2em] hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {inCorso
                ? (avanzamento || t({ it: 'Attendere…', en: 'Please wait…' }))
                : t({ it: 'Conferma prenotazione', en: 'Confirm booking' })}
            </button>
          )}
        </div>

        {!inCorso && passo === 'riepilogo' && (
          <button onClick={() => void svuota()} className="w-full text-gray-500 hover:text-gray-300 text-xs uppercase tracking-[0.2em] mt-6">
            {t({ it: 'Svuota il carrello', en: 'Empty the cart' })}
          </button>
        )}
      </div>
    </motion.div>
  );
};

export default CheckoutPage;

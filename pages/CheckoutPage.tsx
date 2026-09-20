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
 * 12/09/2026 — il checkout e' a passi: Riepilogo, Dati cliente, Pagamento.
 * La fattura non si chiede piu': ogni pagamento ne genera una, e i dati
 * (codice fiscale, indirizzo) sono gia' obbligatori all'iscrizione, quindi si
 * leggono in silenzio dal profilo. Se nel profilo manca qualcosa il pagamento
 * NON si blocca: si completa dal gestionale.
 */

type Passo = 'riepilogo' | 'cliente' | 'pagamento';

const PASSI: Passo[] = ['riepilogo', 'cliente', 'pagamento'];

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
    fullName: '', email: '', phone: '',
    ragioneSociale: '', codiceFiscale: '', partitaIva: '',
    indirizzo: '', numeroCivico: '', codicePostale: '', citta: '', provincia: '',
    sdi: '', pec: '',
    fatturaAzienda: false,
    aziendaRagioneSociale: '', aziendaPartitaIva: '', aziendaCodiceFiscale: '',
    aziendaSedeLegale: '', aziendaCap: '', aziendaCitta: '', aziendaProvincia: '',
    aziendaSdi: '', aziendaPec: '',
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
    // La fattura all'azienda e' una scelta: se la prendi, servono i dati che
    // lo SDI pretende da una societa'.
    if (cliente.fatturaAzienda) {
      if (!String(cliente.aziendaRagioneSociale || '').trim()) {
        e.aziendaRagioneSociale = t({ it: 'Obbligatoria per la fattura', en: 'Required for the invoice' });
      }
      if (!String(cliente.aziendaPartitaIva || '').trim()) {
        e.aziendaPartitaIva = t({ it: 'Obbligatoria per la fattura', en: 'Required for the invoice' });
      }
      if (!String(cliente.aziendaSedeLegale || '').trim()) {
        e.aziendaSedeLegale = t({ it: 'Obbligatoria per la fattura', en: 'Required for the invoice' });
      }
    }
    setErroriCampi(e);
    return Object.keys(e).length === 0;
  };


  const avanti = () => {
    setErrore(null);
    if (passo === 'riepilogo') return setPasso('cliente');
    if (passo === 'cliente') return validaCliente() && setPasso('pagamento');
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
    setInCorso(true);
    try {
      // Anagrafica e dati fattura (letti dal profilo) entrano negli articoli
      // solo ora, e solo dove manca qualcosa: quello che il servizio ha gia'
      // raccolto (il conducente di un noleggio) resta com'e'.
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
    pagamento: { it: 'Pagamento', en: 'Payment' },
  };
  const indicePasso = PASSI.indexOf(passo);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-black pt-32 pb-20 px-4 sm:px-6">
      <div className="container mx-auto max-w-6xl">
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

        {/* 20/09/2026 (direzione): checkout del carrello su due colonne, come la
            prenotazione del sito. A sinistra il passo corrente, a destra la scheda
            del riepilogo col totale sempre in vista. Solo impaginazione: articoli,
            metodi di pagamento, controlli e chiamate sono gli stessi di prima. */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] gap-6 lg:gap-8 items-start">
          <div className="min-w-0">
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
                <label className={etichetta}>{t({ it: 'Email', en: 'Email' })}</label>
                <input type="email" className={campo} value={cliente.email} onChange={e => scrivi('email', e.target.value)} />
                {erroriCampi.email && <p className="text-xs text-red-400 mt-1">{erroriCampi.email}</p>}
              </div>
              <div>
                <label className={etichetta}>{t({ it: 'Telefono', en: 'Phone' })}</label>
                <input type="tel" className={campo} value={cliente.phone} onChange={e => scrivi('phone', e.target.value)} />
                {erroriCampi.phone && <p className="text-xs text-red-400 mt-1">{erroriCampi.phone}</p>}
              </div>
            </div>

            {/* La fattura parte da sola intestata a te. Chi compra per lavoro
                la vuole intestata alla societa': un bottone, e i campi che
                servono solo in quel caso. */}
            <div className="pt-2 border-t border-gray-800">
              <button
                type="button"
                onClick={() => scrivi('fatturaAzienda', !cliente.fatturaAzienda)}
                className={`w-full sm:w-auto px-5 py-3 border text-xs uppercase tracking-[0.18em] transition-colors ${
                  cliente.fatturaAzienda ? 'border-white text-white' : 'border-gray-700 text-gray-400 hover:border-white hover:text-white'
                }`}
              >
                {t({ it: "Fattura a un'azienda", en: 'Invoice to a company' })}
              </button>
              {!cliente.fatturaAzienda ? (
                <p className="text-gray-500 text-xs mt-3">
                  {t({
                    it: 'La fattura arriva intestata a te con i dati del tuo account. Premi qui se va intestata a una societa\u2019.',
                    en: 'The invoice is issued to you with your account details. Tap here if it goes to a company.',
                  })}
                </p>
              ) : (
                <div className="space-y-4 pt-4">
                  <div>
                    <label className={etichetta}>{t({ it: 'Ragione sociale', en: 'Company name' })}</label>
                    <input className={campo} value={cliente.aziendaRagioneSociale || ''} onChange={e => scrivi('aziendaRagioneSociale', e.target.value)} />
                    {erroriCampi.aziendaRagioneSociale && <p className="text-xs text-red-400 mt-1">{erroriCampi.aziendaRagioneSociale}</p>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={etichetta}>{t({ it: 'Partita IVA', en: 'VAT number' })}</label>
                      <input className={campo} value={cliente.aziendaPartitaIva || ''} onChange={e => scrivi('aziendaPartitaIva', e.target.value)} />
                      {erroriCampi.aziendaPartitaIva && <p className="text-xs text-red-400 mt-1">{erroriCampi.aziendaPartitaIva}</p>}
                    </div>
                    <div>
                      <label className={etichetta}>{t({ it: 'Codice fiscale azienda', en: 'Company tax code' })}</label>
                      <input className={`${campo} uppercase`} value={cliente.aziendaCodiceFiscale || ''} onChange={e => scrivi('aziendaCodiceFiscale', e.target.value.toUpperCase())} />
                    </div>
                  </div>
                  <div>
                    <label className={etichetta}>{t({ it: 'Sede legale', en: 'Registered address' })}</label>
                    <input className={campo} value={cliente.aziendaSedeLegale || ''} onChange={e => scrivi('aziendaSedeLegale', e.target.value)} />
                    {erroriCampi.aziendaSedeLegale && <p className="text-xs text-red-400 mt-1">{erroriCampi.aziendaSedeLegale}</p>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className={etichetta}>CAP</label>
                      <input className={campo} value={cliente.aziendaCap || ''} onChange={e => scrivi('aziendaCap', e.target.value)} />
                    </div>
                    <div>
                      <label className={etichetta}>{t({ it: 'Citt\u00e0', en: 'City' })}</label>
                      <input className={campo} value={cliente.aziendaCitta || ''} onChange={e => scrivi('aziendaCitta', e.target.value)} />
                    </div>
                    <div>
                      <label className={etichetta}>{t({ it: 'Provincia', en: 'Province' })}</label>
                      <input className={`${campo} uppercase`} maxLength={2} value={cliente.aziendaProvincia || ''} onChange={e => scrivi('aziendaProvincia', e.target.value.toUpperCase())} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={etichetta}>{t({ it: 'Codice SDI', en: 'SDI code' })}</label>
                      <input className={`${campo} uppercase`} value={cliente.aziendaSdi || ''} onChange={e => scrivi('aziendaSdi', e.target.value.toUpperCase())} />
                    </div>
                    <div>
                      <label className={etichetta}>PEC</label>
                      <input type="email" className={campo} value={cliente.aziendaPec || ''} onChange={e => scrivi('aziendaPec', e.target.value)} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {passo === 'pagamento' && (
          <div className="bg-gray-900/50 border border-gray-800 p-4 sm:p-6 mb-8">
            <h2 className="text-white font-bold mb-4 uppercase tracking-[0.18em] text-sm">
              {t({ it: 'Metodo di pagamento', en: 'Payment method' })}
            </h2>
            {/* 20/09/2026: due schede al posto dei due bottoni piatti — stessa
                scelta, stessi stati, solo piu' leggibile. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => setMetodo('nexi')}
                className={`relative text-left p-4 border transition-colors ${metodo === 'nexi' ? 'border-dr7-gold bg-white/[0.03]' : 'border-gray-700 hover:border-gray-500'}`}
              >
                <span className={`absolute top-3 right-3 w-5 h-5 rounded-full border flex items-center justify-center ${metodo === 'nexi' ? 'border-dr7-gold bg-dr7-gold' : 'border-gray-600'}`}>
                  {metodo === 'nexi' && (
                    <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  )}
                </span>
                <svg className={`w-7 h-7 mb-3 ${metodo === 'nexi' ? 'text-white' : 'text-gray-500'}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
                <span className={`block text-sm font-bold ${metodo === 'nexi' ? 'text-white' : 'text-gray-300'}`}>
                  {t({ it: 'Carta di credito/debito', en: 'Credit/debit card' })}
                </span>
                <span className="block text-xs text-gray-500 mt-1">
                  {t({ it: 'Paga in modo sicuro con la tua carta', en: 'Pay securely with your card' })}
                </span>
              </button>
              <button
                onClick={() => pagabileACredito && setMetodo('credit')}
                disabled={!pagabileACredito}
                className={`relative text-left p-4 border transition-colors disabled:opacity-40 ${metodo === 'credit' ? 'border-dr7-gold bg-white/[0.03]' : 'border-gray-700 enabled:hover:border-gray-500'}`}
              >
                <span className={`absolute top-3 right-3 w-5 h-5 rounded-full border flex items-center justify-center ${metodo === 'credit' ? 'border-dr7-gold bg-dr7-gold' : 'border-gray-600'}`}>
                  {metodo === 'credit' && (
                    <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  )}
                </span>
                <svg className={`w-7 h-7 mb-3 ${metodo === 'credit' ? 'text-white' : 'text-gray-500'}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path d="M3 7a2 2 0 012-2h12a2 2 0 012 2v1h1a2 2 0 012 2v6a2 2 0 01-2 2h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /><circle cx="17" cy="13" r="1" /></svg>
                <span className={`block text-sm font-bold ${metodo === 'credit' ? 'text-white' : 'text-gray-300'}`}>Credit Wallet</span>
                <span className="block text-xs text-gray-500 mt-1">
                  {saldo != null
                    ? `${t({ it: 'Disponibile', en: 'Available' })}: €${saldo.toFixed(2)}`
                    : t({ it: 'Usa il tuo credito DR7', en: 'Use your DR7 credit' })}
                </span>
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
              className="flex-1 bg-dr7-gold text-black py-4 font-bold text-sm uppercase tracking-[0.2em] hover:brightness-110 transition-all disabled:opacity-50 disabled:hover:brightness-100"
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

          <aside className="min-w-0 lg:sticky lg:top-28">
            <div className="border border-gray-800 bg-gray-900/60">
              <div className="px-5 py-4 border-b border-gray-800">
                <p className="text-[11px] uppercase tracking-[0.22em] text-dr7-gold">{t({ it: 'Riepilogo ordine', en: 'Order summary' })}</p>
              </div>
              <div className="px-5 py-4 space-y-3">
                {articoliSelezionati.map(articolo => (
                  <div key={articolo.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-white leading-snug">{articolo.titolo}</p>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500 mt-0.5">
                        {etichettaTipo(articolo.tipo, lang === 'it' ? 'it' : 'en')}
                      </p>
                    </div>
                    <span className="text-sm text-white tabular-nums shrink-0">{euro(articolo.prezzoCents)}</span>
                  </div>
                ))}
                {articoliSelezionati.length === 0 && (
                  <p className="text-sm text-gray-500">{t({ it: 'Nessun articolo selezionato.', en: 'No item selected.' })}</p>
                )}
              </div>
              <div className="px-5 py-4 border-t border-gray-800 flex items-end justify-between gap-3">
                <span className="text-sm text-white uppercase tracking-[0.18em]">
                  {t({ it: 'Totale', en: 'Total' })}
                  {articoliSelezionati.length !== articoli.length && (
                    <span className="block text-[11px] tracking-normal text-gray-500 normal-case mt-1">
                      {articoliSelezionati.length}/{articoli.length} {t({ it: 'articoli selezionati', en: 'items selected' })}
                    </span>
                  )}
                </span>
                <span className="text-2xl font-bold text-white tabular-nums">{euro(totaleCents)}</span>
              </div>
              <div className="px-5 py-4 border-t border-gray-800 flex items-start gap-2">
                <svg className="w-4 h-4 mt-0.5 text-dr7-gold shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                <div>
                  <p className="text-xs font-semibold text-white">{t({ it: 'Pagamento sicuro', en: 'Secure payment' })}</p>
                  <p className="text-[11px] text-gray-500">{t({ it: 'I tuoi dati sono protetti', en: 'Your data is protected' })}</p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </motion.div>
  );
};

export default CheckoutPage;

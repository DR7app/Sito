import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../supabaseClient';
import { caricaDatiFatturaCliente } from '../utils/datiFatturaCliente';
import CaroselloFoto from '../components/ui/CaroselloFoto';
import { useCarrello } from '../hooks/useCarrello';
import { useBooking } from '../hooks/useBooking';
import { useVehicles } from '../hooks/useVehicles';
import {
  getCatalogoPromozioni,
  primoGiornoPrenotabile,
  aggiungiGiorni,
  restringiGruppoAPromo,
  dataIt,
  type Promozione,
} from '../utils/promozioni';
import {
  rigaAcquistoPrevendita,
  walletCarrelloPrevendite,
  acquistaPrevenditaConCredito,
} from '../utils/prevenditeAcquisto';
import {
  getCatalogoPrevendite,
  getImpostazioniPrevendite,
  IMPOSTAZIONI_DEFAULT,
  type Prevendita,
  type ImpostazioniPrevendite,
  fotoPrevendita,
} from '../utils/prevendite';

/**
 * PREVENDITE DR7 — la vetrina, 14/09/2026.
 *
 * Il cliente vede la foto, il prezzo e TUTTE le condizioni (utilizzi, km
 * inclusi per utilizzo, assicurazione, validita', limiti mensili e di giorni
 * consecutivi). Compra online e il pacchetto finisce subito nel suo account.
 *
 * Il pagamento segue la stessa strada della ricarica Credit Wallet: riga in
 * `prevendite_clienti` in pending, ordine Nexi, ritorno su /payment-success che
 * chiama `prevendite-finalizza`. Il webhook fa lo stesso lavoro: chi arriva
 * primo attiva, l'altro trova gia' fatto.
 *
 * 26/09/2026 — PROMOZIONI e nuove strade di pagamento:
 *  - le promozioni (prezzo al giorno speciale, posti limitati) compaiono qui
 *    sopra le prevendite; "Prenota" apre il wizard con il veicolo della promo
 *    e il suo prezzo (cauzione, assicurazione e km come sempre);
 *  - una prevendita si paga anche col Credit Wallet e si mette nel carrello,
 *    quando la migrazione 20260926_prevendite_wallet_carrello e' applicata
 *    (walletCarrelloPrevendite); prima, solo carta come sempre.
 */

const euro = (n: number) =>
  `€ ${(Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const PrevenditePage: React.FC = () => {
  const { t, lang } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [catalogo, setCatalogo] = useState<Prevendita[]>([]);
  const [impostazioni, setImpostazioni] = useState<ImpostazioniPrevendite>(IMPOSTAZIONI_DEFAULT);
  const [caricamento, setCaricamento] = useState(true);
  const [scelta, setScelta] = useState<Prevendita | null>(null);
  const [inPagamento, setInPagamento] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const [promozioni, setPromozioni] = useState<Promozione[]>([]);
  const [promoScelta, setPromoScelta] = useState<Promozione | null>(null);
  const [promoErrore, setPromoErrore] = useState<string | null>(null);
  const [walletCarrello, setWalletCarrello] = useState(false);
  const { aggiungi } = useCarrello();
  const { openCarWizard, setInitialSearchDates } = useBooking();
  const { vehicles: tuttiVeicoli } = useVehicles(undefined);

  useEffect(() => {
    let annullato = false;
    Promise.all([getCatalogoPrevendite(), getImpostazioniPrevendite(), getCatalogoPromozioni(), walletCarrelloPrevendite()])
      .then(([c, i, promo, wc]) => {
        if (annullato) return;
        setCatalogo(c);
        setImpostazioni(i);
        setPromozioni(promo);
        setWalletCarrello(wc);
        setCaricamento(false);
      });
    return () => { annullato = true; };
  }, []);

  /** Pacchetti ancora comprabili: la disponibilita' limitata e' una promessa. */
  const disponibili = useMemo(
    () => catalogo.filter(p => p.posti_totali === null || p.posti_venduti < p.posti_totali),
    [catalogo],
  );

  const vantaggio = (p: Prevendita): number | null => {
    if (!p.prezzo_listino || p.prezzo_listino <= p.prezzo) return null;
    return Math.round((1 - p.prezzo / p.prezzo_listino) * 100);
  };

  async function acquista(p: Prevendita) {
    setErrore(null);

    if (!user?.id) {
      // Dopo l'accesso si torna qui, sulla prevendita che stava guardando.
      navigate('/signin', { state: { from: { pathname: `${location.pathname}?prevendita=${p.id}` } } });
      return;
    }

    setInPagamento(true);
    try {
      const dati = await caricaDatiFatturaCliente(user.id);

      // L'ordine Nexi si genera PRIMA e va dentro la INSERT: la riga la puo'
      // creare il cliente, ma modificarla no (la RLS lascia gli UPDATE al solo
      // gestionale). Scriverlo dopo lasciava l'acquisto senza numero d'ordine
      // e il ritorno dal pagamento non trovava piu' niente.
      const nexiOrderId = `DR7PV${Date.now()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      // La riga porta con se' le condizioni di OGGI: se domani la direzione
      // cambia il catalogo, chi ha pagato tiene quello che ha comprato.
      const { data: riga, error: erroreRiga } = await supabase
        .from('prevendite_clienti')
        .insert(rigaAcquistoPrevendita(p, { id: user.id, email: user.email, fullName: user.fullName }, dati, nexiOrderId))
        .select()
        .single();

      if (erroreRiga) throw new Error(erroreRiga.message);
      console.log('[prevendite] acquisto in attesa di pagamento:', riga.id);

      const risposta = await fetch('/.netlify/functions/create-nexi-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: nexiOrderId,
          amount: Math.round(p.prezzo * 100),
          currency: 'EUR',
          description: `Prevendita DR7 - ${p.nome}`,
          customerEmail: dati.email || user.email || '',
          customerName: dati.fullName || user.fullName || '',
        }),
      });

      const esito = await risposta.json();
      if (!risposta.ok) {
        // Pagamenti sospesi dal System Control: il messaggio va mostrato cosi' com'e'.
        if (esito.code === 'pagamenti_online_off') { setErrore(esito.error); setInPagamento(false); return; }
        throw new Error(esito.error || 'Pagamento non avviato');
      }

      sessionStorage.setItem('dr7_pending_order', nexiOrderId);
      window.location.href = esito.paymentUrl;
    } catch (e) {
      console.error('[prevendite] acquisto non riuscito:', e);
      setErrore(
        t({
          it: 'Non siamo riusciti ad avviare il pagamento. Riprova o scrivici.',
          en: 'We could not start the payment. Please try again or contact us.',
        }),
      );
      setInPagamento(false);
    }
  }

  /** Credit Wallet: il database scala il saldo libero e attiva il pacchetto. */
  async function acquistaConCredito(p: Prevendita) {
    setErrore(null);
    if (!user?.id) {
      navigate('/signin', { state: { from: { pathname: `${location.pathname}?prevendita=${p.id}` } } });
      return;
    }
    setInPagamento(true);
    try {
      const dati = await caricaDatiFatturaCliente(user.id);
      const esito = await acquistaPrevenditaConCredito(p.id, dati);
      if (!esito.ok) {
        setErrore(esito.errore || t({ it: 'Acquisto non riuscito.', en: 'Purchase failed.' }));
        return;
      }
      navigate('/account/prevendite');
    } finally {
      setInPagamento(false);
    }
  }

  async function prevenditaAlCarrello(p: Prevendita) {
    setErrore(null);
    await aggiungi({
      tipo: 'prevendita',
      titolo: p.nome,
      sottotitolo: `${p.utilizzi_inclusi} ${t({ it: 'utilizzi', en: 'uses' })} · ${p.validita_mesi} ${t({ it: 'mesi', en: 'months' })}`,
      immagine: fotoPrevendita(p)[0],
      prezzoCents: Math.round(p.prezzo * 100),
      dati: { prevendita: p },
    });
    setScelta(null);
  }

  /**
   * Prenota una promozione: apre il wizard sul gruppo di auto della promo,
   * ristretto alle sole targhe in promozione, con le prime date utili. Dal
   * wizard il cliente paga subito (carta o wallet) oppure aggiunge al carrello.
   */
  function prenotaPromo(p: Promozione) {
    setPromoErrore(null);
    const ids = p.veicoli.map(v => v.id);
    let gruppo: (typeof tuttiVeicoli)[number] | null = null;
    for (const v of tuttiVeicoli) {
      const ristretto = restringiGruppoAPromo(v, ids);
      if (ristretto) { gruppo = ristretto; break; }
    }
    if (!gruppo) {
      setPromoErrore(t({ it: 'Il veicolo di questa promozione non e disponibile online in questo momento. Scrivici su WhatsApp.', en: 'The vehicle of this promotion is not available online right now. Contact us on WhatsApp.' }));
      return;
    }
    const dal = primoGiornoPrenotabile(p);
    const giorni = Math.max(1, p.min_giorni || 1);
    const al = aggiungiGiorni(dal, giorni) > p.noleggio_al ? p.noleggio_al : aggiungiGiorni(dal, giorni);
    setInitialSearchDates({
      pickupDate: dal,
      pickupTime: '10:30',
      returnDate: al,
      returnTime: '09:00',
      pickupLocation: 'dr7_office',
      returnLocation: 'dr7_office',
      promoId: p.id,
    });
    const cat = String(gruppo.category || '').toLowerCase();
    openCarWizard(gruppo, cat === 'urban' || cat === 'urban-cars' ? 'urban-cars' : 'cars');
    setPromoScelta(null);
  }

  // Uscendo dalla pagina le date della promo non devono restare nel contesto:
  // una prenotazione aperta altrove ripartirebbe con la promo (stessa pulizia
  // di FlottaIndexPage).
  useEffect(() => () => { setInitialSearchDates(null); },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  // Arrivo con ?promo=<id>: apre la scheda della promozione.
  useEffect(() => {
    if (caricamento) return;
    const id = new URLSearchParams(location.search).get('promo');
    if (!id) return;
    const p = promozioni.find(x => x.id === id);
    if (p) setPromoScelta(p);
  }, [caricamento, promozioni, location.search]);

  const titoloPromo = (p: Promozione) => (lang === 'en' && p.titolo_en) || p.titolo;
  const descrizionePromo = (p: Promozione) => (lang === 'en' && p.descrizione_en) || p.descrizione;

  // Arrivo con ?prevendita=<id> (dal popup o dopo l'accesso): apre la scheda.
  useEffect(() => {
    if (caricamento) return;
    const id = new URLSearchParams(location.search).get('prevendita');
    if (!id) return;
    const p = catalogo.find(x => x.id === id);
    if (p) setScelta(p);
  }, [caricamento, catalogo, location.search]);

  const Condizioni: React.FC<{ p: Prevendita; compatte?: boolean }> = ({ p, compatte }) => (
    <dl className={`grid grid-cols-2 gap-x-4 ${compatte ? 'gap-y-1 text-xs' : 'gap-y-2 text-sm'}`}>
      <dt className="text-gray-500">{t({ it: 'Utilizzi inclusi', en: 'Included uses' })}</dt>
      <dd className="text-white text-right font-medium">{p.utilizzi_inclusi}</dd>

      <dt className="text-gray-500">{t({ it: 'Km per utilizzo', en: 'Km per use' })}</dt>
      <dd className="text-white text-right font-medium">{p.km_inclusi >= 9999 ? t({ it: 'Illimitati', en: 'Unlimited' }) : p.km_inclusi ? `${p.km_inclusi} km` : '—'}</dd>

      <dt className="text-gray-500">{t({ it: 'Validita’', en: 'Validity' })}</dt>
      <dd className="text-white text-right font-medium">
        {p.validita_mesi} {t({ it: 'mesi', en: 'months' })}
      </dd>

      <dt className="text-gray-500">{t({ it: 'Assicurazione', en: 'Insurance' })}</dt>
      <dd className="text-white text-right font-medium">
        {p.assicurazione_inclusa || t({ it: 'Non inclusa', en: 'Not included' })}
      </dd>

      {p.max_utilizzi_mese != null && (
        <>
          <dt className="text-gray-500">{t({ it: 'Massimo al mese', en: 'Max per month' })}</dt>
          <dd className="text-white text-right font-medium">
            {p.max_utilizzi_mese} {t({ it: 'utilizzi', en: 'uses' })}
          </dd>
        </>
      )}

      {p.max_giorni_consecutivi != null && (
        <>
          <dt className="text-gray-500">{t({ it: 'Giorni consecutivi', en: 'Consecutive days' })}</dt>
          <dd className="text-white text-right font-medium">
            {t({ it: 'massimo', en: 'max' })} {p.max_giorni_consecutivi}
          </dd>
        </>
      )}
    </dl>
  );

  const PrezzoPromo: React.FC<{ p: Promozione }> = ({ p }) => {
    const sconto = p.prezzo_listino_giorno && p.prezzo_listino_giorno > p.prezzo_giorno
      ? Math.round((1 - p.prezzo_giorno / p.prezzo_listino_giorno) * 100)
      : null;
    return (
      <div className="flex items-end gap-3 flex-wrap">
        <span className="text-3xl font-bold text-white">{euro(p.prezzo_giorno)}</span>
        <span className="text-sm text-gray-400 mb-1">{t({ it: 'al giorno', en: 'per day' })}</span>
        {sconto && (
          <>
            <span className="text-base text-gray-600 line-through mb-1">{euro(p.prezzo_listino_giorno!)}</span>
            <span className="mb-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-white text-black">-{sconto}%</span>
          </>
        )}
      </div>
    );
  };

  const DettagliPromo: React.FC<{ p: Promozione }> = ({ p }) => (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      <dt className="text-gray-500">{t({ it: 'Noleggi dal', en: 'Rentals from' })}</dt>
      <dd className="text-white text-right font-medium">{dataIt(p.noleggio_dal)}</dd>
      <dt className="text-gray-500">{t({ it: 'Fino al', en: 'Until' })}</dt>
      <dd className="text-white text-right font-medium">{dataIt(p.noleggio_al)}</dd>
      {p.min_giorni != null && (
        <>
          <dt className="text-gray-500">{t({ it: 'Minimo', en: 'Minimum' })}</dt>
          <dd className="text-white text-right font-medium">{p.min_giorni} {t({ it: 'giorni', en: 'days' })}</dd>
        </>
      )}
      {p.max_giorni != null && (
        <>
          <dt className="text-gray-500">{t({ it: 'Massimo', en: 'Maximum' })}</dt>
          <dd className="text-white text-right font-medium">{p.max_giorni} {t({ it: 'giorni', en: 'days' })}</dd>
        </>
      )}
      <dt className="text-gray-500">{t({ it: 'Veicolo', en: 'Vehicle' })}</dt>
      <dd className="text-white text-right font-medium">{Array.from(new Set(p.veicoli.map(v => v.nome))).join(', ')}</dd>
      {p.posti_residui !== null && p.posti_residui <= 5 && (
        <>
          <dt className="text-amber-400 uppercase tracking-wider">{t({ it: 'Posti', en: 'Places' })}</dt>
          <dd className="text-amber-400 text-right font-medium">{t({ it: 'ne restano', en: 'only' })} {p.posti_residui}</dd>
        </>
      )}
    </dl>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen bg-black pt-28 pb-24"
    >
      <div className="container mx-auto px-4 md:px-6">
        <header className="text-center max-w-3xl mx-auto mb-14">
          <h1 className="text-3xl md:text-5xl font-bold text-white tracking-widest">
            {impostazioni.pagina_titolo}
          </h1>
          <p className="text-gray-300 mt-4 text-base md:text-lg">{impostazioni.pagina_sottotitolo}</p>
          <p className="text-gray-500 mt-3 text-sm">{impostazioni.popup_testo}</p>
        </header>

        {/* ── PROMOZIONI: si prenotano subito ─────────────────────────── */}
        {!caricamento && promozioni.length > 0 && (
          <section className="mb-16">
            <h2 className="text-2xl md:text-3xl font-bold text-white tracking-widest text-center mb-2">
              {t({ it: 'PROMOZIONI', en: 'PROMOTIONS' })}
            </h2>
            <p className="text-center text-gray-400 text-sm mb-8">
              {t({ it: 'Prezzo speciale al giorno, posti limitati. Prenoti subito.', en: 'Special daily price, limited availability. Book now.' })}
            </p>
            {promoErrore && (
              <div className="border border-red-800 bg-red-950/40 rounded-lg p-3 text-sm text-red-300 max-w-xl mx-auto mb-6">{promoErrore}</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {promozioni.map(p => (
                <article
                  key={p.id}
                  className="border border-gray-800 rounded-2xl overflow-hidden bg-gray-950 flex flex-col hover:border-gray-600 transition-colors"
                >
                  <CaroselloFoto foto={p.foto_urls} alt={titoloPromo(p)} className="h-56" />
                  <div className="p-6 flex-1 flex flex-col gap-4">
                    <div>
                      <h3 className="text-xl font-bold text-white leading-tight">{titoloPromo(p)}</h3>
                      {descrizionePromo(p) && <p className="text-sm text-gray-400 mt-2">{descrizionePromo(p)}</p>}
                    </div>
                    <PrezzoPromo p={p} />
                    <DettagliPromo p={p} />
                    <p className="text-xs text-gray-500">
                      {t({ it: 'Cauzione, assicurazione e km come una normale prenotazione.', en: 'Deposit, insurance and km as in a normal booking.' })}
                    </p>
                    <div className="mt-auto grid grid-cols-1 gap-2">
                      <button
                        onClick={() => prenotaPromo(p)}
                        className="w-full bg-white text-black py-3 font-bold text-sm tracking-wider hover:bg-gray-200 transition-colors"
                      >
                        {t({ it: 'PRENOTA', en: 'BOOK' })}
                      </button>
                      <button
                        onClick={() => setPromoScelta(p)}
                        className="w-full border border-gray-700 text-gray-300 py-2.5 font-semibold text-xs tracking-wider hover:bg-gray-900 transition-colors"
                      >
                        {t({ it: 'DETTAGLI', en: 'DETAILS' })}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {!caricamento && promozioni.length > 0 && (
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-widest text-center mb-8">
            {t({ it: 'PREVENDITE', en: 'PRE-SALES' })}
          </h2>
        )}

        {caricamento ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {[0, 1, 2].map(i => (
              <div key={i} className="border border-gray-800 rounded-2xl overflow-hidden animate-pulse">
                <div className="h-56 bg-gray-900" />
                <div className="p-6 space-y-3">
                  <div className="h-5 bg-gray-900 rounded w-2/3" />
                  <div className="h-4 bg-gray-900 rounded w-1/3" />
                  <div className="h-20 bg-gray-900 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : disponibili.length === 0 ? (
          <div className="border border-gray-800 rounded-2xl p-12 text-center max-w-xl mx-auto">
            <p className="text-white font-medium">
              {t({ it: 'Nessuna prevendita disponibile in questo momento.', en: 'No pre-sales available right now.' })}
            </p>
            <p className="text-gray-500 text-sm mt-2">
              {t({ it: 'Torna a trovarci: le prevendite escono a lotti limitati.', en: 'Come back soon: pre-sales are released in limited batches.' })}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {disponibili.map(p => {
              const sconto = vantaggio(p);
              const rimasti = p.posti_totali === null ? null : p.posti_totali - p.posti_venduti;
              return (
                <article
                  key={p.id}
                  className="border border-gray-800 rounded-2xl overflow-hidden bg-gray-950 flex flex-col hover:border-gray-600 transition-colors"
                >
                  <CaroselloFoto foto={fotoPrevendita(p)} alt={p.nome} className="h-56" />

                  <div className="p-6 flex-1 flex flex-col gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-white leading-tight">{p.nome}</h2>
                      {p.descrizione && <p className="text-sm text-gray-400 mt-2">{p.descrizione}</p>}
                    </div>

                    <div className="flex items-end gap-3">
                      <span className="text-3xl font-bold text-white">{euro(p.prezzo)}</span>
                      {p.prezzo_listino && p.prezzo_listino > p.prezzo && (
                        <span className="text-base text-gray-600 line-through mb-1">{euro(p.prezzo_listino)}</span>
                      )}
                      {sconto && (
                        <span className="mb-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-white text-black">
                          -{sconto}%
                        </span>
                      )}
                    </div>

                    <Condizioni p={p} />

                    <div className="flex flex-wrap gap-1">
                      {p.veicoli.map(v => (
                        <span key={v.id} className="px-2 py-0.5 rounded-full text-xs bg-gray-900 text-gray-400 border border-gray-800">
                          {v.nome}
                        </span>
                      ))}
                    </div>

                    {rimasti !== null && rimasti <= 5 && (
                      <p className="text-xs text-amber-400 uppercase tracking-wider">
                        {t({ it: 'Ne restano', en: 'Only' })} {rimasti}
                      </p>
                    )}

                    <div className="mt-auto grid grid-cols-1 gap-2">
                      <button
                        onClick={() => setScelta(p)}
                        className="w-full bg-white text-black py-3 font-bold text-sm tracking-wider hover:bg-gray-200 transition-colors"
                      >
                        {t({ it: 'SCOPRI E ACQUISTA', en: 'DISCOVER AND BUY' })}
                      </button>
                      {walletCarrello && (
                        <button
                          onClick={() => void prevenditaAlCarrello(p)}
                          className="w-full border border-gray-700 text-gray-300 py-2.5 font-semibold text-xs tracking-wider hover:bg-gray-900 transition-colors"
                        >
                          {t({ it: 'AGGIUNGI AL CARRELLO', en: 'ADD TO CART' })}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <p className="text-center text-xs text-gray-600 mt-12 max-w-2xl mx-auto">
          {t({
            it: 'La prevendita e’ un pacchetto di utilizzi gia’ pagati: quando prenoti scegli "Usa prevendita", il noleggio e i km inclusi sono gia’ coperti e paghi solo gli extra che aggiungi.',
            en: 'A pre-sale is a package of uses paid in advance: when you book you choose "Use pre-sale", the rental and the included km are already covered and you only pay for the extras you add.',
          })}
        </p>
      </div>

      {/* Scheda con TUTTE le condizioni + acquisto */}
      {scelta && (
        <div
          className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
          onClick={() => !inPagamento && setScelta(null)}
        >
          <div
            className="bg-gray-950 border border-gray-800 w-full max-w-lg sm:rounded-2xl my-0 sm:my-8"
            onClick={e => e.stopPropagation()}
          >
            {fotoPrevendita(scelta).length > 0 && (
              <CaroselloFoto foto={fotoPrevendita(scelta)} alt={scelta.nome} className="h-52 sm:rounded-t-2xl" />
            )}
            <div className="p-6 space-y-5">
              <div>
                <h3 className="text-xl font-bold text-white">{scelta.nome}</h3>
                {scelta.descrizione && <p className="text-sm text-gray-400 mt-2">{scelta.descrizione}</p>}
              </div>

              <div className="flex items-end gap-3">
                <span className="text-3xl font-bold text-white">{euro(scelta.prezzo)}</span>
                {scelta.prezzo_listino && scelta.prezzo_listino > scelta.prezzo && (
                  <span className="text-base text-gray-600 line-through mb-1">{euro(scelta.prezzo_listino)}</span>
                )}
              </div>

              <div className="border-t border-gray-800 pt-4">
                <Condizioni p={scelta} />
              </div>

              <div className="flex flex-wrap gap-1">
                {scelta.veicoli.map(v => (
                  <span key={v.id} className="px-2 py-0.5 rounded-full text-xs bg-gray-900 text-gray-400 border border-gray-800">
                    {v.nome}{v.targa ? ` · ${v.targa}` : ''}
                  </span>
                ))}
              </div>

              {scelta.regole_extra && (
                <div className="border-t border-gray-800 pt-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                    {t({ it: 'Altre condizioni', en: 'Other conditions' })}
                  </p>
                  <p className="text-sm text-gray-400 whitespace-pre-wrap">{scelta.regole_extra}</p>
                </div>
              )}

              {errore && (
                <div className="border border-red-800 bg-red-950/40 rounded-lg p-3 text-sm text-red-300">{errore}</div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={() => setScelta(null)}
                  disabled={inPagamento}
                  className="flex-1 border border-gray-700 text-gray-300 py-3 font-semibold text-sm hover:bg-gray-900 transition-colors disabled:opacity-50"
                >
                  {t({ it: 'Chiudi', en: 'Close' })}
                </button>
                <button
                  onClick={() => acquista(scelta)}
                  disabled={inPagamento}
                  className="flex-[2] bg-white text-black py-3 font-bold text-sm tracking-wider hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  {inPagamento
                    ? t({ it: 'ATTENDI...', en: 'PLEASE WAIT...' })
                    : user
                      ? t({ it: 'ACQUISTA ORA', en: 'BUY NOW' })
                      : t({ it: 'ACCEDI E ACQUISTA', en: 'SIGN IN AND BUY' })}
                </button>
              </div>

              {walletCarrello && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => void acquistaConCredito(scelta)}
                    disabled={inPagamento}
                    className="border border-white/40 text-white py-3 font-semibold text-xs tracking-wider hover:bg-white/10 transition-colors disabled:opacity-50"
                  >
                    {user
                      ? t({ it: 'PAGA CON CREDIT WALLET', en: 'PAY WITH CREDIT WALLET' })
                      : t({ it: 'ACCEDI E PAGA COL WALLET', en: 'SIGN IN AND PAY WITH WALLET' })}
                  </button>
                  <button
                    onClick={() => void prevenditaAlCarrello(scelta)}
                    disabled={inPagamento}
                    className="border border-gray-700 text-gray-300 py-3 font-semibold text-xs tracking-wider hover:bg-gray-900 transition-colors disabled:opacity-50"
                  >
                    {t({ it: 'AGGIUNGI AL CARRELLO', en: 'ADD TO CART' })}
                  </button>
                </div>
              )}

              <p className="text-xs text-gray-600 text-center">
                {t({
                  it: 'Dopo il pagamento la prevendita compare subito in Le Mie Prevendite, nella tua area cliente.',
                  en: 'After payment the pre-sale appears right away under My Pre-sales in your account.',
                })}
              </p>
            </div>
          </div>
        </div>
      )}
      {/* Scheda promozione */}
      {promoScelta && (
        <div
          className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
          onClick={() => setPromoScelta(null)}
        >
          <div
            className="bg-gray-950 border border-gray-800 w-full max-w-lg sm:rounded-2xl my-0 sm:my-8"
            onClick={e => e.stopPropagation()}
          >
            {promoScelta.foto_urls.length > 0 && (
              <CaroselloFoto foto={promoScelta.foto_urls} alt={titoloPromo(promoScelta)} className="h-52 sm:rounded-t-2xl" />
            )}
            <div className="p-6 space-y-5">
              <div>
                <h3 className="text-xl font-bold text-white">{titoloPromo(promoScelta)}</h3>
                {descrizionePromo(promoScelta) && (
                  <p className="text-sm text-gray-400 mt-2 whitespace-pre-wrap">{descrizionePromo(promoScelta)}</p>
                )}
              </div>
              <PrezzoPromo p={promoScelta} />
              <div className="border-t border-gray-800 pt-4">
                <DettagliPromo p={promoScelta} />
              </div>
              <p className="text-xs text-gray-500">
                {t({
                  it: 'Il prezzo promozionale vale sui giorni di noleggio. Cauzione, assicurazione e km si scelgono come in una normale prenotazione e dipendono dal profilo del conducente. Non si somma ad altri codici sconto.',
                  en: 'The promotional price applies to the rental days. Deposit, insurance and km are chosen as in a normal booking and depend on the driver profile. Cannot be combined with other discount codes.',
                })}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={() => setPromoScelta(null)}
                  className="flex-1 border border-gray-700 text-gray-300 py-3 font-semibold text-sm hover:bg-gray-900 transition-colors"
                >
                  {t({ it: 'Chiudi', en: 'Close' })}
                </button>
                <button
                  onClick={() => prenotaPromo(promoScelta)}
                  className="flex-[2] bg-white text-black py-3 font-bold text-sm tracking-wider hover:bg-gray-200 transition-colors"
                >
                  {t({ it: 'PRENOTA', en: 'BOOK' })}
                </button>
              </div>
              <p className="text-xs text-gray-600 text-center">
                {t({
                  it: 'Nella prenotazione paghi con carta o Credit Wallet, oppure la aggiungi al carrello.',
                  en: 'In the booking you pay by card or Credit Wallet, or add it to the cart.',
                })}
              </p>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default PrevenditePage;

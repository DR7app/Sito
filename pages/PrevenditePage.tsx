import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../supabaseClient';
import { caricaDatiFatturaCliente } from '../utils/datiFatturaCliente';
import CaroselloFoto from '../components/ui/CaroselloFoto';
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
 */

const euro = (n: number) =>
  `€ ${(Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const PrevenditePage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [catalogo, setCatalogo] = useState<Prevendita[]>([]);
  const [impostazioni, setImpostazioni] = useState<ImpostazioniPrevendite>(IMPOSTAZIONI_DEFAULT);
  const [caricamento, setCaricamento] = useState(true);
  const [scelta, setScelta] = useState<Prevendita | null>(null);
  const [inPagamento, setInPagamento] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let annullato = false;
    Promise.all([getCatalogoPrevendite(), getImpostazioniPrevendite()]).then(([c, i]) => {
      if (annullato) return;
      setCatalogo(c);
      setImpostazioni(i);
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
        .insert({
          prevendita_id: p.id,
          user_id: user.id,
          customer_email: dati.email || user.email || '',
          customer_nome: dati.fullName || user.fullName || '',
          customer_telefono: dati.phone || '',
          nome: p.nome,
          foto_url: p.foto_url,
          prezzo_pagato: p.prezzo,
          utilizzi_iniziali: p.utilizzi_inclusi,
          utilizzi_usati: 0,
          veicoli: p.veicoli,
          km_inclusi: p.km_inclusi,
          assicurazione_inclusa: p.assicurazione_inclusa,
          max_utilizzi_mese: p.max_utilizzi_mese,
          max_giorni_consecutivi: p.max_giorni_consecutivi,
          regole_extra: p.regole_extra,
          payment_status: 'pending',
          payment_method: 'nexi',
          nexi_order_id: nexiOrderId,
          origine: 'sito',
          customer_codice_fiscale: dati.codiceFiscale || null,
          customer_indirizzo: dati.indirizzo || null,
          customer_numero_civico: dati.numeroCivico || null,
          customer_citta: dati.cittaResidenza || null,
          customer_cap: dati.codicePostale || null,
          customer_provincia: dati.provinciaResidenza || null,
        })
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

                    <button
                      onClick={() => setScelta(p)}
                      className="mt-auto w-full bg-white text-black py-3 font-bold text-sm tracking-wider hover:bg-gray-200 transition-colors"
                    >
                      {t({ it: 'SCOPRI E ACQUISTA', en: 'DISCOVER AND BUY' })}
                    </button>
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
    </motion.div>
  );
};

export default PrevenditePage;

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import {
  getMiePrevendite,
  getMovimentiPrevendita,
  statoPrevendita,
  utilizziResidui,
  type PrevenditaCliente,
  type MovimentoPrevendita,
} from '../../utils/prevendite';

/**
 * LE MIE PREVENDITE — area cliente, 14/09/2026.
 *
 * Il cliente deve sapere sempre, senza chiedere: quanti utilizzi aveva, quanti
 * ne ha usati, quanti gliene restano, quando scade e con quali regole.
 * Sotto, l'elenco degli utilizzi: quando, per quanti giorni, su quale auto.
 */

const dataIt = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' }) : '—';

const euro = (n: number) =>
  `€ ${(Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MiePrevendite: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [pacchetti, setPacchetti] = useState<PrevenditaCliente[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [aperto, setAperto] = useState<string | null>(null);
  const [movimenti, setMovimenti] = useState<Record<string, MovimentoPrevendita[]>>({});

  useEffect(() => {
    let annullato = false;
    if (!user?.id) { setCaricamento(false); return; }
    getMiePrevendite(user.id, user.email).then(p => {
      if (annullato) return;
      setPacchetti(p);
      setCaricamento(false);
    });
    return () => { annullato = true; };
  }, [user?.id, user?.email]);

  async function apri(id: string) {
    if (aperto === id) { setAperto(null); return; }
    setAperto(id);
    if (!movimenti[id]) {
      const m = await getMovimentiPrevendita(id);
      setMovimenti(prev => ({ ...prev, [id]: m }));
    }
  }

  // Un letterale per caso: cosi' ogni etichetta e' riscrivibile dal gestionale.
  const etichettaStato = (stato: string): string => {
    switch (stato) {
      case 'attiva': return t({ it: 'Attiva', en: 'Active' });
      case 'terminata': return t({ it: 'Terminata', en: 'Finished' });
      case 'scaduta': return t({ it: 'Scaduta', en: 'Expired' });
      case 'bloccata': return t({ it: 'Bloccata', en: 'Blocked' });
      default: return '';
    }
  };

  const coloreStato: Record<string, string> = {
    attiva: 'bg-green-500/15 text-green-400',
    terminata: 'bg-blue-500/15 text-blue-400',
    scaduta: 'bg-yellow-500/15 text-yellow-400',
    bloccata: 'bg-red-500/15 text-red-400',
  };

  if (caricamento) {
    return (
      <div className="space-y-4">
        {[0, 1].map(i => (
          <div key={i} className="border border-gray-800 rounded-xl p-6 animate-pulse">
            <div className="h-5 bg-gray-900 rounded w-1/2" />
            <div className="h-20 bg-gray-900 rounded mt-4" />
          </div>
        ))}
      </div>
    );
  }

  if (pacchetti.length === 0) {
    return (
      <div className="border border-gray-800 rounded-xl p-10 text-center">
        <h2 className="text-xl font-bold text-white">
          {t({ it: 'LE MIE PREVENDITE', en: 'MY PRE-SALES' })}
        </h2>
        <p className="text-gray-400 mt-3">
          {t({ it: 'Non hai ancora nessuna prevendita.', en: 'You do not have any pre-sale yet.' })}
        </p>
        <p className="text-gray-500 text-sm mt-2">
          {t({
            it: 'Una prevendita e’ un pacchetto di utilizzi pagati in anticipo: prenoti quando vuoi e paghi solo gli extra.',
            en: 'A pre-sale is a package of uses paid in advance: you book whenever you want and only pay for extras.',
          })}
        </p>
        <Link
          to="/prevendite"
          className="inline-block mt-6 bg-white text-black px-8 py-3 font-bold text-sm tracking-wider hover:bg-gray-200 transition-colors"
        >
          {t({ it: 'SCOPRI LE PREVENDITE', en: 'DISCOVER PRE-SALES' })}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-white tracking-wider">
          {t({ it: 'LE MIE PREVENDITE', en: 'MY PRE-SALES' })}
        </h2>
        <Link to="/prevendite" className="text-sm text-gray-400 hover:text-white underline">
          {t({ it: 'Vedi le prevendite in vendita', en: 'See pre-sales on sale' })}
        </Link>
      </div>

      {pacchetti.map(pc => {
        const stato = statoPrevendita(pc);
        const residui = utilizziResidui(pc);
        const movs = movimenti[pc.id] || [];
        const scali = movs.filter(m => m.tipo === 'scalo' && !m.annullato);
        return (
          <article key={pc.id} className="border border-gray-800 rounded-xl overflow-hidden bg-gray-950">
            <div className="sm:flex">
              {pc.foto_url && (
                <img src={pc.foto_url} alt={pc.nome} className="w-full sm:w-48 h-40 sm:h-auto object-cover" />
              )}
              <div className="p-6 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="text-lg font-bold text-white">{pc.nome}</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${coloreStato[stato]}`}>
                    {etichettaStato(stato)}
                  </span>
                </div>

                {/* I tre numeri che il cliente cerca */}
                <div className="grid grid-cols-3 gap-3 mt-5">
                  {[
                    { l: t({ it: 'Utilizzi iniziali', en: 'Initial uses' }), v: pc.utilizzi_iniziali, forte: false },
                    { l: t({ it: 'Utilizzati', en: 'Used' }), v: pc.utilizzi_usati, forte: false },
                    { l: t({ it: 'Disponibili', en: 'Available' }), v: residui, forte: true },
                  ].map(k => (
                    <div key={k.l} className={`rounded-lg p-3 text-center ${k.forte ? 'bg-white text-black' : 'bg-gray-900'}`}>
                      <div className={`text-2xl font-bold ${k.forte ? 'text-black' : 'text-white'}`}>{k.v}</div>
                      <div className={`text-[11px] mt-0.5 ${k.forte ? 'text-black/70' : 'text-gray-500'}`}>{k.l}</div>
                    </div>
                  ))}
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 mt-5 text-sm">
                  <dt className="text-gray-500">{t({ it: 'Acquistata il', en: 'Purchased on' })}</dt>
                  <dd className="text-gray-300 text-right">{dataIt(pc.data_acquisto)}</dd>

                  <dt className="text-gray-500">{t({ it: 'Scade il', en: 'Expires on' })}</dt>
                  <dd className="text-gray-300 text-right">{dataIt(pc.data_scadenza)}</dd>

                  <dt className="text-gray-500">{t({ it: 'Km inclusi per utilizzo', en: 'Km included per use' })}</dt>
                  <dd className="text-gray-300 text-right">{pc.km_inclusi ? `${pc.km_inclusi} km` : '—'}</dd>

                  <dt className="text-gray-500">{t({ it: 'Assicurazione', en: 'Insurance' })}</dt>
                  <dd className="text-gray-300 text-right">
                    {pc.assicurazione_inclusa || t({ it: 'Non inclusa', en: 'Not included' })}
                  </dd>

                  {pc.max_utilizzi_mese != null && (
                    <>
                      <dt className="text-gray-500">{t({ it: 'Massimo al mese', en: 'Max per month' })}</dt>
                      <dd className="text-gray-300 text-right">{pc.max_utilizzi_mese}</dd>
                    </>
                  )}

                  {pc.max_giorni_consecutivi != null && (
                    <>
                      <dt className="text-gray-500">{t({ it: 'Giorni consecutivi', en: 'Consecutive days' })}</dt>
                      <dd className="text-gray-300 text-right">{t({ it: 'massimo', en: 'max' })} {pc.max_giorni_consecutivi}</dd>
                    </>
                  )}

                  <dt className="text-gray-500">{t({ it: 'Pagata', en: 'Paid' })}</dt>
                  <dd className="text-gray-300 text-right">{euro(pc.prezzo_pagato)}</dd>
                </dl>

                <div className="flex flex-wrap gap-1 mt-4">
                  {pc.veicoli.map(v => (
                    <span key={v.id} className="px-2 py-0.5 rounded-full text-xs bg-gray-900 text-gray-400 border border-gray-800">
                      {v.nome}
                    </span>
                  ))}
                </div>

                {pc.regole_extra && (
                  <p className="text-xs text-gray-500 mt-4 whitespace-pre-wrap">{pc.regole_extra}</p>
                )}

                <button
                  type="button"
                  onClick={() => apri(pc.id)}
                  className="mt-5 text-sm text-gray-400 hover:text-white underline"
                >
                  {aperto === pc.id
                    ? t({ it: 'Nascondi gli utilizzi', en: 'Hide uses' })
                    : t({ it: 'Vedi i tuoi utilizzi', en: 'See your uses' })}
                </button>

                {aperto === pc.id && (
                  <div className="mt-4 border-t border-gray-800 pt-4">
                    {scali.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        {t({ it: 'Non hai ancora usato questa prevendita.', en: 'You have not used this pre-sale yet.' })}
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {scali.map(m => (
                          <li key={m.id} className="flex justify-between text-sm">
                            <span className="text-gray-300">
                              {m.veicolo_nome || pc.nome}
                            </span>
                            <span className="text-gray-500">
                              {dataIt(m.data_inizio)}
                              {m.data_fine && m.data_fine !== m.data_inizio ? ` → ${dataIt(m.data_fine)}` : ''}
                              {m.giorni ? ` · ${m.giorni} ${m.giorni === 1 ? t({ it: 'giorno', en: 'day' }) : t({ it: 'giorni', en: 'days' })}` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {stato === 'attiva' && residui > 0 && (
                  <p className="text-xs text-gray-600 mt-5">
                    {t({
                      it: 'Quando prenoti una di queste auto ti verra’ chiesto se vuoi usare la prevendita: noleggio e km inclusi sono gia’ pagati, paghi solo gli extra.',
                      en: 'When you book one of these cars you will be asked whether to use the pre-sale: rental and included km are already paid, you only pay extras.',
                    })}
                  </p>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
};

export default MiePrevendite;

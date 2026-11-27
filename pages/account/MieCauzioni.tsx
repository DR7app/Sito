import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import { supabase } from '../../supabaseClient';

/**
 * LE MIE CAUZIONI — area cliente, 27/11/2026 (video di Valerio).
 *
 * Il cliente vede da solo, senza chiederlo a DR7:
 *  - le cauzioni versate, come (pre-autorizzazione, carta, bonifico), lo stato
 *    e il GIORNO DI SBLOCCO (riconsegna + 14 giorni lavorativi, la stessa data
 *    del gestionale);
 *  - per ogni prossimo noleggio: quanta cauzione chiede, quanta e' gia' coperta
 *    da quella versata, quanto resta da integrare, e lo paga da qui con la
 *    pre-autorizzazione (fondi bloccati, non incassati).
 *
 * La cauzione versata vale anche per i noleggi successivi: con 2000 versati e
 * un'auto che ne chiede 5000 si integrano 3000. I conti li fa il gestionale
 * (netlify/functions/cauzioni-cliente su platform.dr7ai.com): qui si mostra.
 */

const FUNZIONE = 'https://platform.dr7ai.com/.netlify/functions/cauzioni-cliente';

type CauzioneCliente = {
  id: string;
  importo: number;
  metodo: string;
  stato: { codice: 'versata' | 'da_versare' | 'restituita' | 'trattenuta' | string; etichetta: string };
  veicolo: string | null;
  riconsegna: string | null;
  sblocco: string | null;
  restituita_il: string | null;
  noleggi_coperti: string[];
};

type NoleggioCliente = {
  id: string;
  veicolo: string | null;
  ritiro: string | null;
  riconsegna: string | null;
  richiesta: number;
  coperta: number;
  da_integrare: number;
  collegata: boolean;
};

const dataIt = (v: string | null | undefined) =>
  v ? new Date(v.length === 10 ? `${v}T12:00:00` : v).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' }) : '—';

const euro = (n: number) =>
  `€ ${(Number(n) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function chiama(metodo: 'GET' | 'POST', corpo?: unknown) {
  const { data } = await supabase.auth.getSession();
  const jwt = data?.session?.access_token;
  if (!jwt) throw new Error('Accedi di nuovo per vedere le tue cauzioni.');
  const res = await fetch(FUNZIONE, {
    method: metodo,
    headers: { Authorization: `Bearer ${jwt}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out?.error || 'Errore, riprova piu\' tardi.');
  return out;
}

const MieCauzioni: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [versato, setVersato] = useState(0);
  const [cauzioni, setCauzioni] = useState<CauzioneCliente[]>([]);
  const [noleggi, setNoleggi] = useState<NoleggioCliente[]>([]);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [esito, setEsito] = useState<Record<string, string>>({});

  const carica = useCallback(async () => {
    if (!user?.id) { setCaricamento(false); return; }
    try {
      const out = await chiama('GET');
      setVersato(Number(out.versato || 0));
      setCauzioni(out.cauzioni || []);
      setNoleggi(out.prenotazioni || []);
      setErrore(null);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
    } finally {
      setCaricamento(false);
    }
  }, [user?.id]);

  useEffect(() => { carica(); }, [carica]);

  async function integra(n: NoleggioCliente) {
    if (inCorso) return;
    setInCorso(n.id);
    setEsito(prev => ({ ...prev, [n.id]: '' }));
    try {
      const out = await chiama('POST', { bookingId: n.id });
      if (out.paymentUrl) { window.location.href = out.paymentUrl; return; }
      if (out.coperta) {
        setEsito(prev => ({ ...prev, [n.id]: t({ it: 'Fatto: la cauzione versata copre questo noleggio.', en: 'Done: your paid deposit covers this rental.' }) }));
        await carica();
      }
    } catch (e) {
      setEsito(prev => ({ ...prev, [n.id]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setInCorso(null);
    }
  }

  const metodoIt = (m: string) => {
    switch (m) {
      case 'preautorizzazione': return t({ it: 'Pre-autorizzazione su carta', en: 'Card pre-authorization' });
      case 'carta': return t({ it: 'Carta', en: 'Card' });
      case 'bonifico': return t({ it: 'Bonifico', en: 'Bank transfer' });
      default: return m;
    }
  };

  const coloreStato: Record<string, string> = {
    versata: 'bg-green-500/15 text-green-400',
    da_versare: 'bg-yellow-500/15 text-yellow-400',
    restituita: 'bg-blue-500/15 text-blue-400',
    trattenuta: 'bg-red-500/15 text-red-400',
  };
  const etichettaStato = (s: CauzioneCliente['stato']) => {
    switch (s.codice) {
      case 'versata': return s.etichetta.startsWith('Pre') ? t({ it: 'Pre-autorizzata', en: 'Pre-authorized' }) : t({ it: 'Versata', en: 'Paid' });
      case 'da_versare': return t({ it: 'Da versare', en: 'To be paid' });
      case 'restituita': return t({ it: 'Restituita', en: 'Returned' });
      case 'trattenuta': return t({ it: 'Trattenuta', en: 'Withheld' });
      default: return s.etichetta;
    }
  };

  if (caricamento) {
    return (
      <div className="space-y-4">
        {[0, 1].map(i => (
          <div key={i} className="border border-gray-800 rounded-xl p-6 animate-pulse">
            <div className="h-5 bg-gray-900 rounded w-1/2" />
            <div className="h-4 bg-gray-900 rounded w-1/3 mt-3" />
          </div>
        ))}
      </div>
    );
  }

  if (errore) {
    return <p className="text-sm text-red-400">{errore}</p>;
  }

  const aperte = cauzioni.filter(c => c.stato.codice === 'versata' || c.stato.codice === 'da_versare');
  const chiuse = cauzioni.filter(c => !aperte.includes(c));

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">{t({ it: 'Le Mie Cauzioni', en: 'My Deposits' })}</h2>
        <p className="text-sm text-gray-400 mt-1">
          {t({
            it: 'La cauzione versata vale anche per i noleggi successivi: per un’auto che ne chiede di piu’ integri solo la differenza.',
            en: 'Your paid deposit also covers later rentals: for a car that requires more, you only top up the difference.',
          })}
        </p>
      </div>

      <div className="rounded-xl p-5 bg-white text-black">
        <div className="text-[11px] uppercase tracking-wider text-black/60">{t({ it: 'Cauzione versata oggi', en: 'Deposit currently held' })}</div>
        <div className="text-3xl font-bold mt-1">{euro(versato)}</div>
      </div>

      {noleggi.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">{t({ it: 'Prossimi noleggi', en: 'Upcoming rentals' })}</h3>
          {noleggi.map(n => (
            <article key={n.id} className="border border-gray-800 rounded-xl p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-white font-semibold">{n.veicolo || t({ it: 'Noleggio', en: 'Rental' })}</span>
                <span className="text-sm text-gray-500">{dataIt(n.ritiro)} → {dataIt(n.riconsegna)}</span>
              </div>
              <dl className="grid grid-cols-3 gap-3 mt-4 text-center">
                <div className="rounded-lg p-3 bg-gray-900">
                  <dd className="text-lg font-bold text-white">{euro(n.richiesta)}</dd>
                  <dt className="text-[11px] text-gray-500 mt-0.5">{t({ it: 'Cauzione richiesta', en: 'Deposit required' })}</dt>
                </div>
                <div className="rounded-lg p-3 bg-gray-900">
                  <dd className="text-lg font-bold text-white">{euro(n.coperta)}</dd>
                  <dt className="text-[11px] text-gray-500 mt-0.5">{t({ it: 'Gia’ versata', en: 'Already paid' })}</dt>
                </div>
                <div className={`rounded-lg p-3 ${n.da_integrare > 0 ? 'bg-white text-black' : 'bg-gray-900'}`}>
                  <dd className={`text-lg font-bold ${n.da_integrare > 0 ? 'text-black' : 'text-white'}`}>{euro(n.da_integrare)}</dd>
                  <dt className={`text-[11px] mt-0.5 ${n.da_integrare > 0 ? 'text-black/70' : 'text-gray-500'}`}>{t({ it: 'Da integrare', en: 'To top up' })}</dt>
                </div>
              </dl>

              {n.da_integrare > 0 ? (
                <button
                  type="button"
                  disabled={!!inCorso}
                  onClick={() => integra(n)}
                  className="mt-5 w-full sm:w-auto bg-white text-black px-8 py-3 font-bold text-sm tracking-wider hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  {inCorso === n.id
                    ? t({ it: 'Apertura pagamento...', en: 'Opening payment...' })
                    : n.coperta > 0
                      ? t({ it: `INTEGRA ${euro(n.da_integrare)}`, en: `TOP UP ${euro(n.da_integrare)}` })
                      : t({ it: `VERSA LA CAUZIONE (${euro(n.da_integrare)})`, en: `PAY THE DEPOSIT (${euro(n.da_integrare)})` })}
                </button>
              ) : n.collegata ? (
                <p className="mt-4 text-sm text-green-400">{t({ it: 'Coperto dalla cauzione versata.', en: 'Covered by your paid deposit.' })}</p>
              ) : (
                <button
                  type="button"
                  disabled={!!inCorso}
                  onClick={() => integra(n)}
                  className="mt-5 w-full sm:w-auto border border-white text-white px-8 py-3 font-bold text-sm tracking-wider hover:bg-white hover:text-black transition-colors disabled:opacity-50"
                >
                  {inCorso === n.id
                    ? t({ it: 'Un momento...', en: 'One moment...' })
                    : t({ it: 'USA LA CAUZIONE VERSATA', en: 'USE MY PAID DEPOSIT' })}
                </button>
              )}
              {n.da_integrare > 0 && (
                <p className="text-xs text-gray-600 mt-3">
                  {t({
                    it: 'Pre-autorizzazione: l’importo viene bloccato sulla carta, non addebitato, e si sblocca alla data indicata qui sotto.',
                    en: 'Pre-authorization: the amount is held on your card, not charged, and released on the date shown below.',
                  })}
                </p>
              )}
              {esito[n.id] && <p className="text-sm text-gray-300 mt-3">{esito[n.id]}</p>}
            </article>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">{t({ it: 'Cauzioni', en: 'Deposits' })}</h3>
        {aperte.length === 0 && chiuse.length === 0 && (
          <p className="text-sm text-gray-500">{t({ it: 'Non hai ancora cauzioni.', en: 'You have no deposits yet.' })}</p>
        )}
        {[...aperte, ...chiuse].map(c => (
          <article key={c.id} className="border border-gray-800 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xl font-bold text-white">{euro(c.importo)}</span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${coloreStato[c.stato.codice] || 'bg-gray-800 text-gray-300'}`}>
                {etichettaStato(c.stato)}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 mt-4 text-sm">
              {c.veicolo && (<>
                <dt className="text-gray-500">{t({ it: 'Noleggio', en: 'Rental' })}</dt>
                <dd className="text-gray-300 text-right">{c.veicolo}</dd>
              </>)}
              <dt className="text-gray-500">{t({ it: 'Metodo', en: 'Method' })}</dt>
              <dd className="text-gray-300 text-right">{metodoIt(c.metodo)}</dd>
              {c.noleggi_coperti.length > 0 && (<>
                <dt className="text-gray-500">{t({ it: 'Copre anche', en: 'Also covers' })}</dt>
                <dd className="text-gray-300 text-right">{c.noleggi_coperti.join(', ')}</dd>
              </>)}
              {c.stato.codice === 'restituita' ? (<>
                <dt className="text-gray-500">{t({ it: 'Restituita il', en: 'Returned on' })}</dt>
                <dd className="text-gray-300 text-right">{dataIt(c.restituita_il || c.sblocco)}</dd>
              </>) : c.stato.codice !== 'trattenuta' && (<>
                <dt className="text-gray-500">{t({ it: 'Riconsegna veicolo', en: 'Vehicle return' })}</dt>
                <dd className="text-gray-300 text-right">{dataIt(c.riconsegna)}</dd>
                <dt className="text-gray-500">{t({ it: 'Sblocco previsto', en: 'Expected release' })}</dt>
                <dd className="text-white font-semibold text-right">{dataIt(c.sblocco)}</dd>
              </>)}
            </dl>
          </article>
        ))}
        <p className="text-xs text-gray-600">
          {t({
            it: 'Lo sblocco avviene 14 giorni lavorativi dopo la riconsegna dell’ultimo noleggio coperto (festivi esclusi).',
            en: 'The release happens 14 working days after the return of the last covered rental (public holidays excluded).',
          })}
        </p>
      </section>
    </div>
  );
};

export default MieCauzioni;

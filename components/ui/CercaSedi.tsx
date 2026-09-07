/**
 * CercaSedi — la ricerca del sito, dalla lente in alto a destra.
 *
 * 07/09/2026 — cercava SOLO le sedi: chi scriveva "Lamborghini", "Huracan" o
 * "lavaggio" non trovava niente e la lente sembrava rotta. Ora cerca in tutto
 * quello che il sito mostra: veicoli a noleggio (nome e categoria), catalogo
 * Mare / Aria / Soggiorni, sedi e pagine dei servizi. Ogni risultato porta
 * dove si prenota.
 *
 * Le fonti sono le stesse che riempiono le pagine — la tabella `vehicles`,
 * `noleggio_catalog`, le Locations del pannello, i nomi di menu della
 * Centralina: nessun elenco scritto a mano qui dentro, quindi un veicolo
 * aggiunto dal gestionale si trova subito anche qui.
 *
 * Sedi: dal catalogo del pannello (Sito > Locations) — punti di ritiro e
 * riconsegna, marina, eliporti.
 *
 * Gli AEROPORTI restano fuori di proposito. Sono scali di terzi che servono
 * ai voli, non posti dove DR7 sta: in elenco facevano sembrare che DR7 avesse
 * una sede a Nizza o a Ibiza. Chi cerca "Olbia" oggi non trova niente, ed e'
 * la risposta giusta finche' li' una sede non c'e'.
 *
 * Fuori anche la consegna a domicilio: e' un servizio, non un posto.
 *
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { getHeaderCopy, getLocationsCopy, type HeaderCopy, type LocationsCopy } from '../../utils/siteCopy';
import { supabase } from '../../supabaseClient';

/**
 * Il catalogo cercabile: veicoli a noleggio e schede Mare / Aria / Soggiorni.
 *
 * Si legge UNA volta per apertura di pagina, e solo quando qualcuno apre
 * davvero la ricerca: la lente non deve costare niente a chi non la usa.
 */
type VoceCatalogo = {
  id: string;
  nome: string;
  categoria: string | null;
  tipo: 'veicolo' | 'boat_rental' | 'heli_rental' | 'stay_rental';
};

let cacheCatalogo: VoceCatalogo[] | null = null;
let attesaCatalogo: Promise<VoceCatalogo[]> | null = null;

async function caricaCatalogo(): Promise<VoceCatalogo[]> {
  if (cacheCatalogo) return cacheCatalogo;
  if (attesaCatalogo) return attesaCatalogo;
  attesaCatalogo = (async () => {
    const out: VoceCatalogo[] = [];
    try {
      const { data } = await supabase
        .from('vehicles')
        .select('id, display_name, category, status')
        .neq('status', 'retired');
      // Lo stesso modello ha piu' targhe: in ricerca si mostra una volta.
      const visti = new Set<string>();
      for (const v of (data || []) as Array<{ id: string; display_name: string | null; category: string | null }>) {
        const nome = (v.display_name || '').trim();
        const chiave = nome.toLowerCase();
        if (!nome || visti.has(chiave)) continue;
        visti.add(chiave);
        out.push({ id: v.id, nome, categoria: v.category, tipo: 'veicolo' });
      }
    } catch (err) {
      console.warn('[CercaSedi] veicoli non letti:', err);
    }
    try {
      const { data } = await supabase
        .from('noleggio_catalog')
        .select('id, name, service_type')
        .eq('is_active', true);
      for (const c of (data || []) as Array<{ id: string; name: string | null; service_type: VoceCatalogo['tipo'] }>) {
        const nome = (c.name || '').trim();
        if (!nome) continue;
        out.push({ id: c.id, nome, categoria: null, tipo: c.service_type });
      }
    } catch (err) {
      console.warn('[CercaSedi] catalogo Mare/Aria/Soggiorni non letto:', err);
    }
    cacheCatalogo = out;
    attesaCatalogo = null;
    return out;
  })();
  return attesaCatalogo;
}

/** Categoria del veicolo -> pagina della categoria (App.tsx crea /<id>). */
function paginaVeicolo(categoria: string | null): string {
  const c = (categoria || '').trim();
  return c ? `/${c}` : '/flotta';
}

const PAGINA_PER_TIPO: Record<string, string> = {
  boat_rental: '/noleggio-mare',
  heli_rental: '/noleggio-aria',
  stay_rental: '/soggiorni',
};

type Risultato = {
  chiave: string;
  titolo: string;
  /** Riga sotto: citta', codice IATA, indirizzo. Puo' mancare. */
  dettaglio?: string;
  gruppo: string;
  to: string;
};

/** Toglie accenti e maiuscole: "Cagliari" trova "cagliari", "Nizza" trova "Nice". */
function normalizza(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

const CercaSedi: React.FC<{ aperto: boolean; onClose: () => void }> = ({ aperto, onClose }) => {
  const { lang, t } = useTranslation();
  const navigate = useNavigate();
  const [locations, setLocations] = useState<LocationsCopy | null>(null);
  const [headerCopy, setHeaderCopy] = useState<HeaderCopy | null>(null);
  const [catalogo, setCatalogo] = useState<VoceCatalogo[]>([]);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let annullato = false;
    getLocationsCopy().then((l) => { if (!annullato) setLocations(l); });
    getHeaderCopy().then((h) => { if (!annullato) setHeaderCopy(h); });
    return () => { annullato = true; };
  }, []);

  // Veicoli e catalogo: si chiedono alla prima apertura della lente, non al
  // caricamento del sito.
  useEffect(() => {
    if (!aperto) return;
    let annullato = false;
    caricaCatalogo().then((c) => { if (!annullato) setCatalogo(c); });
    return () => { annullato = true; };
  }, [aperto]);

  // Il cursore va nel campo appena la finestra si apre: chi preme la lente sta
  // gia' per scrivere.
  useEffect(() => {
    if (!aperto) return;
    const id = setTimeout(() => inputRef.current?.focus(), 60);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => { clearTimeout(id); window.removeEventListener('keydown', esc); };
  }, [aperto, onClose]);

  // Chiudendo si svuota: riaprendo non si trova la ricerca di ieri.
  useEffect(() => { if (!aperto) setQuery(''); }, [aperto]);

  const tutte = useMemo<Risultato[]>(() => {
    if (!locations) return [];
    const et = {
      ritiro: t({ it: 'Ritiro e riconsegna', en: 'Pickup and return' }),
      marina: t({ it: 'Marina', en: 'Marinas' }),
      eliporti: t({ it: 'Eliporti', en: 'Heliports' }),
    };
    const bil = (i: { label_it: string; label_en: string }) => (lang === 'it' ? i.label_it : i.label_en);
    const out: Risultato[] = [];

    // Ritiro e riconsegna condividono quasi sempre gli stessi posti: si
    // mostrano una volta sola, se no la lista dice tutto due volte.
    // La consegna a domicilio non e' una sede: non e' un posto dove andare.
    const domicilio = (v: string) => /domicili|delivery|home pickup/i.test(v);
    const visti = new Set<string>();
    for (const p of [...(locations.pickup_locations || []), ...(locations.return_locations || [])]) {
      const etichetta = bil(p);
      if (!etichetta || visti.has(etichetta)) continue;
      if (domicilio(etichetta) || domicilio(p.id)) continue;
      visti.add(etichetta);
      out.push({ chiave: `pick-${p.id}-${etichetta}`, titolo: etichetta, gruppo: et.ritiro, to: '/flotta' });
    }
    for (const m of locations.yacht_marinas || []) {
      out.push({ chiave: `mar-${m.id}`, titolo: bil(m), gruppo: et.marina, to: '/noleggio-mare' });
    }
    const eli = new Set<string>();
    for (const h of [...(locations.heli_departure_points || []), ...(locations.heli_arrival_points || [])]) {
      if (eli.has(h.name)) continue;
      eli.add(h.name);
      out.push({ chiave: `eli-${h.id}-${h.name}`, titolo: h.name, gruppo: et.eliporti, to: '/noleggio-aria' });
    }
    return out;
  }, [locations, lang, t]);

  /** Veicoli e schede Mare / Aria / Soggiorni. */
  const mezzi = useMemo<Risultato[]>(() => {
    const et = {
      veicoli: t({ it: 'Veicoli', en: 'Vehicles' }),
      boat_rental: t({ it: 'Mare', en: 'Sea' }),
      heli_rental: t({ it: 'Aria', en: 'Air' }),
      stay_rental: t({ it: 'Soggiorni', en: 'Stays' }),
    };
    return catalogo.map((v) => ({
      chiave: `cat-${v.tipo}-${v.id}`,
      titolo: v.nome,
      // La categoria si vede E si cerca: "supercar" trova le supercar.
      dettaglio: v.categoria ? v.categoria.replace(/_/g, ' ') : undefined,
      gruppo: v.tipo === 'veicolo' ? et.veicoli : et[v.tipo],
      to: v.tipo === 'veicolo' ? paginaVeicolo(v.categoria) : (PAGINA_PER_TIPO[v.tipo] || '/flotta'),
    }));
  }, [catalogo, t]);

  /**
   * Le pagine dei servizi, con gli stessi nomi del menu: chi cerca
   * "lavaggio" o "club" deve arrivarci dalla lente come dal menu.
   */
  const pagine = useMemo<Risultato[]>(() => {
    const isIt = lang === 'it';
    const rec = (headerCopy || {}) as unknown as Record<string, string | undefined>;
    const nome = (itKey: string, enKey: string, fbIt: string, fbEn: string) => {
      const val = (isIt ? rec[itKey] : rec[enKey]) || '';
      return val.trim() ? val : (isIt ? fbIt : fbEn);
    };
    const gruppo = t({ it: 'Servizi', en: 'Services' });
    return [
      { chiave: 'pg-terra', titolo: nome('menu_mobilita_title_it', 'menu_mobilita_title_en', 'Terra', 'Land'), gruppo, to: '/flotta' },
      { chiave: 'pg-mare', titolo: nome('menu_mare_title_it', 'menu_mare_title_en', 'Mare', 'Sea'), gruppo, to: '/noleggio-mare' },
      { chiave: 'pg-aria', titolo: nome('menu_aria_title_it', 'menu_aria_title_en', 'Aria', 'Air'), gruppo, to: '/noleggio-aria' },
      { chiave: 'pg-soggiorni', titolo: nome('menu_property_title_it', 'menu_property_title_en', 'Soggiorni & Ospitalità', 'Stays & Hospitality'), gruppo, to: '/soggiorni' },
      { chiave: 'pg-lavaggio', titolo: nome('menu_servizi_title_it', 'menu_servizi_title_en', 'Lavaggio & Meccanica', 'Car Wash & Mechanics'), gruppo, to: '/prime-wash' },
      { chiave: 'pg-wallet', titolo: nome('menu_wallet_title_it', 'menu_wallet_title_en', 'Credit Wallet', 'Credit Wallet'), gruppo, to: '/credit-wallet' },
      { chiave: 'pg-club', titolo: nome('menu_club_title_it', 'menu_club_title_en', 'DR7 Club', 'DR7 Club'), gruppo, to: '/membership' },
      { chiave: 'pg-contatti', titolo: t({ it: 'Contatti', en: 'Contact' }), gruppo, to: '/contact' },
    ];
  }, [headerCopy, lang, t]);

  const risultati = useMemo(() => {
    // Parole separate, tutte devono corrispondere: "huracan cagliari" non
    // deve rispondere a mezza Sardegna.
    const parole = normalizza(query).split(/\s+/).filter(Boolean);
    if (parole.length === 0) return [];
    // Prima i mezzi: chi scrive un nome di modello cerca quello, non la sede.
    const tutteLeVoci = [...mezzi, ...tutte, ...pagine];
    return tutteLeVoci
      .filter((r) => {
        const testo = normalizza(`${r.titolo} ${r.dettaglio || ''} ${r.gruppo}`);
        return parole.every((p) => testo.includes(p));
      })
      .slice(0, 30);
  }, [query, tutte, mezzi, pagine]);

  const vai = (to: string) => { onClose(); navigate(to); };

  return (
    <AnimatePresence>
      {aperto && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[280] bg-[#08090A]/[0.97] backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <div className="container mx-auto px-6 pt-28 md:pt-36">
            <div className="mx-auto max-w-2xl">
              <div className="flex items-center justify-between gap-6">
                <span className="text-[11px] uppercase tracking-[0.28em] text-white/40">
                  {t({ it: 'Cerca nel sito', en: 'Search the site' })}
                </span>
                <button
                  onClick={onClose}
                  aria-label={t({ it: 'Chiudi', en: 'Close' })}
                  className="flex h-9 w-9 items-center justify-center border border-white/15 text-white/50 transition-colors duration-500 ease-editorial hover:border-white/40 hover:text-white"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.4} viewBox="0 0 24 24">
                    <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t({ it: 'Lamborghini, Cagliari, lavaggio...', en: 'Lamborghini, Cagliari, car wash...' })}
                className="mt-8 w-full border-b border-white/20 bg-transparent pb-5 font-serif text-3xl font-normal text-white placeholder:text-white/25 focus:border-white/50 focus:outline-none md:text-5xl"
              />

              <div className="mt-10 max-h-[52vh] overflow-y-auto pb-16">
                {query && risultati.length === 0 && (
                  <p className="text-sm text-white/40">
                    {t({ it: 'Nessun risultato per questa ricerca.', en: 'Nothing matches this search.' })}
                  </p>
                )}
                {risultati.map((r) => (
                  <button
                    key={r.chiave}
                    onClick={() => vai(r.to)}
                    className="group flex w-full items-baseline justify-between gap-6 border-b border-white/[0.08] py-4 text-left transition-colors duration-300 hover:border-white/25"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] text-white/75 transition-colors duration-300 group-hover:text-white">
                        {r.titolo}
                      </span>
                      {r.dettaglio && (
                        <span className="mt-1 block text-[12px] text-white/35">{r.dettaglio}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-white/30">{r.gruppo}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CercaSedi;

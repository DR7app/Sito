import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  getInvestitoriCopy, getHomeCopy, bilingual, bilingualList,
  type InvestitoriCopy, type HomeMetric, type IrNumero, type IrBarra, type IrAzionista, type IrDocumento,
} from '../utils/siteCopy';
import { useTranslation } from '../hooks/useTranslation';
import { useAspetto } from '../hooks/useAspetto';
import { useReviewCount, risolviReviewCount } from '../hooks/useReviewCount';

/**
 * Investor Relations — 22/09/2026.
 *
 * Ogni blocco si compila da Admin > Sito > Investitori. Un blocco con elenco
 * vuoto (numeri, grafico, azionisti, investitori privati, loghi) non si
 * mostra. I documenti senza file si chiedono via email.
 */

const GOLD = '#C8A24A';

// Icone a linea sottile, scelte dal gestionale per chiave.
const IR_ICONE: Record<string, React.ReactNode> = {
  ricavi: <><circle cx="12" cy="12" r="8" /><path d="M14.5 9.5a2.5 2.5 0 0 0-2.5-1.5c-1.4 0-2.5.8-2.5 2s1.1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2a2.6 2.6 0 0 1-2.5-1.5M12 6.5v1.5M12 16v1.5" /></>,
  utile: <><path d="M4 19h16" /><path d="M6 15l4-4 3 3 5-6" /><path d="M15 8h3v3" /></>,
  clienti: <><circle cx="9" cy="9" r="3" /><path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" /><circle cx="17" cy="10" r="2.2" /><path d="M16 14.6c2.3.2 3.9 1.6 4.5 4.4" /></>,
  auto: <><path d="M4 15.5V13l1.8-4.2A2 2 0 0 1 7.6 7.5h8.8a2 2 0 0 1 1.8 1.3L20 13v2.5" /><path d="M3.5 15.5h17v2h-17z" /><circle cx="7.5" cy="17.5" r="1.3" /><circle cx="16.5" cy="17.5" r="1.3" /></>,
  patrimonio: <><path d="M4 20h16" /><path d="M5 20V10l7-5 7 5v10" /><path d="M9 20v-5h6v5" /></>,
  sedi: <><path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10z" /><circle cx="12" cy="11" r="2.2" /></>,
  capitale: <><rect x="4" y="7" width="16" height="11" rx="1" /><path d="M4 11h16" /><path d="M8 15h3" /></>,
  quota: <><circle cx="12" cy="12" r="8" /><path d="M12 4v8l5.5 5.5" /></>,
  round: <><path d="M12 3l2.4 5 5.6.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9 5.6-.8z" /></>,
  documento: <><path d="M7 3.5h7l4 4V20.5H7z" /><path d="M14 3.5V8h4" /><path d="M9.5 12h6M9.5 15h6M9.5 18h4" /></>,
  presentazione: <><rect x="4" y="5" width="16" height="11" rx="1" /><path d="M12 16v4M9 20h6" /><path d="M10.5 8.5l3.5 2-3.5 2z" /></>,
  governance: <><path d="M7 3.5h7l4 4V20.5H7z" /><path d="M14 3.5V8h4" /><path d="M10 14.5l1.6 1.6 3-3.2" /></>,
  comunicati: <><rect x="4" y="5" width="16" height="14" rx="1" /><path d="M8 9h8M8 12.5h8M8 16h5" /></>,
  lucchetto: <><rect x="6" y="11" width="12" height="9" rx="1" /><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" /><circle cx="12" cy="15.5" r="1" /></>,
};

const Icona: React.FC<{ nome: string; className?: string }> = ({ nome, className = 'h-7 w-7' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    {IR_ICONE[nome] || IR_ICONE.documento}
  </svg>
);

const Freccia = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="t-nav text-[11px] uppercase tracking-[0.28em]" style={{ color: GOLD }}>{children}</p>
);

const Titolo: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <h2 className={`font-serif text-3xl md:text-[2.6rem] font-normal leading-[1.1] tracking-[-0.015em] text-white ${className}`}>{children}</h2>
);

const Paragrafi: React.FC<{ testo: string; className?: string }> = ({ testo, className = '' }) => (
  <>
    {testo.split(/\n\s*\n/).filter(p => p.trim()).map((p, i) => (
      <p key={i} className={`text-[14px] leading-relaxed text-white/70 ${i > 0 ? 'mt-3' : ''} ${className}`}>{p.trim()}</p>
    ))}
  </>
);

const BottoneOro: React.FC<{ href: string; children: React.ReactNode; pieno?: boolean }> = ({ href, children, pieno }) => {
  const classi = `t-nav inline-flex items-center gap-3 px-6 py-3.5 text-[11px] uppercase tracking-[0.22em] transition-colors ${
    pieno ? 'text-black hover:brightness-110' : 'border text-white hover:bg-white/5'
  }`;
  const stile = pieno ? { backgroundColor: GOLD } : { borderColor: `${GOLD}99` };
  const interno = href.startsWith('/') && !href.startsWith('//');
  return interno
    ? <Link to={href} className={classi} style={stile}>{children}<Freccia /></Link>
    : <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className={classi} style={stile}>{children}<Freccia /></a>;
};

/** € 1,5 M / € 450 K / € 900 */
function euroCorto(n: number, lang: string): string {
  const loc = lang === 'en' ? 'en-GB' : 'it-IT';
  if (Math.abs(n) >= 1_000_000) return `€ ${(n / 1_000_000).toLocaleString(loc, { maximumFractionDigits: 1 })} M`;
  if (Math.abs(n) >= 1_000) return `€ ${Math.round(n / 1_000).toLocaleString(loc)} K`;
  return `€ ${Math.round(n).toLocaleString(loc)}`;
}

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6 },
};

const Sezione: React.FC<{ children: React.ReactNode; className?: string; bordo?: boolean }> = ({ children, className = '', bordo = true }) => (
  <section className={`${bordo ? 'border-t border-white/[0.08]' : ''} ${className}`}>{children}</section>
);

const Grafico: React.FC<{ barre: IrBarra[]; lang: string; ricaviLabel: string; utileLabel: string }> = ({ barre, lang, ricaviLabel, utileLabel }) => {
  const max = Math.max(1, ...barre.map(b => Math.max(b.ricavi || 0, b.utile || 0)));
  const conUtile = barre.some(b => (b.utile || 0) > 0);
  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-5 text-[12px] text-white/70">
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: GOLD }} />{ricaviLabel}</span>
        {conUtile && <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-white/35" />{utileLabel}</span>}
      </div>
      <div className="flex h-56 items-end gap-6 border-b border-white/15 pb-0 md:gap-10">
        {barre.map(b => (
          <div key={b.id} className="flex h-full flex-1 flex-col justify-end">
            <div className="flex h-full items-end justify-center gap-1.5">
              <div className="flex h-full w-full max-w-[64px] flex-col justify-end">
                <span className="mb-1.5 text-center text-[11px] text-white/85">{euroCorto(b.ricavi || 0, lang)}</span>
                <motion.div
                  initial={{ height: 0 }}
                  whileInView={{ height: `${((b.ricavi || 0) / max) * 100}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.9, ease: 'easeOut' }}
                  style={{ background: `linear-gradient(180deg, ${GOLD}, #7a6230)` }}
                />
              </div>
              {conUtile && (
                <div className="flex h-full w-full max-w-[64px] flex-col justify-end">
                  <span className="mb-1.5 text-center text-[11px] text-white/60">{euroCorto(b.utile || 0, lang)}</span>
                  <motion.div
                    initial={{ height: 0 }}
                    whileInView={{ height: `${((b.utile || 0) / max) * 100}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.9, delay: 0.1, ease: 'easeOut' }}
                    className="bg-white/25"
                    title={`${utileLabel}: ${euroCorto(b.utile || 0, lang)}`}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-6 md:gap-10">
        {barre.map(b => <span key={b.id} className="flex-1 text-center text-[12px] text-white/60">{b.anno}</span>)}
      </div>
    </div>
  );
};

// I numeri sono quelli della Home (Admin > Sito > Home): una cifra sola per
// tutto il sito. L'icona si sceglie dall'id della metrica.
const ICONA_METRICA: Record<string, string> = {
  contratti: 'documento', clienti: 'clienti', fatturato: 'ricavi', parco: 'auto',
  patrimonio: 'patrimonio', capitale: 'capitale', recensioni: 'round', brand: 'utile', azienda: 'patrimonio',
};

const SchedaNumero: React.FC<{ m: HomeMetric; lang: string }> = ({ m, lang }) => (
  <div className="border-t border-white/[0.08] pt-5">
    <Icona nome={ICONA_METRICA[m.id] || 'round'} />
    <p className="mt-4 font-serif text-[1.7rem] leading-none text-white">{m.value}</p>
    <p className="mt-2 text-[12px] text-white/80">{bilingual(m, 'label', lang)}</p>
  </div>
);

// Colonne secondo quante schede ci sono: due azionisti non restano stretti a
// sinistra in una griglia da cinque. Classi scritte per intero per Tailwind.
const GRIGLIA_AZIONISTI: Record<number, string> = {
  0: '',
  1: 'sm:max-w-[260px] sm:grid-cols-1',
  2: 'sm:max-w-[540px] sm:grid-cols-2',
  3: 'sm:grid-cols-3 lg:max-w-[820px]',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
  5: 'sm:grid-cols-3 lg:grid-cols-5',
};

const SchedaAzionista: React.FC<{ a: IrAzionista; lang: string; riservatoLabel: string }> = ({ a, lang, riservatoLabel }) => (
  <div className="w-[62vw] max-w-[220px] shrink-0 snap-start border border-white/[0.1] bg-white/[0.02] sm:w-auto sm:max-w-none">
    <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-b from-white/[0.04] to-transparent">
      {a.riservato
        ? <div className="flex h-full items-center justify-center"><span className="flex h-14 w-14 items-center justify-center rounded-full border" style={{ borderColor: `${GOLD}66` }}><Icona nome="lucchetto" className="h-6 w-6" /></span></div>
        : a.foto
          ? <img src={a.foto} alt={a.nome} loading="lazy" className="h-full w-full object-cover" />
          // Senza foto: le iniziali, finche' la direzione non la carica.
          : <div className="flex h-full items-center justify-center"><span className="font-serif text-5xl" style={{ color: GOLD }}>{a.nome.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase()}</span></div>}
    </div>
    <div className="px-4 py-4">
      <p className={a.riservato ? 't-nav text-[11px] uppercase tracking-[0.2em] text-white' : 'text-[15px] text-white'}>
        {a.riservato ? (a.nome || riservatoLabel) : a.nome}
      </p>
      {bilingual(a, 'ruolo', lang) && <p className="mt-1 text-[12px] text-white/55">{bilingual(a, 'ruolo', lang)}</p>}
      {bilingual(a, 'da', lang) && <p className="text-[12px] text-white/55">{bilingual(a, 'da', lang)}</p>}
    </div>
  </div>
);

// Pochi azionisti (1-2): una scheda larga su una riga invece di un
// rettangolo alto e solo. Stessi dati, stessa regola riservato / foto / iniziali.
const RigaAzionista: React.FC<{ a: IrAzionista; lang: string; riservatoLabel: string }> = ({ a, lang, riservatoLabel }) => {
  const iniziali = a.nome.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
  const dettagli = [bilingual(a, 'ruolo', lang), bilingual(a, 'da', lang)].filter(Boolean);
  return (
    <div className="flex items-center gap-5 border border-white/[0.1] bg-white/[0.02] px-5 py-5 sm:gap-7 sm:px-8 sm:py-6">
      <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border sm:h-20 sm:w-20" style={{ borderColor: `${GOLD}66` }}>
        {a.riservato
          ? <Icona nome="lucchetto" className="h-7 w-7" />
          : a.foto
            ? <img src={a.foto} alt={a.nome} loading="lazy" className="h-full w-full object-cover" />
            : <span className="font-serif text-2xl" style={{ color: GOLD }}>{iniziali}</span>}
      </span>
      <div className="min-w-0 flex-1">
        <p className={a.riservato ? 't-nav text-[12px] uppercase tracking-[0.22em] text-white' : 'text-[17px] text-white'}>
          {a.riservato ? (a.nome || riservatoLabel) : a.nome}
        </p>
        {dettagli.length > 0 && (
          <p className="mt-1.5 text-[13px] text-white/55">
            {dettagli.map((d, i) => <React.Fragment key={i}>{i > 0 && <span className="mx-2 text-white/25">·</span>}{d}</React.Fragment>)}
          </p>
        )}
      </div>
    </div>
  );
};

const SchedaDocumento: React.FC<{ d: IrDocumento; lang: string; mailto: string }> = ({ d, lang, mailto }) => {
  const titolo = bilingual(d, 'titolo', lang);
  // Scheda con piu' file (es. un bilancio per anno): li elenca tutti, ognuno
  // si apre in una nuova scheda. Senza file resta il comportamento di prima.
  const file = (d.file || []).filter(f => f.url?.trim());
  if (file.length > 0) {
    return (
      <div className="border border-white/[0.1] bg-white/[0.02] p-6">
        <Icona nome={d.icona} className="h-8 w-8" />
        <p className="mt-6 text-[15px] text-white">{titolo}</p>
        <ul className="mt-3 space-y-2">
          {file.map(f => (
            <li key={f.id}>
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[12px] hover:underline" style={{ color: GOLD }}>
                {bilingual(f, 'nome', lang)}<Freccia />
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const href = d.url?.trim() || `${mailto}?subject=${encodeURIComponent(titolo)}`;
  const interno = href.startsWith('/') && !href.startsWith('//');
  const corpo = (
    <>
      <Icona nome={d.icona} className="h-8 w-8" />
      <p className="mt-6 text-[15px] text-white">{titolo}</p>
      <p className="mt-2 inline-flex items-center gap-2 text-[12px]" style={{ color: GOLD }}>{bilingual(d, 'azione', lang)}<Freccia /></p>
    </>
  );
  const classi = 'block border border-white/[0.1] bg-white/[0.02] p-6 transition-colors hover:border-white/25';
  return interno
    ? <Link to={href} className={classi}>{corpo}</Link>
    : <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className={classi}>{corpo}</a>;
};

const InvestitoriPage: React.FC = () => {
  const aspetto = useAspetto();
  const { t, lang } = useTranslation();
  const [copy, setCopy] = useState<InvestitoriCopy | null>(null);
  const [metriche, setMetriche] = useState<HomeMetric[]>([]);
  const reviewCount = useReviewCount();

  useEffect(() => {
    let cancelled = false;
    getInvestitoriCopy().then((c) => { if (!cancelled) setCopy(c); });
    getHomeCopy().then((h) => { if (!cancelled) setMetriche(h.metrics || []); });
    return () => { cancelled = true; };
  }, []);

  if (!copy) return <div className="min-h-screen bg-black" />;

  const tx = (base: string) => bilingual(copy, base, lang);
  const email = (copy.cta_email || '').trim();
  const mailto = email ? `mailto:${email}` : '/contact';
  // "Manifesta il tuo interesse": WhatsApp se c'e', altrimenti email.
  const contatto = (copy.cta_whatsapp_url || '').trim() || (email ? `${mailto}?subject=${encodeURIComponent('Investor Relations DR7')}` : '/contact');

  // Come sulla Home: finche' il conteggio delle recensioni non si sa, quella
  // metrica non si mostra.
  const numeri = metriche
    .map((m) => ({ ...m, value: risolviReviewCount(m.value, reviewCount) }))
    .filter((m): m is HomeMetric => m.value !== null);
  const barre = (copy.ir_crescita || []).filter(b => b.anno);
  const azionisti = copy.ir_azionisti || [];
  const stat = copy.ir_privati_stat || [];
  const loghi = (copy.ir_partner_loghi || []).filter(l => l.logo || l.nome);
  const documenti = copy.ir_gov_documenti || [];
  const info = copy.info_items || [];
  const legale = bilingualList(copy, 'legal_paragraphs', lang);
  const heroImg = copy.ir_hero_img || aspetto.img_investitori_hero;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="bg-[#0b0b0b] text-white">
      {/* Hero */}
      <section className="relative overflow-hidden">
        {heroImg && <img src={heroImg} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/20" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-[#0b0b0b]" />
        <div className="container relative z-10 mx-auto px-6 pb-20 pt-36 md:pb-28 md:pt-44">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="max-w-xl">
            <Eyebrow>{tx('ir_hero_eyebrow')}</Eyebrow>
            <h1 className="notranslate mt-5 font-serif text-5xl font-normal leading-[1.02] tracking-[-0.02em] md:text-7xl">
              {tx('ir_hero_riga1')}<br />{tx('ir_hero_riga2')}
              {tx('ir_hero_accento') && <><br /><em className="italic" style={{ color: GOLD }}>{tx('ir_hero_accento')}</em></>}
            </h1>
            <div className="mt-7 max-w-md"><Paragrafi testo={tx('ir_hero_testo')} className="text-white/80" /></div>
            {tx('ir_hero_bottone') && <div className="mt-8"><BottoneOro href={contatto}>{tx('ir_hero_bottone')}</BottoneOro></div>}
          </motion.div>
        </div>
      </section>

      {/* I nostri numeri */}
      {numeri.length > 0 && (
        <Sezione className="py-16 md:py-20">
          <div className="container mx-auto px-6">
            <motion.div {...fadeUp} className="grid gap-6 md:grid-cols-[1fr_minmax(0,380px)] md:items-end">
              <div><Eyebrow>{tx('ir_numeri_eyebrow')}</Eyebrow><Titolo className="mt-4">{tx('ir_numeri_titolo')}</Titolo></div>
              {tx('ir_numeri_testo') && <p className="text-[13px] leading-relaxed text-white/60">{tx('ir_numeri_testo')}</p>}
            </motion.div>
            <motion.div {...fadeUp} className="mt-12 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
              {numeri.map(m => <SchedaNumero key={m.id} m={m} lang={lang} />)}
            </motion.div>
          </div>
        </Sezione>
      )}

      {/* Crescita + Visione */}
      <Sezione>
        <div className={`grid ${barre.length > 0 ? 'lg:grid-cols-2' : ''}`}>
          {barre.length > 0 && (
            <motion.div {...fadeUp} className="border-white/[0.08] px-6 py-14 lg:border-r lg:px-12">
              <Eyebrow>{tx('ir_crescita_titolo')}</Eyebrow>
              <div className="mt-8"><Grafico barre={barre} lang={lang} ricaviLabel={tx('ir_crescita_ricavi')} utileLabel={tx('ir_crescita_utile')} /></div>
              {tx('ir_crescita_nota') && <p className="mt-5 text-[11px] text-white/45">{tx('ir_crescita_nota')}</p>}
            </motion.div>
          )}
          <div className="relative overflow-hidden">
            {copy.ir_visione_img && <img src={copy.ir_visione_img} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/30" />
            <motion.div {...fadeUp} className={`relative px-6 py-16 lg:px-12 ${barre.length > 0 ? '' : 'container mx-auto'}`}>
              <div className="max-w-md">
                <Eyebrow>{tx('ir_visione_eyebrow')}</Eyebrow>
                <Titolo className="mt-4">{tx('ir_visione_titolo')}</Titolo>
                <div className="mt-6"><Paragrafi testo={tx('ir_visione_testo')} /></div>
                {tx('ir_visione_bottone') && copy.ir_visione_link && <div className="mt-8"><BottoneOro href={copy.ir_visione_link}>{tx('ir_visione_bottone')}</BottoneOro></div>}
              </div>
            </motion.div>
          </div>
        </div>
      </Sezione>

      {/* Azionisti */}
      {azionisti.length > 0 && (
        <Sezione className="py-16 md:py-20">
          <div className="container mx-auto px-6">
            <motion.div {...fadeUp} className="grid gap-6 md:grid-cols-[1fr_minmax(0,380px)] md:items-end">
              <div><Eyebrow>{tx('ir_azionisti_eyebrow')}</Eyebrow><Titolo className="mt-4">{tx('ir_azionisti_titolo')}</Titolo></div>
              {tx('ir_azionisti_testo') && <p className="text-[13px] leading-relaxed text-white/60">{tx('ir_azionisti_testo')}</p>}
            </motion.div>
            {azionisti.length < 3 ? (
              <motion.div {...fadeUp} className={`mt-12 grid gap-4 ${azionisti.length === 2 ? 'md:grid-cols-2' : 'max-w-2xl'}`}>
                {azionisti.map(a => <RigaAzionista key={a.id} a={a} lang={lang} riservatoLabel={t({ it: 'Investitore privato', en: 'Private investor' })} />)}
              </motion.div>
            ) : (
              <motion.div {...fadeUp} className={`-mx-6 mt-12 flex snap-x gap-4 overflow-x-auto px-6 pb-2 sm:mx-0 sm:grid sm:overflow-visible sm:px-0 ${GRIGLIA_AZIONISTI[Math.min(azionisti.length, 5)]}`}>
                {azionisti.map(a => <SchedaAzionista key={a.id} a={a} lang={lang} riservatoLabel={t({ it: 'Investitore privato', en: 'Private investor' })} />)}
              </motion.div>
            )}
          </div>
        </Sezione>
      )}

      {/* Investitori privati */}
      {stat.length > 0 && (
        <Sezione>
          <div className={`grid ${copy.ir_privati_img ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]' : ''}`}>
            {copy.ir_privati_img && (
              <div className="relative min-h-[240px] overflow-hidden">
                <img src={copy.ir_privati_img} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0b0b0b]/80" />
              </div>
            )}
            <motion.div {...fadeUp} className={`grid gap-10 px-6 py-14 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:px-12 ${copy.ir_privati_img ? '' : 'container mx-auto'}`}>
              <div>
                <Eyebrow>{tx('ir_privati_eyebrow')}</Eyebrow>
                {tx('ir_privati_titolo') && <Titolo className="mt-4">{tx('ir_privati_titolo')}</Titolo>}
                {tx('ir_privati_testo') && <div className="mt-5"><Paragrafi testo={tx('ir_privati_testo')} /></div>}
                <div className="mt-8 grid grid-cols-1 border border-white/[0.1] sm:grid-cols-3">
                  {stat.map(n => (
                    <div key={n.id} className="border-white/[0.1] p-5 sm:border-l sm:first:border-l-0">
                      <Icona nome={n.icona} className="h-6 w-6" />
                      <p className="mt-3 font-serif text-xl text-white">{n.valore}</p>
                      {bilingual(n, 'label', lang) && <p className="mt-1 text-[12px] text-white/70">{bilingual(n, 'label', lang)}</p>}
                      {bilingual(n, 'nota', lang) && <p className="text-[11px] text-white/45">{bilingual(n, 'nota', lang)}</p>}
                    </div>
                  ))}
                </div>
              </div>
              {tx('ir_riservati_label') && (
                <div className="border-white/[0.08] md:border-l md:pl-8">
                  <Eyebrow>{tx('ir_riservati_eyebrow')}</Eyebrow>
                  <p className="mt-4 text-[13px] leading-relaxed text-white/65">{tx('ir_riservati_testo')}</p>
                  <div className="mt-8 flex flex-col items-center text-center">
                    <span className="flex h-16 w-16 items-center justify-center rounded-full border" style={{ borderColor: `${GOLD}66` }}><Icona nome="lucchetto" /></span>
                    <p className="t-nav mt-4 text-[11px] uppercase tracking-[0.2em]" style={{ color: GOLD }}>{tx('ir_riservati_label')}</p>
                    {tx('ir_riservati_nota') && <p className="mt-1 text-[12px] text-white/55">{tx('ir_riservati_nota')}</p>}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </Sezione>
      )}

      {/* Partner strategici */}
      {loghi.length > 0 && (
        <Sezione className="relative overflow-hidden">
          {copy.ir_partner_img && <img src={copy.ir_partner_img} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/75 to-black/60" />
          <div className="container relative mx-auto grid gap-12 px-6 py-16 md:py-20 lg:grid-cols-2 lg:items-center">
            <motion.div {...fadeUp} className="max-w-md">
              <Eyebrow>{tx('ir_partner_eyebrow')}</Eyebrow>
              <Titolo className="mt-4">{tx('ir_partner_titolo')}</Titolo>
              {tx('ir_partner_testo') && <div className="mt-5"><Paragrafi testo={tx('ir_partner_testo')} /></div>}
              {tx('ir_partner_bottone') && copy.ir_partner_link && <div className="mt-8"><BottoneOro href={copy.ir_partner_link}>{tx('ir_partner_bottone')}</BottoneOro></div>}
            </motion.div>
            <motion.div {...fadeUp} className="grid grid-cols-2 items-center gap-x-8 gap-y-10 sm:grid-cols-3">
              {loghi.map(l => {
                const segno = l.logo
                  ? <img src={l.logo} alt={l.nome} loading="lazy" className="mx-auto max-h-9 w-auto max-w-[150px] object-contain opacity-75 transition-opacity duration-300 group-hover:opacity-100" />
                  : <span className="block text-center font-serif text-xl text-white/90">{l.nome}</span>;
                return l.link
                  ? <a key={l.id} href={l.link} target="_blank" rel="noopener noreferrer" title={l.nome} className="group block">{segno}</a>
                  : <div key={l.id}>{segno}</div>;
              })}
            </motion.div>
          </div>
        </Sezione>
      )}

      {/* Governance */}
      <Sezione className="py-16 md:py-20">
        <div className="container mx-auto px-6">
          <motion.div {...fadeUp} className="grid gap-6 md:grid-cols-[1fr_minmax(0,380px)] md:items-end">
            <div><Eyebrow>{tx('ir_gov_eyebrow')}</Eyebrow><Titolo className="mt-4">{tx('ir_gov_titolo')}</Titolo></div>
            {tx('ir_gov_testo') && <p className="text-[13px] leading-relaxed text-white/60">{tx('ir_gov_testo')}</p>}
          </motion.div>
          {documenti.length > 0 && (
            <motion.div {...fadeUp} className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {documenti.map(d => <SchedaDocumento key={d.id} d={d} lang={lang} mailto={mailto} />)}
            </motion.div>
          )}
          {info.length > 0 && (
            <motion.div {...fadeUp} className="mt-12">
              {tx('info_heading') && <p className="t-nav mb-4 text-[11px] uppercase tracking-[0.22em] text-white/55">{tx('info_heading')}</p>}
              <dl className="grid grid-cols-1 border-t border-white/[0.08] sm:grid-cols-2">
                {info.map((it, i) => (
                  <div key={i} className="flex justify-between gap-6 border-b border-white/[0.08] py-3 text-[13px] sm:odd:pr-8 sm:even:pl-8">
                    <dt className="text-white/50">{bilingual(it, 'label', lang)}</dt>
                    <dd className="text-right text-white/90">{bilingual(it, 'value', lang)}</dd>
                  </div>
                ))}
              </dl>
              {tx('info_footnote') && <p className="mt-4 text-[12px] italic text-white/45">{tx('info_footnote')}</p>}
            </motion.div>
          )}
        </div>
      </Sezione>

      {/* Chiusura */}
      <Sezione className="bg-gradient-to-br from-[#16130d] via-[#0b0b0b] to-[#0b0b0b]">
        <div className="container mx-auto grid gap-10 px-6 py-16 md:py-20 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-center">
          <motion.div {...fadeUp}>
            <Eyebrow>{tx('ir_cta_eyebrow')}</Eyebrow>
            <Titolo className="mt-4">{tx('ir_cta_titolo')}</Titolo>
            {tx('ir_cta_testo') && <div className="mt-5 max-w-lg"><Paragrafi testo={tx('ir_cta_testo')} /></div>}
          </motion.div>
          <motion.div {...fadeUp} className="lg:justify-self-end">
            {tx('ir_cta_bottone') && <BottoneOro href={contatto} pieno>{tx('ir_cta_bottone')}</BottoneOro>}
            {tx('ir_cta_nota') && <p className="mt-5 max-w-sm text-[13px] leading-relaxed text-white/60">{tx('ir_cta_nota')}</p>}
            {email && <a href={mailto} className="mt-3 inline-block text-[13px] underline decoration-white/30 underline-offset-4 hover:decoration-white" style={{ color: GOLD }}>{email}</a>}
          </motion.div>
        </div>
      </Sezione>

      {/* Avvertenza legale */}
      {legale.length > 0 && (
        <Sezione className="py-10">
          <div className="container mx-auto px-6">
            {tx('legal_heading') && <p className="t-nav mb-3 text-[10px] uppercase tracking-[0.22em] text-white/45">{tx('legal_heading')}</p>}
            {legale.map((p, i) => <p key={i} className="mt-2 max-w-4xl text-[11px] leading-relaxed text-white/40">{p}</p>)}
          </div>
        </Sezione>
      )}
    </motion.div>
  );
};

export default InvestitoriPage;

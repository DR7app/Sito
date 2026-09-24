import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getInvestitoriCopy, bilingual, type InvestitoriCopy, type IrDocumento } from '../utils/siteCopy';
import { useTranslation } from '../hooks/useTranslation';

/**
 * 24/09/2026 — Documento Investitori che e' un video (es. Investor
 * Presentation): la scheda apre questa pagina invece dell'email. Titolo e
 * file sono quelli del documento in Admin > Sito > Investitori; occhiello,
 * testo e bottone sono quelli dell'apertura della pagina Investitori.
 *
 * Il filmato e' verticale: su computer sta a destra, intero nello schermo,
 * col testo a sinistra; su telefono viene prima del testo. Parte solo col
 * tocco sul bottone grande, con l'audio (e' una presentazione parlata).
 */

const GOLD = '#C8A24A';

/** Un documento il cui file e' un video si guarda qui, non si scarica. */
export const eVideo = (url?: string) => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test((url || '').trim());

// Copertina: per un video del sito (/video-x.mp4) si cerca /video-x.jpg
// accanto. Se non c'e' si usa il primo fotogramma.
const copertinaDi = (url: string) =>
  url.startsWith('/') && !url.startsWith('//') ? url.replace(/\.(mp4|webm|mov|m4v)(\?.*)?$/i, '.jpg') : '';

const durata = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

const Freccia: React.FC<{ indietro?: boolean }> = ({ indietro }) => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
    <path d={indietro ? 'M19 12H5M11 6l-6 6 6 6' : 'M5 12h14M13 6l6 6-6 6'} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const InvestitoriVideoPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useTranslation();
  const [copy, setCopy] = useState<InvestitoriCopy | null>(null);
  const [doc, setDoc] = useState<IrDocumento | null | undefined>(undefined);
  const [copertina, setCopertina] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [secondi, setSecondi] = useState(0);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let cancelled = false;
    getInvestitoriCopy().then((c) => {
      if (cancelled) return;
      setCopy(c);
      setDoc((c.ir_gov_documenti || []).find(x => x.id === id && eVideo(x.url)) || null);
    });
    return () => { cancelled = true; };
  }, [id]);

  const src = doc?.url.trim() || '';
  useEffect(() => {
    const url = copertinaDi(src);
    if (!url) return;
    const img = new Image();
    img.onload = () => setCopertina(url);
    img.src = url;
  }, [src]);

  if (doc === undefined || !copy) return <div className="min-h-screen bg-[#0b0b0b]" />;

  const tx = (base: string) => bilingual(copy, base, lang);
  const email = (copy.cta_email || '').trim();
  const contatto = (copy.cta_whatsapp_url || '').trim() || (email ? `mailto:${email}?subject=${encodeURIComponent('Investor Relations DR7')}` : '/contact');
  const testo = tx('ir_hero_testo').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

  const guarda = () => {
    const v = video.current;
    if (!v) return;
    v.muted = false;
    void v.play();
  };

  const tornaIndietro = (
    <Link to="/investitori" className="t-nav inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-white/60 transition-colors hover:text-white">
      <Freccia indietro />{t({ it: 'Investitori', en: 'Investors' })}
    </Link>
  );

  if (!doc) {
    return (
      <div className="min-h-screen bg-[#0b0b0b] px-6 pt-36 text-white">
        <div className="container mx-auto">
          {tornaIndietro}
          <p className="mt-8 text-[14px] text-white/65">{t({ it: 'Video non disponibile.', en: 'Video not available.' })}</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="relative min-h-screen overflow-hidden bg-[#0b0b0b] text-white">
      {/* Atmosfera: la copertina sfocata e un bagliore d'oro dietro al filmato. */}
      {copertina && (
        <img src={copertina} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-[0.18] blur-3xl" />
      )}
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(45% 55% at 68% 50%, ${GOLD}22, transparent 70%)` }} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0b0b0b]/60 via-transparent to-[#0b0b0b]" />

      <div className="container relative mx-auto grid grid-cols-1 items-center gap-10 px-6 pb-20 pt-28 md:pt-32 lg:min-h-screen lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-20 lg:pb-16">
        {/* Testo */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="order-2 min-w-0 max-w-xl lg:order-1">
          <div className="hidden lg:block">{tornaIndietro}</div>
          <p className="t-nav text-[11px] uppercase tracking-[0.28em] lg:mt-10" style={{ color: GOLD }}>{tx('ir_hero_eyebrow')}</p>
          <h1 className="notranslate mt-5 font-serif text-4xl font-normal leading-[1.04] tracking-[-0.02em] md:text-6xl">{bilingual(doc, 'titolo', lang)}</h1>
          <span className="mt-7 block h-px w-12" style={{ backgroundColor: GOLD }} />
          <div className="mt-7 space-y-3">
            {testo.map((p, i) => <p key={i} className="text-[15px] leading-relaxed text-white/70">{p}</p>)}
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            {tx('ir_hero_bottone') && (
              <a href={contatto} target={contatto.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
                className="t-nav inline-flex items-center gap-3 px-6 py-3.5 text-[11px] uppercase tracking-[0.22em] text-black transition hover:brightness-110"
                style={{ backgroundColor: GOLD }}>
                {tx('ir_hero_bottone')}<Freccia />
              </a>
            )}
            <Link to="/investitori" className="t-nav inline-flex items-center gap-3 border px-6 py-3.5 text-[11px] uppercase tracking-[0.22em] text-white transition-colors hover:bg-white/5" style={{ borderColor: `${GOLD}99` }}>
              {t({ it: 'Torna agli investitori', en: 'Back to investors' })}
            </Link>
          </div>
        </motion.div>

        {/* Filmato */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1 }} className="order-1 min-w-0 lg:order-2">
          <div className="mb-6 lg:hidden">{tornaIndietro}</div>
          <div
            className="relative mx-auto aspect-[9/16] w-full max-w-[420px] overflow-hidden border bg-black lg:h-[min(80vh,780px)] lg:w-auto lg:max-w-none"
            style={{ borderColor: `${GOLD}55`, boxShadow: `0 40px 120px -30px ${GOLD}40, 0 0 0 1px rgba(255,255,255,0.03)` }}
          >
            <video
              ref={video}
              src={copertina ? src : `${src}#t=0.1`}
              poster={copertina || undefined}
              controls={inCorso}
              playsInline
              preload="metadata"
              onLoadedMetadata={e => setSecondi(e.currentTarget.duration || 0)}
              onPlay={() => setInCorso(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
            {!inCorso && (
              <button type="button" onClick={guarda} aria-label={t({ it: 'Guarda il video', en: 'Watch the video' })}
                className="group absolute inset-0 flex flex-col items-center justify-end bg-gradient-to-t from-black/75 via-black/10 to-transparent pb-10">
                <span className="flex h-20 w-20 items-center justify-center rounded-full border backdrop-blur-sm transition-transform duration-300 group-hover:scale-105"
                  style={{ borderColor: GOLD, backgroundColor: 'rgba(0,0,0,0.35)' }}>
                  <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7" fill={GOLD} aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
                </span>
                <span className="t-nav mt-4 text-[11px] uppercase tracking-[0.25em] text-white">
                  {bilingual(doc, 'azione', lang) || t({ it: 'Guarda il video', en: 'Watch the video' })}
                  {secondi > 0 && <span className="text-white/60"> · {durata(secondi)}</span>}
                </span>
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default InvestitoriVideoPage;

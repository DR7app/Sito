import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getInvestitoriCopy, bilingual, type IrDocumento } from '../utils/siteCopy';
import { useTranslation } from '../hooks/useTranslation';

/**
 * 24/09/2026 — Documento Investitori che e' un video (es. Investor
 * Presentation): la scheda apre questa pagina invece dell'email. Titolo e
 * file sono quelli del documento in Admin > Sito > Investitori.
 */

const GOLD = '#C8A24A';

/** Un documento il cui file e' un video si guarda qui, non si scarica. */
export const eVideo = (url?: string) => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test((url || '').trim());

const InvestitoriVideoPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useTranslation();
  const [doc, setDoc] = useState<IrDocumento | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getInvestitoriCopy().then((c) => {
      if (cancelled) return;
      const d = (c.ir_gov_documenti || []).find(x => x.id === id && eVideo(x.url));
      setDoc(d || null);
    });
    return () => { cancelled = true; };
  }, [id]);

  if (doc === undefined) return <div className="min-h-screen bg-[#0b0b0b]" />;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="min-h-screen bg-[#0b0b0b] text-white">
      <div className="container mx-auto px-6 pb-20 pt-32 md:pt-40">
        <Link to="/investitori" className="t-nav inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em]" style={{ color: GOLD }}>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t({ it: 'Investitori', en: 'Investors' })}
        </Link>
        {doc ? (
          <>
            <h1 className="notranslate mt-6 font-serif text-4xl font-normal leading-[1.05] tracking-[-0.02em] md:text-5xl">{bilingual(doc, 'titolo', lang)}</h1>
            <span className="mt-6 block h-px w-12" style={{ backgroundColor: GOLD }} />
            <div className="mt-10 flex justify-center">
              {/* #t=0.1: il browser mostra il primo fotogramma invece di un riquadro nero. */}
              <video
                src={`${doc.url.trim()}#t=0.1`}
                controls
                playsInline
                preload="metadata"
                className="max-h-[80vh] w-full max-w-[480px] border border-white/[0.1] bg-black"
              />
            </div>
          </>
        ) : (
          <p className="mt-10 text-[14px] text-white/65">{t({ it: 'Video non disponibile.', en: 'Video not available.' })}</p>
        )}
      </div>
    </motion.div>
  );
};

export default InvestitoriVideoPage;

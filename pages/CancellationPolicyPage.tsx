import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import BackButton from '../components/ui/BackButton';
import { useCancellationPolicy } from '../hooks/useCancellationPolicy';
import {
  getCancellazioneCopy,
  applyCancellazionePlaceholders,
  type CancellazioneCopy,
  type CancellazioneSection,
  type CancellazioneBlock,
  type CancellazionePlaceholderValues,
} from '../utils/siteCopy';

const CancellationPolicyPage = () => {
  const { lang, t } = useTranslation();
  // Pull the "main" rule (highest threshold) from Centralina Pro to drive
  // the displayed numbers. Operators edit the rules in admin > Centralina
  // Pro > Automazioni > "Regole di cancellazione". Static text comes from
  // admin > Sito > Cancellazione (utils/siteCopy).
  const { thresholdDays, refundPercent, penaltyPercent } = useCancellationPolicy();
  const [copy, setCopy] = useState<CancellazioneCopy | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCancellazioneCopy().then((c) => {
      if (!cancelled) setCopy(c);
    });
    return () => { cancelled = true; };
  }, []);

  const daysWord = `${thresholdDays} (${thresholdDays === 1 ? t({ it: 'un', en: 'one' }) : thresholdDays}) ${thresholdDays === 1 ? t({ it: 'giorno', en: 'day' }) : t({ it: 'giorni', en: 'days' })}`;

  const placeholders: CancellazionePlaceholderValues = {
    thresholdDays,
    refundPercent,
    penaltyPercent,
    daysWord,
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  const tx = (it: string, en: string) => applyCancellazionePlaceholders(lang === 'it' ? it : en, placeholders);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="bg-black text-white min-h-screen"
    >
      <div className="container mx-auto px-6 pt-32 pb-24">
        <div className="max-w-4xl mx-auto">
          <div className="mb-12">
            <BackButton to="/" />
          </div>

          <h1 className="text-4xl md:text-5xl font-bold text-white text-center mb-6">
            {copy ? tx(copy.page_title_it, copy.page_title_en) : t({ it: 'Caricamento…', en: 'Loading…' })}
          </h1>
          <p className="text-center text-gray-400 text-sm mb-12">DR7</p>

          {copy && (
            <motion.div
              className="space-y-8"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              {copy.sections.map((section) => (
                <SectionView
                  key={section.id}
                  section={section}
                  lang={lang}
                  placeholders={placeholders}
                  itemVariants={itemVariants}
                />
              ))}
            </motion.div>
          )}

          {copy && (
            <div className="mt-12 text-center">
              <p className="text-gray-400 mb-2">
                {lang === 'it' ? copy.contact_label_it : copy.contact_label_en}
              </p>
              <a
                href={`mailto:${copy.contact_email}`}
                className="text-white hover:underline font-semibold text-lg"
              >
                {copy.contact_email}
              </a>
              <p className="text-gray-500 text-sm mt-6">
                {copy.contact_address}
              </p>
              <p className="text-gray-600 text-xs mt-4">
                {lang === 'it' ? copy.last_updated_it : copy.last_updated_en}
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ─── Section + Block renderers ──────────────────────────────────────────────
function SectionView({
  section,
  lang,
  placeholders,
  itemVariants,
}: {
  section: CancellazioneSection;
  lang: 'it' | 'en';
  placeholders: CancellazionePlaceholderValues;
  itemVariants: { hidden: { opacity: number; y: number }; visible: { opacity: number; y: number } };
}) {
  const borderClass = section.variant === 'flex' ? 'border-green-800/50' : 'border-gray-800';
  return (
    <motion.section className={`bg-gray-900/50 border ${borderClass} rounded-lg p-8`} variants={itemVariants}>
      <h2 className="text-2xl font-bold text-white mb-4 border-b border-gray-700 pb-3">
        {applyCancellazionePlaceholders(lang === 'it' ? section.title_it : section.title_en, placeholders)}
      </h2>
      {section.blocks.map((block, i) => (
        <BlockView key={i} block={block} lang={lang} placeholders={placeholders} />
      ))}
    </motion.section>
  );
}

function BlockView({
  block,
  lang,
  placeholders,
}: {
  block: CancellazioneBlock;
  lang: 'it' | 'en';
  placeholders: CancellazionePlaceholderValues;
}) {
  const t = (it: string, en: string) => applyCancellazionePlaceholders(lang === 'it' ? it : en, placeholders);

  switch (block.type) {
    case 'p':
      return <p className="text-gray-300 leading-relaxed mb-4">{t(block.text_it, block.text_en)}</p>;
    case 'p-bold':
      return <p className="text-gray-400 font-semibold mb-2">{t(block.text_it, block.text_en)}</p>;
    case 'p-italic':
      return <p className="text-gray-400 leading-relaxed italic">{t(block.text_it, block.text_en)}</p>;
    case 'ul': {
      const items = lang === 'it' ? block.items_it : block.items_en;
      const itemColor = block.tone === 'green' ? 'text-green-400' : 'text-gray-300';
      return (
        <ul className={`space-y-1.5 ml-4 mb-4 ${itemColor}`}>
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className={`${block.tone === 'green' ? '' : 'text-white'} mt-0.5`}>•</span>
              {applyCancellazionePlaceholders(item, placeholders)}
            </li>
          ))}
        </ul>
      );
    }
    default:
      return null;
  }
}

export default CancellationPolicyPage;

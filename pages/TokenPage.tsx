import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTranslation } from '../hooks/useTranslation';
import { getTokenCopy, type TokenCopy } from '../utils/siteCopy';

const TokenPage: React.FC = () => {
  const { lang } = useTranslation();
  const [copy, setCopy] = useState<TokenCopy | null>(null);
  useEffect(() => {
    let cancelled = false;
    getTokenCopy().then(c => { if (!cancelled) setCopy(c); });
    return () => { cancelled = true; };
  }, []);
  const tk = (it: keyof TokenCopy, en: keyof TokenCopy): string =>
    copy ? (copy[lang === 'it' ? it : en] as string) : '';

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="max-w-2xl text-center"
      >
        <p className="text-sm text-gray-500 uppercase tracking-widest mb-4">
          {tk('hero_eyebrow_it', 'hero_eyebrow_en')}
        </p>
        <h1 className="text-6xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-white via-gray-300 to-white bg-clip-text text-transparent">
          {tk('hero_title_it', 'hero_title_en')}
        </h1>
        <p className="text-lg text-gray-400 leading-relaxed mb-10">
          {tk('body_message_it', 'body_message_en')}
        </p>
        <Link
          to="/"
          className="inline-block bg-white text-black px-8 py-4 font-bold text-lg hover:bg-gray-200 transition-all"
        >
          {tk('cta_button_it', 'cta_button_en')}
        </Link>
      </motion.div>
    </div>
  );
};

export default TokenPage;

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { getPressCopy, type PressCopy } from '../utils/siteCopy';
import { logoTestata } from '../utils/loghiStampa';

const PressPage: React.FC = () => {
    const { t, lang } = useTranslation();
    const [copy, setCopy] = useState<PressCopy | null>(null);

    useEffect(() => {
        let cancelled = false;
        getPressCopy().then((c) => { if (!cancelled) setCopy(c); });
        return () => { cancelled = true; };
    }, []);

    if (!copy) {
        return (
            <div className="min-h-screen bg-black pt-32 pb-24">
                <div className="container mx-auto px-6 text-center text-gray-500 text-sm">
                    {t({ it: 'Caricamento…', en: 'Loading…' })}
                </div>
            </div>
        );
    }

    const tx = (it: string, en: string) => (lang === 'it' ? it : en);

    return (
        <div className="min-h-screen bg-black pt-32 pb-24">
            <div className="container mx-auto px-6 max-w-7xl">
                {/* Hero */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="text-center mb-16"
                >
                    <h1 className="text-6xl md:text-7xl font-bold text-white mb-6">
                        {tx(copy.page_title_it, copy.page_title_en)}
                    </h1>
                    <p className="text-xl text-gray-400 max-w-3xl mx-auto">
                        {tx(copy.subtitle_it, copy.subtitle_en)}
                    </p>
                </motion.div>

                {/* Media Inquiries */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                    className="bg-gradient-to-r from-gray-900/50 to-gray-800/50 border border-gray-700 rounded-2xl p-8 mb-16"
                >
                    <h2 className="text-3xl font-bold text-white mb-4">
                        {tx(copy.inquiries_heading_it, copy.inquiries_heading_en)}
                    </h2>
                    <p className="text-gray-300 mb-4">
                        {tx(copy.inquiries_text_it, copy.inquiries_text_en)}
                    </p>
                    <div className="flex items-center gap-2">
                        <span className="text-gray-400">{tx(copy.inquiries_email_label_it, copy.inquiries_email_label_en)}</span>
                        <a
                            href={`mailto:${copy.inquiries_email}`}
                            className="text-white hover:text-gray-300 transition-colors font-semibold"
                        >
                            {copy.inquiries_email}
                        </a>
                    </div>
                </motion.div>

                {/* In the News */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="mb-16"
                >
                    <h2 className="text-4xl font-bold text-white mb-8">
                        {tx(copy.news_heading_it, copy.news_heading_en)}
                    </h2>

                    {/* Solo i loghi delle testate, come su Investitori, con
                        "Leggi articolo" sotto ogni logo. Senza logo resta il
                        nome scritto. */}
                    <div className="grid grid-cols-2 items-start gap-x-8 gap-y-12 sm:grid-cols-3 lg:grid-cols-4">
                        {copy.articles.map((article) => {
                            const logo = article.logo || logoTestata(article.publication);
                            return (
                                <a
                                    key={article.id}
                                    href={article.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={article.title || article.publication}
                                    className="group flex flex-col items-center text-center"
                                >
                                    <div className="flex h-12 items-center justify-center">
                                        {logo
                                            ? <img
                                                src={logo}
                                                alt={article.publication}
                                                loading="lazy"
                                                className="mx-auto max-h-9 w-auto max-w-[150px] object-contain opacity-75 transition-opacity duration-300 group-hover:opacity-100"
                                              />
                                            : <span className="block font-serif text-xl text-white/90">{article.publication}</span>}
                                    </div>
                                    <span className="mt-3 text-xs uppercase tracking-[0.18em] text-white/55 transition-colors group-hover:text-white">
                                        {tx(copy.read_more_label_it, copy.read_more_label_en)}
                                    </span>
                                </a>
                            );
                        })}
                    </div>
                </motion.div>

                {/* Press Releases */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.5 }}
                    className="bg-gray-900/30 border border-gray-800 rounded-2xl p-8"
                >
                    <h2 className="text-3xl font-bold text-white mb-4">
                        {tx(copy.releases_heading_it, copy.releases_heading_en)}
                    </h2>
                    <p className="text-gray-400">
                        {tx(copy.releases_text_it, copy.releases_text_en)}
                    </p>
                </motion.div>
            </div>
        </div>
    );
};

export default PressPage;

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

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {copy.articles.map((article, index) => (
                            <motion.article
                                key={article.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.6, delay: 0.1 * (index + 3) }}
                                className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-600 transition-all duration-300 group"
                            >
                                <div className="p-8">
                                    {/* La testata si vede col suo logo quando ce l'abbiamo
                                        (public/loghi-stampa), altrimenti resta il nome scritto. */}
                                    <div className="flex items-center gap-3 text-sm text-gray-400 mb-3">
                                        {(article.logo || logoTestata(article.publication))
                                            ? <img
                                                src={article.logo || logoTestata(article.publication)}
                                                alt={article.publication}
                                                loading="lazy"
                                                className="h-6 w-auto max-w-[130px] object-contain opacity-80 transition-opacity duration-300 group-hover:opacity-100"
                                              />
                                            : <span className="font-semibold">{article.publication}</span>}
                                        <span>•</span>
                                        <span>{article.date}</span>
                                    </div>

                                    <h3 className="text-xl font-bold text-white mb-3 group-hover:text-gray-300 transition-colors">
                                        {article.title}
                                    </h3>

                                    <p className="text-gray-400 mb-4 line-clamp-3">
                                        {tx(article.summary_it, article.summary_en)}
                                    </p>

                                    <a
                                        href={article.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center text-white hover:text-gray-300 transition-colors font-semibold group/link"
                                    >
                                        {tx(copy.read_more_label_it, copy.read_more_label_en)}
                                        <span className="ml-2 group-hover/link:translate-x-1 transition-transform">→</span>
                                    </a>
                                </div>
                            </motion.article>
                        ))}
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

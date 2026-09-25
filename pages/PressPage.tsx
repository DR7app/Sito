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

    // Una casella per testata: si raggruppa per logo (o per nome se manca).
    const testate: { key: string; publication: string; logo?: string }[] = [];
    for (const a of copy.articles) {
        const logo = a.logo || logoTestata(a.publication);
        const key = logo || a.publication.trim().toLowerCase();
        if (!testate.some((t) => t.key === key)) testate.push({ key, publication: a.publication, logo: logo || undefined });
    }

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

                    {/* Muro dei loghi: ogni testata una sola volta, anche se
                        ha scritto piu' articoli (Casteddu Online ne ha 6). */}
                    <div className="mb-14 grid grid-cols-3 items-center gap-x-5 gap-y-8 rounded-2xl border border-white/10 px-4 py-8 md:flex md:flex-wrap md:justify-center md:gap-x-16 md:gap-y-10 md:px-6 md:py-10">
                        {testate.map((t) => (
                            <div key={t.key} className="flex h-10 items-center justify-center">
                                {t.logo
                                    ? <img
                                        src={t.logo}
                                        alt={t.publication}
                                        loading="lazy"
                                        className="max-h-6 w-auto max-w-full object-contain opacity-70 md:max-h-8 md:max-w-[130px]"
                                      />
                                    : <span className="font-serif text-sm text-white/80 md:text-lg">{t.publication}</span>}
                            </div>
                        ))}
                    </div>

                    {/* Elenco articoli: titolo, data e riassunto al posto di
                        "Leggi l'articolo" ripetuto sotto ogni logo. */}
                    <ul className="divide-y divide-white/10 border-y border-white/10">
                        {copy.articles.map((article) => {
                            const logo = article.logo || logoTestata(article.publication);
                            const summary = tx(article.summary_it, article.summary_en);
                            return (
                                <li key={article.id}>
                                    <a
                                        href={article.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group grid grid-cols-1 gap-3 py-6 md:grid-cols-[160px_1fr_auto] md:items-center md:gap-8"
                                    >
                                        <div className="flex h-8 items-center">
                                            {logo
                                                ? <img
                                                    src={logo}
                                                    alt={article.publication}
                                                    loading="lazy"
                                                    className="max-h-7 w-auto max-w-[140px] object-contain opacity-60 transition-opacity group-hover:opacity-100"
                                                  />
                                                : <span className="font-serif text-base text-white/70">{article.publication}</span>}
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="text-lg font-semibold leading-snug text-white transition-colors group-hover:text-white/80">
                                                {article.title || article.publication}
                                            </h3>
                                            {summary && (
                                                <p className="mt-1 line-clamp-2 text-sm text-gray-400">{summary}</p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-4 text-xs uppercase tracking-[0.18em] text-white/50 md:flex-col md:items-end md:gap-1">
                                            {article.date && <span className="normal-case tracking-normal text-white/40">{article.date}</span>}
                                            <span className="whitespace-nowrap transition-colors group-hover:text-white">
                                                {tx(copy.read_more_label_it, copy.read_more_label_en)} &rarr;
                                            </span>
                                        </div>
                                    </a>
                                </li>
                            );
                        })}
                    </ul>
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

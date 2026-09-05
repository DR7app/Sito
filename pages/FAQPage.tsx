import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import BackButton from '../components/ui/BackButton';
import { getFaqCopy, type FaqCopy } from '../utils/siteCopy';

const FAQPage: React.FC = () => {
    const { lang } = useTranslation();
    const [copy, setCopy] = useState<FaqCopy | null>(null);
    const [openId, setOpenId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        getFaqCopy().then((c) => {
            if (cancelled) return;
            setCopy(c);
            if (c.entries.length > 0) setOpenId(c.entries[0].id);
        });
        return () => { cancelled = true; };
    }, []);

    const entries = copy?.entries ?? null;

    const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id));

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-black text-white min-h-screen"
        >
            <div className="container mx-auto px-6 pt-32 pb-24">
                <div className="max-w-3xl mx-auto">
                    <div className="mb-12">
                        <BackButton to="/" />
                    </div>

                    {/* Hero */}
                    <div className="text-center mb-14">
                        <p className="uppercase tracking-[0.3em] text-xs text-gray-500 mb-3">
                            {copy ? (lang === 'it' ? copy.eyebrow_it : copy.eyebrow_en) : 'DR7 · Support'}
                        </p>
                        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                            {copy ? (lang === 'it' ? copy.page_title_it : copy.page_title_en) : (lang === 'it' ? 'Domande Frequenti' : 'FAQ')}
                        </h1>
                        <p className="text-gray-400 text-base md:text-lg">
                            {copy ? (lang === 'it' ? copy.subtitle_it : copy.subtitle_en) : ''}
                        </p>
                    </div>

                    {/* Accordion */}
                    {entries === null && (
                        <div className="text-center text-gray-500 py-16 text-sm">
                            {lang === 'it' ? 'Caricamento…' : 'Loading…'}
                        </div>
                    )}

                    {entries !== null && entries.length === 0 && (
                        <div className="text-center text-gray-500 py-16 text-sm">
                            {lang === 'it' ? 'Nessuna domanda configurata.' : 'No questions configured.'}
                        </div>
                    )}

                    {entries !== null && entries.length > 0 && (
                        <ul className="space-y-3">
                            {entries.map((e, idx) => {
                                const isOpen = openId === e.id;
                                return (
                                    <motion.li
                                        key={e.id}
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.35, delay: idx * 0.05 }}
                                        className={`bg-gray-900/40 border rounded-2xl overflow-hidden transition-colors ${
                                            isOpen ? 'border-white/40' : 'border-gray-800 hover:border-gray-700'
                                        }`}
                                    >
                                        <button
                                            onClick={() => toggle(e.id)}
                                            className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left group"
                                            aria-expanded={isOpen}
                                            aria-controls={`faq-answer-${e.id}`}
                                        >
                                            <span className="flex items-center gap-4 min-w-0 flex-1">
                                                <span className={`shrink-0 inline-flex items-center justify-center w-8 h-8 text-[12px] font-mono font-semibold transition-colors ${
                                                    isOpen ? 'bg-white text-black' : 'bg-white/10 text-gray-300 group-hover:bg-white/15'
                                                }`}>
                                                    {String(idx + 1).padStart(2, '0')}
                                                </span>
                                                <span className="text-base md:text-lg font-semibold text-white truncate">
                                                    {e.question || (lang === 'it' ? '(senza titolo)' : '(no title)')}
                                                </span>
                                            </span>
                                            <motion.span
                                                animate={{ rotate: isOpen ? 45 : 0 }}
                                                transition={{ duration: 0.25 }}
                                                className={`shrink-0 inline-flex items-center justify-center w-8 h-8 transition-colors ${
                                                    isOpen ? 'bg-white text-black' : 'text-gray-400 group-hover:text-white'
                                                }`}
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <line x1="12" y1="5" x2="12" y2="19"/>
                                                    <line x1="5" y1="12" x2="19" y2="12"/>
                                                </svg>
                                            </motion.span>
                                        </button>
                                        <AnimatePresence initial={false}>
                                            {isOpen && (
                                                <motion.div
                                                    id={`faq-answer-${e.id}`}
                                                    key="content"
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="px-6 pb-6 pl-[72px]">
                                                        <p className="text-gray-300 leading-relaxed text-[15px] whitespace-pre-line">
                                                            {e.answer}
                                                        </p>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.li>
                                );
                            })}
                        </ul>
                    )}

                    {/* Footer CTA */}
                    {entries !== null && entries.length > 0 && (
                        <div className="mt-14 text-center">
                            <p className="text-gray-400 text-sm mb-2">
                                {lang === 'it' ? 'Non hai trovato la risposta?' : "Didn’t find the answer?"}
                            </p>
                            <a
                                href="mailto:info@dr7.app"
                                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-black bg-white hover:bg-gray-200 transition-colors"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                                    <polyline points="22,6 12,13 2,6"/>
                                </svg>
                                info@dr7.app
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default FAQPage;

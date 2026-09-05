import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { getAboutCopy, type AboutCopy } from '../utils/siteCopy';

const AboutPage: React.FC = () => {
    const { t, lang } = useTranslation();
    const [copy, setCopy] = useState<AboutCopy | null>(null);

    useEffect(() => {
        let cancelled = false;
        getAboutCopy().then((c) => { if (!cancelled) setCopy(c); });
        return () => { cancelled = true; };
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
        >
            {/* Founders & Story Section */}
            <section className="pt-32 pb-20 bg-black">
                <div className="container mx-auto px-6">
                    {/* Founder Portraits */}
                    {copy && (
                        <motion.div
                            initial={{ opacity: 0, y: 50 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.3 }}
                            transition={{ duration: 0.7 }}
                            // Whitelist dynamic column counts so Tailwind JIT keeps them in the bundle.
                            // md:grid-cols-1 md:grid-cols-2 md:grid-cols-3 md:grid-cols-4
                            className={`grid grid-cols-1 ${
                                copy.founders.length >= 4 ? 'md:grid-cols-4'
                                : copy.founders.length === 3 ? 'md:grid-cols-3'
                                : copy.founders.length === 1 ? 'md:grid-cols-1'
                                : 'md:grid-cols-2'
                            } gap-12 md:gap-8 justify-items-center max-w-3xl mx-auto mb-16`}
                        >
                            {copy.founders.map((f) => {
                                const role = lang === 'it' ? f.role_it : f.role_en;
                                const alt = lang === 'it' ? f.alt_it : f.alt_en;
                                return (
                                    <div key={f.id} className="flex flex-col items-center">
                                        <div className="relative w-64 h-80 mx-auto">
                                            <img
                                                src={f.photo_src}
                                                alt={alt}
                                                className="w-full h-full object-cover rounded-lg shadow-2xl shadow-white/10"
                                            />
                                            <div className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-sm px-4 py-2 rounded">
                                                <p className="text-white font-semibold">{f.name}</p>
                                                <p className="text-white/80 text-sm">{role}</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </motion.div>
                    )}

                    {/* Story Section */}
                    {copy && (
                        <motion.div
                            initial={{ opacity: 0, y: 50 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.2 }}
                            transition={{ duration: 0.7 }}
                            className="max-w-4xl mx-auto"
                        >
                            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl p-8 md:p-12 shadow-2xl shadow-white/10">
                                <h2 className="text-3xl md:text-4xl font-bold text-white mb-8 text-center">
                                    {lang === 'it' ? copy.story_title_it : copy.story_title_en}
                                </h2>

                                <div className="space-y-6 text-lg text-gray-300 leading-relaxed">
                                    {copy.story_paragraphs.map((p, i) => (
                                        <p key={i}>{lang === 'it' ? p.text_it : p.text_en}</p>
                                    ))}
                                </div>

                                <div className="mt-12 text-center">
                                    <p className="text-2xl font-semibold text-white mb-4">
                                        {lang === 'it' ? copy.story_outro_main_it : copy.story_outro_main_en}
                                    </p>
                                    <p className="text-lg text-gray-400 italic">
                                        {lang === 'it' ? copy.story_outro_sub_it : copy.story_outro_sub_en}
                                    </p>
                                    <div className="mt-6 flex justify-center">
                                        <p className="text-lg font-medium text-white">
                                            {copy.story_signature}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </div>
            </section>

             {/* Careers CTA */}
            <section className="py-24 relative bg-gray-900/40">
                <div className="container mx-auto px-6 text-center relative z-10">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.5 }}
                        transition={{ duration: 0.5 }}
                        className="text-4xl font-bold text-white">{t('Join_Our_Team')}</motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.5 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">{t('Join_Our_Team_Statement')}</motion.p>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.5 }}
                        transition={{ duration: 0.5, delay: 0.4 }}
                        className="mt-8"
                    >
                        <Link to="/careers" className="inline-flex items-center justify-center bg-white text-black font-bold uppercase tracking-widest text-sm md:text-base px-6 py-3 md:px-8 md:py-4 w-[min(320px,90vw)] whitespace-nowrap transition-all duration-300 hover:bg-gray-200 md:transform md:hover:scale-105 focus:outline-none focus:ring-2 focus:ring-white/40 focus:ring-offset-2 focus:ring-offset-gray-900">
  {t('View_Openings')}
</Link>
                    </motion.div>
                </div>
            </section>

        </motion.div>
    );
};

export default AboutPage;

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import LegalPageLayout from '../components/layout/LegalPageLayout';
import { getLegalPage, type LegalPageCopy, type LegalSection, type CancellazioneBlock } from '../utils/siteCopy';

// Inline markdown parsing for **bold** and [text](url) — same subset used by
// LegalDocumentRenderer. Kept local so the page renders independently of
// the shared renderer (custom layout: indice sidebar + scroll-spy).
function parseInline(text: string): React.ReactNode[] {
    if (!text) return [];
    const out: React.ReactNode[] = [];
    const re = /(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)]+)\))/g;
    let last = 0; let key = 0; let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) out.push(text.slice(last, m.index));
        if (m[1]) out.push(<strong key={key++} className="text-white">{m[2]}</strong>);
        else if (m[3]) {
            const isExternal = /^https?:\/\//i.test(m[5]);
            out.push(<a key={key++} href={m[5]} target={isExternal ? '_blank' : undefined} rel={isExternal ? 'noopener noreferrer' : undefined} className="text-white underline hover:text-gray-300">{m[4]}</a>);
        }
        last = re.lastIndex;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
}

const Block: React.FC<{ block: CancellazioneBlock; lang: 'it' | 'en' }> = ({ block, lang }) => {
    const t = (it: string, en: string) => lang === 'it' ? it : en;
    switch (block.type) {
        case 'p':
            return <p className="whitespace-pre-line">{parseInline(t(block.text_it, block.text_en))}</p>;
        case 'p-bold':
            return <p className="text-white font-medium">{parseInline(t(block.text_it, block.text_en))}</p>;
        case 'p-italic':
            return <p className="italic text-sm text-gray-500 whitespace-pre-line">{parseInline(t(block.text_it, block.text_en))}</p>;
        case 'ul': {
            const items = lang === 'it' ? block.items_it : block.items_en;
            return (
                <ul className="space-y-3 ml-1">
                    {items.map((item, i) => (
                        <li key={i} className="flex items-start gap-3">
                            <span className="w-1.5 h-1.5 rounded-full bg-white/30 mt-2 shrink-0" />
                            <span>{parseInline(item)}</span>
                        </li>
                    ))}
                </ul>
            );
        }
        default:
            return null;
    }
};

const TermsOfServicePage: React.FC = () => {
    const { t, lang } = useTranslation();
    const [copy, setCopy] = useState<LegalPageCopy | null | undefined>(undefined);
    const [activeSection, setActiveSection] = useState<string>('');
    const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

    useEffect(() => {
        let cancelled = false;
        getLegalPage('terms').then((c) => {
            if (cancelled) return;
            setCopy(c);
            if (c && c.sections.length > 0) setActiveSection(c.sections[0].id);
        });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!copy) return;
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter(e => e.isIntersecting);
                if (visible.length > 0) {
                    setActiveSection(visible[0].target.id);
                }
            },
            { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
        );
        Object.values(sectionRefs.current).forEach(ref => {
            if (ref) observer.observe(ref);
        });
        return () => observer.disconnect();
    }, [copy]);

    const scrollTo = (id: string) => {
        sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // Loading state — render minimal layout to avoid layout shift.
    if (copy === undefined) {
        return (
            <LegalPageLayout title={t('Terms_of_Service')}>
                <p className="text-gray-500 text-sm">{t('Loading')}</p>
            </LegalPageLayout>
        );
    }

    // Disabled in CMS — render legacy minimal fallback (matches placeholder
    // behavior of the other 3 legal pages).
    if (!copy) {
        return (
            <LegalPageLayout title={t('Terms_of_Service')}>
                <p>{t({ it: 'I termini di servizio non sono ancora pubblicati. Contatta info@dr7.app per maggiori informazioni.', en: 'The terms of service have not been published yet. Contact info@dr7.app for more information.' })}</p>
            </LegalPageLayout>
        );
    }

    const pageTitle = lang === 'it' ? copy.title_it : copy.title_en;
    const today = new Date().toLocaleDateString(lang === 'it' ? 'it-IT' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const updatedLabel = lang === 'it' ? copy.last_updated_label_it : copy.last_updated_label_en;

    // Build indice from sections (auto-numbered 01, 02, ...).
    const indice = copy.sections.map((s, i) => ({
        id: s.id,
        num: String(i + 1).padStart(2, '0'),
        title: lang === 'it' ? s.heading_it : s.heading_en,
    }));

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-black min-h-screen"
        >
            {/* Hero header */}
            <div className="pt-32 pb-16 text-center px-6">
                <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="text-sm tracking-widest uppercase text-gray-500 mb-4"
                >
                    {lang === 'it' ? 'Documentazione legale' : 'Legal documentation'}
                </motion.p>
                <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className="text-4xl md:text-6xl font-bold text-white tracking-tight"
                >
                    {pageTitle}
                </motion.h1>
                {copy.last_updated_dynamic && updatedLabel && (
                    <motion.p
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 }}
                        className="mt-4 text-gray-400 text-sm"
                    >
                        {updatedLabel}: {today}
                    </motion.p>
                )}
            </div>

            {/* Content with sidebar */}
            <div className="max-w-7xl mx-auto px-6 pb-24 flex gap-12">
                {/* Sidebar — desktop only */}
                <nav className="hidden lg:block w-64 shrink-0">
                    <div className="sticky top-28">
                        <p className="text-xs uppercase tracking-widest text-gray-500 mb-4 font-semibold">
                            {lang === 'it' ? 'Indice' : 'Contents'}
                        </p>
                        <ul className="space-y-1">
                            {indice.map((s) => (
                                <li key={s.id}>
                                    <button
                                        onClick={() => scrollTo(s.id)}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                                            activeSection === s.id
                                                ? 'bg-white/10 text-white font-medium'
                                                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                        }`}
                                    >
                                        <span className="text-gray-600 mr-2">{s.num}.</span>
                                        {s.title}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </nav>

                {/* Main content */}
                <div className="flex-1 max-w-3xl">
                    {copy.sections.map((section: LegalSection, idx: number) => (
                        <React.Fragment key={section.id}>
                            <section
                                id={section.id}
                                ref={el => { sectionRefs.current[section.id] = el; }}
                                className="scroll-mt-28 mb-16"
                            >
                                <div className="flex items-baseline gap-4 mb-6">
                                    <span className="text-5xl font-bold text-white/10">{String(idx + 1).padStart(2, '0')}</span>
                                    <h2 className="text-2xl font-semibold text-white">
                                        {lang === 'it' ? section.heading_it : section.heading_en}
                                    </h2>
                                </div>
                                <div className="space-y-4 text-gray-400 leading-relaxed">
                                    {section.blocks.map((block, i) => (
                                        <Block key={i} block={block} lang={lang} />
                                    ))}
                                </div>
                            </section>
                            {idx < copy.sections.length - 1 && (
                                <div className="border-t border-gray-800/60 mb-16" />
                            )}
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </motion.div>
    );
};

export default TermsOfServicePage;

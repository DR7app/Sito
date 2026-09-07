import React, { useEffect, useState } from 'react';
import LegalPageLayout from '../components/layout/LegalPageLayout';
import { useTranslation } from '../hooks/useTranslation';
import { getCareersCopy, type CareersCopy } from '../utils/siteCopy';

// Inline-markdown helper local to this page (just **bold** + [text](url)).
function renderInline(text: string): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    const re = /(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)]+)\))/g;
    let last = 0; let key = 0; let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) out.push(text.slice(last, m.index));
        if (m[1]) out.push(<strong key={key++}>{m[2]}</strong>);
        else if (m[3]) {
            const isExternal = /^https?:\/\//i.test(m[5]);
            out.push(<a key={key++} href={m[5]} target={isExternal ? '_blank' : undefined} rel={isExternal ? 'noopener noreferrer' : undefined} className="text-white underline hover:text-gray-300">{m[4]}</a>);
        }
        last = re.lastIndex;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
}

const CareersPage: React.FC = () => {
    const { t, lang } = useTranslation();
    const [copy, setCopy] = useState<CareersCopy | null>(null);

    useEffect(() => {
        let cancelled = false;
        getCareersCopy().then((c) => { if (!cancelled) setCopy(c); });
        return () => { cancelled = true; };
    }, []);

    if (!copy) {
        return (
            <LegalPageLayout title={t('Careers')}>
                <p>{t({ it: 'Caricamento…', en: 'Loading…' })}</p>
            </LegalPageLayout>
        );
    }

    const tx = (it: string, en: string) => (lang === 'it' ? it : en);

    return (
        <LegalPageLayout title={tx(copy.page_title_it, copy.page_title_en)}>
            <p>{tx(copy.intro_it, copy.intro_en)}</p>

            <h2>{tx(copy.jobs_heading_it, copy.jobs_heading_en)}</h2>

            <div className="mt-8 space-y-6">
                {copy.jobs.map((j) => (
                    <div key={j.id}>
                        <h3>{tx(j.title_it, j.title_en)}</h3>
                        <p className="text-sm text-stone-400">
                            {tx(j.location_it, j.location_en)} | {tx(j.type_it, j.type_en)}
                        </p>
                        <p className="mt-2">{tx(j.description_it, j.description_en)}</p>
                    </div>
                ))}
            </div>

            <h2 className="mt-12">{tx(copy.apply_heading_it, copy.apply_heading_en)}</h2>
            <p>{renderInline(tx(copy.apply_text_it, copy.apply_text_en))}</p>
        </LegalPageLayout>
    );
};

export default CareersPage;

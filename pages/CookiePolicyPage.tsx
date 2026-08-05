import React, { useEffect, useState } from 'react';
import LegalPageLayout from '../components/layout/LegalPageLayout';
import LegalDocumentRenderer from '../components/layout/LegalDocumentRenderer';
import { useTranslation } from '../hooks/useTranslation';
import { getLegalPage, type LegalPageCopy } from '../utils/siteCopy';
import { dateLocale } from '../utils/i18nDate';

const CookiePolicyPage: React.FC = () => {
    const { t, lang } = useTranslation();
    const [copy, setCopy] = useState<LegalPageCopy | null | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        getLegalPage('cookie').then((c) => { if (!cancelled) setCopy(c); });
        return () => { cancelled = true; };
    }, []);

    if (copy === undefined) {
        return <LegalPageLayout title={t('Cookie_Policy')}><p>{t('Loading')}</p></LegalPageLayout>;
    }
    if (copy) return <LegalDocumentRenderer copy={copy} />;

    return (
        <LegalPageLayout title={t('Cookie_Policy')}>
            <p>{t({ it: 'Ultimo Aggiornamento:', en: 'Last Updated:' })} {new Date().toLocaleDateString(dateLocale(lang))}</p>
            <h2>{t({ it: '1. Cosa Sono i Cookie?', en: '1. What Are Cookies?' })}</h2>
            <p>{t({ it: 'I cookie sono piccoli file di testo memorizzati sul tuo dispositivo quando visiti un sito web. Aiutano a far funzionare i siti più efficientemente e a fornire informazioni ai gestori.', en: 'Cookies are small text files stored on your device when you visit a website. They help sites work more efficiently and provide information to site owners.' })}</p>
        </LegalPageLayout>
    );
};

export default CookiePolicyPage;

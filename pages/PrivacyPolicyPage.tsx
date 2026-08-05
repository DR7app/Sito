import React, { useEffect, useState } from 'react';
import LegalPageLayout from '../components/layout/LegalPageLayout';
import LegalDocumentRenderer from '../components/layout/LegalDocumentRenderer';
import { getLegalPage, type LegalPageCopy } from '../utils/siteCopy';
import { useTranslation } from '../hooks/useTranslation';
import { dateLocale } from '../utils/i18nDate';

/**
 * Falls back to the legacy hardcoded body if the admin has not enabled
 * the page in centralina_pro_config.config.site_copy.legal.
 */
const PrivacyPolicyPage: React.FC = () => {
    const { t, lang } = useTranslation();
    const [copy, setCopy] = useState<LegalPageCopy | null | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        getLegalPage('privacy').then((c) => { if (!cancelled) setCopy(c); });
        return () => { cancelled = true; };
    }, []);

    if (copy === undefined) {
        return <LegalPageLayout title={t({ it: 'Informativa sulla Privacy', en: 'Privacy Policy' })}><p>{t('Loading')}</p></LegalPageLayout>;
    }
    if (copy) return <LegalDocumentRenderer copy={copy} />;

    // Legacy fallback (kept verbatim).
    return (
        <LegalPageLayout title={t({ it: 'Informativa sulla Privacy', en: 'Privacy Policy' })}>
            <p><strong>{t({ it: 'Ultimo aggiornamento:', en: 'Last updated:' })} {new Date().toLocaleDateString(dateLocale(lang))}</strong></p>
            <h2>{t({ it: '1. Introduzione e Titolare del Trattamento', en: '1. Introduction and Data Controller' })}</h2>
            <p>{t({ it: 'Dubai Rent 7.0 S.p.A. – DR7 ("noi", "nostro" o "ci") si impegna a proteggere la tua privacy. Questa Informativa sulla Privacy spiega come raccogliamo, utilizziamo, divulghiamo e proteggiamo i tuoi dati personali quando utilizzi i nostri servizi. Questa informativa è fornita in conformità con il Regolamento Generale sulla Protezione dei Dati (GDPR) dell\'UE.', en: 'Dubai Rent 7.0 S.p.A. – DR7 ("we", "our" or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose and safeguard your personal data when you use our services. This notice is provided in compliance with the EU General Data Protection Regulation (GDPR).' })}</p>
            <p>{t({ it: 'DR7 è il Titolare del Trattamento dei dati personali raccolti attraverso la nostra piattaforma ed è responsabile dei tuoi dati personali.', en: 'DR7 is the Data Controller for personal data collected through our platform and is responsible for your personal data.' })}</p>
            <h2>{t({ it: '2. Contattaci', en: '2. Contact us' })}</h2>
            <p>{t({ it: "Se hai domande su questa Informativa sulla Privacy, contatta il nostro Responsabile della Privacy dei Dati all'indirizzo:", en: 'If you have questions about this Privacy Policy, contact our Data Privacy Officer at:' })} <a href="mailto:info@dr7.app">info@dr7.app</a>.</p>
        </LegalPageLayout>
    );
};

export default PrivacyPolicyPage;

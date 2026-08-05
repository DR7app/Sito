import React, { useEffect, useState } from 'react';
import LegalPageLayout from '../components/layout/LegalPageLayout';
import LegalDocumentRenderer from '../components/layout/LegalDocumentRenderer';
import { useTranslation } from '../hooks/useTranslation';
import { getLegalPage, type LegalPageCopy } from '../utils/siteCopy';

const RentalAgreementPage: React.FC = () => {
    const { t } = useTranslation();
    const [copy, setCopy] = useState<LegalPageCopy | null | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        getLegalPage('rental_agreement').then((c) => { if (!cancelled) setCopy(c); });
        return () => { cancelled = true; };
    }, []);

    if (copy === undefined) {
        return <LegalPageLayout title={t('Rental_Agreement')}><p>{t('Loading')}</p></LegalPageLayout>;
    }
    if (copy) return <LegalDocumentRenderer copy={copy} />;

    return (
        <LegalPageLayout title={t('Rental_Agreement')}>
            <p><strong>{t({ it: 'Avviso importante:', en: 'Important Notice:' })}</strong> {t({ it: 'Questo documento fornisce una panoramica generale dei termini e delle condizioni tipiche che regolano il noleggio di beni di lusso tramite la piattaforma DR7. DR7 agisce come intermediario e non è parte del contratto di noleggio finale.', en: 'This document provides a general overview of the typical terms and conditions governing the rental of luxury assets through the DR7 platform. DR7 acts as a broker and is not a party to the final rental contract.' })}</p>
            <h2>{t({ it: '1. Il Ruolo di Intermediazione di DR7', en: '1. The Brokerage Role of DR7' })}</h2>
            <p>{t({ it: 'DR7 facilita il collegamento tra il Noleggiante e il Proprietario. Non siamo proprietari né operatori dei beni elencati.', en: 'DR7 facilitates the connection between the Renter and the Owner. We are not the owner or operator of the assets listed.' })}</p>
        </LegalPageLayout>
    );
};

export default RentalAgreementPage;

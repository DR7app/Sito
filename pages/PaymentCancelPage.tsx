import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../hooks/useTranslation';
import { getPaymentCancelCopy, type PaymentCancelCopy } from '../utils/siteCopy';

const PaymentCancelPage: React.FC = () => {
    const navigate = useNavigate();
    const { lang } = useTranslation();
    const [copy, setCopy] = useState<PaymentCancelCopy | null>(null);
    useEffect(() => {
        let cancelled = false;
        getPaymentCancelCopy().then(c => { if (!cancelled) setCopy(c); });
        return () => { cancelled = true; };
    }, []);
    const c = (it: keyof PaymentCancelCopy, en: keyof PaymentCancelCopy): string =>
        copy ? (copy[lang === 'it' ? it : en] as string) : '';

    return (
        <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8">
                <div className="text-center">
                    <div className="mx-auto w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </div>

                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        {c('title_it', 'title_en')}
                    </h1>

                    <p className="text-gray-600 mb-8">
                        {c('body_it', 'body_en')}
                    </p>

                    <div className="space-y-3">
                        <button
                            onClick={() => navigate('/')}
                            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 px-6 font-semibold hover:from-purple-700 hover:to-blue-700 transition-all"
                        >
                            {c('cta_home_it', 'cta_home_en')}
                        </button>

                        <button
                            onClick={() => window.history.back()}
                            className="w-full bg-gray-100 text-gray-700 py-3 px-6 font-semibold hover:bg-gray-200 transition-all"
                        >
                            {c('cta_retry_it', 'cta_retry_en')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PaymentCancelPage;

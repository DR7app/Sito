import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { supabase } from '../supabaseClient';

/**
 * This page handles Supabase's /auth/v1/verify token verification
 * It processes the token and redirects to the appropriate page
 */
const AuthVerifyPage: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [error, setError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(true);

    useEffect(() => {
        const verifyToken = async () => {
            const token = searchParams.get('token');
            const type = searchParams.get('type');
            const redirectTo = searchParams.get('redirect_to');

            console.log('[AuthVerify] Processing:', { token: token?.substring(0, 10) + '...', type, redirectTo });

            if (token && type) {
                try {
                    // Verify the OTP token with Supabase
                    const { data, error: verifyError } = await supabase.auth.verifyOtp({
                        token_hash: token,
                        type: type as 'recovery' | 'signup' | 'email',
                    });

                    if (verifyError) {
                        console.error('[AuthVerify] Verification error:', verifyError);
                        setError(verifyError.message);
                        setIsProcessing(false);
                        return;
                    }

                    console.log('[AuthVerify] Verification successful:', data);

                    // Redirect based on type
                    if (type === 'recovery') {
                        // Password recovery - go to reset password page
                        navigate('/reset-password', { replace: true });
                    } else if (type === 'signup' || type === 'email') {
                        // Email confirmation - go to confirmation success
                        navigate('/confirmation-success', { replace: true });
                    } else {
                        // Default redirect
                        navigate(redirectTo || '/', { replace: true });
                    }
                } catch (err: any) {
                    console.error('[AuthVerify] Error:', err);
                    setError(err.message || t({ it: 'Verifica non riuscita', en: 'Verification failed' }));
                    setIsProcessing(false);
                }
            } else {
                setError(t({ it: "Link di verifica non valido", en: "Invalid verification link" }));
                setIsProcessing(false);
            }
        };

        verifyToken();
    }, [searchParams, navigate]);

    if (isProcessing) {
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="min-h-screen flex items-center justify-center pt-24 pb-12 px-4"
            >
                <div className="w-full max-w-md">
                    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-8 text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mx-auto mb-4"></div>
                        <p className="text-gray-400">{t('Verifying_your_link')}</p>
                    </div>
                </div>
            </motion.div>
        );
    }

    if (error) {
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="min-h-screen flex items-center justify-center pt-24 pb-12 px-4"
            >
                <div className="w-full max-w-md">
                    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-8 space-y-6">
                        <div className="text-center">
                            <h2 className="text-3xl font-bold text-white">{t('Link_Invalid')}</h2>
                        </div>
                        <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded p-3">
                            {error}
                        </p>
                        <button
                            onClick={() => navigate('/forgot-password')}
                            className="w-full py-3 px-4 text-sm font-medium text-black bg-white hover:bg-gray-200"
                        >
                            {t('Request_New_Link')}
                        </button>
                    </div>
                </div>
            </motion.div>
        );
    }

    return null;
};

export default AuthVerifyPage;

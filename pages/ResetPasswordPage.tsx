import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../supabaseClient';

const ResetPasswordPage: React.FC = () => {
    const { t } = useTranslation();
    const { updateUserPassword } = useAuth();
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [isSuccess, setIsSuccess] = useState(false);
    const [hasSession, setHasSession] = useState<boolean | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    // Check for active session on mount.
    // 2026-06-20: il link email arriva come ?token_hash=...&type=recovery (lo
    // genera la function request-password-reset). Qui verifichiamo il token via
    // SDK (verifyOtp) per creare la sessione di recovery, poi l'utente imposta
    // la nuova password. Evita la dipendenza da /auth/v1/verify (il sito non fa
    // proxy) e dalla "Site URL" del dashboard. Fallback: sessione gia' presente
    // (vecchio flusso con token nell'hash dopo redirect Supabase).
    useEffect(() => {
        const init = async () => {
            const params = new URLSearchParams(window.location.search);
            const tokenHash = params.get('token_hash');
            const type = params.get('type');
            if (tokenHash) {
                const { error: vErr } = await supabase.auth.verifyOtp({
                    type: (type as any) || 'recovery',
                    token_hash: tokenHash,
                });
                // Token monouso: pulisci la query dall'URL.
                window.history.replaceState({}, document.title, '/reset-password');
                if (vErr) {
                    setHasSession(false);
                    setError(t('Invalid_or_expired_reset_link'));
                    return;
                }
            }
            const { data: { session } } = await supabase.auth.getSession();
            setHasSession(!!session);
            if (!session) {
                // No session - user accessed this page directly without a valid link
                setError(t('Invalid_or_expired_reset_link'));
            }
        };

        init();
    }, [t]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');

        if (password !== confirmPassword) {
            setError(t('Passwords_do_not_match'));
            return;
        }
        if (password.length < 8) {
            setError(t('Password_is_too_weak'));
            return;
        }

        setIsSubmitting(true);
        try {
            const { error } = await updateUserPassword(password);
            if (error) throw error;
            setMessage(t('Password_has_been_updated_successfully'));
            setIsSuccess(true);
        } catch (err: any) {
            setError(err.message || t('Something_went_wrong'));
        } finally {
            setIsSubmitting(false);
        }
    };

    // Show loading while checking session
    if (hasSession === null) {
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="min-h-screen flex items-center justify-center pt-24 pb-12 px-4"
            >
                <div className="w-full max-w-md">
                    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-8 text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mx-auto mb-4"></div>
                        <p className="text-gray-400">{t('Please_wait')}</p>
                    </div>
                </div>
            </motion.div>
        );
    }

    // No session - show error
    if (!hasSession) {
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
                            {error || t('Invalid_or_expired_reset_link')}
                        </p>
                        <button
                            onClick={() => navigate('/forgot-password')}
                            className="w-full py-3 px-4 text-sm font-medium rounded-md text-black bg-white hover:bg-gray-200"
                        >
                            {t('Request_New_Link')}
                        </button>
                    </div>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="min-h-screen flex items-center justify-center pt-24 pb-12 px-4 sm:px-6 lg:px-8"
        >
            <div className="w-full max-w-md space-y-8">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg shadow-2xl shadow-black/50 p-8 space-y-6"
                >
                    <div className="text-center">
                        <h2 className="text-3xl font-bold text-white">{t('Set_a_New_Password')}</h2>
                        <p className="mt-2 text-sm text-gray-400">{t('Your_new_password_must_be_different')}</p>
                    </div>

                    {message && <p className={`text-sm rounded p-3 ${isSuccess ? 'text-green-400 bg-green-900/20 border border-green-800' : 'text-gray-300'}`}>{message}</p>}
                    {error && <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded p-3">{error}</p>}

                    {isSuccess ? (
                         <button
                            onClick={() => navigate('/signin')}
                            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-black bg-white hover:bg-gray-200"
                        >
                            {t('Proceed_to_Sign_In')}
                        </button>
                    ) : (
                        <form className="space-y-6" onSubmit={handleSubmit} noValidate>
                            <div className="relative">
                                <label htmlFor="password" className="sr-only">{t('New_Password')}</label>
                                <input id="password" name="password" type={showPassword ? 'text' : 'password'} required className="appearance-none rounded-md relative block w-full px-3 py-3 pr-12 border bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-white focus:border-white focus:z-10 sm:text-sm border-gray-700" placeholder={t('New_Password')} value={password} onChange={(e) => setPassword(e.target.value)} />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-white transition-colors">
                                  {showPassword ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                  ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                  )}
                                </button>
                            </div>
                             <div className="relative">
                                <label htmlFor="confirm-password" className="sr-only">{t('Confirm_Password')}</label>
                                <input id="confirm-password" name="confirmPassword" type={showPassword ? 'text' : 'password'} required className="appearance-none rounded-md relative block w-full px-3 py-3 pr-12 border bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-white focus:border-white focus:z-10 sm:text-sm border-gray-700" placeholder={t('Confirm_Password')} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-white transition-colors">
                                  {showPassword ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                  ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                  )}
                                </button>
                            </div>
                            <div>
                                <button type="submit" disabled={isSubmitting || !password || !confirmPassword} className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-black bg-white hover:bg-gray-200 disabled:opacity-60">
                                    {isSubmitting ? t('Please_wait') : t('Update_Password')}
                                </button>
                            </div>
                        </form>
                    )}
                </motion.div>
            </div>
        </motion.div>
    );
};

export default ResetPasswordPage;

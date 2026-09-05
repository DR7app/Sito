import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { useAuth } from '../hooks/useAuth';

const ForgotPasswordPage: React.FC = () => {
    const { t } = useTranslation();
    const { sendPasswordResetEmail } = useAuth();
    const [email, setEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setIsSubmitting(true);
        try {
            const { error } = await sendPasswordResetEmail(email);
            if (error) throw error;
            setMessage(t('If_an_account_exists_a_reset_link_has_been_sent'));
        } catch (err: any) {
            setError(err.message || t('Something_went_wrong'));
        } finally {
            setIsSubmitting(false);
        }
    };

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
                        <h2 className="text-3xl font-bold text-white">{t('Reset_your_Password')}</h2>
                        <p className="mt-2 text-sm text-gray-400">{t('Enter_your_email_to_receive_a_reset_link')}</p>
                    </div>

                    {message && <p className="text-sm text-green-400 bg-green-900/20 border border-green-800 rounded p-3">{message}</p>}
                    {error && <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded p-3">{error}</p>}

                    <form className="space-y-6" onSubmit={handleSubmit} noValidate>
                        <div>
                            <label htmlFor="email-address" className="sr-only">{t('Email_Address')}</label>
                            <input
                                id="email-address"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                className="appearance-none rounded-md relative block w-full px-3 py-3 border bg-gray-800 text-white placeholder-gray-400 focus:outline-none focus:ring-white focus:border-white focus:z-10 sm:text-sm border-gray-700"
                                placeholder={t('Email_Address')}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <button
                                type="submit"
                                disabled={isSubmitting || !email}
                                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium text-black bg-white hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white focus:ring-offset-gray-900 transition-colors disabled:opacity-60"
                            >
                                {isSubmitting ? t('Please_wait') : t('Send_Reset_Link')}
                            </button>
                        </div>
                    </form>
                    <div className="text-sm text-center">
                        <Link to="/signin" className="font-medium text-white hover:text-gray-300">
                            {t('Back_to_Sign_In')}
                        </Link>
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
};

export default ForgotPasswordPage;
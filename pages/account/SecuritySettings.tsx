import React, { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../supabaseClient';

const SecuritySettings = () => {
    const { t } = useTranslation();
    const { user, updateUserPassword, login } = useAuth();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [error, setError] = useState('');
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteSuccess, setDeleteSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');

        if (newPassword !== confirmPassword) {
            setError(t('Passwords_do_not_match'));
            return;
        }
        if (newPassword.length < 8) {
            setError(t('Password_is_too_weak'));
            return;
        }

        setIsSubmitting(true);
        try {
            const { error: loginError } = await login(user!.email, currentPassword);
            if (loginError) {
                if (loginError.message.includes('Invalid login credentials')) {
                    throw new Error("The current password you entered is incorrect.");
                }
                throw loginError;
            }

            const { error: updateError } = await updateUserPassword(newPassword);
            if (updateError) throw updateError;

            setSuccessMessage(t('Password_updated_successfully'));
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setTimeout(() => setSuccessMessage(''), 4000);
        } catch (err: any) {
            setError(err.message || t('Something_went_wrong'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteAccount = async () => {
        setIsDeleting(true);
        setError('');

        try {
            // Prendi la sessione corrente: la funzione delete-account richiede un
            // token valido (Authorization). Senza, rispondeva "Authentication
            // required". Usiamo access_token + user id dalla sessione Supabase.
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token || '';
            const userId = user?.id || session?.user?.id;

            if (!token || !userId) {
                throw new Error(t({ en: 'Session expired. Please log out and log in again.', it: 'Sessione scaduta. Esci e accedi di nuovo.' }));
            }

            const response = await fetch('/.netlify/functions/delete-account', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ userId, token })
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || t({ en: 'Delete failed', it: 'Eliminazione non riuscita' }));
            }

            setDeleteSuccess(true);
            setTimeout(() => {
                localStorage.clear();
                sessionStorage.clear();
                window.location.replace('/');
            }, 2000);

        } catch (err: any) {
            setError(err.message || t({ en: 'Failed to delete account', it: 'Eliminazione account non riuscita' }));
            setIsDeleting(false);
        }
    };

    return (
        <>
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg">
                <div className="p-4 md:p-6 border-b border-gray-800">
                    <h2 className="text-xl font-bold text-white">{t('Change_Password')}</h2>
                    <p className="text-sm text-gray-400 mt-1">{t('Update_your_password')}</p>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="p-4 md:p-6 space-y-4">
                        {error && !showDeleteModal && <p className="text-sm text-red-400 bg-red-900/20 p-3 rounded-md">{error}</p>}
                        <div>
                            <label className="block text-sm font-medium text-gray-300">{t('Current_Password')}</label>
                            <div className="relative">
                                <input type={showCurrentPassword ? 'text' : 'password'} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required className="mt-1 block w-full min-h-[44px] bg-gray-800 border-gray-700 rounded-md shadow-sm text-white pr-12" />
                                <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-white transition-colors">
                                    {showCurrentPassword ? (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>) : (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>)}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300">{t('New_Password')}</label>
                            <div className="relative">
                                <input type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} required className="mt-1 block w-full min-h-[44px] bg-gray-800 border-gray-700 rounded-md shadow-sm text-white pr-12" />
                                <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-white transition-colors">
                                    {showNewPassword ? (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>) : (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>)}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300">{t('Confirm_Password')}</label>
                            <div className="relative">
                                <input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className="mt-1 block w-full min-h-[44px] bg-gray-800 border-gray-700 rounded-md shadow-sm text-white pr-12" />
                                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-white transition-colors">
                                    {showConfirmPassword ? (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>) : (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>)}
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 md:p-6 bg-gray-900 flex items-center justify-end space-x-4 rounded-b-lg">
                        {successMessage && <span className="text-sm text-green-400">{successMessage}</span>}
                        <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-colors text-sm disabled:opacity-60">
                            {isSubmitting ? t('Please_wait') : t('Save_Changes')}
                        </button>
                    </div>
                </form>
            </div>

            <div className="bg-gray-900/50 border border-gray-800 rounded-lg mt-6">
                <div className="p-4 md:p-6 border-b border-gray-800">
                    <h2 className="text-xl font-bold text-white">{t({ en: 'Delete Account', it: 'Elimina Account' })}</h2>
                    <p className="text-sm text-gray-400 mt-1">{t({ en: 'Permanently remove your account and all data', it: 'Rimuovi definitivamente il tuo account e tutti i dati' })}</p>
                </div>
                <div className="p-4 md:p-6">
                    <button
                        onClick={() => setShowDeleteModal(true)}
                        className="px-5 py-2.5 bg-red-600 text-white font-bold rounded-full hover:bg-red-700 transition-colors text-sm"
                    >
                        {t({ en: 'Delete My Account', it: 'Elimina il mio Account' })}
                    </button>
                </div>
            </div>

            {showDeleteModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-lg max-w-md w-full p-4 md:p-6">
                        {deleteSuccess ? (
                            <>
                                <h3 className="text-2xl font-bold text-green-400 mb-4">{t({ en: 'Account Deleted', it: 'Account Eliminato' })}</h3>
                                <p className="text-gray-300">{t({ en: 'Redirecting...', it: 'Reindirizzamento...' })}</p>
                            </>
                        ) : (
                            <>
                                <h3 className="text-2xl font-bold text-white mb-4">{t({ en: 'Delete Account?', it: 'Eliminare l\'account?' })}</h3>
                                <p className="text-gray-300 mb-6">{t({ en: 'This will permanently delete your account and all data.', it: 'Questa azione eliminerà definitivamente il tuo account e tutti i dati.' })}</p>
                                {error && <p className="text-sm text-red-400 bg-red-900/20 p-3 rounded-md mb-4">{error}</p>}
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => { setShowDeleteModal(false); setError(''); }}
                                        disabled={isDeleting}
                                        className="flex-1 px-5 py-2.5 bg-gray-700 text-white font-bold rounded-full hover:bg-gray-600 transition-colors text-sm disabled:opacity-50"
                                    >
                                        {t({ en: 'Cancel', it: 'Annulla' })}
                                    </button>
                                    <button
                                        onClick={handleDeleteAccount}
                                        disabled={isDeleting}
                                        className="flex-1 px-5 py-2.5 bg-red-600 text-white font-bold rounded-full hover:bg-red-700 transition-colors text-sm disabled:opacity-50"
                                    >
                                        {isDeleting ? t({ en: 'Deleting...', it: 'Eliminazione...' }) : t({ en: 'Yes, Delete', it: 'Sì, elimina' })}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

export default SecuritySettings;

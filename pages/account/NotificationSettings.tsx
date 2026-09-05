import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import MarketingConsentModal from '../../components/ui/MarketingConsentModal';

// La pallina resta nera piena: corre su una pista bianca o grigia, non sul
// marmo, e trasparente sparirebbe.
const Switch: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }> = ({ checked, onChange, disabled }) => (
    <button
        type="button"
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative w-12 h-6 rounded-full transition-colors ${checked ? 'bg-white' : 'bg-gray-700'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
        <div className={`absolute left-1 top-1 bg-dr7-obsidian w-4 h-4 rounded-full transition-transform ${checked ? 'translate-x-6' : ''}`}></div>
    </button>
);

const NotificationSettings = () => {
    const { user, updateUser } = useAuth();
    const { t } = useTranslation();

    const [prefs, setPrefs] = useState({
        bookingConfirmations: true,
        specialOffers: false,
        newsletter: false,
        marketingConsent: false,
    });

    const [showConsentModal, setShowConsentModal] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        if (user?.notifications) {
            setPrefs({
                bookingConfirmations: user.notifications.bookingConfirmations ?? true,
                specialOffers: user.notifications.specialOffers ?? false,
                newsletter: user.notifications.newsletter ?? false,
                marketingConsent: user.notifications.marketingConsent ?? false,
            });
        }
    }, [user]);

    const [pendingPref, setPendingPref] = useState<'newsletter' | 'specialOffers' | null>(null);

    const handlePrefChange = async (key: keyof typeof prefs, value: boolean) => {
        // If trying to enable newsletter or specialOffers and no marketing consent yet, show modal
        if ((key === 'newsletter' || key === 'specialOffers') && value && !prefs.marketingConsent) {
            setPendingPref(key);
            setShowConsentModal(true);
            return;
        }

        const newPrefs = { ...prefs, [key]: value };

        // If turning off newsletter or specialOffers, check if both are off to revoke consent
        if ((key === 'newsletter' || key === 'specialOffers') && !value) {
            const otherKey = key === 'newsletter' ? 'specialOffers' : 'newsletter';
            const bothOff = !value && !prefs[otherKey];

            if (bothOff) {
                newPrefs.marketingConsent = false;

                // Revoke consent via Netlify function (GDPR-compliant)
                try {
                    const response = await fetch('/.netlify/functions/revoke-consent', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            user_id: user!.id,
                            consent_type: 'marketing_partner',
                        }),
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        console.error('Failed to revoke consent:', error);
                    } else {
                        console.log('Consent revoked successfully');
                    }
                } catch (e) {
                    console.error('Failed to revoke marketing consent:', e);
                }
            }
        }

        setPrefs(newPrefs);
        await updateUser({ notifications: newPrefs });
    };

    const handleConsentAccept = async () => {
        const newPrefs = {
            ...prefs,
            marketingConsent: true,
            ...(pendingPref === 'newsletter' && { newsletter: true }),
            ...(pendingPref === 'specialOffers' && { specialOffers: true }),
        };
        setPrefs(newPrefs);

        // Save to user metadata
        await updateUser({ notifications: newPrefs });

        // Note: GDPR-compliant consent is now saved by the MarketingConsentModal
        // via the save-consent Netlify function (with IP address and user agent)
        setSuccessMessage('Consenso salvato con successo!');

        setPendingPref(null);
        setShowConsentModal(false);

        // Clear message after 4 seconds
        setTimeout(() => setSuccessMessage(''), 4000);
    };

    const handleConsentDecline = () => {
        setPendingPref(null);
        setShowConsentModal(false);
    };

    if (!user) return null;

    return (
        <>
            {/* Success/Error Message */}
            {successMessage && (
                <div className={`mb-4 p-4 rounded-lg text-center font-medium ${successMessage.includes('Errore') ? 'bg-red-900/50 text-red-300 border border-red-700' : 'bg-green-900/50 text-green-300 border border-green-700'}`}>
                    {successMessage}
                </div>
            )}

            <div className="bg-gray-900/50 border border-gray-800 rounded-lg">
                <div className="p-4 md:p-6 border-b border-gray-800">
                    <h2 className="text-xl font-bold text-white">{t('Notification_Preferences')}</h2>
                    <p className="text-sm text-gray-400 mt-1">{t('Manage_how_we_communicate_with_you')}</p>
                </div>
                <div className="p-4 md:p-6 space-y-4">
                    <div className="flex justify-between items-center p-4 bg-gray-800/50 rounded-lg gap-4">
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold text-white">{t('Booking_Confirmations')}</p>
                            <p className="text-sm text-gray-400">{t('Essential_updates_about_your_bookings')}</p>
                        </div>
                        <Switch checked={prefs.bookingConfirmations} onChange={() => { }} disabled />
                    </div>
                    <div className="flex justify-between items-center p-4 bg-gray-800/50 rounded-lg gap-4">
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold text-white">{t('Special_Offers')}</p>
                            <p className="text-sm text-gray-400">{t('Exclusive_deals_and_promotions_for_you')}</p>
                        </div>
                        <Switch checked={prefs.specialOffers} onChange={(val) => handlePrefChange('specialOffers', val)} />
                    </div>
                    <div className="flex justify-between items-center p-4 bg-gray-800/50 rounded-lg gap-4">
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold text-white">{t('Newsletter')}</p>
                            <p className="text-sm text-gray-400">{t('Latest_fleet_updates_and_news')}</p>
                        </div>
                        <Switch checked={prefs.newsletter} onChange={(val) => handlePrefChange('newsletter', val)} />
                    </div>
                </div>
            </div>

            {/* Marketing Consent Modal */}
            <MarketingConsentModal
                isOpen={showConsentModal}
                userId={user.id}
                onConfirm={handleConsentAccept}
                onClose={handleConsentDecline}
            />
        </>
    );
};

export default NotificationSettings;

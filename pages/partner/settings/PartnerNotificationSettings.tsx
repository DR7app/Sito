import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { useTranslation } from '../../../hooks/useTranslation';

// La pallina resta nera piena: corre su una pista bianca o grigia, non sul
// marmo, e trasparente sparirebbe.
const Switch: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }> = ({ checked, onChange, disabled }) => (
    <div className="relative">
        <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
        <div className={`block w-12 h-6 rounded-full transition-colors ${checked ? 'bg-white' : 'bg-gray-700'}`}></div>
        <div className={`dot absolute left-1 top-1 bg-dr7-obsidian w-4 h-4 rounded-full transition-transform ${checked ? 'translate-x-6' : ''}`}></div>
    </div>
);

const PartnerNotificationSettings = () => {
    const { user, updateUser } = useAuth();
    const { t } = useTranslation();

    const [prefs, setPrefs] = useState({
        newBookings: true,
        bookingCancellations: true,
        platformUpdates: false,
    });

    // In a real app, partner-specific notifications would be a separate field.
    // For this mock, we are managing a local state and not persisting it.
    // useEffect(() => {
    //     if (user && user.partnerNotifications) {
    //         setPrefs(user.partnerNotifications);
    //     }
    // }, [user]);

    const handlePrefChange = async (key: keyof typeof prefs, value: boolean) => {
        const newPrefs = { ...prefs, [key]: value };
        setPrefs(newPrefs);
        // This is where you would call updateUser if you had this field in your User type
        // await updateUser({ partnerNotifications: newPrefs });
    };

    if (!user) return null;

    return (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg">
            <div className="p-6 border-b border-gray-800">
                <h2 className="text-xl font-bold text-white">{t('Notification_Preferences')}</h2>
                <p className="text-sm text-gray-400 mt-1">{t('Manage_how_we_communicate_with_you')}</p>
            </div>
            <div className="p-6 space-y-4">
                <div className="flex justify-between items-center p-4 bg-gray-800/50 rounded-lg">
                    <div>
                        <p className="font-semibold text-white">{t('New_Bookings')}</p>
                        <p className="text-sm text-gray-400">{t('Get_notified_about_new_bookings')}</p>
                    </div>
                    <Switch checked={prefs.newBookings} onChange={(val) => handlePrefChange('newBookings', val)} />
                </div>
                 <div className="flex justify-between items-center p-4 bg-gray-800/50 rounded-lg">
                    <div>
                        <p className="font-semibold text-white">{t('Booking_Cancellations')}</p>
                        <p className="text-sm text-gray-400">{t('Get_notified_about_cancellations')}</p>
                    </div>
                    <Switch checked={prefs.bookingCancellations} onChange={(val) => handlePrefChange('bookingCancellations', val)} />
                </div>
                 <div className="flex justify-between items-center p-4 bg-gray-800/50 rounded-lg">
                    <div>
                        <p className="font-semibold text-white">{t('Platform_Updates')}</p>
                        <p className="text-sm text-gray-400">{t('Receive_updates_about_the_platform')}</p>
                    </div>
                    <Switch checked={prefs.platformUpdates} onChange={(val) => handlePrefChange('platformUpdates', val)} />
                </div>
            </div>
        </div>
    );
};

export default PartnerNotificationSettings;
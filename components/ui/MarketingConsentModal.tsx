import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XIcon } from '../icons/Icons';
import { useTranslation } from '../../hooks/useTranslation';

interface MarketingConsentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    userId?: string;
}

const CONSENT_TEXT = "Acconsento a ricevere offerte e comunicazioni promozionali da partner selezionati da DR7 tramite email, telefono, SMS o WhatsApp.";

const MarketingConsentModal: React.FC<MarketingConsentModalProps> = ({ isOpen, onClose, onConfirm, userId }) => {
    const { t } = useTranslation();
    const [isSaving, setIsSaving] = useState(false);

    const handleConfirm = async () => {
        if (!userId) {
            console.warn('[MarketingConsentModal] No userId provided, skipping GDPR consent save');
            onConfirm();
            return;
        }

        setIsSaving(true);
        try {
            // Call the Netlify function to save consent with IP address and user agent
            const response = await fetch('/.netlify/functions/save-consent', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id: userId,
                    consent_type: 'marketing_partner',
                    consent_text: CONSENT_TEXT,
                    source: 'web',
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                console.error('[MarketingConsentModal] Failed to save consent:', error);
            } else {
                const result = await response.json();
                console.log('[MarketingConsentModal] Consent saved successfully:', result);
            }
        } catch (error) {
            console.error('[MarketingConsentModal] Error saving consent:', error);
        } finally {
            setIsSaving(false);
            onConfirm();
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/90 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="relative bg-black border border-gray-700 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden"
                    >
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors z-10"
                            aria-label={t({ it: "Chiudi", en: "Close" })}
                        >
                            <XIcon className="w-5 h-5" />
                        </button>

                        <div className="p-5 md:p-8">
                            <div className="text-center mb-6">
                                <h2 className="text-2xl font-bold text-white mb-4">{t({ it: "Rimani Aggiornato", en: "Stay Updated" })}</h2>
                            </div>

                            <div className="bg-gray-900/50 rounded-lg p-4 mb-4 border border-gray-800">
                                <p className="text-gray-300 text-sm leading-relaxed">
                                    {t({ it: 'Acconsento a ricevere offerte e comunicazioni promozionali da partner selezionati da DR7 tramite email, telefono, SMS o WhatsApp.', en: 'I consent to receiving offers and promotional communications from partners selected by DR7 via email, phone, SMS or WhatsApp.' })}
                                </p>
                                <p className="text-gray-400 text-xs mt-2">
                                    {t({ it: 'Consenso facoltativo e revocabile in qualsiasi momento.', en: 'Consent is optional and can be withdrawn at any time.' })} <a href="/privacy-policy" className="text-white underline hover:text-gray-300">Privacy Policy</a>
                                </p>
                            </div>

                            <div className="bg-gray-900/50 rounded-lg p-4 mb-6 border border-gray-800">
                                <p className="text-white font-semibold text-sm mb-3">{t({ it: "Vantaggi immediati:", en: "Immediate benefits:" })}</p>
                                <ul className="text-gray-300 text-sm space-y-2">
                                    <li>• {t({ it: "Credito immediato ogni volta che acquisti", en: "Instant credit every time you buy" })}</li>
                                    <li>• {t({ it: "Accesso a premi ed estrazioni riservate gratuite ogni mese", en: "Access to free prizes and members-only draws every month" })}</li>
                                    <li>• {t({ it: "Sconti esclusivi e priorità sulle offerte", en: "Exclusive discounts and priority on offers" })}</li>
                                </ul>
                            </div>

                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={handleConfirm}
                                    disabled={isSaving}
                                    className="w-full py-3.5 bg-white text-black font-bold hover:bg-gray-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {isSaving ? 'Salvataggio...' : 'Acconsento'}
                                </button>
                                <button
                                    onClick={onClose}
                                    className="w-full py-3 text-gray-500 font-medium hover:text-white transition-colors text-sm"
                                >
                                    Non accetto, grazie
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default MarketingConsentModal;

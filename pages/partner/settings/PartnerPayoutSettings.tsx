import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { useTranslation } from '../../../hooks/useTranslation';

const PartnerPayoutSettings = () => {
    const { user, updateUser } = useAuth();
    const { t } = useTranslation();

    const [formData, setFormData] = useState({
        payoutMethod: 'iban' as 'iban' | 'paypal',
        payoutDetails: '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        if (user?.businessVerification) {
            setFormData({
                payoutMethod: user.businessVerification.payoutMethod || 'iban',
                payoutDetails: user.businessVerification.payoutDetails || '',
            });
        }
    }, [user]);

    const payoutPlaceholder = useMemo(() => {
        return formData.payoutMethod === 'iban' ? t('IBAN') : t('PayPal_Email');
    }, [formData.payoutMethod, t]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (successMessage) setSuccessMessage('');
    };
    
    const handleMethodChange = (method: 'iban' | 'paypal') => {
        setFormData(prev => ({ ...prev, payoutMethod: method, payoutDetails: '' }));
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setSuccessMessage('');
        
        if (user) {
            await updateUser({
                businessVerification: {
                    ...user.businessVerification,
                    status: user.businessVerification?.status || 'unverified',
                    payoutMethod: formData.payoutMethod,
                    payoutDetails: formData.payoutDetails,
                }
            });
        }

        setIsSubmitting(false);
        setSuccessMessage(t('Changes_Saved'));
        setTimeout(() => setSuccessMessage(''), 3000);
    };

    return (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg">
            <div className="p-4 md:p-6 border-b border-gray-800">
                <h2 className="text-xl font-bold text-white">{t('Payout_Settings')}</h2>
                <p className="text-sm text-gray-400 mt-1">{t('Manage_your_payout_information')}</p>
            </div>
            <form onSubmit={handleSubmit}>
                <div className="p-4 md:p-6 space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold text-white">{t('Payout_Method')}</h3>
                        <p className="text-sm text-gray-400 mb-4">{t('How_would_you_like_to_receive_payouts')}</p>
                        <div className="flex gap-4 mb-4">
                            <label className={`flex-1 p-4 border cursor-pointer transition-colors ${formData.payoutMethod === 'iban' ? 'bg-white/10 border-white' : 'border-gray-700 hover:border-gray-500'}`}><input type="radio" name="payoutMethod" value="iban" checked={formData.payoutMethod === 'iban'} onChange={() => handleMethodChange('iban')} className="sr-only"/><span>{t('Bank_Transfer')}</span></label>
                            <label className={`flex-1 p-4 border cursor-pointer transition-colors ${formData.payoutMethod === 'paypal' ? 'bg-white/10 border-white' : 'border-gray-700 hover:border-gray-500'}`}><input type="radio" name="payoutMethod" value="paypal" checked={formData.payoutMethod === 'paypal'} onChange={() => handleMethodChange('paypal')} className="sr-only"/><span>{t('PayPal')}</span></label>
                        </div>
                        <div>
                            <label htmlFor="payoutDetails" className="sr-only">{payoutPlaceholder}</label>
                            <input type="text" id="payoutDetails" name="payoutDetails" value={formData.payoutDetails} onChange={handleChange} placeholder={payoutPlaceholder} required className="w-full bg-gray-800 border-gray-700 rounded-md p-3 text-white"/>
                        </div>
                    </div>
                </div>
                <div className="p-4 md:p-6 bg-gray-900 flex items-center justify-end space-x-4 rounded-b-lg">
                    {successMessage && <span className="text-sm text-green-400">{successMessage}</span>}
                    <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 bg-white text-black font-bold hover:bg-gray-200 transition-colors text-sm disabled:opacity-60">{isSubmitting ? t('Please_wait') : t('Save_Changes')}</button>
                </div>
            </form>
        </div>
    );
};
export default PartnerPayoutSettings;
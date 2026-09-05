import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { useTranslation } from '../../../hooks/useTranslation';

const PartnerProfileSettings = () => {
    const { user, updateUser } = useAuth();
    const { t } = useTranslation();

    const [formData, setFormData] = useState({
        companyName: '',
        address: '',
        vatNumber: '',
        fullName: '',
        email: '',
        phone: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        if (user) {
            setFormData({
                companyName: user.companyName || '',
                address: user.businessVerification?.address || '',
                vatNumber: user.businessVerification?.vatNumber || '',
                fullName: user.fullName || '',
                email: user.email || '',
                phone: user.phone || ''
            });
        }
    }, [user]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if(successMessage) setSuccessMessage('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setSuccessMessage('');

        if (user) {
            await updateUser({
                companyName: formData.companyName,
                fullName: formData.fullName,
                email: formData.email,
                phone: formData.phone,
                businessVerification: {
                    ...user.businessVerification,
                    status: user.businessVerification?.status || 'unverified',
                    address: formData.address,
                    vatNumber: formData.vatNumber,
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
                <h2 className="text-xl font-bold text-white">{t('Profile_Details')}</h2>
                <p className="text-sm text-gray-400 mt-1">{t('Update_your_information')}</p>
            </div>
            <form onSubmit={handleSubmit}>
                <div className="p-4 md:p-6 space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold text-white mb-4">{t('Company_Information')}</h3>
                        <div className="space-y-4">
                            <div><label htmlFor="companyName" className="block text-sm font-medium text-gray-300">{t('Company_Name')}</label><input type="text" name="companyName" id="companyName" value={formData.companyName} onChange={handleChange} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md text-white"/></div>
                            <div><label htmlFor="vatNumber" className="block text-sm font-medium text-gray-300">{t('VAT_Number')}</label><input type="text" name="vatNumber" id="vatNumber" value={formData.vatNumber} onChange={handleChange} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md text-white"/></div>
                            <div><label htmlFor="address" className="block text-sm font-medium text-gray-300">{t('Business_Address')}</label><input type="text" name="address" id="address" value={formData.address} onChange={handleChange} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md text-white"/></div>
                        </div>
                    </div>
                    <div className="border-t border-gray-800 pt-6">
                        <h3 className="text-lg font-semibold text-white mb-4">{t('Legal_Representative')}</h3>
                        <div className="space-y-4">
                            <div><label htmlFor="fullName" className="block text-sm font-medium text-gray-300">{t('Full_Name')}</label><input type="text" name="fullName" id="fullName" value={formData.fullName} onChange={handleChange} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md text-white"/></div>
                            <div><label htmlFor="email" className="block text-sm font-medium text-gray-300">{t('Email_Address')}</label><input type="email" name="email" id="email" value={formData.email} readOnly className="mt-1 block w-full bg-gray-800/50 border-gray-700 rounded-md text-gray-400 cursor-not-allowed"/></div>
                            <div><label htmlFor="phone" className="block text-sm font-medium text-gray-300">{t('Phone_Number')}</label><input type="tel" name="phone" id="phone" value={formData.phone} onChange={handleChange} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md text-white"/></div>
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

export default PartnerProfileSettings;
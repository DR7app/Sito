import React, { useState, useRef, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../../components/ui/Button';
// FIX: Import AnimatePresence from framer-motion
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const VerificationForm: React.FC = () => {
  const { user, updateUser } = useAuth();
  const { t } = useTranslation();
  
  const [formData, setFormData] = useState({
    address: user?.businessVerification?.address || '',
    vatNumber: user?.businessVerification?.vatNumber || '',
    registrationDoc: user?.businessVerification?.registrationDoc || '',
    payoutMethod: user?.businessVerification?.payoutMethod || ('iban' as 'iban' | 'paypal'),
    payoutDetails: user?.businessVerification?.payoutDetails || '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => setFormData(prev => ({ ...prev, registrationDoc: event.target?.result as string }));
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.address || !formData.registrationDoc || !user) return;
    setIsSubmitting(true);
    
    await updateUser({
      businessVerification: {
        ...user.businessVerification,
        status: 'pending',
        ...formData
      }
    });
    
    setIsSubmitting(false);
  };
  
  const payoutPlaceholder = useMemo(() => {
    return formData.payoutMethod === 'iban' ? t('IBAN') : t('PayPal_Email');
  }, [formData.payoutMethod, t]);

  if (!user) return null;

  return (
    <form onSubmit={handleSubmit} className="bg-gray-900/50 border border-gray-800 rounded-lg">
      <div className="p-4 md:p-8 space-y-8">
        <div className="border-b border-gray-700 pb-6">
          <h3 className="text-xl font-bold text-white mb-4">{t('Company_Information')}</h3>
          <div className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-300 mb-2">{t('Company_Name')}</label><input type="text" value={user.companyName || ''} readOnly className="w-full bg-gray-800/50 border-gray-700 rounded-md p-3 text-gray-400 cursor-not-allowed"/></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label htmlFor="vatNumber" className="block text-sm font-medium text-gray-300 mb-2">{t('VAT_Number')}</label><input type="text" id="vatNumber" name="vatNumber" value={formData.vatNumber} onChange={handleChange} required className="w-full bg-gray-800 border-gray-700 rounded-md p-3 text-white"/></div>
              <div><label htmlFor="address" className="block text-sm font-medium text-gray-300 mb-2">{t('Business_Address')}</label><input type="text" id="address" name="address" value={formData.address} onChange={handleChange} required className="w-full bg-gray-800 border-gray-700 rounded-md p-3 text-white"/></div>
            </div>
          </div>
        </div>
        <div className="border-b border-gray-700 pb-6">
           <h3 className="text-xl font-bold text-white mb-4">{t('Legal_Representative')}</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-300 mb-2">{t('Full_Name')}</label><input type="text" value={user.fullName || ''} readOnly className="w-full bg-gray-800/50 border-gray-700 rounded-md p-3 text-gray-400 cursor-not-allowed"/></div>
              <div><label className="block text-sm font-medium text-gray-300 mb-2">{t('Email_Address')}</label><input type="email" value={user.email || ''} readOnly className="w-full bg-gray-800/50 border-gray-700 rounded-md p-3 text-gray-400 cursor-not-allowed"/></div>
           </div>
        </div>
        <div className="border-b border-gray-700 pb-6">
          <h3 className="text-xl font-bold text-white mb-4">{t('Upload_Registration_Document')}</h3>
          {formData.registrationDoc ? (
            <div className="relative"><div className="bg-gray-800 p-3 rounded-md text-sm text-green-400 border border-green-700">{t('Document_uploaded')}</div><button type="button" onClick={() => setFormData(p => ({...p, registrationDoc: ''}))} className="absolute top-2 right-2 bg-black/50 text-white p-1.5 text-xs hover:bg-black">✕</button></div>
          ) : (
            <div className="mt-2 border-2 border-dashed border-gray-600 rounded-lg p-6 text-center"><p className="text-sm text-gray-400 mb-4">{t('Please_upload_your_business_registration')}</p><Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>{t('Upload_File')}</Button><input type="file" accept=".pdf,.png,.jpg,.jpeg" ref={fileInputRef} onChange={handleFileChange} className="hidden" /></div>
          )}
        </div>
        <div>
          <h3 className="text-xl font-bold text-white mb-4">{t('Payout_Method')}</h3>
          <p className="text-sm text-gray-400 mb-4">{t('How_would_you_like_to_receive_payouts')}</p>
          <div className="flex gap-4 mb-4">
              <label className={`flex-1 p-4 border cursor-pointer transition-colors ${formData.payoutMethod === 'iban' ? 'bg-white/10 border-white' : 'border-gray-700 hover:border-gray-500'}`}><input type="radio" name="payoutMethod" value="iban" checked={formData.payoutMethod === 'iban'} onChange={handleChange} className="sr-only"/><span>{t('Bank_Transfer')}</span></label>
              <label className={`flex-1 p-4 border cursor-pointer transition-colors ${formData.payoutMethod === 'paypal' ? 'bg-white/10 border-white' : 'border-gray-700 hover:border-gray-500'}`}><input type="radio" name="payoutMethod" value="paypal" checked={formData.payoutMethod === 'paypal'} onChange={handleChange} className="sr-only"/><span>{t('PayPal')}</span></label>
          </div>
          <div><label htmlFor="payoutDetails" className="sr-only">{payoutPlaceholder}</label><input type="text" id="payoutDetails" name="payoutDetails" value={formData.payoutDetails} onChange={handleChange} placeholder={payoutPlaceholder} required className="w-full bg-gray-800 border-gray-700 rounded-md p-3 text-white"/></div>
        </div>
      </div>
      <div className="p-6 bg-gray-900 flex items-center justify-end rounded-b-lg">
        <Button type="submit" disabled={isSubmitting || !formData.address || !formData.registrationDoc || !formData.payoutDetails}>
          {isSubmitting ? t('Please_wait') : t('Submit_for_Verification')}
        </Button>
      </div>
    </form>
  )
}

const VerifiedView: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    return (
        <div className="bg-green-900/30 border border-green-400/40 rounded-lg p-8 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-green-500/20 text-green-300 rounded-full flex items-center justify-center mx-auto mb-6">
                
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">{t('Verification_Status_Verified')}</h2>
            <p className="text-green-200/80 max-w-md mx-auto">{t('Verification_Status_Verified_Desc')}</p>
            <Button as={motion.button} whileHover={{scale:1.05}} whileTap={{scale:0.95}} onClick={() => navigate('/partner/dashboard')} className="mt-8">{t('Back_to_Dashboard')}</Button>
        </div>
    );
}

const PendingView: React.FC = () => {
    const { t } = useTranslation();
    const { user } = useAuth();

    const InfoRow: React.FC<{ label: string, value?: string }> = ({ label, value }) => (
        <div className="flex justify-between items-center text-sm py-2">
            <span className="text-gray-400">{label}</span>
            <span className="font-medium text-white text-right">{value || 'N/A'}</span>
        </div>
    )
    
    return (
        <div className="bg-yellow-900/30 border border-yellow-400/40 rounded-lg p-8 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-yellow-500/20 text-yellow-300 rounded-full flex items-center justify-center mx-auto mb-6">
                
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">{t('Verification_Status_Pending')}</h2>
            <p className="text-yellow-200/80 max-w-md mx-auto mb-8">{t('Verification_Status_Pending_Desc')}</p>

             <div className="w-full max-w-lg bg-gray-900/50 border border-gray-700 rounded-lg p-6 text-left">
                <h3 className="text-lg font-bold text-white mb-4">{t('Submitted_Information')}</h3>
                <div className="space-y-1">
                    <InfoRow label={t('Company_Name')} value={user?.companyName} />
                    <InfoRow label={t('VAT_Number')} value={user?.businessVerification?.vatNumber} />
                    <InfoRow label={t('Business_Address')} value={user?.businessVerification?.address} />
                    <InfoRow label={t('Payout_Method')} value={user?.businessVerification?.payoutMethod} />
                    <InfoRow label={t('Payout_Settings')} value={user?.businessVerification?.payoutMethod === 'iban' ? '••••' + user?.businessVerification?.payoutDetails?.slice(-4) : user?.businessVerification?.payoutDetails} />
                </div>
            </div>
        </div>
    );
}

const PartnerVerificationPage = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  
  const verificationStatus = useMemo(() => user?.businessVerification?.status || 'unverified', [user]);

  const renderContent = () => {
    switch(verificationStatus) {
        case 'verified':
            return <VerifiedView />;
        case 'pending':
            return <PendingView />;
        case 'unverified':
        default:
            return <VerificationForm />;
    }
  }

  return (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="pt-20 pb-24 bg-black min-h-screen text-white"
    >
      <div className="container mx-auto px-4 md:px-6 max-w-3xl">
        {verificationStatus === 'unverified' && (
            <div className="text-center mb-10">
                <h1 className="text-2xl md:text-4xl font-bold">{t('Business_Verification')}</h1>
                <p className="text-gray-400 mt-2">{t('Complete_verification_to_publish')}</p>
            </div>
        )}
        
        <AnimatePresence mode="wait">
            <motion.div
                key={verificationStatus}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
            >
                {renderContent()}
            </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default PartnerVerificationPage;

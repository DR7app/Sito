import React, { useState, useEffect, useRef } from 'react';
import { motion, Variants, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../supabaseClient';
import { addCredits } from '../utils/creditWallet';
import { caricaDatiFatturaCliente } from '../utils/datiFatturaCliente';
import { useTranslation } from '../hooks/useTranslation';
import { getCreditWalletCopy, type CreditWalletCopy, type CreditPackage } from '../utils/siteCopy';

// I pacchetti arrivano dal CMS (admin > Sito > Credit Wallet, salvati in
// centralina_pro_config.site_copy.creditWallet.packages). getCreditWalletCopy
// ricade sul seed di siteCopy.ts finche' l'admin non ne salva di suoi.

// Migliaia e decimali secondo la lingua della pagina: in italiano "10.000",
// in inglese "10,000". Senza locale esplicita toLocaleString usava quella del
// browser e un pacchetto da diecimila euro appariva "10,000" a un cliente
// italiano, che legge dieci.
const formatAmount = (n: number, lang: 'it' | 'en'): string =>
  n.toLocaleString(lang === 'it' ? 'it-IT' : 'en-GB', { maximumFractionDigits: 2 });

const PackageCard: React.FC<{ pkg: CreditPackage; onSelect: () => void; copy: CreditWalletCopy; lang: 'it' | 'en' }> = ({ pkg, onSelect, copy, lang }) => {
  const c = (it: keyof CreditWalletCopy, en: keyof CreditWalletCopy): string =>
    (copy as Record<string, string>)[(lang === 'it' ? it : en) as string];
  const cardVariants: Variants = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  return (
    <motion.div
      variants={cardVariants}
      className={`relative bg-gray-900/50 backdrop-blur-sm border ${pkg.popular ? 'border-white' : 'border-gray-800'
        } rounded-lg p-6 flex flex-col transition-all duration-300 hover:border-white hover:shadow-xl hover:shadow-white/20`}
    >
      {pkg.popular && (
        <div className="absolute top-0 -translate-y-1/2 left-1/2 -translate-x-1/2 bg-white text-black px-4 py-1 rounded-full text-sm font-semibold">
          {c('card_popular_badge_it', 'card_popular_badge_en')}
        </div>
      )}

      {/* La serie e' un'etichetta di sezione: sempre in maiuscolo, qualunque
          cosa sia finita in configurazione (una salvata prima che il
          gestionale normalizzasse restava "dr7 maxi" sulla card). */}
      <div className="text-xs text-gray-400 font-semibold mb-2 uppercase">{pkg.series}</div>
      <h3 className="text-2xl font-bold text-white mb-4">{pkg.name}</h3>

      <div className="mb-4">
        <div className="text-xs text-gray-500 mb-1">{c('card_recharge_label_it', 'card_recharge_label_en')}</div>
        <div className="text-xl font-semibold text-gray-300">{formatAmount(pkg.rechargeAmount, lang)}</div>
      </div>

      <div className="flex items-center justify-center py-2">
        <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
        </svg>
      </div>

      <div className="mb-4 pb-4 border-b border-gray-700">
        <div className="text-sm text-gray-400 mb-1">{c('card_receive_label_it', 'card_receive_label_en')}</div>
        <div className="text-5xl font-extrabold text-white">{formatAmount(pkg.receivedAmount, lang)}</div>
        <div className="text-lg text-white mt-3 font-bold">
          +{pkg.bonusPercentage}% {c('card_bonus_suffix_it', 'card_bonus_suffix_en')} ({formatAmount(pkg.bonus, lang)})
        </div>
      </div>

      <button
        onClick={onSelect}
        className={`w-full mt-auto py-3 px-6 font-bold rounded-full transition-all duration-300 transform hover:scale-105 ${pkg.popular
          ? 'bg-white text-black hover:bg-gray-200'
          : 'bg-gray-700 text-white hover:bg-gray-600'
          }`}
      >
        {c('card_cta_it', 'card_cta_en')}
      </button>
    </motion.div>
  );
};


const CreditWalletPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, lang } = useTranslation();
  const [selectedSeries, setSelectedSeries] = useState<string>('all');
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [copy, setCopy] = useState<CreditWalletCopy | null>(null);
  const copyRef = useRef<CreditWalletCopy | null>(null);
  useEffect(() => {
    let cancelled = false;
    getCreditWalletCopy().then(c => { if (cancelled) return; copyRef.current = c; setCopy(c); });
    return () => { cancelled = true; };
  }, []);
  const w = (it: keyof CreditWalletCopy, en: keyof CreditWalletCopy): string => {
    const cur = copyRef.current;
    if (!cur) return '';
    return cur[lang === 'it' ? it : en] as string;
  };
  const packages: CreditPackage[] = copy?.packages ?? [];
  // Nexi payment - no stripe needed
  // Nexi payment - no elements needed
  // Nexi payment - no card element needed
  // Nexi payment - no client secret needed
  // Nexi payment - no loading state needed
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Customer info
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    codiceFiscale: '',
    indirizzo: '',
    numeroCivico: '',
    cittaResidenza: '',
    codicePostale: '',
    provinciaResidenza: ''
  });



  // Precompila i dati fattura del cliente loggato. La fonte non e' solo la
  // scheda cliente: chi si e' iscritto dal sito ha gia' inserito CF e
  // indirizzo, che restano nei metadati auth anche quando il salvataggio
  // della scheda e' fallito. Vedi utils/datiFatturaCliente.ts.
  useEffect(() => {
    if (!user) return;

    let annullato = false;
    (async () => {
      const dati = await caricaDatiFatturaCliente(user.id);
      if (annullato) return;
      setFormData(prev => ({
        fullName: dati.fullName || user.fullName || prev.fullName,
        email: dati.email || user.email || prev.email,
        phone: dati.phone || user.phone || prev.phone,
        codiceFiscale: dati.codiceFiscale || prev.codiceFiscale,
        indirizzo: dati.indirizzo || prev.indirizzo,
        numeroCivico: dati.numeroCivico || prev.numeroCivico,
        cittaResidenza: dati.cittaResidenza || prev.cittaResidenza,
        codicePostale: dati.codicePostale || prev.codicePostale,
        provinciaResidenza: dati.provinciaResidenza || prev.provinciaResidenza,
      }));
    })();

    return () => { annullato = true; };
  }, [user]);

  const handleSelectPackage = (packageId: string) => {
    if (user) {
      const pkg = packages.find(p => p.id === packageId);
      if (pkg) {
        setSelectedPackage(pkg);
        setShowPaymentModal(true);
      }
    } else {
      navigate('/signin', { state: { from: { pathname: '/credit-wallet' } } });
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPackage || !user?.id) {
      setPaymentError(w('err_payment_not_ready_it', 'err_payment_not_ready_en'));
      return;
    }

    setIsProcessing(true);
    setPaymentError(null);

    try {
      // 1. Save credit wallet purchase as pending
      const { data, error: dbError } = await supabase
        .from('credit_wallet_purchases')
        .insert([{
          user_id: user.id,
          package_id: selectedPackage.id,
          package_name: selectedPackage.name,
          package_series: selectedPackage.series,
          recharge_amount: selectedPackage.rechargeAmount,
          received_amount: selectedPackage.receivedAmount,
          bonus_amount: selectedPackage.bonus,
          bonus_percentage: selectedPackage.bonusPercentage,
          payment_status: 'pending',
          payment_method: 'nexi',
          currency: 'EUR',
          customer_name: formData.fullName || user.fullName || '',
          customer_email: formData.email || user.email || '',
          customer_phone: formData.phone || user.phone || '',
          customer_codice_fiscale: formData.codiceFiscale,
          customer_indirizzo: formData.indirizzo,
          customer_numero_civico: formData.numeroCivico,
          customer_citta: formData.cittaResidenza,
          customer_cap: formData.codicePostale,
          customer_provincia: formData.provinciaResidenza,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (dbError) {
        console.error('Database error:', dbError);
        throw new Error(t('Purchase_record_failed'));
      }

      console.log('Purchase record saved:', data.id);

      // 2. Generate nexi_order_id
      const nexiOrderId = `DR7${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      // 3. Update with nexi_order_id
      await supabase
        .from('credit_wallet_purchases')
        .update({ nexi_order_id: nexiOrderId })
        .eq('id', data.id);

      // 4. Create Nexi payment — tokenize the card (MIT_UNSCHEDULED) so admin
      // can re-charge it later for penalties, late fees, or future recharges
      // without the customer re-entering card details.
      const nexiResponse = await fetch('/.netlify/functions/create-nexi-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: nexiOrderId,
          amount: Math.round(selectedPackage.rechargeAmount * 100),
          currency: 'EUR',
          description: `Credit Wallet - ${selectedPackage.name}`,
          customerEmail: formData.email || user.email || '',
          customerName: formData.fullName || user.fullName || '',
          recurringType: 'MIT_UNSCHEDULED'
        })
      });

      const nexiData = await nexiResponse.json();
      if (!nexiResponse.ok) throw new Error(nexiData.error || 'Failed to create payment');

      console.log('Nexi payment created, redirecting...');

      // 5. Redirect to Nexi HPP
      window.location.href = nexiData.paymentUrl;

    } catch (error: any) {
      console.error('Payment error:', error);
      setPaymentError(error.message || w('err_payment_failed_it', 'err_payment_failed_en'));
      setIsProcessing(false);
    }
  };

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  // Le serie sono dedotte dai pacchetti: aggiungerne una in admin basta a far
  // comparire il filtro, senza toccare il codice.
  const series = ['all', ...packages.reduce<string[]>((acc, pkg) => (
    pkg.series && !acc.includes(pkg.series) ? [...acc, pkg.series] : acc
  ), [])];
  const filteredPackages = selectedSeries === 'all'
    ? packages
    : packages.filter(pkg => pkg.series === selectedSeries);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="pt-32 pb-24 bg-black min-h-screen">
        <div className="container mx-auto px-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h1 className="text-6xl md:text-7xl font-extrabold text-white mb-4">
              {w('hero_title_eyebrow_it', 'hero_title_eyebrow_en')}
            </h1>
            <p className="text-2xl text-white font-semibold mb-6">
              {w('hero_subtitle_it', 'hero_subtitle_en')}
            </p>
            <p className="text-gray-300 text-lg max-w-4xl mx-auto leading-relaxed whitespace-pre-line">
              {w('hero_intro_it', 'hero_intro_en')}
            </p>
          </motion.div>

          {/* Benefits Grid */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16"
          >
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6 text-center">
              <h3 className="text-xl font-bold text-white mb-2">{w('benefit_extra_title_it', 'benefit_extra_title_en')}</h3>
              <p className="text-gray-400">{w('benefit_extra_body_it', 'benefit_extra_body_en')}</p>
            </div>
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6 text-center">
              <h3 className="text-xl font-bold text-white mb-2">{w('benefit_no_expiry_title_it', 'benefit_no_expiry_title_en')}</h3>
              <p className="text-gray-400">{w('benefit_no_expiry_body_it', 'benefit_no_expiry_body_en')}</p>
            </div>
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6 text-center">
              <h3 className="text-xl font-bold text-white mb-2">{w('benefit_secure_title_it', 'benefit_secure_title_en')}</h3>
              <p className="text-gray-400">{w('benefit_secure_body_it', 'benefit_secure_body_en')}</p>
            </div>
          </motion.div>

          {/* Services Info */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="bg-gradient-to-r from-white/10 to-transparent border border-white/30 rounded-lg p-8 mb-16"
          >
            <h2 className="text-2xl font-bold text-white mb-4">
              {w('services_heading_it', 'services_heading_en')}
            </h2>
            <p className="text-gray-300 text-lg leading-relaxed">
              {w('services_body_it', 'services_body_en')}
              <br />
              <span className="text-white font-semibold">{w('services_no_expiry_it', 'services_no_expiry_en')}</span>
            </p>
          </motion.div>

          {/* Series Filter */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mb-12"
          >
            <h2 className="text-3xl font-bold text-white text-center mb-6">
              {w('packages_section_label_it', 'packages_section_label_en')}
            </h2>
            <div className="flex flex-wrap justify-center gap-3">
              {series.map((s) => (
                <button
                  key={s}
                  onClick={() => setSelectedSeries(s)}
                  className={`px-6 py-2 rounded-full font-semibold transition-all duration-300 ${selectedSeries === s
                    ? 'bg-white text-black'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                >
                  {s === 'all' ? w('packages_filter_all_it', 'packages_filter_all_en') : <span className="uppercase">{s}</span>}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Packages Grid */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16"
          >
            {copy && filteredPackages.map((pkg) => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                onSelect={() => handleSelectPackage(pkg.id)}
                copy={copy}
                lang={lang}
              />
            ))}
          </motion.div>

          {/* Promotional Footer */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="text-center mb-16"
          >
            <p className="text-2xl md:text-3xl font-extrabold text-white mb-3">
              {w('promo_line1_it', 'promo_line1_en')}
            </p>
            <p className="text-2xl md:text-3xl font-extrabold text-white">
              {w('promo_line2_it', 'promo_line2_en')}
            </p>
          </motion.div>

          {/* Advantages Section */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-8 mb-16"
          >
            <h2 className="text-3xl font-bold text-white mb-8 text-center">
              {w('advantages_heading_it', 'advantages_heading_en')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-bold text-white mb-2">{w('advantage_1_title_it', 'advantage_1_title_en')}</h3>
                <p className="text-gray-400">{w('advantage_1_body_it', 'advantage_1_body_en')}</p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2">{w('advantage_2_title_it', 'advantage_2_title_en')}</h3>
                <p className="text-gray-400">{w('advantage_2_body_it', 'advantage_2_body_en')}</p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2">{w('advantage_3_title_it', 'advantage_3_title_en')}</h3>
                <p className="text-gray-400">{w('advantage_3_body_it', 'advantage_3_body_en')}</p>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2">{w('advantage_4_title_it', 'advantage_4_title_en')}</h3>
                <p className="text-gray-400">{w('advantage_4_body_it', 'advantage_4_body_en')}</p>
              </div>
            </div>
          </motion.div>

          {/* Transparency Section */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="bg-gradient-to-br from-gray-900 to-black border border-gray-800 rounded-lg p-8 mb-12"
          >
            <h2 className="text-3xl font-bold text-white mb-6 text-center">
              {w('transparency_heading_it', 'transparency_heading_en')}
            </h2>
            <div className="space-y-4 text-gray-300 max-w-3xl mx-auto">
              <p>• {w('transparency_bullet_1_it', 'transparency_bullet_1_en')}</p>
              <p>• {w('transparency_bullet_2_it', 'transparency_bullet_2_en')}</p>
              <p>• {w('transparency_bullet_3_it', 'transparency_bullet_3_en')}</p>
            </div>
          </motion.div>

          {/* CTA Section */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="text-center"
          >
            <h2 className="text-4xl font-extrabold text-white mb-6">
              {w('cta_title_it', 'cta_title_en')}
            </h2>
            <p className="text-xl text-gray-300 mb-8">
              {w('cta_subtitle_it', 'cta_subtitle_en')}
            </p>
            <button
              onClick={() => {
                window.scrollTo({ top: 400, behavior: 'smooth' });
              }}
              className="bg-white text-black px-12 py-4 rounded-full text-xl font-bold hover:bg-gray-200 transition-all duration-300 transform hover:scale-105 shadow-lg shadow-white/50"
            >
              {w('cta_button_it', 'cta_button_en')}
            </button>
          </motion.div>
        </div>
      </div>

      {/* Payment Modal */}
      <AnimatePresence>
        {showPaymentModal && selectedPackage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-gray-900 border border-gray-800 rounded-lg max-w-2xl w-full my-8"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-gray-800">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2">
                      {w('modal_title_it', 'modal_title_en')}
                    </h2>
                    <p className="text-gray-400">
                      {selectedPackage.name} - {selectedPackage.series}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowPaymentModal(false)}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <form onSubmit={handlePayment} className="p-6 space-y-6">
                {/* Package Summary */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-400 text-xs">{w('modal_recharge_label_it', 'modal_recharge_label_en')}</span>
                    <span className="text-gray-300 font-semibold">{formatAmount(selectedPackage.rechargeAmount, lang)}</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-400">{w('modal_bonus_label_it', 'modal_bonus_label_en')} (+{selectedPackage.bonusPercentage}%)</span>
                    <span className="text-white font-bold text-xl">{formatAmount(selectedPackage.bonus, lang)}</span>
                  </div>
                  <div className="border-t border-gray-700 my-2"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-white font-semibold text-lg">{w('modal_receive_label_it', 'modal_receive_label_en')}</span>
                    <span className="text-white font-bold text-3xl">{formatAmount(selectedPackage.receivedAmount, lang)}</span>
                  </div>
                </div>

                {/* Payment Information */}
                <div>
                  <h3 className="text-lg font-bold text-white mb-4">{w('modal_payment_heading_it', 'modal_payment_heading_en')}</h3>
                  <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 text-center">
                    <p className="text-gray-300 mb-2">{w('modal_payment_info_it', 'modal_payment_info_en')}</p>
                    <p className="text-gray-400 text-sm">{w('modal_payment_secure_it', 'modal_payment_secure_en')}</p>
                    {paymentError && <p className="text-xs text-red-400 mt-2">{paymentError}</p>}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(false)}
                    className="flex-1 px-6 py-3 bg-gray-800 text-white rounded-full font-bold hover:bg-gray-700 transition-colors"
                  >
                    {w('modal_cancel_it', 'modal_cancel_en')}
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="flex-1 px-6 py-3 bg-white text-black rounded-full font-bold hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing
                      ? w('modal_processing_it', 'modal_processing_en')
                      : w('modal_pay_template_it', 'modal_pay_template_en').split('{amount}').join(formatAmount(selectedPackage.rechargeAmount, lang))}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default CreditWalletPage;

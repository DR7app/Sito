import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { useAuth } from '../hooks/useAuth';
import { MEMBERSHIP_TIERS as DEFAULT_MEMBERSHIP_TIERS } from '../constants';
import { getMembershipTiers } from '../utils/getMembershipTiers';
import type { MembershipTier } from '../types';
import { supabase } from '../supabaseClient';

const MembershipEnrollmentPage: React.FC = () => {
    const { tierId } = useParams<{ tierId: string }>();
    const [searchParams] = useSearchParams();

    const { t, lang } = useTranslation();
    const { user } = useAuth();

    const billingParam = searchParams.get('billing');
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'annually'>(
        billingParam === 'annually' ? 'annually' : 'monthly'
    );
    const [isProcessing, setIsProcessing] = useState(false);
    const [paymentError, setPaymentError] = useState<string | null>(null);

    const [tiers, setTiers] = useState<MembershipTier[]>(DEFAULT_MEMBERSHIP_TIERS);
    useEffect(() => {
        let cancelled = false;
        getMembershipTiers().then(t => { if (!cancelled && t.length > 0) setTiers(t); });
        return () => { cancelled = true; };
    }, []);

    const tier = useMemo(() => tiers.find(t => t.id === tierId), [tierId, tiers]);
    const price = useMemo(() => tier?.price[billingCycle].eur || 0, [tier, billingCycle]);

    const formatPrice = (p: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(p);

    const handleConfirm = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsProcessing(true);

        if (!tier || !user?.id) {
            setPaymentError(t({ it: "Sistema di pagamento non pronto.", en: "Payment system not ready." }));
            setIsProcessing(false);
            return;
        }

        try {
            let baseDate = new Date();
            if (user.membership?.renewalDate) {
                const currentExpiry = new Date(user.membership.renewalDate);
                if (currentExpiry > baseDate) {
                    baseDate = currentExpiry;
                }
            }
            const renewalDate = new Date(baseDate);
            if (billingCycle === 'monthly') {
                renewalDate.setMonth(renewalDate.getMonth() + 1);
            } else {
                renewalDate.setFullYear(renewalDate.getFullYear() + 1);
            }

            // 1. Save membership purchase as pending (with recurring flag)
            const { data: purchaseData, error: dbError } = await supabase
                .from('membership_purchases')
                .insert({
                    user_id: user.id,
                    tier_id: tier.id,
                    tier_name: tier.name[lang],
                    billing_cycle: billingCycle,
                    price: price,
                    currency: 'EUR',
                    payment_method: 'nexi',
                    payment_status: 'pending',
                    is_recurring: true,
                    subscription_status: 'active',
                    renewal_date: renewalDate.toISOString()
                })
                .select()
                .single();

            if (dbError) {
                console.error('Supabase error:', dbError);
                throw new Error(`Errore nel salvataggio: ${dbError.message}`);
            }

            // 2. Generate nexi_order_id (same format as car/carwash bookings)
            const nexiOrderId = `DR7${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

            await supabase
                .from('membership_purchases')
                .update({ nexi_order_id: nexiOrderId })
                .eq('id', purchaseData.id);

            const nexiResponse = await fetch('/.netlify/functions/create-nexi-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: nexiOrderId,
                    amount: Math.round(price * 100),
                    currency: 'EUR',
                    description: `DR7 Club - ${billingCycle === 'monthly' ? 'Mensile' : 'Annuale'}`,
                    customerEmail: user.email,
                    customerName: user.fullName,
                    recurringType: 'MIT_SCHEDULED',
                    billingCycle: billingCycle,
                })
            });

            const nexiData = await nexiResponse.json();
            if (!nexiResponse.ok) throw new Error(nexiData.error || 'Pagamento non riuscito');

            sessionStorage.setItem('dr7_pending_order', nexiOrderId);
            sessionStorage.setItem('dr7_pending_type', 'membership');

            window.location.href = nexiData.paymentUrl;
        } catch (error: any) {
            setPaymentError(error.message || 'Pagamento non riuscito');
            setIsProcessing(false);
        }
    };

    if (!tier) return <div className="pt-32 text-center text-white">{t({ it: "Piano non trovato.", en: "Plan not found." })}</div>;

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pt-32 pb-24 bg-black min-h-screen">
            <div className="container mx-auto px-6 max-w-lg">
                <h1 className="text-3xl font-bold text-white text-center mb-2">DR7 CLUB</h1>
                <p className="text-gray-400 text-center mb-8">
                    {lang === 'it' ? 'Conferma il tuo abbonamento' : 'Confirm your subscription'}
                </p>

                <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 md:p-8">
                    {/* Billing Toggle */}
                    <div className="flex justify-center mb-6">
                        <div className="inline-flex bg-gray-800 border border-gray-700 rounded-full p-1 w-full">
                            <button
                                type="button"
                                onClick={() => setBillingCycle('monthly')}
                                className={`flex-1 py-2 rounded-full text-sm font-semibold transition-all ${
                                    billingCycle === 'monthly' ? 'bg-white text-black' : 'text-gray-400'
                                }`}
                            >
                                {lang === 'it' ? 'Mensile' : 'Monthly'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setBillingCycle('annually')}
                                className={`flex-1 py-2 rounded-full text-sm font-semibold transition-all ${
                                    billingCycle === 'annually' ? 'bg-white text-black' : 'text-gray-400'
                                }`}
                            >
                                {lang === 'it' ? 'Annuale (-33%)' : 'Annual (-33%)'}
                            </button>
                        </div>
                    </div>

                    {/* Summary */}
                    <div className="space-y-3 text-sm mb-6">
                        <div className="flex justify-between">
                            <span className="text-gray-400">{lang === 'it' ? 'Piano' : 'Plan'}</span>
                            <span className="text-white font-semibold">DR7 Club</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-400">{lang === 'it' ? 'Fatturazione' : 'Billing'}</span>
                            <span className="text-white font-semibold">
                                {billingCycle === 'monthly' ? (lang === 'it' ? 'Mensile' : 'Monthly') : (lang === 'it' ? 'Annuale' : 'Annual')}
                            </span>
                        </div>
                        <div className="border-t border-gray-700 my-2" />
                        <div className="flex justify-between text-lg">
                            <span className="text-white font-bold">{lang === 'it' ? 'Totale' : 'Total'}</span>
                            <span className="text-white font-bold">{formatPrice(price)}</span>
                        </div>
                        {billingCycle === 'annually' && (
                            <p className="text-green-400 text-xs text-right">
                                {lang === 'it'
                                    ? `Risparmi €${((tier.price.monthly.eur * 12) - price).toFixed(2).replace('.', ',')} rispetto al mensile`
                                    : `Save €${((tier.price.monthly.eur * 12) - price).toFixed(2)} vs monthly`}
                            </p>
                        )}
                    </div>

                    {/* Payment */}
                    <form onSubmit={handleConfirm}>
                        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 text-center mb-4">
                            <p className="text-gray-300 text-sm">
                                {lang === 'it'
                                    ? 'Verrai reindirizzato alla pagina di pagamento sicura Nexi'
                                    : 'You will be redirected to Nexi secure payment page'}
                            </p>
                            <p className="text-gray-500 text-xs mt-1">
                                {lang === 'it' ? 'Pagamento protetto e certificato' : 'Protected and certified payment'}
                            </p>
                        </div>
                        <div className="bg-blue-900/30 border border-blue-800/50 rounded-lg p-4 mb-4">
                            <p className="text-blue-300 text-xs">
                                {lang === 'it'
                                    ? `Abbonamento con rinnovo automatico ${billingCycle === 'monthly' ? 'mensile' : 'annuale'}. Puoi cancellare in qualsiasi momento dalla tua area personale.`
                                    : `Auto-renewing ${billingCycle === 'monthly' ? 'monthly' : 'annual'} subscription. You can cancel anytime from your account page.`
                                }
                            </p>
                        </div>
                        {paymentError && <p className="text-xs text-red-400 mb-3">{paymentError}</p>}

                        <button
                            type="submit"
                            disabled={isProcessing}
                            className="w-full py-3.5 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-colors disabled:opacity-60"
                        >
                            {isProcessing
                                ? (lang === 'it' ? 'Elaborazione...' : 'Processing...')
                                : (lang === 'it' ? 'Conferma e paga' : 'Confirm and pay')}
                        </button>
                    </form>
                </div>
            </div>
        </motion.div>
    );
};

export default MembershipEnrollmentPage;

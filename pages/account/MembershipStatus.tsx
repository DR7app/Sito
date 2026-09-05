import React, { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import { MEMBERSHIP_TIERS as DEFAULT_MEMBERSHIP_TIERS } from '../../constants';
import { getMembershipTiers } from '../../utils/getMembershipTiers';
import type { MembershipTier } from '../../types';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';

const MembershipStatus = () => {
    const { user } = useAuth();
    const { t, lang } = useTranslation();
    const navigate = useNavigate();
    const [membershipPurchase, setMembershipPurchase] = useState<any>(null);
    const [tiers, setTiers] = useState<MembershipTier[]>(DEFAULT_MEMBERSHIP_TIERS);
    useEffect(() => {
        let cancelled = false;
        getMembershipTiers().then(t => { if (!cancelled && t.length > 0) setTiers(t); });
        return () => { cancelled = true; };
    }, []);

    const currentTier = user?.membership ? tiers.find(t => t.id === user.membership?.tierId) : null;

    // Fetch the actual membership purchase record
    useEffect(() => {
        const fetchMembership = async () => {
            if (!user?.id) return;
            const { data } = await supabase
                .from('membership_purchases')
                .select('*')
                .eq('user_id', user.id)
                .eq('payment_status', 'succeeded')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (data) setMembershipPurchase(data);
        };
        fetchMembership();
    }, [user?.id]);

    if (!user?.membership || !currentTier) {
        return (
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5 md:p-8 text-center">
                <h2 className="text-xl font-bold text-white">{t('No_Active_Membership')}</h2>
                <p className="text-sm text-gray-400 mt-2 max-w-sm mx-auto">{t('You_do_not_have_an_active_membership')}</p>
                <button onClick={() => navigate('/membership')} className="mt-6 px-5 py-2.5 bg-white text-black font-bold hover:bg-gray-200 transition-colors text-sm">
                    {t('Explore_Tiers')}
                </button>
            </div>
        );
    }

    const renewalDate = new Date(user.membership.renewalDate).toLocaleDateString(lang, { year: 'numeric', month: 'long', day: 'numeric' });

    return (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg">
            <div className="p-4 md:p-6 border-b border-gray-800">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                        <h2 className="text-xl font-bold text-white">{t('My_Membership')}</h2>
                        <p className="text-sm text-gray-400 mt-1">
                            {lang === 'it' ? 'Scade il' : 'Expires on'} {renewalDate}
                        </p>
                    </div>
                    <span className={`px-3 py-1 text-sm font-bold ${currentTier.isPopular ? 'bg-white text-black' : 'bg-gray-700 text-white'}`}>
                        {currentTier.name[lang]}
                    </span>
                </div>
            </div>
            <div className="p-4 md:p-6">
                 <h3 className="text-lg font-semibold text-white mb-4">{t('Your_Benefits')}</h3>
                 <ul className="space-y-3">
                     {currentTier.features[lang].map((feature, index) => (
                        <li key={index} className="flex items-start text-gray-300 text-sm">
                            {typeof feature === 'string' ? (
                                <>
                                    <svg className="w-4 h-4 text-white mr-2.5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                    <span>{feature}</span>
                                </>
                            ) : (
                                <>
                                    <feature.icon className="w-4 h-4 text-white mr-2.5 flex-shrink-0 mt-0.5" />
                                    <span>{feature.text}</span>
                                </>
                            )}
                        </li>
                     ))}
                 </ul>
            </div>
            <div className="p-4 md:p-6 bg-gray-900 flex items-center justify-end rounded-b-lg">
                <button
                    onClick={() => navigate(`/membership/enroll/${currentTier.id}?billing=${user.membership?.billingCycle}`)}
                    className="px-5 py-2.5 bg-white text-black font-bold text-sm hover:bg-gray-200 transition-colors"
                >
                    {lang === 'it' ? 'Rinnova Membership' : 'Renew Membership'}
                </button>
            </div>
        </div>
    );
};

export default MembershipStatus;

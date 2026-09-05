import React, { useEffect, useMemo, useState } from 'react';
import { MEMBERSHIP_TIERS as DEFAULT_MEMBERSHIP_TIERS } from '../constants';
import { useTranslation } from '../hooks/useTranslation';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
    getMembershipCopy,
    applyMembershipPlaceholders,
    type MembershipCopy,
    type MembershipPlaceholderValues,
    type CancellazioneSection,
    type CancellazioneBlock,
} from '../utils/siteCopy';
import { getMembershipTiers } from '../utils/getMembershipTiers';
import ClubTiersBoard from '../components/ui/ClubTiersBoard';
import type { MembershipTier } from '../types';

const MembershipPage: React.FC = () => {
    const { lang } = useTranslation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'annually'>('monthly');
    const [copy, setCopy] = useState<MembershipCopy | null>(null);
    const [tiers, setTiers] = useState<MembershipTier[]>(DEFAULT_MEMBERSHIP_TIERS);

    useEffect(() => {
        let cancelled = false;
        getMembershipCopy().then((c) => { if (!cancelled) setCopy(c); });
        getMembershipTiers().then((t) => { if (!cancelled && t.length > 0) setTiers(t); });
        return () => { cancelled = true; };
    }, []);

    const club = tiers[0];
    const monthlyPrice = club.price.monthly.eur;
    const annualPrice = club.price.annually.eur;
    const annualMonthly = +(annualPrice / 12).toFixed(2);
    const annualSavings = +((monthlyPrice * 12) - annualPrice).toFixed(2);

    const fmt = (n: number, decimals = 2) =>
        lang === 'it'
            ? n.toFixed(decimals).replace('.', ',')
            : n.toFixed(decimals);

    const placeholders: MembershipPlaceholderValues = useMemo(() => ({
        monthlyPrice: fmt(monthlyPrice),
        annualPrice: lang === 'it' ? annualPrice.toString() : annualPrice.toString(),
        annualMonthly: fmt(annualMonthly),
        annualSavings: fmt(annualSavings),
    }), [lang, monthlyPrice, annualPrice, annualMonthly, annualSavings]);

    const handleSubscribe = () => {
        if (user) {
            navigate(`/membership/enroll/${club.id}?billing=${billingCycle}`);
        } else {
            navigate('/signin', { state: { from: { pathname: `/membership/enroll/${club.id}`, search: `?billing=${billingCycle}` } } });
        }
    };

    if (!copy) {
        return (
            <div className="bg-black min-h-screen flex items-center justify-center">
                <p className="text-gray-500 text-sm">{lang === 'it' ? 'Caricamento…' : 'Loading…'}</p>
            </div>
        );
    }

    const tx = (it: string, en: string) => applyMembershipPlaceholders(lang === 'it' ? it : en, placeholders);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
        >
            {/* Hero */}
            <div className="pt-32 pb-20 bg-black relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />
                <div className="container mx-auto px-6 relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="text-center max-w-3xl mx-auto"
                    >
                        <p className="text-sm tracking-[0.3em] text-gray-400 uppercase mb-4">
                            {tx(copy.hero_eyebrow_it, copy.hero_eyebrow_en)}
                        </p>
                        <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 tracking-tight">
                            {copy.hero_title}
                        </h1>
                        <p className="text-xl md:text-2xl text-gray-300 font-light mb-3">
                            {tx(copy.hero_subtitle_it, copy.hero_subtitle_en)}
                        </p>
                        <p className="text-gray-500 text-lg">
                            {tx(copy.hero_opener_it, copy.hero_opener_en)}
                        </p>
                    </motion.div>
                </div>
            </div>

            {/* Pricing Section */}
            <div className="bg-black pb-20">
                <div className="container mx-auto px-6 max-w-4xl">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                    >
                        {/* Billing Toggle */}
                        <div className="flex justify-center mb-10">
                            <div className="inline-flex bg-gray-900 border border-gray-800 p-1">
                                <button
                                    onClick={() => setBillingCycle('monthly')}
                                    className={`px-6 py-2.5 text-sm font-semibold transition-all duration-200 ${
                                        billingCycle === 'monthly'
                                            ? 'bg-white text-black'
                                            : 'text-gray-400 hover:text-white'
                                    }`}
                                >
                                    {tx(copy.pricing_billing_monthly_it, copy.pricing_billing_monthly_en)}
                                </button>
                                <button
                                    onClick={() => setBillingCycle('annually')}
                                    className={`px-6 py-2.5 text-sm font-semibold transition-all duration-200 relative ${
                                        billingCycle === 'annually'
                                            ? 'bg-white text-black'
                                            : 'text-gray-400 hover:text-white'
                                    }`}
                                >
                                    {tx(copy.pricing_billing_annual_it, copy.pricing_billing_annual_en)}
                                    <span className="absolute -top-2 -right-2 bg-green-500 text-black text-[10px] font-bold px-1.5 py-0.5">
                                        {copy.pricing_billing_save_badge}
                                    </span>
                                </button>
                            </div>
                        </div>

                        {/* Price Card */}
                        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-8 md:p-12 max-w-2xl mx-auto">
                            <div className="text-center mb-8">
                                <h2 className="text-2xl font-bold text-white mb-6">{copy.pricing_card_title}</h2>
                                <div className="flex items-baseline justify-center gap-1">
                                    <span className="text-6xl md:text-7xl font-extrabold text-white">
                                        €{billingCycle === 'monthly' ? fmt(monthlyPrice) : annualPrice}
                                    </span>
                                    <span className="text-gray-400 text-lg">
                                        /{billingCycle === 'monthly'
                                            ? tx(copy.pricing_cycle_month_it, copy.pricing_cycle_month_en)
                                            : tx(copy.pricing_cycle_year_it, copy.pricing_cycle_year_en)}
                                    </span>
                                </div>
                                {billingCycle === 'annually' && (
                                    <p className="text-green-400 text-sm mt-2">
                                        {tx(copy.pricing_savings_it, copy.pricing_savings_en)}
                                    </p>
                                )}
                            </div>

                            {/* Features (still tied to MEMBERSHIP_TIERS — these mirror actual purchasable benefits) */}
                            <ul className="space-y-4 mb-10">
                                {club.features[lang].map((feature, i) => (
                                    <li key={i} className="flex items-start gap-3">
                                        <svg className="w-5 h-5 text-white mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                        <span className="text-gray-300">{typeof feature === 'string' ? feature : feature.text}</span>
                                    </li>
                                ))}
                            </ul>

                            <button
                                onClick={handleSubscribe}
                                className="w-full py-4 bg-white text-black font-bold text-lg hover:bg-gray-200 transition-all duration-200 transform hover:scale-[1.02]"
                            >
                                {tx(copy.pricing_cta_it, copy.pricing_cta_en)}
                            </button>
                            <p className="text-center text-gray-500 text-xs mt-3">
                                {tx(copy.pricing_cta_footnote_it, copy.pricing_cta_footnote_en)}
                            </p>
                        </div>
                    </motion.div>

                    {/* DR7 Elite Rewards Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.4 }}
                        className="mt-16 max-w-4xl mx-auto"
                    >
                        <div className="bg-gradient-to-r from-gray-900/80 to-black border border-gray-800 rounded-lg p-10">
                            <h2 className="text-3xl font-bold text-white text-center mb-2">{copy.elite_title}</h2>
                            <p className="text-gray-400 text-center mb-8">
                                {tx(copy.elite_subtitle_it, copy.elite_subtitle_en)}
                            </p>
                            <p className="text-gray-300 text-center max-w-2xl mx-auto mb-10">
                                {tx(copy.elite_intro_it, copy.elite_intro_en)}
                            </p>

                            {copy.elite_sections.map((sec) => (
                                <EliteSection key={sec.id} section={sec} lang={lang} placeholders={placeholders} />
                            ))}

                            <div className="border-t border-gray-700 pt-8 text-center">
                                <h3 className="text-xl font-bold text-white mb-3">{tx(copy.elite_cta_title_it, copy.elite_cta_title_en)}</h3>
                                <p className="text-gray-300 mb-6">{tx(copy.elite_cta_text_it, copy.elite_cta_text_en)}</p>
                                <button
                                    onClick={() => user ? navigate('/account') : navigate('/signin')}
                                    className="bg-white text-black px-8 py-3 font-bold hover:bg-gray-200 transition-all duration-300 transform hover:scale-105"
                                >
                                    {user
                                        ? tx(copy.elite_cta_logged_in_it, copy.elite_cta_logged_in_en)
                                        : tx(copy.elite_cta_logged_out_it, copy.elite_cta_logged_out_en)}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Scala dei livelli cashback — la lista arriva da Centralina Pro >
                DR7 Club, la stessa che il gestionale usa per calcolare il premio.
                Se l'operatore aggiunge o toglie un livello, questa sezione cambia
                da sola. */}
            <ClubTiersBoard
                lang={lang}
                eyebrow={tx(copy.tiers_eyebrow_it || 'Programma Cashback', copy.tiers_eyebrow_en || 'Cashback Programme')}
                title={tx(copy.tiers_title_it || 'Tutti i livelli', copy.tiers_title_en || 'Every tier')}
                note={tx(copy.tiers_note_it || 'Un solo percorso.', copy.tiers_note_en || 'One single path.')}
            />

            {/* DR7 Club Privilege — maturazione giornaliera sul Wallet.
                Il motore vero sta nel gestionale (accrue-club-wallet-interest,
                0,1% al giorno sul capitale, accredito mensile): qui c'e' solo
                il racconto, editabile da admin > Sito > Membership. */}
            <div className="bg-black border-t border-gray-900">
                <div className="container mx-auto px-6 max-w-4xl py-20">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                    >
                        <p className="t-eyebrow text-center">
                            {tx(copy.privilege_eyebrow_it, copy.privilege_eyebrow_en)}
                        </p>
                        <h2 className="mt-5 text-center font-serif text-3xl md:text-4xl font-normal leading-tight tracking-[-0.015em] text-white">
                            {tx(copy.privilege_title_it, copy.privilege_title_en)}
                        </h2>
                        <p className="mt-8 mx-auto max-w-2xl text-center text-gray-300 leading-relaxed">
                            {tx(copy.privilege_intro_it, copy.privilege_intro_en)}
                        </p>

                        <div className="mt-8 flex flex-col items-center gap-1.5 text-center text-sm text-gray-400">
                            <span>{tx(copy.privilege_claim_1_it, copy.privilege_claim_1_en)}</span>
                            <span>{tx(copy.privilege_claim_2_it, copy.privilege_claim_2_en)}</span>
                        </div>

                        <p className="mt-8 mx-auto max-w-2xl text-center text-gray-400 text-sm leading-relaxed">
                            {tx(copy.privilege_calc_it, copy.privilege_calc_en)}
                        </p>

                        {/* L'esempio: una tabella, non un grafico — sono quattro
                            numeri esatti, un grafico li renderebbe solo vaghi. */}
                        <div className="mt-12 mx-auto max-w-xl border border-gray-800">
                            <p className="border-b border-gray-800 px-6 py-4 text-sm text-white">
                                {tx(copy.privilege_example_label_it, copy.privilege_example_label_en)}
                            </p>
                            {(copy.privilege_rows || []).map((row, i) => (
                                <div
                                    key={i}
                                    className="flex items-baseline justify-between gap-5 border-b border-gray-900 px-6 py-3.5 last:border-b-0"
                                >
                                    <span className="text-sm text-gray-400">
                                        {tx(row.label_it, row.label_en)}
                                    </span>
                                    <span className="text-right text-sm text-white">{row.value}</span>
                                </div>
                            ))}
                        </div>

                        <p className="mt-12 mx-auto max-w-2xl text-center text-gray-300 leading-relaxed">
                            {tx(copy.privilege_principle_it, copy.privilege_principle_en)}
                        </p>
                        <p className="mt-5 mx-auto max-w-2xl text-center text-gray-500 text-sm leading-relaxed">
                            {tx(copy.privilege_usage_it, copy.privilege_usage_en)}
                        </p>
                        <p className="mt-10 text-center font-serif text-xl tracking-[-0.01em] text-white">
                            {tx(copy.privilege_closing_it, copy.privilege_closing_en)}
                        </p>
                    </motion.div>
                </div>
            </div>

            {/* Reward System Section */}
            <div className="bg-black pb-24 border-t border-gray-900">
                <div className="container mx-auto px-6 max-w-4xl pt-20">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                        className="text-center mb-12"
                    >
                        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                            {tx(copy.reward_title_it, copy.reward_title_en)}
                        </h2>
                        <p className="text-gray-400 max-w-xl mx-auto">
                            {tx(copy.reward_intro_it, copy.reward_intro_en)}
                        </p>
                    </motion.div>

                    <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
                        {copy.reward_items.map((rule, i) => {
                            const note = lang === 'it' ? rule.note_it : rule.note_en;
                            return (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.4, delay: i * 0.1 }}
                                    className="bg-gray-900/50 border border-gray-800 rounded-xl p-5"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-white font-semibold text-sm">
                                            {tx(rule.label_it, rule.label_en)}
                                        </span>
                                        <span className="bg-white text-black text-sm font-bold px-2.5 py-0.5">
                                            {rule.reward}
                                        </span>
                                    </div>
                                    {note && <p className="text-gray-500 text-xs">{tx(note, note)}</p>}
                                </motion.div>
                            );
                        })}
                    </div>

                    <motion.div
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: 0.4 }}
                        className="mt-10 text-center"
                    >
                        <div className="inline-flex items-center gap-2 bg-gray-900/50 border border-gray-800 px-5 py-2.5">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-gray-400 text-sm">
                                {tx(copy.reward_footnote_it, copy.reward_footnote_en)}
                            </span>
                        </div>
                    </motion.div>
                </div>
            </div>
        </motion.div>
    );
};

// ─── Elite-section renderer (mirrors Cancellazione block schema) ────────────
function EliteSection({
    section,
    lang,
    placeholders,
}: {
    section: CancellazioneSection;
    lang: 'it' | 'en';
    placeholders: MembershipPlaceholderValues;
}) {
    const tx = (it: string, en: string) => applyMembershipPlaceholders(lang === 'it' ? it : en, placeholders);
    return (
        <div className="border-t border-gray-700 pt-8 mb-8">
            <h3 className="text-xl font-bold text-white mb-4">{tx(section.title_it, section.title_en)}</h3>
            {section.blocks.map((block, i) => (
                <EliteBlock key={i} block={block} lang={lang} placeholders={placeholders} />
            ))}
        </div>
    );
}

function EliteBlock({
    block,
    lang,
    placeholders,
}: {
    block: CancellazioneBlock;
    lang: 'it' | 'en';
    placeholders: MembershipPlaceholderValues;
}) {
    const tx = (it: string, en: string) => applyMembershipPlaceholders(lang === 'it' ? it : en, placeholders);
    switch (block.type) {
        case 'p':
            return <p className="text-gray-300 mb-3">{tx(block.text_it, block.text_en)}</p>;
        case 'p-bold':
            return <p className="text-white font-semibold mb-2">{tx(block.text_it, block.text_en)}</p>;
        case 'p-italic':
            return <p className="text-gray-400 text-sm italic">{tx(block.text_it, block.text_en)}</p>;
        case 'ul': {
            const items = lang === 'it' ? block.items_it : block.items_en;
            return (
                <ul className="space-y-2 text-gray-300 ml-4 mb-4">
                    {items.map((item, i) => (
                        <li key={i} className="flex items-start">
                            <span className="text-white mr-2">•</span>
                            <span>{tx(item, item)}</span>
                        </li>
                    ))}
                </ul>
            );
        }
        default:
            return null;
    }
}

export default MembershipPage;

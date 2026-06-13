import React, { useState, useEffect } from 'react';
import LegalPageLayout from '../components/layout/LegalPageLayout';
import { useTranslation } from '../hooks/useTranslation';
import { fetchGoogleReviews } from '../services/googleReviews';
import { getFranchisingCopy, type FranchisingCopy, type FranchisingExpansionIcon, type FranchisingBenefitIcon } from '../utils/siteCopy';

const ExpansionIcon: React.FC<{ icon: FranchisingExpansionIcon }> = ({ icon }) => {
    if (icon === 'square') return <div className="w-8 h-8 bg-white rounded-sm" />;
    if (icon === 'diamond') return <div className="w-8 h-8 border-2 border-white transform rotate-45" />;
    return (
        <div className="space-y-1">
            <div className="w-8 h-1 bg-white" />
            <div className="w-8 h-1 bg-white" />
            <div className="w-8 h-1 bg-white" />
        </div>
    );
};

const BenefitIcon: React.FC<{ icon: FranchisingBenefitIcon }> = ({ icon }) => {
    if (icon === 'shield') {
        return (
            <svg className="w-5 h-5 md:w-6 md:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
        );
    }
    if (icon === 'star') {
        return (
            <svg className="w-5 h-5 md:w-6 md:h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <polygon points="12,2 15,9 22,9.3 17,14 18.5,21 12,17.5 5.5,21 7,14 2,9.3 9,9" />
            </svg>
        );
    }
    return (
        <svg className="w-5 h-5 md:w-6 md:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    );
};

const FranchisingPage: React.FC = () => {
    const { t } = useTranslation();
    const [reviewCount, setReviewCount] = useState(246);
    const [copy, setCopy] = useState<FranchisingCopy | null>(null);

    useEffect(() => {
        let cancelled = false;
        getFranchisingCopy().then((c) => { if (!cancelled) setCopy(c); });
        const loadReviewCount = async () => {
            try {
                const data = await fetchGoogleReviews();
                if (!cancelled) setReviewCount(data.ratingSummary.reviewCount);
            } catch (error) {
                console.error('Failed to load review count:', error);
            }
        };
        loadReviewCount();
        return () => { cancelled = true; };
    }, []);

    if (!copy) {
        return (
            <LegalPageLayout title={t('Franchising')}>
                <p className="text-gray-400 text-sm">Caricamento…</p>
            </LegalPageLayout>
        );
    }

    const resolveReviewCount = (s: string) => s.split('{reviewCount}').join(reviewCount > 250 ? String(reviewCount) : '250');

    return (
        <LegalPageLayout title={t('Franchising')}>
            <div className="space-y-8">
                {/* Hero banner — Global Franchising */}
                <div className="relative -mt-2 rounded-2xl overflow-hidden border border-gray-800">
                    <img src="/franchising-hero.jpeg" alt="" className="w-full h-40 md:h-56 object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                </div>
                {/* Hero Statement */}
                <div className="text-center py-6 md:py-8 border-b border-gray-800">
                    <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-4 px-4">
                        {copy.hero_h2}
                    </h2>
                    <p className="text-lg md:text-xl text-gray-300 px-4 mb-2">
                        {copy.hero_p1}
                    </p>
                    <p className="text-base md:text-lg text-gray-400 px-4 whitespace-pre-line">
                        {copy.hero_p2}
                    </p>
                </div>

                {/* Stats */}
                <div className="text-center mb-4">
                    <h3 className="text-xl md:text-2xl font-bold text-white mb-2">{copy.stats_heading}</h3>
                </div>
                <div className="space-y-3 text-gray-300 px-4">
                    {copy.stats_lines.map((line, i) => (
                        <p key={i}>{resolveReviewCount(line)}</p>
                    ))}
                </div>

                <div className="text-center py-4">
                    <p className="text-base md:text-lg text-gray-300">{copy.stats_footer_main}</p>
                    <p className="text-sm text-gray-400 mt-2">{copy.stats_footer_sub}</p>
                </div>

                {/* Expansion Plan */}
                <div className="bg-gradient-to-br from-gray-900/50 to-black/50 border border-gray-800 rounded-2xl p-6 md:p-8">
                    <h3 className="text-xl md:text-2xl font-bold text-white mb-6 text-center">{copy.expansion_heading}</h3>
                    {/* Whitelist for Tailwind JIT: md:grid-cols-1 md:grid-cols-2 md:grid-cols-3 md:grid-cols-4 */}
                    <div className={`grid grid-cols-1 ${
                        copy.expansion_locations.length >= 4 ? 'md:grid-cols-4'
                        : copy.expansion_locations.length === 3 ? 'md:grid-cols-3'
                        : copy.expansion_locations.length === 2 ? 'md:grid-cols-2'
                        : 'md:grid-cols-1'
                    } gap-6`}>
                        {copy.expansion_locations.map((loc) => (
                            <div key={loc.id} className="text-center">
                                <div className="w-16 h-16 bg-gradient-to-br from-white/20 to-white/10 border border-white/30 rounded-lg flex items-center justify-center mx-auto mb-4">
                                    <ExpansionIcon icon={loc.icon} />
                                </div>
                                <h4 className="text-lg font-semibold text-white mb-2">{loc.name}</h4>
                                <p className="text-gray-400 text-sm">{loc.description}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* About DR7 */}
                <div className="bg-gradient-to-br from-gray-900/50 to-black/50 border border-gray-800 rounded-2xl p-6 md:p-8">
                    <h3 className="text-xl md:text-2xl font-bold text-white mb-6">{copy.about_heading}</h3>
                    <div className="space-y-4 text-gray-300">
                        {copy.about_paragraphs.map((p, i) => (
                            <p key={i}>{p}</p>
                        ))}
                    </div>
                </div>

                {/* Benefits */}
                <div className="grid grid-cols-1 gap-4 md:gap-6">
                    {copy.benefits.map((benefit) => (
                        <div key={benefit.id} className="bg-gradient-to-br from-gray-900/50 to-black/50 border border-gray-800 rounded-2xl p-4 md:p-6">
                            <div className="flex items-start space-x-3 md:space-x-4">
                                <div className="flex-shrink-0 w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-white/20 to-white/10 border border-white/30 rounded-lg flex items-center justify-center">
                                    <BenefitIcon icon={benefit.icon} />
                                </div>
                                <div>
                                    <h4 className="text-lg md:text-xl font-bold text-white mb-2">{benefit.title}</h4>
                                    <p className="text-sm md:text-base text-gray-400">{benefit.description}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Call to Action */}
                <div className="bg-gradient-to-br from-white/10 to-white/5 border-2 border-white/30 rounded-2xl p-6 md:p-8 text-center">
                    <h3 className="text-xl md:text-2xl font-bold text-white mb-4">
                        {copy.cta_heading}
                    </h3>
                    <p className="text-sm md:text-base text-gray-300 mb-6">
                        {copy.cta_intro}
                    </p>
                    <div className="inline-block bg-white/10 border border-white/30 rounded-xl p-4 md:p-6 mb-6">
                        <p className="text-sm md:text-base text-white font-semibold mb-2">
                            {copy.cta_box_main}
                        </p>
                        <p className="text-gray-400 text-xs md:text-sm">
                            {copy.cta_box_sub}
                        </p>
                    </div>
                </div>

                {/* Contact Section */}
                <div className="bg-gradient-to-br from-gray-900/80 to-black/80 border-2 border-gray-800 rounded-2xl p-6 md:p-8 text-center">
                    <h3 className="text-xl md:text-2xl font-bold text-white mb-4">{copy.contact_heading}</h3>
                    <p className="text-sm md:text-base text-gray-300 mb-6">
                        {copy.contact_intro}
                    </p>
                    <div className="flex justify-center">
                        <a
                            href={`mailto:${copy.contact_email}`}
                            className="inline-block bg-white text-black px-6 md:px-8 py-4 rounded-full font-bold text-base md:text-lg hover:bg-gray-200 transition-all duration-300 transform hover:scale-105 break-all max-w-full"
                        >
                            {copy.contact_email}
                        </a>
                    </div>
                </div>

                {/* Footer Statement */}
                <div className="text-center py-8 border-t border-gray-800">
                    <p className="text-sm text-gray-300 mb-4 whitespace-pre-line">
                        {copy.footer_statement}
                    </p>
                </div>
            </div>
        </LegalPageLayout>
    );
};

export default FranchisingPage;

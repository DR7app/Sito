import React, { useState, useEffect } from 'react';
import CountUp from '../components/editorial/CountUp';
import { useInViewOnce } from '../hooks/useInViewOnce';
import LegalPageLayout from '../components/layout/LegalPageLayout';
import { useTranslation } from '../hooks/useTranslation';
import { fetchGoogleReviews } from '../services/googleReviews';
import { getFranchisingCopy, bilingual, bilingualList, type FranchisingCopy, type FranchisingExpansionIcon, type FranchisingBenefitIcon } from '../utils/siteCopy';
import { useFilmato } from '../hooks/useFilmato';

/**
 * Le icone della pagina Business.
 *
 * 10/09/2026 — erano quadrati bianchi pieni e simboli spessi dentro a scatole
 * col fondo sfumato: pesavano piu' del testo che accompagnavano. Ora sono di
 * filo sottile, color sabbia, senza scatola — le stesse della riga dei dati
 * sotto le recensioni.
 */
const TRATTO = 'h-8 w-8 text-[#C9BEA8]';

const ExpansionIcon: React.FC<{ icon: FranchisingExpansionIcon }> = ({ icon }) => {
    if (icon === 'square') return (
        <svg className={TRATTO} fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="4" width="16" height="16" />
            <path d="M9 9h6v6H9z" />
        </svg>
    );
    if (icon === 'diamond') return (
        <svg className={TRATTO} fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 4h12l3 5-9 11L3 9l3-5z" />
            <path d="M3 9h18M9 4l3 16 3-16" />
        </svg>
    );
    return (
        <svg className={TRATTO} fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
    );
};

const BenefitIcon: React.FC<{ icon: FranchisingBenefitIcon }> = ({ icon }) => {
    if (icon === 'shield') return (
        <svg className={TRATTO} fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3l7 3v6c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6l7-3z" />
            <path d="M9 12l2 2 4-4" />
        </svg>
    );
    if (icon === 'star') return (
        <svg className={TRATTO} fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3.5l2.6 5.6 6 .7-4.5 4.2 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9.8l6-.7L12 3.5z" />
        </svg>
    );
    return (
        <svg className={TRATTO} fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M8.5 12.2l2.4 2.4 4.6-4.8" />
        </svg>
    );
};

const FranchisingPage: React.FC = () => {
    const { t, lang } = useTranslation();
    const [reviewCount, setReviewCount] = useState(300);
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

    // Il filmato dietro alla pagina. Sta PRIMA dell'uscita anticipata qui
    // sotto: un hook chiamato solo quando i testi sono arrivati cambia il
    // numero di hook fra un render e l'altro, e React si ferma (errore 310,
    // pagina bianca). Costava la pagina Business intera.
    const filmato = useFilmato('business');

    // I numeri salgono da zero quando la sezione entra in campo. L'hook sta
    // qui sopra all'uscita anticipata per lo stesso motivo del filmato: il
    // numero di hook non puo' cambiare fra un render e l'altro.
    const [numeriRef, numeriInCampo] = useInViewOnce<HTMLDivElement>();

    if (!copy) {
        return (
            <LegalPageLayout title={t('Franchising')}>
                <p className="text-gray-400 text-sm">{t('Loading')}</p>
            </LegalPageLayout>
        );
    }

    const resolveReviewCount = (s: string) => s.split('{reviewCount}').join(reviewCount > 300 ? String(reviewCount) : '300');

    return (
        <LegalPageLayout title={t('Franchising')} filmato={filmato}>
            {/* 10/09/2026 — la pagina parlava un'altra lingua dal resto del
                sito: schede con angoli molto tondi, fondi sfumati, icone
                bianche dentro a riquadri grigi, e in cima una barra bianca
                spessa sotto al titolo. Ora segue la stessa impaginazione
                delle altre sezioni: filetti sottili invece di cornici,
                occhiello e titolo in serif, icone di filo color sabbia,
                bottoni con il contorno. I testi sono gli stessi, tutti dal
                gestionale. */}
            <div className="space-y-[var(--sp-xl)]">
                {/* La fotografia d'apertura, intera nel suo rapporto. */}
                <div className="overflow-hidden border border-white/10">
                    <img src="/franchising-hero.jpeg" alt="" loading="lazy" decoding="async" className="block h-auto w-full" />
                </div>

                {/* Dichiarazione d'apertura */}
                <section className="border-b border-white/[0.07] pb-[var(--sp-lg)] text-center">
                    <h2 className="font-serif text-3xl md:text-5xl font-normal leading-tight tracking-[-0.015em] text-white">
                        {bilingual(copy, 'hero_h2', lang)}
                    </h2>
                    <p className="mt-6 text-lg md:text-xl text-gray-300 max-w-3xl mx-auto">
                        {bilingual(copy, 'hero_p1', lang)}
                    </p>
                    <p className="mt-3 text-base text-gray-400 max-w-3xl mx-auto whitespace-pre-line">
                        {bilingual(copy, 'hero_p2', lang)}
                    </p>
                </section>

                {/* I numeri — 11/09/2026 l'unico blocco chiaro della pagina.
                    Sono i dati di bilancio: nero su bianco si leggono come
                    su carta e staccano dal racconto intorno. `surface-light`
                    e' la superficie chiara del sito, quella che ribalta
                    anche i filetti; i colori del testo vanno comunque
                    riscritti a mano perche' qui erano fissati uno per uno. */}
                <section className="a-tutta-larghezza surface-light py-[var(--sp-lg)]">
                  <div className="mx-auto max-w-5xl px-6 text-center">
                    <p className="whitespace-pre-line text-[11px] uppercase leading-[2] tracking-[0.28em] text-black/55">
                        {bilingual(copy, 'stats_heading', lang)}
                    </p>
                    <div ref={numeriRef} className="mt-8 space-y-3 text-black">
                        {bilingualList(copy, 'stats_lines', lang).map((line, i) => (
                            <CountUp key={i} text={resolveReviewCount(line)} run={numeriInCampo} lang={lang} />
                        ))}
                    </div>
                    <p className="mt-8 text-lg text-black">{bilingual(copy, 'stats_footer_main', lang)}</p>
                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-black/55">{bilingual(copy, 'stats_footer_sub', lang)}</p>
                  </div>
                </section>

                {/* Piano di espansione */}
                <section className="border-t border-white/[0.07] pt-[var(--sp-lg)]">
                    <h3 className="text-center font-serif text-2xl md:text-3xl font-normal tracking-[-0.015em] text-white">
                        {bilingual(copy, 'expansion_heading', lang)}
                    </h3>
                    {/* Whitelist per Tailwind JIT: md:grid-cols-1 md:grid-cols-2 md:grid-cols-3 md:grid-cols-4 */}
                    <div className={`mt-10 grid grid-cols-2 gap-8 ${
                        copy.expansion_locations.length >= 4 ? 'md:grid-cols-4'
                        : copy.expansion_locations.length === 3 ? 'md:grid-cols-3'
                        : copy.expansion_locations.length === 2 ? 'md:grid-cols-2'
                        : 'md:grid-cols-1'
                    }`}>
                        {copy.expansion_locations.map((loc) => (
                            <div key={loc.id} className="flex flex-col items-center text-center">
                                <ExpansionIcon icon={loc.icon} />
                                <h4 className="mt-5 text-[13px] uppercase tracking-[0.2em] text-white">{bilingual(loc, 'name', lang)}</h4>
                                <p className="mt-2 text-[13px] text-gray-500">{bilingual(loc, 'description', lang)}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Chi siamo */}
                <section className="border-t border-white/[0.07] pt-[var(--sp-lg)]">
                    <h3 className="font-serif text-2xl md:text-3xl font-normal tracking-[-0.015em] text-white">
                        {bilingual(copy, 'about_heading', lang)}
                    </h3>
                    <div className="mt-6 space-y-4 text-gray-400 leading-relaxed">
                        {bilingualList(copy, 'about_paragraphs', lang).map((p, i) => (
                            <p key={i}>{p}</p>
                        ))}
                    </div>
                </section>

                {/* Cosa si riceve */}
                <section className="border-t border-white/[0.07] pt-[var(--sp-lg)] grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-10">
                    {copy.benefits.map((benefit) => (
                        <div key={benefit.id} className="flex items-start gap-5">
                            <div className="shrink-0"><BenefitIcon icon={benefit.icon} /></div>
                            <div>
                                <h4 className="text-lg text-white">{bilingual(benefit, 'title', lang)}</h4>
                                <p className="mt-2 text-[15px] text-gray-400 leading-relaxed">{bilingual(benefit, 'description', lang)}</p>
                            </div>
                        </div>
                    ))}
                </section>

                {/* Invito */}
                <section className="border-t border-white/[0.07] pt-[var(--sp-lg)] text-center">
                    <h3 className="font-serif text-2xl md:text-3xl font-normal tracking-[-0.015em] text-white">
                        {bilingual(copy, 'cta_heading', lang)}
                    </h3>
                    <p className="mt-5 text-gray-400 max-w-2xl mx-auto">
                        {bilingual(copy, 'cta_intro', lang)}
                    </p>
                    <div className="mt-8 inline-block border border-white/15 px-8 py-6">
                        <p className="text-white">{bilingual(copy, 'cta_box_main', lang)}</p>
                        <p className="mt-2 text-[13px] text-gray-500">{bilingual(copy, 'cta_box_sub', lang)}</p>
                    </div>
                </section>

                {/* Contatto */}
                <section className="border-t border-white/[0.07] pt-[var(--sp-lg)] text-center">
                    <h3 className="font-serif text-2xl md:text-3xl font-normal tracking-[-0.015em] text-white">
                        {bilingual(copy, 'contact_heading', lang)}
                    </h3>
                    <p className="mt-5 text-gray-400 max-w-2xl mx-auto">
                        {bilingual(copy, 'contact_intro', lang)}
                    </p>
                    <div className="mt-8 flex justify-center">
                        <a
                            href={`mailto:${copy.contact_email}`}
                            className="inline-flex max-w-full items-center justify-center break-all border border-[#C9BEA8]/60 px-8 py-4 text-[12px] uppercase tracking-[0.24em] text-[#E8DFCC] transition-colors duration-300 hover:bg-[#C9BEA8] hover:text-black"
                        >
                            {copy.contact_email}
                        </a>
                    </div>
                </section>

                {/* Chiusura */}
                <section className="border-t border-white/[0.07] pt-[var(--sp-lg)] text-center">
                    <p className="text-sm text-gray-500 whitespace-pre-line">
                        {bilingual(copy, 'footer_statement', lang)}
                    </p>
                </section>
            </div>
        </LegalPageLayout>
    );
};

export default FranchisingPage;

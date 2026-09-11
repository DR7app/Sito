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
import ClubIcona from '../components/ui/ClubIcona';
import type { MembershipTier } from '../types';
import SfondoVideo from '../components/ui/SfondoVideo';
import { useFilmato } from '../hooks/useFilmato';

/**
 * DR7 Club.
 *
 * 11/09/2026 — la pagina parlava la lingua delle schede: angoli tondi, fondi
 * sfumati, riquadri grigi. Ora parla quella del resto del sito — nero pieno,
 * filetti sottili, titoli in Bodoni, l'oro del marchio solo dove serve
 * davvero (l'occhiello, i segni di spunta, il bottone che porta all'acquisto).
 *
 * Le sezioni sono le stesse di prima, nessun contenuto e' stato tolto: apertura,
 * fascia dei vantaggi, carta e piano, galleria dei servizi, scala dei livelli,
 * Privilege, Invita un amico, come funzionano i premi, chiusura. Ogni testo
 * continua ad arrivare da admin > Sito > Membership, prezzi compresi: il
 * numero grande e' quello di Centralina Pro, non un numero scritto qui.
 */

/** Il filetto corto che divide i blocchi dell'apertura. */
const Filetto: React.FC<{ className?: string }> = ({ className = '' }) => (
    <span className={`block h-px w-16 bg-dr7-gold/50 ${className}`} aria-hidden="true" />
);

/** Le colonne di parole ai lati del titolo: solo da desktop, sono un fregio. */
const ColonnaLaterale: React.FC<{ righe: string[]; allinea: 'left' | 'right' }> = ({ righe, allinea }) => (
    <ul
        className={`hidden lg:block space-y-2.5 text-[10px] uppercase tracking-[0.26em] text-white/45 ${
            allinea === 'right' ? 'text-right' : ''
        }`}
        aria-hidden="true"
    >
        {righe.map((r, i) => <li key={i}>{r}</li>)}
    </ul>
);

const MembershipPage: React.FC = () => {
    const { lang } = useTranslation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'annually'>('monthly');
    const [copy, setCopy] = useState<MembershipCopy | null>(null);
    const [tiers, setTiers] = useState<MembershipTier[]>(DEFAULT_MEMBERSHIP_TIERS);
    // I filmati della pagina, scelti da Sito > Aspetto & Funzionalita'.
    const filmatoClub = useFilmato('club');
    const filmatoPrivilege = useFilmato('privilege');

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
    /** Liste bilingui aggiunte col restyling: se mancano, la riga sparisce. */
    const lista = (it?: string[], en?: string[]) => (lang === 'it' ? it : en) || [];

    const benefits = copy.benefits || [];
    const galleria = copy.gallery_items || [];

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
        >
            {/* ═══ APERTURA ═══════════════════════════════════════════════
                Dietro al titolo c'e' il filmato del Club, scelto da Sito >
                Aspetto & Funzionalita'. Le sezioni sotto restano nere e lo
                coprono: il filmato si vede solo qui. */}
            <SfondoVideo
                src={filmatoClub.src}
                poster={filmatoClub.poster}
                ariaLabel={copy.hero_title}
                compatta
            >
                <div className="container mx-auto px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="grid items-center gap-8 lg:grid-cols-[1fr_minmax(0,44rem)_1fr]"
                    >
                        <ColonnaLaterale righe={lista(copy.hero_side_left_it, copy.hero_side_left_en)} allinea="left" />

                        <div className="text-center">
                            <p className="text-[11px] uppercase tracking-[0.3em] text-dr7-gold">
                                {tx(copy.hero_eyebrow_it, copy.hero_eyebrow_en)}
                            </p>
                            <h1 className="mt-6 font-serif text-5xl md:text-7xl font-normal leading-[1.02] tracking-[-0.02em] text-white">
                                {copy.hero_title}
                            </h1>
                            <p className="mt-5 text-xl md:text-2xl font-light text-gray-200">
                                {tx(copy.hero_subtitle_it, copy.hero_subtitle_en)}
                            </p>
                            <Filetto className="mx-auto my-8" />
                            <p className="mx-auto max-w-xl text-base leading-relaxed text-gray-400">
                                {tx(copy.hero_opener_it, copy.hero_opener_en)}
                            </p>
                            <button
                                onClick={handleSubscribe}
                                className="mt-10 inline-flex items-center gap-3 border border-dr7-gold px-10 py-4 text-[12px] uppercase tracking-[0.26em] text-dr7-gold transition-colors duration-standard hover:bg-dr7-gold hover:text-black"
                            >
                                {tx(copy.hero_cta_it || copy.pricing_cta_it, copy.hero_cta_en || copy.pricing_cta_en)}
                                <span aria-hidden="true">&#8594;</span>
                            </button>
                            {(copy.hero_footer_it || copy.hero_footer_en) && (
                                <p className="mt-10 text-[10px] uppercase tracking-[0.3em] text-white/35">
                                    {tx(copy.hero_footer_it || '', copy.hero_footer_en || '')}
                                </p>
                            )}
                        </div>

                        <ColonnaLaterale righe={lista(copy.hero_side_right_it, copy.hero_side_right_en)} allinea="right" />
                    </motion.div>
                </div>
            </SfondoVideo>

            {/* ═══ FASCIA DEI VANTAGGI ════════════════════════════════════
                Sei segni di filo, una riga di testo ciascuno. Compaiono solo
                se il gestionale ne pubblica. */}
            {benefits.length > 0 && (
                <section className="border-y border-white/10 bg-black">
                    <div className="mx-auto grid max-w-[90rem] grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                        {benefits.map((b, i) => (
                            <div
                                key={b.id}
                                className={`flex flex-col items-center gap-3 border-white/10 px-4 py-9 text-center ${
                                    i < benefits.length - 1 ? 'border-r' : ''
                                } ${i < benefits.length - 2 ? 'border-b sm:border-b-0' : ''}`}
                            >
                                <ClubIcona icon={b.icon} />
                                <span className="text-[10px] uppercase leading-relaxed tracking-[0.2em] text-gray-300">
                                    {tx(b.label_it, b.label_en)}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* ═══ LA CARTA E IL PIANO ════════════════════════════════════ */}
            <section className="relative isolate overflow-hidden border-b border-white/10 bg-black">
                <img
                    src="/marmo-nero.jpeg"
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover opacity-50"
                />
                <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-black via-black/75 to-black/92" />

                <div className="container mx-auto px-6 py-20 md:py-28">
                    <div className="grid items-center gap-12 lg:grid-cols-12">
                        {/* Il racconto */}
                        <div className="lg:col-span-4">
                            <p className="text-[11px] uppercase tracking-[0.3em] text-dr7-gold">
                                {tx(copy.card_eyebrow_it || '', copy.card_eyebrow_en || '')}
                            </p>
                            <h2 className="mt-6 whitespace-pre-line font-serif text-4xl md:text-5xl font-normal leading-[1.05] tracking-[-0.02em] text-white">
                                {tx(copy.card_title_it || '', copy.card_title_en || '')}
                            </h2>
                            <p className="mt-7 text-base leading-relaxed text-gray-300">
                                {tx(copy.card_body_it || '', copy.card_body_en || '')}
                            </p>
                            <Filetto className="my-8" />
                            <ul className="space-y-1.5 text-[10px] uppercase tracking-[0.26em] text-white/45">
                                {lista(copy.card_signature_it, copy.card_signature_en).map((r, i) => (
                                    <li key={i}>{r}</li>
                                ))}
                            </ul>
                        </div>

                        {/* La carta. Ritaglio quadrato allineato a sinistra: la
                            fotografia porta una scritta sulla destra che qui
                            non deve entrare. */}
                        {copy.card_image && (
                            <div className="lg:col-span-3">
                                <div className="aspect-square overflow-hidden border border-white/10">
                                    <img
                                        src={copy.card_image}
                                        alt=""
                                        loading="lazy"
                                        decoding="async"
                                        className="h-full w-full object-cover object-left"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Il piano */}
                        <div className="lg:col-span-5">
                            <div className="border border-white/12 bg-black/70 p-8 md:p-10">
                                <p className="text-[11px] uppercase tracking-[0.28em] text-dr7-gold">
                                    {copy.pricing_card_title}
                                </p>

                                {/* Mensile o annuale */}
                                <div className="mt-6 inline-flex border border-white/15">
                                    <button
                                        onClick={() => setBillingCycle('monthly')}
                                        className={`px-5 py-2 text-[11px] uppercase tracking-[0.2em] transition-colors duration-standard ${
                                            billingCycle === 'monthly' ? 'bg-dr7-gold text-black' : 'text-gray-400 hover:text-white'
                                        }`}
                                    >
                                        {tx(copy.pricing_billing_monthly_it, copy.pricing_billing_monthly_en)}
                                    </button>
                                    <button
                                        onClick={() => setBillingCycle('annually')}
                                        className={`relative px-5 py-2 text-[11px] uppercase tracking-[0.2em] transition-colors duration-standard ${
                                            billingCycle === 'annually' ? 'bg-dr7-gold text-black' : 'text-gray-400 hover:text-white'
                                        }`}
                                    >
                                        {tx(copy.pricing_billing_annual_it, copy.pricing_billing_annual_en)}
                                        <span className="absolute -top-2.5 -right-3 border border-dr7-gold bg-black px-1.5 py-0.5 text-[9px] tracking-normal text-dr7-gold">
                                            {copy.pricing_billing_save_badge}
                                        </span>
                                    </button>
                                </div>

                                <div className="mt-8 flex items-baseline gap-2">
                                    <span className="font-serif text-6xl md:text-7xl font-normal leading-none tracking-[-0.02em] text-white">
                                        €{billingCycle === 'monthly' ? fmt(monthlyPrice) : annualPrice}
                                    </span>
                                    <span className="text-base text-gray-400">
                                        /{billingCycle === 'monthly'
                                            ? tx(copy.pricing_cycle_month_it, copy.pricing_cycle_month_en)
                                            : tx(copy.pricing_cycle_year_it, copy.pricing_cycle_year_en)}
                                    </span>
                                </div>
                                {billingCycle === 'annually' && (
                                    <p className="mt-2 text-sm text-dr7-gold">
                                        {tx(copy.pricing_savings_it, copy.pricing_savings_en)}
                                    </p>
                                )}

                                {/* I vantaggi del piano: la lista vera, quella
                                    che il cliente compra, non un elenco scritto
                                    qui accanto. */}
                                <ul className="mt-9 space-y-3.5 border-t border-white/10 pt-8">
                                    {club.features[lang].map((feature, i) => (
                                        <li key={i} className="flex items-start gap-3">
                                            <svg className="mt-1 h-3.5 w-3.5 flex-shrink-0 text-dr7-gold" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 12.5l5 5L20 6.5" />
                                            </svg>
                                            <span className="text-sm leading-relaxed text-gray-300">
                                                {typeof feature === 'string' ? feature : feature.text}
                                            </span>
                                        </li>
                                    ))}
                                </ul>

                                {/* Rimando al Privilege, subito sopra il bottone:
                                    chi sta per iscriversi e' anche chi ha motivo
                                    di sapere che il Wallet matura da solo. */}
                                <a
                                    href="#privilege"
                                    className="mt-8 block text-[11px] uppercase tracking-[0.2em] text-gray-400 underline decoration-white/25 underline-offset-4 transition-colors hover:text-dr7-gold hover:decoration-dr7-gold"
                                >
                                    {tx(copy.privilege_link_it || 'Scopri DR7 Club Privilege', copy.privilege_link_en || 'Discover DR7 Club Privilege')}
                                </a>

                                <button
                                    onClick={handleSubscribe}
                                    className="mt-6 flex w-full items-center justify-center gap-3 bg-dr7-gold py-4 text-[12px] uppercase tracking-[0.26em] text-black transition-colors duration-standard hover:bg-[#d9b96a]"
                                >
                                    {tx(copy.pricing_cta_it, copy.pricing_cta_en)}
                                    <span aria-hidden="true">&#8594;</span>
                                </button>
                                <p className="mt-3 text-center text-xs text-gray-500">
                                    {tx(copy.pricing_cta_footnote_it, copy.pricing_cta_footnote_en)}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══ LA GALLERIA DEI SERVIZI ════════════════════════════════ */}
            {galleria.length > 0 && (
                <section className="border-b border-white/10 bg-black py-20 md:py-24">
                    <div className="container mx-auto px-6">
                        <h2 className="text-center font-serif text-3xl md:text-4xl font-normal tracking-[-0.015em] text-white">
                            {tx(copy.gallery_title_it || '', copy.gallery_title_en || '')}
                        </h2>
                        <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
                            {galleria.map((g) => (
                                <figure key={g.id} className="group relative overflow-hidden border border-white/10">
                                    <div className="aspect-[3/4]">
                                        <img
                                            src={g.image}
                                            alt=""
                                            loading="lazy"
                                            decoding="async"
                                            className="h-full w-full object-cover transition-transform duration-cinematic ease-editorial group-hover:scale-[1.04]"
                                        />
                                    </div>
                                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
                                    <figcaption className="absolute inset-x-0 bottom-0 p-4">
                                        <p className="text-[10px] uppercase tracking-[0.22em] text-white">
                                            {tx(g.title_it, g.title_en)}
                                        </p>
                                        <p className="mt-1 text-[11px] leading-snug text-gray-400">
                                            {tx(g.subtitle_it, g.subtitle_en)}
                                        </p>
                                    </figcaption>
                                </figure>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* ═══ LA SCALA DEI LIVELLI ═══════════════════════════════════
                La lista arriva da Centralina Pro > DR7 Club, la stessa che il
                gestionale usa per calcolare il premio. Se l'operatore aggiunge
                o toglie un livello, questa sezione cambia da sola. */}
            <ClubTiersBoard
                lang={lang}
                eyebrow={tx(copy.tiers_eyebrow_it || 'Programma Cashback', copy.tiers_eyebrow_en || 'Cashback Programme')}
                title={tx(copy.tiers_title_it || 'Tutti i livelli', copy.tiers_title_en || 'Every tier')}
                note={tx(copy.tiers_note_it || 'Un solo percorso.', copy.tiers_note_en || 'One single path.')}
            />

            {/* ═══ DR7 CLUB PRIVILEGE ═════════════════════════════════════
                Il motore vero sta nel gestionale (accrue-club-wallet-interest,
                0,1% al giorno sul capitale, accredito mensile): qui c'e' solo
                il racconto, editabile da admin > Sito > Membership. */}
            <div id="privilege" className="relative isolate scroll-mt-28 overflow-hidden border-t border-white/10 bg-black">
                {/* Il filmato del Privilege sta dentro a questo blocco, non
                    dietro alla pagina: sotto e sopra ci sono altre sezioni
                    nere. Velo scuro sopra, il testo qui e' lungo. */}
                <video
                    src={filmatoPrivilege.src}
                    poster={filmatoPrivilege.poster}
                    className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover"
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="auto"
                    aria-hidden="true"
                />
                <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-black/85 via-black/75 to-black/90" />
                <div className="container mx-auto max-w-4xl px-6 py-20 md:py-24">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                    >
                        <p className="text-center text-[11px] uppercase tracking-[0.3em] text-dr7-gold">
                            {tx(copy.privilege_eyebrow_it, copy.privilege_eyebrow_en)}
                        </p>
                        <h2 className="mt-5 text-center font-serif text-3xl md:text-4xl font-normal leading-tight tracking-[-0.015em] text-white">
                            {tx(copy.privilege_title_it, copy.privilege_title_en)}
                        </h2>
                        <Filetto className="mx-auto my-8" />
                        <p className="mx-auto max-w-2xl text-center leading-relaxed text-gray-300">
                            {tx(copy.privilege_intro_it, copy.privilege_intro_en)}
                        </p>

                        <div className="mt-8 flex flex-col items-center gap-1.5 text-center text-sm text-gray-400">
                            <span>{tx(copy.privilege_claim_1_it, copy.privilege_claim_1_en)}</span>
                            <span>{tx(copy.privilege_claim_2_it, copy.privilege_claim_2_en)}</span>
                        </div>

                        <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-gray-400">
                            {tx(copy.privilege_calc_it, copy.privilege_calc_en)}
                        </p>

                        {/* L'esempio: una tabella, non un grafico — sono quattro
                            numeri esatti, un grafico li renderebbe solo vaghi. */}
                        <div className="mx-auto mt-12 max-w-xl border border-white/12">
                            <p className="border-b border-white/12 px-6 py-4 text-[11px] uppercase tracking-[0.2em] text-dr7-gold">
                                {tx(copy.privilege_example_label_it, copy.privilege_example_label_en)}
                            </p>
                            {(copy.privilege_rows || []).map((row, i) => (
                                <div
                                    key={i}
                                    className="flex items-baseline justify-between gap-5 border-b border-white/[0.07] px-6 py-3.5 last:border-b-0"
                                >
                                    <span className="text-sm text-gray-400">
                                        {tx(row.label_it, row.label_en)}
                                    </span>
                                    <span className="text-right text-sm text-white">{row.value}</span>
                                </div>
                            ))}
                        </div>

                        <p className="mx-auto mt-12 max-w-2xl text-center leading-relaxed text-gray-300">
                            {tx(copy.privilege_principle_it, copy.privilege_principle_en)}
                        </p>
                        <p className="mx-auto mt-5 max-w-2xl text-center text-sm leading-relaxed text-gray-500">
                            {tx(copy.privilege_usage_it, copy.privilege_usage_en)}
                        </p>
                        <p className="mt-10 text-center font-serif text-xl tracking-[-0.01em] text-white">
                            {tx(copy.privilege_closing_it, copy.privilege_closing_en)}
                        </p>
                    </motion.div>
                </div>
            </div>

            {/* ═══ INVITA UN AMICO ════════════════════════════════════════ */}
            <section className="border-t border-white/10 bg-black py-20 md:py-24">
                <div className="container mx-auto max-w-4xl px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                        className="border border-white/12 p-8 md:p-12"
                    >
                        <h2 className="text-center font-serif text-3xl md:text-4xl font-normal tracking-[-0.015em] text-white">
                            {copy.elite_title}
                        </h2>
                        <p className="mt-3 text-center text-[11px] uppercase tracking-[0.22em] text-dr7-gold">
                            {tx(copy.elite_subtitle_it, copy.elite_subtitle_en)}
                        </p>
                        <p className="mx-auto mt-8 max-w-2xl text-center leading-relaxed text-gray-300">
                            {tx(copy.elite_intro_it, copy.elite_intro_en)}
                        </p>

                        {copy.elite_sections.map((sec) => (
                            <EliteSection key={sec.id} section={sec} lang={lang} placeholders={placeholders} />
                        ))}

                        <div className="border-t border-white/10 pt-10 text-center">
                            <h3 className="font-serif text-2xl font-normal tracking-[-0.01em] text-white">
                                {tx(copy.elite_cta_title_it, copy.elite_cta_title_en)}
                            </h3>
                            <p className="mt-3 text-gray-300">{tx(copy.elite_cta_text_it, copy.elite_cta_text_en)}</p>
                            <button
                                onClick={() => user ? navigate('/account') : navigate('/signin')}
                                className="mt-8 inline-flex items-center gap-3 border border-dr7-gold px-9 py-3.5 text-[12px] uppercase tracking-[0.24em] text-dr7-gold transition-colors duration-standard hover:bg-dr7-gold hover:text-black"
                            >
                                {user
                                    ? tx(copy.elite_cta_logged_in_it, copy.elite_cta_logged_in_en)
                                    : tx(copy.elite_cta_logged_out_it, copy.elite_cta_logged_out_en)}
                            </button>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* ═══ COME FUNZIONANO I PREMI ════════════════════════════════
                06/09/2026 — via la griglia delle percentuali (anticipato 2%,
                acconto 1%, extra 2%, lavaggio 3%). Erano numeri fissi scritti
                a mano che contraddicevano i livelli veri qui sopra, quelli che
                il gestionale calcola davvero. Restano titolo, introduzione e
                la nota in fondo. */}
            <section className="border-t border-white/10 bg-black py-20 md:py-24">
                <div className="container mx-auto max-w-4xl px-6 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5 }}
                    >
                        <h2 className="font-serif text-3xl md:text-4xl font-normal tracking-[-0.015em] text-white">
                            {tx(copy.reward_title_it, copy.reward_title_en)}
                        </h2>
                        <p className="mx-auto mt-5 max-w-xl text-gray-400">
                            {tx(copy.reward_intro_it, copy.reward_intro_en)}
                        </p>
                        <div className="mt-10 inline-flex items-center gap-3 border border-white/12 px-6 py-3">
                            <svg className="h-4 w-4 text-dr7-gold" fill="none" stroke="currentColor" strokeWidth={1.4} viewBox="0 0 24 24" aria-hidden="true">
                                <circle cx="12" cy="12" r="9" />
                                <path strokeLinecap="round" d="M12 11v5M12 7.8v.4" />
                            </svg>
                            <span className="text-sm text-gray-400">
                                {tx(copy.reward_footnote_it, copy.reward_footnote_en)}
                            </span>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* ═══ LA FIRMA ═══════════════════════════════════════════════ */}
            <section className="relative isolate overflow-hidden border-t border-white/10 bg-black">
                <img
                    src="/marmo-nero.jpeg"
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover opacity-40"
                />
                <div className="pointer-events-none absolute inset-0 -z-10 bg-black/70" />
                <div className="container mx-auto px-6 py-16">
                    <div className="grid items-center gap-10 md:grid-cols-3">
                        <blockquote className="text-center md:text-left">
                            <p className="font-serif text-lg italic leading-relaxed text-gray-200">
                                “{tx(copy.closing_quote_it || '', copy.closing_quote_en || '')}”
                            </p>
                            {copy.closing_attrib && (
                                <footer className="mt-4 text-[10px] uppercase tracking-[0.26em] text-white/45">
                                    {copy.closing_attrib}
                                </footer>
                            )}
                        </blockquote>

                        <div className="text-center">
                            {/* `DR7logo1.png` e non `DR7logo.png`: il primo e'
                                il marchio oro su fondo trasparente, il secondo
                                porta dentro un quadrato nero pieno che sul
                                marmo si vedrebbe come una toppa. */}
                            <img src="/DR7logo1.png" alt="DR7" loading="lazy" className="mx-auto h-9 w-auto" />
                            {copy.closing_wordmark && (
                                <p className="mt-3 text-[11px] uppercase tracking-[0.34em] text-dr7-gold">
                                    {copy.closing_wordmark}
                                </p>
                            )}
                        </div>

                        <ul className="space-y-1.5 text-center text-[10px] uppercase tracking-[0.26em] text-white/45 md:text-right">
                            {lista(copy.closing_lines_it, copy.closing_lines_en).map((r, i) => (
                                <li key={i}>{r}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            </section>
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
        <div className="mt-10 border-t border-white/10 pt-8">
            <h3 className="font-serif text-xl font-normal tracking-[-0.01em] text-white">{tx(section.title_it, section.title_en)}</h3>
            <div className="mt-4">
                {section.blocks.map((block, i) => (
                    <EliteBlock key={i} block={block} lang={lang} placeholders={placeholders} />
                ))}
            </div>
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
            return <p className="mb-3 leading-relaxed text-gray-300">{tx(block.text_it, block.text_en)}</p>;
        case 'p-bold':
            return <p className="mb-2 font-medium text-white">{tx(block.text_it, block.text_en)}</p>;
        case 'p-italic':
            return <p className="text-sm italic text-gray-500">{tx(block.text_it, block.text_en)}</p>;
        case 'ul': {
            const items = lang === 'it' ? block.items_it : block.items_en;
            return (
                <ul className="mb-4 ml-1 space-y-2 text-gray-300">
                    {items.map((item, i) => (
                        <li key={i} className="flex items-start gap-3">
                            <span className="mt-2 h-px w-3 flex-shrink-0 bg-dr7-gold" aria-hidden="true" />
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

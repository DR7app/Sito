import React, { useState, useEffect, useRef } from 'react';
import { motion, Variants, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../supabaseClient';
import { useCarrello } from '../hooks/useCarrello';
import { caricaDatiFatturaCliente } from '../utils/datiFatturaCliente';
import { useTranslation } from '../hooks/useTranslation';
import {
  getCreditWalletCopy,
  getMembershipCopy,
  type CreditWalletCopy,
  type CreditPackage,
  type MembershipCopy,
} from '../utils/siteCopy';
import SfondoVideo from '../components/ui/SfondoVideo';
import { useFilmato } from '../hooks/useFilmato';

// I pacchetti arrivano dal CMS (admin > Sito > Credit Wallet, salvati in
// centralina_pro_config.site_copy.creditWallet.packages). getCreditWalletCopy
// ricade sul seed di siteCopy.ts finche' l'admin non ne salva di suoi.
//
// 11/09/2026 — impaginazione editoriale (fasce a tutta larghezza, oro solo
// sul pacchetto in evidenza). Il racconto del Privilege Bonus NON e' scritto
// qui: arriva da Sito > Membership, le stesse righe della pagina DR7 Club.
// Una sola volta scritto, due pagine allineate.

// Migliaia e decimali secondo la lingua della pagina: in italiano "10.000",
// in inglese "10,000". Senza locale esplicita toLocaleString usava quella del
// browser e un pacchetto da diecimila euro appariva "10,000" a un cliente
// italiano, che legge dieci.
//
// `useGrouping` esplicito: in italiano la regola di fabbrica non separa i
// numeri di quattro cifre, e sulla card "Premium 1.000" ricaricava "1000".
// Due scritture diverse dello stesso importo nella stessa card.
const formatAmount = (n: number, lang: 'it' | 'en'): string =>
  n.toLocaleString(lang === 'it' ? 'it-IT' : 'en-GB', { maximumFractionDigits: 2, useGrouping: true });

// Sfondi decorativi delle card: scenografia, non contenuto. Restano nel
// codice perche' non c'e' nulla da scrivere in gestionale — sono i quattro
// mondi DR7 (strada, dimora, mare, volo) che scorrono sotto ai numeri.
//
// Solo scatti PULITI: mezzo repertorio (supercar, urus, luxury, i listini)
// ha titoli e prezzi stampati dentro al fotogramma, e sotto ai numeri di un
// pacchetto uscivano due tariffe diverse nello stesso riquadro.
const SFONDI_CARD = ['/collezione.jpeg', '/villa.jpeg', '/yacht1.jpeg', '/privatejet.jpeg'];

// ─── Icone (tratto sottile, oro) ───────────────────────────────────────────
// Inline come nel resto del sito: sono nove disegni, una libreria intera
// peserebbe piu' di tutta la pagina.
const Ico: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <svg
    className={`w-7 h-7 ${className}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.25}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const IcoMonete = () => (
  <Ico>
    <ellipse cx="12" cy="6" rx="7" ry="3" />
    <path d="M5 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
    <path d="M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
  </Ico>
);
const IcoInfinito = () => (
  <Ico>
    <path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Z" />
    <path d="M12 12c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z" />
  </Ico>
);
const IcoScudo = () => (
  <Ico>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    <path d="m9 12 2 2 4-4" />
  </Ico>
);
const IcoCorona = () => (
  <Ico>
    <path d="m2 7 4.5 3.5L12 3l5.5 7.5L22 7l-2 11H4L2 7Z" />
    <path d="M5 21h14" />
  </Ico>
);
const IcoGrafico = () => (
  <Ico>
    <path d="M3 3v18h18" />
    <path d="M7 16v-4M12 16V9M17 16v-7" />
  </Ico>
);
const IcoClessidra = () => (
  <Ico>
    <path d="M5 2h14M5 22h14" />
    <path d="M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22" />
    <path d="M7 2v4.2c0 .5.2 1 .6 1.4L12 12l4.4-4.4c.4-.4.6-.9.6-1.4V2" />
  </Ico>
);
const IcoFulmine = () => (
  <Ico>
    <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
  </Ico>
);
const IcoDiamante = () => (
  <Ico>
    <path d="M6 3h12l4 6-10 12L2 9l4-6Z" />
    <path d="M11 3 8 9l4 12 4-12-3-6M2 9h20" />
  </Ico>
);
const IcoOrologio = () => (
  <Ico>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Ico>
);

const PackageCard: React.FC<{
  pkg: CreditPackage;
  indice: number;
  onSelect: () => void;
  copy: CreditWalletCopy;
  lang: 'it' | 'en';
}> = ({ pkg, indice, onSelect, copy, lang }) => {
  const c = (it: keyof CreditWalletCopy, en: keyof CreditWalletCopy): string =>
    (copy as Record<string, string>)[(lang === 'it' ? it : en) as string];
  const cardVariants: Variants = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };
  const oro = !!pkg.popular;

  return (
    <motion.div
      variants={cardVariants}
      className={`group relative isolate overflow-hidden border transition-colors duration-standard ${
        oro ? 'border-dr7-gold bg-dr7-gold/5' : 'border-white/12 bg-black/55 hover:border-white/30'
      }`}
    >
      {/* La scena scorre sotto ai numeri: si intuisce, non si guarda. */}
      <img
        src={SFONDI_CARD[indice % SFONDI_CARD.length]}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className="pointer-events-none absolute inset-y-0 right-0 -z-10 h-full w-2/3 object-cover opacity-45 transition-opacity duration-editorial group-hover:opacity-65"
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-black via-black/80 to-black/25"
        aria-hidden="true"
      />

      <div className="flex h-full flex-col p-6">
        {pkg.popular && (
          <div className="mb-4 inline-flex self-start bg-dr7-gold px-3 py-1 text-[10px] font-medium uppercase tracking-label text-black">
            {c('card_popular_badge_it', 'card_popular_badge_en')}
          </div>
        )}

        {/* La serie e' un'etichetta di sezione: sempre in maiuscolo, qualunque
            cosa sia finita in configurazione (una salvata prima che il
            gestionale normalizzasse restava "dr7 maxi" sulla card). */}
        <div className="t-eyebrow uppercase">{pkg.series}</div>
        <h3 className={`mt-3 font-serif text-2xl leading-tight ${oro ? 'text-dr7-gold' : 'text-white'}`}>
          {pkg.name}
        </h3>

        <div className="mt-6 text-sm text-gray-400">{c('card_recharge_label_it', 'card_recharge_label_en')}</div>
        <div className={`text-2xl font-light ${oro ? 'text-dr7-gold' : 'text-white'}`}>
          {formatAmount(pkg.rechargeAmount, lang)}
        </div>

        <div className="my-4 text-lg font-light text-gray-500" aria-hidden="true">+</div>

        <div className="text-sm text-gray-400">{c('card_receive_label_it', 'card_receive_label_en')}</div>
        <div className={`font-serif text-4xl leading-none ${oro ? 'text-dr7-gold' : 'text-white'}`}>
          {formatAmount(pkg.receivedAmount, lang)}
        </div>
        <div className="mt-3 text-sm text-gray-300">
          +{pkg.bonusPercentage}% {c('card_bonus_suffix_it', 'card_bonus_suffix_en')} ({formatAmount(pkg.bonus, lang)})
        </div>

        <div className={`mt-6 mb-5 h-px w-full ${oro ? 'bg-dr7-gold/40' : 'bg-white/12'}`} />

        <button
          onClick={onSelect}
          className={`mt-auto w-full px-6 py-3 text-[11px] font-medium uppercase tracking-label transition-colors duration-standard ${
            oro
              ? 'bg-dr7-gold text-black hover:bg-dr7-gold/85'
              : 'border border-white/15 bg-white/5 text-white hover:bg-white/12'
          }`}
        >
          {c('card_cta_it', 'card_cta_en')}
        </button>
      </div>
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

  // Il Privilege Bonus si racconta una volta sola: le righe sono quelle di
  // Sito > Membership, gia' usate dalla pagina DR7 Club. Cambiarle li' le
  // cambia in tutt'e due i posti.
  const [club, setClub] = useState<MembershipCopy | null>(null);
  useEffect(() => {
    let cancelled = false;
    getMembershipCopy().then(m => { if (!cancelled) setClub(m); }).catch(() => { /* la fascia resta nascosta */ });
    return () => { cancelled = true; };
  }, []);
  const p = (it?: string, en?: string): string => ((lang === 'it' ? it : en) || '');

  // Il filmato dietro alla pagina, scelto da Sito > Aspetto & Funzionalita'.
  const filmato = useFilmato('wallet');
  // La fascia del Privilege ha il suo filmato, lo stesso della pagina Club.
  const filmatoPrivilege = useFilmato('privilege');
  // Nexi payment - no stripe needed
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

  // Carrello: la ricarica si puo' mettere da parte e pagare insieme al
  // resto. Resta a sola carta: il wallet non si ricarica col wallet.
  const { aggiungi: aggiungiArticolo } = useCarrello();
  const [aggiungendoAlCarrello, setAggiungendoAlCarrello] = useState(false);

  const aggiungiAlCarrello = async () => {
    if (!selectedPackage || !user?.id || aggiungendoAlCarrello) return;
    setAggiungendoAlCarrello(true);
    setPaymentError(null);
    try {
      await aggiungiArticolo({
        tipo: 'wallet',
        titolo: `Credit Wallet — ${selectedPackage.name}`,
        sottotitolo: `${formatAmount(selectedPackage.rechargeAmount, lang)} → ${formatAmount(selectedPackage.receivedAmount, lang)}`,
        prezzoCents: Math.round(selectedPackage.rechargeAmount * 100),
        dati: {
          purchase: {
            package_id: selectedPackage.id,
            package_name: selectedPackage.name,
            package_series: selectedPackage.series,
            recharge_amount: selectedPackage.rechargeAmount,
            received_amount: selectedPackage.receivedAmount,
            bonus_amount: selectedPackage.bonus,
            bonus_percentage: selectedPackage.bonusPercentage,
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
          },
        },
      });
      setShowPaymentModal(false);
    } catch (e: any) {
      setPaymentError(e?.message || 'Errore');
    } finally {
      setAggiungendoAlCarrello(false);
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

  const vantaggi = [
    { icona: <IcoFulmine />, titolo: w('advantage_1_title_it', 'advantage_1_title_en'), testo: w('advantage_1_body_it', 'advantage_1_body_en') },
    { icona: <IcoDiamante />, titolo: w('advantage_3_title_it', 'advantage_3_title_en'), testo: w('advantage_3_body_it', 'advantage_3_body_en') },
    { icona: <IcoMonete />, titolo: w('advantage_2_title_it', 'advantage_2_title_en'), testo: w('advantage_2_body_it', 'advantage_2_body_en') },
    { icona: <IcoOrologio />, titolo: w('advantage_4_title_it', 'advantage_4_title_en'), testo: w('advantage_4_body_it', 'advantage_4_body_en') },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* 10/09/2026 — il filmato sta dietro alla pagina, come su Terra e
          Lavaggio: niente `bg-black` sul contenitore, altrimenti lo
          richiuderebbe. Si sceglie da Sito > Aspetto & Funzionalita'. */}
      <SfondoVideo
        src={filmato.src}
        poster={filmato.poster}
        ariaLabel={w('hero_title_eyebrow_it', 'hero_title_eyebrow_en')}
        compatta
      >
        <div className="container mx-auto px-6 text-center">
          <p className="t-eyebrow">{w('hero_title_eyebrow_it', 'hero_title_eyebrow_en')}</p>
          <h1 className="mt-7 font-serif text-4xl uppercase leading-[1.05] tracking-[-0.01em] text-white md:text-6xl">
            {w('hero_subtitle_it', 'hero_subtitle_en')}
          </h1>
          <p className="mx-auto mt-8 max-w-2xl whitespace-pre-line text-base leading-relaxed text-gray-300 md:text-lg">
            {w('hero_intro_it', 'hero_intro_en')}
          </p>
        </div>
      </SfondoVideo>

      {/* ─── Tre promesse, la fascia sotto all'apertura ─────────────────── */}
      <div className="border-y border-white/10 bg-black/55 backdrop-blur-sm">
        <div className="container mx-auto grid grid-cols-1 gap-px px-6 md:grid-cols-3">
          {[
            { icona: <IcoMonete />, titolo: w('benefit_extra_title_it', 'benefit_extra_title_en'), testo: w('benefit_extra_body_it', 'benefit_extra_body_en') },
            { icona: <IcoInfinito />, titolo: w('benefit_no_expiry_title_it', 'benefit_no_expiry_title_en'), testo: w('benefit_no_expiry_body_it', 'benefit_no_expiry_body_en') },
            { icona: <IcoScudo />, titolo: w('benefit_secure_title_it', 'benefit_secure_title_en'), testo: w('benefit_secure_body_it', 'benefit_secure_body_en') },
          ].map((b, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="flex flex-col items-center px-6 py-10 text-center md:border-l md:border-white/10 md:first:border-l-0"
            >
              <span className="text-dr7-gold">{b.icona}</span>
              <h3 className="mt-5 text-[11px] font-medium uppercase tracking-label text-white">{b.titolo}</h3>
              <p className="mt-3 max-w-xs text-sm font-light leading-relaxed text-gray-400">{b.testo}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ─── Dove si spende: la fascia sul mare ─────────────────────────── */}
      <section className="relative isolate overflow-hidden">
        <img
          src="/yacht.jpeg"
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-black via-black/80 to-black/30" aria-hidden="true" />
        <div className="container mx-auto px-6 py-16 md:py-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="grid grid-cols-1 gap-10 md:grid-cols-[1.5fr_1fr] md:gap-16"
          >
            <div>
              <h2 className="font-serif text-xl uppercase leading-snug tracking-[0.02em] text-white md:text-2xl">
                {w('services_heading_it', 'services_heading_en')}
              </h2>
              <p className="mt-6 max-w-xl text-base font-light leading-relaxed text-gray-300">
                {w('services_body_it', 'services_body_en')}
              </p>
              <p className="mt-3 text-base font-medium text-white">
                {w('services_no_expiry_it', 'services_no_expiry_en')}
              </p>
            </div>
            <div className="md:border-l md:border-white/15 md:pl-10">
              <p className="whitespace-pre-line text-sm uppercase leading-[2.2] tracking-eyebrow text-gray-200 md:text-base">
                {w('services_tagline_it', 'services_tagline_en')}
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── DR7 Club Privilege: il Wallet che matura ────────────────────
          Il motore vero sta nel gestionale (accrue-club-wallet-interest,
          0,1% al giorno sul capitale, accredito mensile). Qui c'e' solo il
          racconto, e arriva da Sito > Membership: la pagina DR7 Club usa le
          stesse righe. */}
      {club && (
        <section className="relative isolate overflow-hidden border-t border-white/10">
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
          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-black via-black/85 to-black/45" aria-hidden="true" />
          <div className="container mx-auto px-6 py-16 md:py-24">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="grid grid-cols-1 gap-12 lg:grid-cols-[1.35fr_1fr] lg:gap-16"
            >
              <div>
                <p className="t-eyebrow">{p(club.privilege_eyebrow_it, club.privilege_eyebrow_en)}</p>
                <h2 className="mt-7 max-w-xl font-serif text-3xl leading-[1.15] tracking-[-0.015em] text-white md:text-5xl">
                  {p(club.privilege_title_it, club.privilege_title_en)}
                </h2>
                <p className="mt-8 max-w-2xl text-base font-light leading-relaxed text-gray-300">
                  {p(club.privilege_intro_it, club.privilege_intro_en)}
                </p>
                <div className="mt-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-12">
                  <span className="flex items-center gap-3 text-sm text-gray-200">
                    <span className="text-dr7-gold"><IcoCorona /></span>
                    {p(club.privilege_claim_1_it, club.privilege_claim_1_en)}
                  </span>
                  <span className="flex items-center gap-3 text-sm text-gray-200">
                    <span className="text-dr7-gold"><IcoGrafico /></span>
                    {p(club.privilege_claim_2_it, club.privilege_claim_2_en)}
                  </span>
                </div>
              </div>

              {/* La chiusa, messa a citazione: e' la frase che resta. */}
              <figure className="self-center border border-white/12 bg-black/45 p-8 backdrop-blur-sm md:p-10">
                <blockquote className="font-serif text-xl italic leading-relaxed text-white md:text-2xl">
                  “{p(club.privilege_closing_it, club.privilege_closing_en)}”
                </blockquote>
                <figcaption className="t-eyebrow mt-6">DR7</figcaption>
              </figure>
            </motion.div>
          </div>
        </section>
      )}

      {/* ─── L'esempio: quattro numeri esatti, quindi una tabella ───────── */}
      {club && (
        <section className="border-t border-white/10 bg-black/85">
          <div className="container mx-auto px-6 py-16 md:py-20">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <p className="max-w-3xl text-sm font-light leading-relaxed text-gray-400">
                {p(club.privilege_calc_it, club.privilege_calc_en)}
              </p>

              <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
                <div className="border border-white/12">
                  <p className="border-b border-white/12 px-6 py-4 text-sm text-white">
                    {p(club.privilege_example_label_it, club.privilege_example_label_en)}
                  </p>
                  {(club.privilege_rows || []).map((row, i) => (
                    <div
                      key={i}
                      className="flex items-baseline justify-between gap-5 border-b border-white/8 px-6 py-3.5 last:border-b-0"
                    >
                      <span className="text-sm text-gray-400">{p(row.label_it, row.label_en)}</span>
                      <span className="text-right text-sm tabular-nums text-white">{row.value}</span>
                    </div>
                  ))}
                </div>

                <aside className="flex flex-col gap-5 border border-white/12 bg-white/[0.03] p-8">
                  <span className="text-dr7-gold"><IcoClessidra /></span>
                  <p className="text-sm font-light leading-relaxed text-gray-200">
                    {p(club.privilege_principle_it, club.privilege_principle_en)}
                  </p>
                  <p className="text-sm font-light leading-relaxed text-gray-400">
                    {p(club.privilege_usage_it, club.privilege_usage_en)}
                  </p>
                </aside>
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* ─── I pacchetti ─────────────────────────────────────────────────── */}
      <section className="border-t border-white/10 bg-black/85">
        <div className="container mx-auto px-6 py-16 md:py-20">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mb-12 text-center"
          >
            <h2 className="font-serif text-3xl uppercase tracking-[0.01em] text-white md:text-4xl">
              {w('packages_section_label_it', 'packages_section_label_en')}
            </h2>
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {series.map((s) => (
                <button
                  key={s}
                  onClick={() => setSelectedSeries(s)}
                  className={`px-5 py-2 text-[11px] font-medium uppercase tracking-label transition-colors duration-standard ${
                    selectedSeries === s
                      ? 'bg-dr7-gold text-black'
                      : 'border border-white/12 bg-white/5 text-gray-300 hover:bg-white/12 hover:text-white'
                  }`}
                >
                  {s === 'all' ? w('packages_filter_all_it', 'packages_filter_all_en') : <span className="uppercase">{s}</span>}
                </button>
              ))}
            </div>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4"
          >
            {copy && filteredPackages.map((pkg, i) => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                indice={i}
                onSelect={() => handleSelectPackage(pkg.id)}
                copy={copy}
                lang={lang}
              />
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── Quattro vantaggi, la riga di chiusura ──────────────────────── */}
      <section className="border-t border-white/10 bg-black/90">
        <div className="container mx-auto grid grid-cols-1 gap-10 px-6 py-14 sm:grid-cols-2 xl:grid-cols-4">
          {vantaggi.map((v, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="flex gap-4"
            >
              <span className="mt-0.5 shrink-0 text-dr7-gold">{v.icona}</span>
              <div>
                <h3 className="text-sm font-medium text-white">{v.titolo}</h3>
                <p className="mt-2 text-sm font-light leading-relaxed text-gray-400">{v.testo}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

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
              className="bg-dr7-graphite border border-white/12 max-w-2xl w-full my-8"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-white/12">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="font-serif text-2xl text-white">
                      {w('modal_title_it', 'modal_title_en')}
                    </h2>
                    <p className="t-eyebrow mt-3">
                      {selectedPackage.name} — {selectedPackage.series}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowPaymentModal(false)}
                    className="text-gray-400 hover:text-white transition-colors"
                    aria-label={w('modal_cancel_it', 'modal_cancel_en')}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <form onSubmit={handlePayment} className="p-6 space-y-6">
                {/* Package Summary */}
                <div className="border border-white/12 bg-white/[0.03] p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-400 text-sm">{w('modal_recharge_label_it', 'modal_recharge_label_en')}</span>
                    <span className="text-gray-200">{formatAmount(selectedPackage.rechargeAmount, lang)}</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-400 text-sm">{w('modal_bonus_label_it', 'modal_bonus_label_en')} (+{selectedPackage.bonusPercentage}%)</span>
                    <span className="text-dr7-gold text-xl">{formatAmount(selectedPackage.bonus, lang)}</span>
                  </div>
                  <div className="border-t border-white/12 my-3"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-white text-sm">{w('modal_receive_label_it', 'modal_receive_label_en')}</span>
                    <span className="font-serif text-3xl text-white">{formatAmount(selectedPackage.receivedAmount, lang)}</span>
                  </div>
                </div>

                {/* Payment Information */}
                <div>
                  <h3 className="text-[11px] font-medium uppercase tracking-label text-white mb-4">{w('modal_payment_heading_it', 'modal_payment_heading_en')}</h3>
                  <div className="border border-white/12 bg-white/[0.03] p-6 text-center">
                    <p className="text-gray-300 mb-2">{w('modal_payment_info_it', 'modal_payment_info_en')}</p>
                    <p className="text-gray-500 text-sm">{w('modal_payment_secure_it', 'modal_payment_secure_en')}</p>
                    {paymentError && <p className="text-xs text-red-400 mt-2">{paymentError}</p>}
                  </div>
                </div>

                {/* Action Buttons */}
                <button
                  type="button"
                  onClick={aggiungiAlCarrello}
                  disabled={isProcessing || aggiungendoAlCarrello}
                  className="mb-4 w-full border border-white/15 bg-white/5 px-6 py-3 text-[11px] font-medium uppercase tracking-label text-white transition-colors hover:bg-white/12 disabled:opacity-50"
                >
                  {aggiungendoAlCarrello
                    ? t({ it: 'Aggiungo…', en: 'Adding…' })
                    : t({ it: 'Aggiungi al carrello', en: 'Add to cart' })}
                </button>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(false)}
                    className="flex-1 border border-white/15 bg-white/5 px-6 py-3 text-[11px] font-medium uppercase tracking-label text-white transition-colors hover:bg-white/12"
                  >
                    {w('modal_cancel_it', 'modal_cancel_en')}
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="flex-1 bg-dr7-gold px-6 py-3 text-[11px] font-medium uppercase tracking-label text-black transition-colors hover:bg-dr7-gold/85 disabled:opacity-50 disabled:cursor-not-allowed"
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

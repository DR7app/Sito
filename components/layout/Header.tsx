import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import {
  UserCircleIcon,
  CarIcon, AnchorIcon, PaperAirplaneIcon, HomeIcon,
  SparklesIcon, CrownIcon, TrendingUpIcon, CubeTransparentIcon, SendIcon, WalletIcon,
} from '../icons/Icons';
import BookingSearchBox from '../ui/BookingSearchBox';
import CercaSedi from '../ui/CercaSedi';
import { getHeaderCopy, getAspettoCopy, DEFAULT_ASPETTO, type HeaderCopy, type AspettoCopy } from '../../utils/siteCopy';
import { useNoleggioCatalog } from '../../hooks/useNoleggioCatalog';

/**
 * Il logo della barra in alto. Due <img> invece di un'altezza sola perche'
 * l'operatore imposta due misure (telefono e schermo grande) e Tailwind non
 * puo' generare una classe da un numero letto a runtime: la scelta la fa il
 * breakpoint, l'altezza lo style.
 */
const SiteLogo: React.FC<{ aspetto: Required<AspettoCopy>; alt: string }> = ({ aspetto, alt }) => (
  <NavLink to="/" className="flex items-center shrink-0">
    <img src={aspetto.logo_url} alt={alt} className="logo-bianco w-auto md:hidden" style={{ height: aspetto.logo_height_mobile }} />
    <img src={aspetto.logo_url} alt={alt} className="logo-bianco w-auto hidden md:block" style={{ height: aspetto.logo_height_desktop }} />
  </NavLink>
);

const NavigationMenu: React.FC<{ isOpen: boolean; onClose: () => void; copy: HeaderCopy; aspetto: Required<AspettoCopy> }> = ({ isOpen, onClose, copy, aspetto }) => {
  const { t, lang } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const [showBookingPopup, setShowBookingPopup] = useState(false);
  const h = (it: keyof HeaderCopy, en: keyof HeaderCopy): string =>
    (copy as Record<string, string>)[(lang === 'it' ? it : en) as string];
  // "La Nostra Flotta" punta SEMPRE alla landing /flotta (index con
  // tutte le categorie come cards). Non saltare direttamente alla
  // prima categoria — l'utente deve vedere il menu di scelta.
  const flottaLanding = '/flotta';
  // Noleggio Mare/Aria: link in menu SOLO se il catalogo admin ha elementi
  // attivi (catalogo vuoto => nessun link, nessuna pagina).
  const { hasBoats, hasHelis, hasStays } = useNoleggioCatalog();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  // Re-open booking popup after sign-in. Triggered when the URL contains
  // `?openBooking=1` (set when an unauthenticated user clicked "Prenota Ora"
  // and was redirected through /signin). Removes the query param so the
  // popup doesn't reopen on subsequent navigations.
  useEffect(() => {
    if (!user) return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('openBooking') === '1') {
        setShowBookingPopup(true);
        try { window.dispatchEvent(new CustomEvent('dr7:prenota-ora:manual-opened')); } catch { /* ignore */ }
        params.delete('openBooking');
        const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
        window.history.replaceState(null, '', newUrl);
      }
    } catch { /* ignore */ }
  }, [user]);

  const navLinkClasses =
    'block py-3 pl-3 text-[15px] font-normal text-gray-400 hover:text-white transition-all duration-200 hover:bg-white/5';

  const accountLink = user?.role === 'business' ? '/partner/dashboard' : '/account';
  const accountLabel = user?.role === 'business' ? t('Partner_Dashboard') : t('My_Account');

  // Voci del menu (redesign): icona oro + immagine + titolo + sottotitolo.
  // Titolo/sottotitolo sono editabili da Admin > Sito > Header (chiavi
  // menu_<id>_title/sub _it/en); se vuote nel DB si usa il default hardcoded.
  const GOLD = '#C8A24A';
  const isIt = lang === 'it';
  // Legge una coppia di chiavi copy con fallback al default hardcoded.
  const mc = (itKey: keyof HeaderCopy, enKey: keyof HeaderCopy, fbIt: string, fbEn: string): string => {
    const rec = copy as unknown as Record<string, string | undefined>;
    const val = (isIt ? rec[itKey as string] : rec[enKey as string]) || '';
    return val.trim() ? val : (isIt ? fbIt : fbEn);
  };
  // Immagine della voce: nel menu a schermo intero e' il visual che si vede,
  // quindi la decide il gestionale. La costante qui sotto e' solo il valore di
  // fabbrica, quello che si vede finche' nessuno l'ha cambiata.
  const mi = (key: keyof HeaderCopy, fallback: string): string => {
    const val = (copy as unknown as Record<string, string | undefined>)[key as string] || '';
    return val.trim() ? val : fallback;
  };
  const MENU_ITEMS: Array<{
    to: string;
    img: string;
    Icon: React.FC<{ className?: string }>;
    title: string;
    subtitle: string;
  }> = [
    { to: flottaLanding, img: mi('menu_mobilita_img', '/menu-mobilita.jpeg'), Icon: CarIcon,
      title: mc('menu_mobilita_title_it', 'menu_mobilita_title_en', 'Mobilità', 'Mobility'),
      subtitle: mc('menu_mobilita_sub_it', 'menu_mobilita_sub_en', 'Auto esclusive per ogni esperienza su strada', 'Exclusive cars for every experience on the road') },
    // Mare / Aria / Property: SEMPRE visibili (anche a catalogo vuoto), per
    // scelta esplicita. Le pagine gestiscono lo stato vuoto.
    { to: '/noleggio-mare', img: mi('menu_mare_img', '/menu-mare.jpeg'), Icon: AnchorIcon,
      title: mc('menu_mare_title_it', 'menu_mare_title_en', 'Mare', 'Sea'),
      subtitle: mc('menu_mare_sub_it', 'menu_mare_sub_en', 'Yacht, barche e esperienze esclusive in mare', 'Yachts, boats and exclusive experiences at sea') },
    { to: '/noleggio-aria', img: mi('menu_aria_img', '/menu-aria.jpeg'), Icon: PaperAirplaneIcon,
      title: mc('menu_aria_title_it', 'menu_aria_title_en', 'Aria', 'Air'),
      subtitle: mc('menu_aria_sub_it', 'menu_aria_sub_en', 'Voli privati ed elicotteri per viaggiare senza confini', 'Private jets and helicopters to travel without limits') },
    { to: '/soggiorni', img: mi('menu_property_img', '/menu-property.jpeg'), Icon: HomeIcon,
      title: mc('menu_property_title_it', 'menu_property_title_en', 'Soggiorni & Ospitalità', 'Stays & Hospitality'),
      subtitle: mc('menu_property_sub_it', 'menu_property_sub_en', 'Ville, appartamenti e residenze selezionate in tutto il mondo', 'Villas, apartments and residences selected worldwide') },
    { to: '/prime-wash', img: mi('menu_servizi_img', '/servizi-lavaggio.jpeg'), Icon: SparklesIcon,
      title: mc('menu_servizi_title_it', 'menu_servizi_title_en', 'Lavaggio & Meccanica', 'Car Wash & Mechanics'),
      subtitle: mc('menu_servizi_sub_it', 'menu_servizi_sub_en', 'Lavaggio auto premium e officina meccanica', 'Premium car wash and mechanical workshop') },
    { to: '/credit-wallet', img: mi('menu_wallet_img', '/menu-club.jpeg'), Icon: WalletIcon,
      title: mc('menu_wallet_title_it', 'menu_wallet_title_en', 'Credit Wallet', 'Credit Wallet'),
      subtitle: mc('menu_wallet_sub_it', 'menu_wallet_sub_en', 'Il tuo credito DR7 Wallet per prenotare e ricaricare', 'Your DR7 Wallet credit to book and top up') },
    { to: '/membership', img: mi('menu_club_img', '/menu-club.jpeg'), Icon: CrownIcon,
      title: mc('menu_club_title_it', 'menu_club_title_en', 'DR7 Club', 'DR7 Club'),
      subtitle: mc('menu_club_sub_it', 'menu_club_sub_en', 'Accesso esclusivo, eventi riservati e vantaggi unici', 'Exclusive access, private events and unique benefits') },
    // Non e' una pagina a se: porta al blocco Privilege dentro DR7 Club
    // (ancora #privilege). Un testo solo, in un posto solo.
    { to: '/membership#privilege', img: mi('menu_privilege_img', '/menu-club.jpeg'), Icon: CrownIcon,
      title: mc('menu_privilege_title_it', 'menu_privilege_title_en', 'DR7 Club Privilege', 'DR7 Club Privilege'),
      subtitle: mc('menu_privilege_sub_it', 'menu_privilege_sub_en', 'Il saldo idoneo del tuo Wallet matura ogni giorno', 'Your eligible Wallet balance grows every day') },
    { to: '/franchising', img: mi('menu_business_img', '/menu-business.jpeg'), Icon: TrendingUpIcon,
      title: mc('menu_business_title_it', 'menu_business_title_en', 'Business', 'Business'),
      subtitle: mc('menu_business_sub_it', 'menu_business_sub_en', 'Soluzioni corporate e noleggi a lungo termine', 'Corporate solutions and long-term rentals') },
    { to: '/token', img: mi('menu_digital_img', '/menu-digital.jpeg'), Icon: CubeTransparentIcon,
      title: mc('menu_digital_title_it', 'menu_digital_title_en', 'Innovazione Digitale', 'Digital Innovation'),
      subtitle: mc('menu_digital_sub_it', 'menu_digital_sub_en', 'Creazione di asset digitali e token', 'Digital Asset & Token Creation') },
    { to: '/contact', img: mi('menu_contatti_img', '/menu-contatti.jpeg'), Icon: SendIcon,
      title: mc('menu_contatti_title_it', 'menu_contatti_title_en', 'Contattaci', 'Contact Us'),
      subtitle: mc('menu_contatti_sub_it', 'menu_contatti_sub_en', 'Siamo a tua disposizione', 'We are at your service') },
    // Ultima riga: l'area cliente. Da quando la barra in alto non porta piu'
    // il Credit Wallet ne' l'uscita, il menu e' la via principale per
    // arrivarci. Chi non ha ancora fatto l'accesso viene mandato al modulo di
    // accesso, non a una pagina che lo rimbalzerebbe.
    { to: user ? accountLink : '/signin', img: mi('menu_account_img', '/menu-club.jpeg'), Icon: UserCircleIcon,
      title: user ? accountLabel : t('Sign_In'),
      subtitle: '' },
  ];

  // Il movimento del menu: una sola serie di numeri, usata sia in ingresso
  // che in uscita. Aprire e chiudere devono essere lo stesso gesto — stessa
  // durata, stesso passo fra una voce e l'altra, stessa curva, stesso ordine
  // (la cascata parte sempre dal BASSO: l'ultima voce si muove per prima).
  const VOCE_DURATA = 0.92;
  const VOCE_PASSO = 0.135;
  const VOCE_CURVA: [number, number, number, number] = [0.19, 1, 0.22, 1];
  const voceRitardo = (i: number) => (MENU_ITEMS.length - 1 - i) * VOCE_PASSO;
  // Velo e pannello se ne vanno quando le voci hanno quasi finito: prima
  // sparirebbe il fondo nero e le ultime voci scorrerebbero sopra la pagina.
  const codaUscita = (MENU_ITEMS.length - 1) * VOCE_PASSO + VOCE_DURATA * 0.6;

  /**
   * Il menu.
   *
   * Non e' un cassetto laterale con una lista fitta di righe: e' uno schermo
   * intero che si posa sopra la pagina, che resta visibile sotto un velo. La
   * pagina non sparisce, si allontana.
   *
   * La colonna delle voci sta a SINISTRA e il testo e' a filo DESTRO contro il
   * proprio asse: le righe finiscono tutte sulla stessa verticale e cominciano
   * dove capita. Corpo piccolo, molto spazio fra una riga e l'altra. Nessuna
   * immagine: restano titolo e sottotitolo, cioe' esattamente quello che il
   * menu diceva prima.
   *
   * Sul telefono il testo torna a filo sinistro: su uno schermo stretto una
   * lista a filo destro costringe l'occhio a ricominciare da un punto diverso
   * a ogni riga. Ogni voce e' alta almeno 48px, la misura di un polpastrello.
   *
   * Il movimento sta nell'ingresso: ogni voce sale da sotto una linea, una
   * dopo l'altra. E' quello a dare il senso di apertura, non un effetto sopra
   * al testo.
   *
   * Restano tutte le destinazioni e l'area cliente, che e' l'ultima voce
   * della lista. Il piede con prenotazione, credito, profilo e uscita non
   * c'e' piu': erano scorciatoie a cose che stanno gia' dentro l'area
   * cliente, e occupavano una fascia intera in fondo allo schermo.
   */
  const [hovered, setHovered] = useState(-1);
  // Chi ha chiesto meno movimento al sistema operativo non deve subire la
  // cascata: framer-motion anima con JavaScript, quindi la regola CSS di
  // `prefers-reduced-motion` non la fermerebbe.
  const menoMovimento = useReducedMotion();

  // Il menu si monta sul <body>, non dove vive l'header.
  //
  // L'header sta dentro un `div.relative.z-10` del layout: un elemento
  // posizionato con uno z-index proprio apre un contesto di impilamento, e
  // tutto cio' che sta dentro non puo' salire sopra a chi sta fuori, per
  // quanto alto sia il suo z-index. Il menu a schermo intero finiva cosi'
  // sotto al pulsante della chat, che vive alla radice. Con il portale il
  // menu esce da quella scatola: e' anche il posto giusto per una
  // sovrapposizione modale.
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[90]" aria-modal="true" role="dialog">
          {/* Velo: la pagina resta sotto, piu' fitto a sinistra dove sta il testo. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            /* Il velo se ne va per ultimo: prima escono le voci, poi torna
               fuori la pagina. Al contrario si vedrebbero le voci uscire nel
               vuoto. */
            exit={{ opacity: 0, transition: { duration: 0.62, delay: codaUscita, ease: [0.22, 1, 0.36, 1] } }}
            transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 bg-[#08090A]/[0.985] backdrop-blur-[3px] lg:bg-transparent lg:backdrop-blur-[2px]"
            onClick={onClose}
          >
            {/* Da desktop in su il velo e' un gradiente: la pagina resta
                intravedibile a destra, dove non c'e' testo. Sul telefono
                sarebbe solo rumore dietro alle voci, quindi resta pieno. */}
            <span
              className="absolute inset-0 hidden lg:block"
              style={{
                background:
                  'linear-gradient(100deg, rgba(8,9,10,0.97) 0%, rgba(8,9,10,0.94) 40%, rgba(8,9,10,0.84) 66%, rgba(8,9,10,0.72) 100%)',
              }}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            /* Anche il pannello aspetta: se sfumasse subito, la cascata di
               uscita delle voci non si vedrebbe proprio. */
            exit={{ opacity: 0, transition: { duration: 0.55, delay: codaUscita, ease: [0.22, 1, 0.36, 1] } }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex h-full flex-col overflow-hidden"
          >
            {/* Barra alta: chiudi a sinistra, marchio al centro, lingua a destra.
                Le stesse posizioni della barra del sito: aprendo il menu non si
                sposta niente, cambia solo cosa c'e' scritto a sinistra. */}
            <div className="shrink-0">
              <div className="container mx-auto flex items-center justify-between gap-4 px-6 py-5 md:py-6">
                <button
                  onClick={onClose}
                  aria-label={h('close_menu_aria_it', 'close_menu_aria_en')}
                  className="group flex items-center gap-3 text-white/90 transition-colors duration-standard hover:text-white"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span className="relative inline-flex h-9 items-center justify-center px-4">
                    <span className="absolute inset-0 border border-white/20 transition-colors duration-standard group-hover:border-white/50" />
                    <span className="t-nav relative">{isIt ? 'Chiudi' : 'Close'}</span>
                  </span>
                </button>

                {/* Il logo segue la posizione scelta in Sito > Aspetto, come nella
                    barra del sito: se e' a sinistra sta accanto a "Chiudi", se e'
                    a destra sta prima della lingua, altrimenti al centro. Prima
                    era inchiodato al centro e la scelta dell'operatore valeva
                    ovunque tranne che qui. */}
                <NavLink
                  to="/"
                  onClick={onClose}
                  className={
                    aspetto.logo_alignment === 'center'
                      ? 'absolute left-1/2 -translate-x-1/2'
                      : aspetto.logo_alignment === 'left'
                        ? 'order-first ml-5'
                        : 'order-last mr-2'
                  }
                >
                  <img src={aspetto.logo_url} alt={copy.logo_alt} className="logo-bianco w-auto" style={{ height: aspetto.logo_height_mobile }} />
                </NavLink>

              </div>
              <div className="container mx-auto px-6"><span className="block h-px w-full bg-white/10" /></div>
            </div>

            {/* Corpo: la colonna delle voci sta a DESTRA, allineata al bordo.
                Niente immagini: restano il titolo e il sottotitolo, cioe' quello
                che il menu diceva prima. Le voci entrano una dopo l'altra da
                sotto una linea, e' li' che sta il movimento. */}
            {/* `m-auto` sul figlio, non `items-center` sul contenitore: con
                l'allineamento al centro, quando la lista e' piu' alta dello
                schermo il contenuto viene tagliato SOPRA e quella parte non si
                raggiunge piu' scorrendo. Il margine automatico centra quando
                c'e' spazio e lascia scorrere quando non ce n'e'. */}
            <div className="flex flex-grow overflow-y-auto">
              <div className="container m-auto w-full px-6 py-5 lg:py-6">
                <nav className="mr-auto w-full text-left lg:max-w-[46%] lg:text-right">
                  <ul>
                    {MENU_ITEMS.map(({ to, title }, i) => (
                      <li key={title}>
                        {/* Apertura e chiusura sono lo stesso gesto.
                            La voce arriva da SINISTRA, di una larghezza esatta
                            della propria riga, mentre sfuma; la verticale non
                            si muove. Alla chiusura rifa' lo stesso tragitto al
                            contrario con gli stessi numeri: stessa durata,
                            stesso passo, stessa curva e la cascata che riparte
                            dal BASSO, cioe' l'ultima voce si muove per prima.
                            Prima la chiusura andava piu' veloce, con un passo
                            piu' corto e partendo dall'alto: era un movimento
                            diverso, e si vedeva. */}
                        <motion.div
                          initial={menoMovimento ? false : { x: '-100%', opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          exit={
                            menoMovimento
                              ? { opacity: 0 }
                              : { x: '-100%', opacity: 0, transition: { duration: VOCE_DURATA, delay: voceRitardo(i), ease: VOCE_CURVA } }
                          }
                          transition={
                            menoMovimento
                              ? { duration: 0 }
                              : { duration: VOCE_DURATA, delay: voceRitardo(i), ease: VOCE_CURVA }
                          }
                        >
                          <NavLink
                            to={to}
                            onClick={onClose}
                            onMouseEnter={() => setHovered(i)}
                            onFocus={() => setHovered(i)}
                            className="group flex min-h-[48px] flex-col justify-center border-b border-white/20 py-3.5 md:py-4"
                          >
                            <span
                              className={`t-nav block text-[13px] leading-none transition-colors duration-standard md:text-[15px] ${
                                hovered === i ? 'text-white' : 'text-white/60'
                              } group-hover:text-white`}
                              style={{ letterSpacing: '0.2em' }}
                            >
                              {title}
                            </span>
                          </NavLink>
                        </motion.div>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
            </div>

          </motion.div>

          {/* PRENOTA ORA POPUP — outside scroll container for proper z-index */}
          <AnimatePresence>
            {showBookingPopup && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center p-4"
                onMouseDown={(e) => { if (e.target === e.currentTarget) setShowBookingPopup(false); }}
                data-prenota-ora-manual="true"
              >
                <motion.div
                  initial={{ scale: 0.96, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.96, opacity: 0, y: 10 }}
                  transition={{ type: 'spring', duration: 0.4, bounce: 0.15 }}
                  className="bg-[#0A0B0C] border border-white/10 p-8 sm:p-10 max-w-[440px] w-full relative"
                  style={{ boxShadow: '0 40px 90px -40px rgba(0,0,0,0.9)' }}
                >
                  <button
                    onClick={() => setShowBookingPopup(false)}
                    className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center border border-white/10 text-white/40 hover:text-white hover:border-white/30 transition-colors duration-300 z-10"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <h3 className="font-serif text-[26px] font-normal text-white text-center mb-2 tracking-[-0.01em]">{h('popup_title_it', 'popup_title_en')}</h3>
                  <p className="text-[12px] text-white/35 text-center mb-8">{h('popup_subtitle_it', 'popup_subtitle_en')}</p>
                  <BookingSearchBox variant="popup" onClose={() => { setShowBookingPopup(false); onClose(); }} />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

const Header: React.FC = () => {
  const { t, lang } = useTranslation();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // La lente in alto a destra: cerca fra le sedi del pannello. Oggi c'e'
  // Cagliari, domani ce ne saranno altre e si troveranno da sole.
  const [cercaAperto, setCercaAperto] = useState(false);
  const [copy, setCopy] = useState<HeaderCopy | null>(null);
  // Logo e widget: si parte dai valori di fabbrica cosi' la barra non appare
  // mai senza logo, poi arriva la configurazione dell'operatore.
  const [aspetto, setAspetto] = useState<Required<AspettoCopy>>(DEFAULT_ASPETTO);

  useEffect(() => {
    let cancelled = false;
    getHeaderCopy().then((c) => { if (!cancelled) setCopy(c); });
    getAspettoCopy().then((a) => { if (!cancelled) setAspetto(a); });
    return () => { cancelled = true; };
  }, []);

  const h = (it: keyof HeaderCopy, en: keyof HeaderCopy): string =>
    copy ? (copy as Record<string, string>)[(lang === 'it' ? it : en) as string] : '';

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className={`fixed top-0 left-0 right-0 z-40 border-b transition-all duration-500 ease-editorial ${scrolled
            ? 'bg-black/70 backdrop-blur-xl border-white/15'
            : 'bg-transparent border-white/15'
          } ${isMenuOpen ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
        aria-hidden={isMenuOpen}
      >
        <div className="container mx-auto px-6 py-5 md:py-6 flex items-center justify-between">
          {/* Pulsante MENU a sinistra — con il logo accanto se allineato a sinistra */}
          <div className="flex items-center gap-4">
            {aspetto.logo_alignment === 'left' && (
              <SiteLogo aspetto={aspetto} alt={copy?.logo_alt || 'DR7 Logo'} />
            )}
            <button
              onClick={() => setIsMenuOpen(true)}
              aria-label={h('open_menu_aria_it', 'open_menu_aria_en') || t({ it: 'Apri menu', en: 'Open menu' })}
              aria-expanded={isMenuOpen}
              className="link-reveal text-white/90 hover:text-white font-medium text-[11px] uppercase tracking-[0.28em] transition-colors duration-500 ease-editorial"
            >
              {h('explore_label_it', 'explore_label_en') || t({ it: 'MENU', en: 'MENU' })}
            </button>
          </div>

          {/* Logo centrato: fuori dal flusso, cosi' resta al centro della barra
              qualunque sia la larghezza dei due gruppi ai lati. */}
          {aspetto.logo_alignment === 'center' && (
            <div className="absolute left-1/2 transform -translate-x-1/2">
              <SiteLogo aspetto={aspetto} alt={copy?.logo_alt || 'DR7 Logo'} />
            </div>
          )}

          {/* A destra resta solo l'accesso per chi non l'ha ancora fatto, e il
              logo se e' allineato di qua. Lingua, Credit Wallet, uscita e
              adesso anche l'ingresso all'area cliente sono usciti dalla barra:
              stanno nel menu e nel fondo pagina. Chi ha gia' fatto l'accesso
              non vede piu' nulla qui. */}
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setCercaAperto(true)}
              aria-label={t({ it: 'Cerca una sede', en: 'Find a location' })}
              title={t({ it: 'Cerca una sede', en: 'Find a location' })}
              className="flex items-center justify-center text-white/90 transition-colors duration-500 ease-editorial hover:text-white"
            >
              <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path strokeLinecap="round" d="M20 20l-3.6-3.6" />
              </svg>
            </button>
            <AnimatePresence mode="wait">
              {user ? null : (
                <Link
                  to="/signin"
                  className="hidden md:inline-flex items-center justify-center border border-white bg-white px-6 py-2.5 text-[10px] font-medium uppercase tracking-[0.2em] text-black transition-colors duration-500 ease-editorial hover:bg-transparent hover:text-white"
                >
                  {t('Sign_In')}
                </Link>
              )}
            </AnimatePresence>
            {aspetto.logo_alignment === 'right' && (
              <SiteLogo aspetto={aspetto} alt={copy?.logo_alt || 'DR7 Logo'} />
            )}
          </div>
        </div>
      </motion.header>

      <CercaSedi aperto={cercaAperto} onClose={() => setCercaAperto(false)} />
      {copy && <NavigationMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} copy={copy} aspetto={aspetto} />}
    </>
  );
};

export default Header;

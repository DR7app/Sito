import React, { useState, useEffect } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import {
  UserCircleIcon, SignOutIcon,
  CarIcon, AnchorIcon, PaperAirplaneIcon, HomeIcon,
  SparklesIcon, CrownIcon, TrendingUpIcon, CubeTransparentIcon, SendIcon,
} from '../icons/Icons';
import { getUserCreditBalance } from '../../utils/creditWallet';
import BookingSearchBox from '../ui/BookingSearchBox';
import { getHeaderCopy, type HeaderCopy } from '../../utils/siteCopy';
import { useFlottaCategories } from '../../hooks/useFlottaCategories';
import { useNoleggioCatalog } from '../../hooks/useNoleggioCatalog';

const NavigationMenu: React.FC<{ isOpen: boolean; onClose: () => void; copy: HeaderCopy }> = ({ isOpen, onClose, copy }) => {
  const { t, lang } = useTranslation();
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [showBookingPopup, setShowBookingPopup] = useState(false);
  const h = (it: keyof HeaderCopy, en: keyof HeaderCopy): string =>
    (copy as Record<string, string>)[(lang === 'it' ? it : en) as string];
  // Categorie veicolo visibili in menu = quelle selezionate in admin
  // > Sito > Flotta (con default = tutte se nulla selezionato).
  const { categories: flottaCats } = useFlottaCategories();
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

  // Fetch credit balance when menu opens (with debounce to prevent rapid calls)
  useEffect(() => {
    if (!isOpen || !user?.id) return;

    const fetchBalance = async () => {
      setIsLoadingBalance(true);
      try {
        const balance = await getUserCreditBalance(user.id);
        setCreditBalance(balance);
      } catch (error) {
        console.error('Error fetching credit balance:', error);
        setCreditBalance(0); // Set to 0 on error to stop retries
      } finally {
        setIsLoadingBalance(false);
      }
    };

    // Debounce: only fetch after 300ms of menu being open
    const timer = setTimeout(fetchBalance, 300);
    return () => clearTimeout(timer);
  }, [isOpen, user?.id]);

  const navLinkClasses =
    'block py-3 pl-3 text-[15px] font-normal text-gray-400 hover:text-white transition-all duration-200 rounded-lg hover:bg-white/5';

  const handleLogout = () => {
    logout();
    onClose();
  };

  const accountLink = user?.role === 'business' ? '/partner/dashboard' : '/account';
  const accountLabel = user?.role === 'business' ? t('Partner_Dashboard') : t('My_Account');
  const userFullName = user?.fullName || 'User';

  // Voci del menu (redesign): icona oro + immagine + titolo + sottotitolo.
  // Le rotte puntano alle pagine esistenti; le immagini sono asset gia' presenti.
  const GOLD = '#C8A24A';
  const isIt = lang === 'it';
  const MENU_ITEMS: Array<{
    to: string;
    img: string;
    Icon: React.FC<{ className?: string }>;
    title: string;
    subtitle: string;
    show?: boolean; // se false la voce è nascosta (gating da catalogo admin)
  }> = [
    { to: flottaLanding, img: '/menu-mobilita.jpeg', Icon: CarIcon,
      title: isIt ? 'Mobilità' : 'Mobility',
      subtitle: isIt ? 'Auto esclusive per ogni esperienza su strada' : 'Exclusive cars for every experience on the road' },
    // Mare / Aria / Property: SEMPRE visibili (anche a catalogo vuoto), per
    // scelta esplicita. Le pagine gestiscono lo stato vuoto.
    { to: '/noleggio-mare', img: '/menu-mare.jpeg', Icon: AnchorIcon,
      title: isIt ? 'Mare' : 'Sea',
      subtitle: isIt ? 'Yacht, barche e esperienze esclusive in mare' : 'Yachts, boats and exclusive experiences at sea' },
    { to: '/noleggio-aria', img: '/menu-aria.jpeg', Icon: PaperAirplaneIcon,
      title: isIt ? 'Aria' : 'Air',
      subtitle: isIt ? 'Voli privati ed elicotteri per viaggiare senza confini' : 'Private jets and helicopters to travel without limits' },
    { to: '/soggiorni', img: '/menu-property.jpeg', Icon: HomeIcon,
      title: 'Property',
      subtitle: isIt ? 'Ville, appartamenti e residenze selezionate in tutto il mondo' : 'Villas, apartments and residences selected worldwide' },
    { to: '/prime-wash', img: '/luxury.jpeg', Icon: SparklesIcon,
      title: isIt ? 'Servizi' : 'Services',
      subtitle: isIt ? 'Servizi su misura per uno stile di vita esclusivo' : 'Tailored services for an exclusive lifestyle' },
    { to: '/membership', img: '/members.jpeg', Icon: CrownIcon,
      title: 'DR7 Club',
      subtitle: isIt ? 'Accesso esclusivo, eventi riservati e vantaggi unici' : 'Exclusive access, private events and unique benefits' },
    { to: '/franchising', img: '/banner.jpeg', Icon: TrendingUpIcon,
      title: 'Business',
      subtitle: isIt ? 'Soluzioni corporate e noleggi a lungo termine' : 'Corporate solutions and long-term rentals' },
    { to: '/token', img: '/cwallet.jpeg', Icon: CubeTransparentIcon,
      title: 'Digital Innovation',
      subtitle: 'Digital Asset & Token Creation' },
    { to: '/contact', img: '/exclusivemc.jpeg', Icon: SendIcon,
      title: isIt ? 'Contattaci' : 'Contact Us',
      subtitle: isIt ? 'Siamo a tua disposizione' : 'We are at your service' },
  ];

  const menuVariants = {
    hidden: { x: '-100%' },
    visible: { x: 0 },
  };

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50" aria-modal="true" role="dialog">
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="absolute inset-0 bg-black/70 backdrop-blur-xl"
            onClick={onClose}
          />
          <motion.div
            variants={menuVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-0 left-0 bottom-0 w-full max-w-md bg-[#070707] border-r border-white/10 shadow-2xl flex flex-col overflow-y-auto"
          >
            {/* Header: logo + tagline (sinistra), chiudi (destra) */}
            <div className="flex items-start justify-between px-5 pt-6 pb-5 border-b border-white/[0.06]">
              <NavLink to="/" onClick={onClose} className="flex flex-col">
                <img src="/DR7logo1.png" alt={copy.logo_alt} className="h-12 w-auto" />
                <span className="mt-1 pl-1 text-[9px] tracking-[0.45em] text-gray-500 uppercase">Beyond Luxury</span>
              </NavLink>
              <button
                onClick={onClose}
                aria-label={h('close_menu_aria_it', 'close_menu_aria_en')}
                className="-mr-2 p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/5 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* PRENOTA ORA — conversione principale, mantenuta.
                Se non loggato reindirizza a /signin e riapre il popup. */}
            <div className="px-5 pt-5">
              <button
                onClick={() => {
                  if (!user) {
                    onClose();
                    nav('/signin?returnTo=' + encodeURIComponent(window.location.pathname + '?openBooking=1'));
                    return;
                  }
                  setShowBookingPopup(true);
                  try { window.dispatchEvent(new CustomEvent('dr7:prenota-ora:manual-opened')); } catch { /* ignore */ }
                }}
                className="w-full py-3 rounded-full text-sm font-semibold tracking-[0.15em] uppercase active:scale-[0.98] transition-all duration-300 hover:bg-white/5"
                style={{ color: GOLD, border: `1px solid ${GOLD}66` }}
              >
                {h('drawer_book_cta_it', 'drawer_book_cta_en')}
              </button>
            </div>

            {/* Menu principale: immagine + icona oro + titolo + sottotitolo + chevron */}
            <nav className="flex-grow px-3 py-4">
              <div className="divide-y divide-white/[0.05]">
                {MENU_ITEMS.map(({ to, img, Icon, title, subtitle }) => (
                  <NavLink
                    key={title}
                    to={to}
                    onClick={onClose}
                    className="group flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-white/[0.03] transition-colors"
                  >
                    <img src={img} alt="" loading="lazy" className="w-[64px] h-[48px] flex-shrink-0 rounded-lg object-cover ring-1 ring-white/10" />
                    <Icon className="w-5 h-5 flex-shrink-0 text-[#C8A24A]" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-semibold uppercase tracking-[0.1em] text-white leading-tight">{title}</span>
                      <span className="mt-0.5 block text-[11px] text-gray-400 leading-snug line-clamp-2">{subtitle}</span>
                    </span>
                    <svg className="w-4 h-4 flex-shrink-0 text-gray-600 group-hover:text-gray-300 transition-colors" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </NavLink>
                ))}
              </div>
            </nav>

            {/* Footer: accesso esclusivo + account/wallet (loggato) o sign in */}
            <div className="mt-auto px-5 py-5 border-t border-white/[0.06]">
              {user ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] tracking-[0.25em] uppercase" style={{ color: GOLD }}>{isIt ? 'Accesso Esclusivo' : 'Exclusive Access'}</p>
                    <p className="text-sm font-semibold text-white truncate">{userFullName}</p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <Link to="/credit-wallet" onClick={onClose} className="rounded-full bg-white/[0.06] border border-white/10 px-3 py-1.5 text-xs font-bold text-white">
                      {isLoadingBalance ? '...' : `€${creditBalance.toFixed(2)}`}
                    </Link>
                    <Link to={accountLink} onClick={onClose} title={accountLabel} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] border border-white/10 text-gray-200 hover:text-white">
                      <UserCircleIcon className="w-5 h-5" />
                    </Link>
                    <button onClick={handleLogout} title={t('Sign_Out')} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] border border-white/10 text-gray-300 hover:text-white">
                      <SignOutIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] tracking-[0.25em] uppercase" style={{ color: GOLD }}>{isIt ? 'Esperienze e Accesso Esclusivo' : 'Experiences & Exclusive Access'}</p>
                    <p className="text-sm font-semibold text-white">DR7 Club</p>
                  </div>
                  <Link to="/signin" onClick={onClose} className="flex-shrink-0 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black hover:bg-gray-200 transition-colors">
                    {t('Sign_In')}
                  </Link>
                </div>
              )}
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
                  className="bg-[#1c1c1e] border border-white/[0.08] rounded-[24px] p-7 sm:p-8 max-w-[420px] w-full relative"
                  style={{ boxShadow: '0 0 0 0.5px rgba(255,255,255,0.06), 0 25px 60px -12px rgba(0,0,0,0.7)' }}
                >
                  <button
                    onClick={() => setShowBookingPopup(false)}
                    className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] text-white/40 hover:text-white hover:bg-white/10 transition-all z-10"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <h3 className="text-[20px] font-semibold text-white text-center mb-1 tracking-tight">{h('popup_title_it', 'popup_title_en')}</h3>
                  <p className="text-[13px] text-white/30 text-center mb-6">{h('popup_subtitle_it', 'popup_subtitle_en')}</p>
                  <BookingSearchBox variant="popup" onClose={() => { setShowBookingPopup(false); onClose(); }} />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </AnimatePresence>
  );
};

const Header: React.FC = () => {
  const { t, lang } = useTranslation();
  const { user, logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [copy, setCopy] = useState<HeaderCopy | null>(null);

  useEffect(() => {
    let cancelled = false;
    getHeaderCopy().then((c) => { if (!cancelled) setCopy(c); });
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

  // Fetch credit balance when user is logged in + refresh on navigation/focus
  useEffect(() => {
    if (!user?.id) {
      setCreditBalance(0);
      return;
    }

    const fetchBalance = async () => {
      setIsLoadingBalance(true);
      try {
        const balance = await getUserCreditBalance(user.id);
        setCreditBalance(balance);
      } catch (error) {
        console.error('Error fetching credit balance:', error);
        setCreditBalance(0);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    // Fetch on mount
    const timer = setTimeout(fetchBalance, 500);

    // Re-fetch when user returns to tab or navigates
    const handleFocus = () => fetchBalance();
    window.addEventListener('focus', handleFocus);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user?.id]);

  return (
    <>
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${scrolled
            ? 'bg-black/50 backdrop-blur-lg border-b border-gray-800'
            : 'bg-transparent'
          }`}
      >
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          {/* EXPLORE menu button on the left */}
          <div className="flex items-center">
            <button
              onClick={() => setIsMenuOpen(true)}
              aria-label={h('open_menu_aria_it', 'open_menu_aria_en') || 'Open menu'}
              aria-expanded={isMenuOpen}
              className="text-white hover:text-gray-300 font-normal text-sm tracking-wider transition-colors"
            >
              {h('explore_label_it', 'explore_label_en') || 'EXPLORE'}
            </button>
          </div>

          {/* Logo centered */}
          <div className="absolute left-1/2 transform -translate-x-1/2">
            <NavLink to="/" className="flex items-center">
              <img src="/DR7logo1.png" alt={h('logo_alt_it', 'logo_alt_en') || 'DR7 Logo'} className="h-14 md:h-16 w-auto" />
            </NavLink>
          </div>

          {/* User controls on the right */}
          <div className="flex items-center space-x-4">
            <AnimatePresence mode="wait">
              {user ? (
                <motion.div
                  key="user-controls"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="flex items-center space-x-3"
                >
                  <Link
                    to="/credit-wallet"
                    className="flex items-center gap-2 bg-black text-white px-3 md:px-4 py-2 rounded-full font-bold text-xs hover:bg-gray-900 transition-colors border border-gray-700"
                  >
                    <span className="hidden md:inline">{h('credit_wallet_pill_it', 'credit_wallet_pill_en') || 'Credit Wallet'}</span>
                    <span className="bg-black text-white px-2 py-0.5 rounded-full text-xs">
                      {isLoadingBalance ? '...' : `€${creditBalance.toFixed(2)}`}
                    </span>
                  </Link>
                  <Link
                    to={user.role === 'business' ? '/partner/dashboard' : '/account'}
                    className="hidden md:flex items-center justify-center w-9 h-9 bg-gray-800/70 border border-gray-700 rounded-full text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
                    title={
                      user.role === 'business' ? t('Partner_Dashboard') : t('My_Account')
                    }
                  >
                    <UserCircleIcon className="w-5 h-5" />
                  </Link>
                  <button
                    onClick={logout}
                    className="hidden md:flex items-center justify-center w-9 h-9 bg-gray-800/70 border border-gray-700 rounded-full text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
                    title={t('Sign_Out')}
                  >
                    <SignOutIcon className="w-5 h-5" />
                  </button>
                </motion.div>
              ) : (
                <Link
                  to="/signin"
                  className="hidden md:block bg-white text-black px-5 py-2 rounded-full font-bold text-sm hover:bg-gray-200 transition-colors"
                >
                  {t('Sign_In')}
                </Link>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.header>

      {copy && <NavigationMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} copy={copy} />}
    </>
  );
};

export default Header;

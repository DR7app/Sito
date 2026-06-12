import React, { useState, useEffect } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { UserCircleIcon, SignOutIcon } from '../icons/Icons';
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
  const { hasBoats, hasHelis } = useNoleggioCatalog();

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
            className="fixed top-0 left-0 bottom-0 w-full max-w-sm bg-[#0a0a0a] border-r border-white/10 shadow-2xl flex flex-col px-5 py-8 overflow-y-auto"
          >
            {/* Logo centered at top */}
            <div className="flex flex-col items-center mb-8">
              <NavLink to="/" onClick={onClose} className="mb-6">
                <img src="/DR7logo1.png" alt={copy.logo_alt} className="h-14 md:h-16 w-auto" />
              </NavLink>
              <button
                onClick={onClose}
                aria-label={h('close_menu_aria_it', 'close_menu_aria_en')}
                className="absolute top-6 right-6 text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-800"
              >

              </button>
            </div>

            {/* Sign In/Sign Up Button at Top (when not logged in) */}
            {!user && (
              <div className="mb-6 pb-6 border-b border-gray-800">
                <Link
                  to="/signin"
                  onClick={onClose}
                  className="flex items-center justify-center w-full bg-white text-black py-4 rounded-full font-bold text-base hover:bg-gray-200 transition-all duration-300 shadow-lg hover:shadow-xl"
                >
                  {t('Sign_In')}
                </Link>
                <p className="text-center text-xs text-gray-400 mt-3">
                  {t('New_here')}? <Link to="/signin" onClick={onClose} className="text-white underline hover:text-gray-300">{t('Create_account')}</Link>
                </p>
              </div>
            )}

            <nav className="flex-grow flex flex-col space-y-5">
              {/* PRENOTA ORA — richiede autenticazione. Se non loggato
                  reindirizza a /signin con returnTo che riapre il popup. */}
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
                className="w-full py-3 border border-white text-white font-semibold text-sm tracking-wider rounded-full hover:bg-white hover:text-black active:scale-[0.98] transition-all duration-300"
              >
                {h('drawer_book_cta_it', 'drawer_book_cta_en')}
              </button>

              {/* LA NOSTRA FLOTTA — link al primo categoria selezionata in
                  Sito > Flotta (fallback a /supercar-luxury se nulla
                  selezionato). */}
              <div className="flex flex-col items-center space-y-2 pb-5 border-b border-white/[0.06]">
                <NavLink to={flottaLanding} onClick={onClose} className="text-[13px] font-medium text-gray-400 hover:text-white tracking-widest uppercase transition-all duration-200">
                  {h('flotta_label_it', 'flotta_label_en')}
                </NavLink>
              </div>

              {/* SERVIZI & MOBILITÀ DI LUSSO — lista dinamica delle
                  categorie veicolo da admin > Sito > Flotta, piu'
                  Yachting/Aviation fissi (non sono categorie veicolari). */}
              <div className="border-b border-white/[0.06] pb-5">
                <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.2em] mb-2 pl-3">
                  {h('servizi_heading_it', 'servizi_heading_en')}
                </h3>
                <div className="space-y-1">
                  {flottaCats.map(c => (
                    <NavLink key={c.id} to={c.path} onClick={onClose} className={navLinkClasses}>
                      <span>{c.label}</span>
                    </NavLink>
                  ))}
                  <NavLink to="/yachts" onClick={onClose} className={navLinkClasses}>
                    <span>Yachting Division</span>
                  </NavLink>
                  <NavLink to="/jets" onClick={onClose} className={navLinkClasses}>
                    <span>Aviation Division</span>
                  </NavLink>
                </div>
              </div>

              {/* ESPERIENZE & ACCESSO ESCLUSIVO */}
              <div className="border-b border-white/[0.06] pb-5">
                <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.2em] mb-2 pl-3">
                  {h('esperienze_heading_it', 'esperienze_heading_en')}
                </h3>
                <div className="space-y-1">
                  <NavLink to="/membership" onClick={onClose} className={navLinkClasses}>
                    <span>DR7 Club</span>
                  </NavLink>
                  <NavLink to="/credit-wallet" onClick={onClose} className={navLinkClasses}>
                    <span className="flex items-center justify-between w-full">
                      <span>DR7 Credit Wallet</span>
                      {user && (
                        <span className="ml-2 px-3 py-0.5 bg-gray-800 border border-gray-700 rounded-full text-white text-xs font-bold">
                          {isLoadingBalance ? '...' : `€${creditBalance.toFixed(2)}`}
                        </span>
                      )}
                    </span>
                  </NavLink>
                  <NavLink
                    to={user ? '/account/referral' : '/signin'}
                    state={user ? undefined : { from: { pathname: '/account/referral' } }}
                    onClick={onClose}
                    className={navLinkClasses}
                  >
                    <span>DR7 Referral</span>
                  </NavLink>
                </div>
              </div>

              {/* NOLEGGIO MARE & ARIA — visibili SOLO se il catalogo admin
                  (noleggio_catalog) ha elementi attivi. */}
              {(hasBoats || hasHelis) && (
                <div className="border-b border-white/[0.06] pb-5">
                  <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.2em] mb-2 pl-3">
                    Noleggio
                  </h3>
                  <div className="space-y-1">
                    {hasBoats && (
                      <NavLink to="/noleggio-mare" onClick={onClose} className={navLinkClasses}>
                        <span>Noleggio Mare</span>
                      </NavLink>
                    )}
                    {hasHelis && (
                      <NavLink to="/noleggio-aria" onClick={onClose} className={navLinkClasses}>
                        <span>Noleggio Aria</span>
                      </NavLink>
                    )}
                  </div>
                </div>
              )}

              {/* PRIME WASH */}
              <div className="border-b border-white/[0.06] pb-5">
                <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.2em] mb-2 pl-3">
                  {h('prime_wash_heading_it', 'prime_wash_heading_en')}
                </h3>
                <div className="space-y-1">
                  <NavLink to="/prime-wash" onClick={onClose} className={navLinkClasses}>
                    <span>Detailing & Wash</span>
                  </NavLink>
                  <NavLink to="/prime-wash#mechanical" onClick={onClose} className={navLinkClasses}>
                    <span>Mechanical & Body Repair</span>
                  </NavLink>
                  <NavLink to="/prime-wash#courtesy" onClick={onClose} className={navLinkClasses}>
                    <span>Courtesy Car Service</span>
                  </NavLink>
                </div>
              </div>

              {/* BUSINESS & CORPORATE */}
              <div className="border-b border-white/[0.06] pb-5">
                <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.2em] mb-2 pl-3">
                  {h('business_heading_it', 'business_heading_en')}
                </h3>
                <div className="space-y-1">
                  <NavLink to="/franchising" onClick={onClose} className={navLinkClasses}>
                    <span>Global Franchising</span>
                  </NavLink>
                  <NavLink to="/investitori" onClick={onClose} className={navLinkClasses}>
                    <span>Investor Relations</span>
                  </NavLink>
                </div>
              </div>

              {/* DIGITAL INNOVATION */}
              <div className="border-b border-white/[0.06] pb-5">
                <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.2em] mb-2 pl-3">
                  {h('digital_heading_it', 'digital_heading_en')}
                </h3>
                <div className="space-y-1">
                  <NavLink to="/token" onClick={onClose} className={navLinkClasses}>
                    <span>Digital Asset & Token Division</span>
                  </NavLink>
                </div>
              </div>

              {/* CONTATTACI */}
              <div className="pt-2">
                <NavLink to="/contact" onClick={onClose} className="block py-3 text-center text-[13px] font-medium text-gray-400 hover:text-white tracking-widest uppercase rounded-lg hover:bg-white/5 transition-all duration-200">
                  {h('contact_cta_it', 'contact_cta_en')}
                </NavLink>
              </div>
            </nav>

            {/* Dead code removed — popup uses BookingSearchBox now */}

            <div className="mt-auto pt-8 border-t border-gray-800">
              {user && (
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold">
                      {userFullName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-white">{userFullName}</p>
                      <p className="text-xs text-gray-400">{user.email}</p>
                    </div>
                  </div>
                  <Link
                    to={accountLink}
                    onClick={onClose}
                    className="flex items-center justify-center w-full bg-gray-800 text-white py-3 rounded-full font-bold text-sm hover:bg-gray-700"
                  >
                    {accountLabel}
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex items-center justify-center w-full bg-gray-200 text-black py-3 rounded-full font-bold text-sm hover:bg-white"
                  >
                    {t('Sign_Out')}
                  </button>
                </div>
              )}
              <div className={`flex justify-between items-center ${user ? 'mt-6' : ''}`}>
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

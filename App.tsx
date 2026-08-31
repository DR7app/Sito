import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { LanguageProvider } from './contexts/LanguageContext';
import { CurrencyProvider } from './contexts/CurrencyContext';
import { BookingProvider } from './contexts/BookingContext';
import { AuthProvider } from './contexts/AuthContext';
// Nexi payment - no Stripe imports needed
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import HomePage from './pages/HomePage';
import RentalPage from './pages/RentalPage';
import FlottaIndexPage from './pages/FlottaIndexPage';
import NoleggioServicePage from './pages/NoleggioServicePage';
import MembershipPage from './pages/MembershipPage';
import { RENTAL_CATEGORIES } from './constants';
import { AnimatePresence, motion } from 'framer-motion';
import BookingModal from './components/ui/BookingModal';
import CarBookingWizard from './components/ui/CarBookingWizard';
import CarBookingConfirmationPage from './components/ui/CarBookingConfirmationPage';
import { useBooking } from './hooks/useBooking';
import BookingPage from './pages/BookingPage';

import AboutPage from './pages/AboutPage';
import TermsOfServicePage from './pages/TermsOfServicePage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import RentalAgreementPage from './pages/RentalAgreementPage';
import CookiePolicyPage from './pages/CookiePolicyPage';
import CareersPage from './pages/CareersPage';
import FranchisingPage from './pages/FranchisingPage';
import PressPage from './pages/PressPage';
import FAQPage from './pages/FAQPage';
import ContactPage from './pages/ContactPage';
import AuthPage from './pages/AuthPage';
import SignUpPage from './pages/SignUpPage';
import ScrollToTop from './components/routing/ScrollToTop';
import PostPage from './pages/PostPage';
import JetSearchResultsPage from './pages/JetSearchResultsPage';
import AviationQuoteRequestPage from './pages/AviationQuoteRequestPage';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AccountPage from './pages/AccountPage';
import ProfileSettings from './pages/account/ProfileSettings';
import SecuritySettings from './pages/account/SecuritySettings';
import DocumentsVerification from './pages/account/DocumentsVerification';
import MembershipStatus from './pages/account/MembershipStatus';
import NotificationSettings from './pages/account/NotificationSettings';
import MembershipEnrollmentPage from './pages/MembershipEnrollmentPage';
import { VerificationProvider } from './contexts/VerificationContext';
import VerificationModal from './components/ui/VerificationModal';
import PartnerDashboardLayout from './layouts/PartnerDashboardLayout';
import PartnerDashboardPage from './pages/partner/PartnerDashboardPage';
import CreateListingPage from './pages/partner/CreateListingPage';
import PartnerVerificationPage from './pages/partner/PartnerVerificationPage';
import PartnerProfileSettings from './pages/partner/settings/PartnerProfileSettings';
import PartnerSecuritySettings from './pages/partner/settings/PartnerSecuritySettings';
import PartnerNotificationSettings from './pages/partner/settings/PartnerNotificationSettings';
import PartnerPayoutSettings from './pages/partner/settings/PartnerPayoutSettings';
import CookieBanner from './components/ui/CookieBanner';
import AutoBookingPopup from './components/ui/AutoBookingPopup';
import HeliTourPopup from './components/ui/HeliTourPopup';
import { useAuth } from './hooks/useAuth';
import AuthCallbackPage from './pages/AuthCallbackPage';
import { DR7AIFloatingButton } from './components/ui/DR7AIChat';
import MarketingConsentModal from './components/ui/MarketingConsentModal';
import { supabase } from './supabaseClient';
import { resolveFlottaCategories } from './utils/flottaConfig';
import { HelmetProvider } from 'react-helmet-async';

import CancellationPolicyPage from './pages/CancellationPolicyPage';
import MyBookings from './pages/account/MyBookings';
import MyPreventivi from './pages/account/MyPreventivi';
import DR7Club from './pages/account/DR7Club';
import ReferralProgram from './pages/account/ReferralProgram';
import ConfirmationSuccessPage from './pages/ConfirmationSuccessPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import RegistrazioneClientePage from './pages/RegistrazioneClientePage';
import AuthVerifyPage from './pages/AuthVerifyPage';
import CheckEmailPage from './pages/CheckEmailPage';
import CarWashServicesPage from './pages/CarWashServicesPage';
import CarWashBookingPage from './pages/CarWashBookingPage';
import ContactPage from './pages/ContactPage';
import MechanicalServicesPage from './pages/MechanicalServicesPage';
import MechanicalBookingPage from './pages/MechanicalBookingPage';
import InvestitoriPage from './pages/InvestitoriPage';
import TokenPage from './pages/TokenPage';
import CreditWalletPage from './pages/CreditWalletPage';
import PaymentSuccessPage from './pages/PaymentSuccessPage';
import PaymentCancelPage from './pages/PaymentCancelPage';
import PaymentPage from './pages/PaymentPage';
import FirmaPage from './pages/FirmaPage';



const AuthRedirector: React.FC = () => {
  const { user, authEvent } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // 1. Handle password recovery link
    if (authEvent === 'PASSWORD_RECOVERY' && location.pathname !== '/reset-password') {
      navigate('/reset-password', { replace: true });
      return;
    }

    // 2. Handle successful OAuth sign-in
    if (user && sessionStorage.getItem('oauth_in_progress')) {
      sessionStorage.removeItem('oauth_in_progress');
      const destination = user.role === 'business' ? '/partner/dashboard' : '/account';
      if (location.pathname !== destination) {
        navigate(destination, { replace: true });
      }
    }
  }, [user, authEvent, navigate, location.pathname]);

  return null;
};

// Marketing Consent Popup Manager - shows popup to logged-in users who haven't consented yet
const ConsentPopupManager: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [showConsentModal, setShowConsentModal] = React.useState(false);
  const [hasCheckedConsent, setHasCheckedConsent] = React.useState(false);

  useEffect(() => {
    const checkConsent = async () => {
      if (!user?.id || hasCheckedConsent) return;

      // Check if user already has marketing consent in their metadata
      if (user.notifications?.marketingConsent === true) {
        setHasCheckedConsent(true);
        return;
      }

      // Check if user has an active consent in user_consents table
      try {
        const { data: existingConsent } = await supabase
          .from('user_consents')
          .select('id')
          .eq('user_id', user.id)
          .eq('consent_type', 'marketing_partner')
          .eq('status', 'active')
          .single();

        if (existingConsent) {
          // User has consent, update metadata to sync
          setHasCheckedConsent(true);
          return;
        }

        // Check session storage to avoid showing popup multiple times in same session
        const dismissedThisSession = sessionStorage.getItem('consent_popup_dismissed');
        if (dismissedThisSession) {
          setHasCheckedConsent(true);
          return;
        }

        // No consent found, show popup after a short delay
        setTimeout(() => {
          setShowConsentModal(true);
        }, 2000);

      } catch (error) {
        // Table might not exist yet or other error, don't show popup
        console.log('[ConsentPopup] Could not check consent:', error);
      }

      setHasCheckedConsent(true);
    };

    checkConsent();
  }, [user, hasCheckedConsent]);

  const handleConfirm = async () => {
    // Update user metadata for quick checks
    if (user) {
      await updateUser({
        notifications: {
          ...user.notifications,
          marketingConsent: true,
          specialOffers: true,
          newsletter: true,
        }
      });

      // Also update customers_extended for backward compatibility
      try {
        await supabase
          .from('customers_extended')
          .update({
            notifications: {
              bookingConfirmations: true,
              specialOffers: true,
              newsletter: true,
              marketingConsent: true
            }
          })
          .eq('id', user.id);
      } catch (e) {
        console.error('Error updating customers_extended:', e);
      }
    }

    setShowConsentModal(false);
  };

  const handleClose = () => {
    // Mark as dismissed for this session so we don't annoy the user
    sessionStorage.setItem('consent_popup_dismissed', 'true');
    setShowConsentModal(false);
  };

  if (!user) return null;

  return (
    <MarketingConsentModal
      isOpen={showConsentModal}
      userId={user.id}
      onConfirm={handleConfirm}
      onClose={handleClose}
    />
  );
};

const AnimatedRoutes = () => {
  const location = useLocation();

  React.useEffect(() => {
    if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
      (window as any).gtag('event', 'page_view', {
        page_path: location.pathname + location.search,
        page_location: window.location.href,
        page_title: document.title,
      });
    }
  }, [location.pathname, location.search]);

  // Carica le categorie dalle Centralina Pro (admin-editabili).
  // Ogni categoria genera automaticamente una route /<id> che apre la
  // RentalPage filtrata per quella categoria → veicoli sempre visibili
  // sul sito senza modifiche al codice.
  // Il catalogo arriva dalla stessa lettura usata da Sito e Flotta
  // (utils/flottaConfig -> siteCopy.loadCentralinaConfigOnce): una sola
  // richiesta per pagina invece di una per consumer, e nessun rischio che
  // App e pagina Flotta leggano due versioni diverse della stessa riga.
  const [dynamicCategories, setDynamicCategories] = React.useState<{ id: string; label: string }[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    resolveFlottaCategories().then(res => {
      if (cancelled) return;
      // Le route si generano per TUTTE le categorie del catalogo, non solo
      // per quelle visibili: nascondere una categoria dalla vetrina non deve
      // rompere un link gia' condiviso verso /<id>.
      setDynamicCategories(res.allCategories);
    });
    return () => { cancelled = true; };
  }, []);

  // Path gia' coperti da route esplicite (legacy + service pages).
  // Non duplichiamo le Route per le categorie con id che coincide con queste.
  const RESERVED_PATHS = new Set([
    'cars', 'urban-cars', 'corporate-fleet', 'supercar-luxury', 'urban',
    'car-wash-services', 'prime-wash', 'mechanical-services',
    'membership', 'credit-wallet',
    'yachts', 'villas', 'jets', 'helicopters',
    'aviation-quote', 'contact', 'flotta',
  ]);

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<HomePage />} />
        <Route path="/jets/search" element={<JetSearchResultsPage />} />
        <Route path="/jets/quote" element={<AviationQuoteRequestPage />} />
        <Route path="/helicopters/quote" element={<AviationQuoteRequestPage />} />
        <Route path="/aviation-quote" element={<AviationQuoteRequestPage />} />
        {/* Canonical SEO-friendly routes */}
        <Route path="/flotta" element={<FlottaIndexPage />} />
        {/* Noleggio Mare / Aria — pagine DINAMICHE dal catalogo admin
            (noleggio_catalog). Catalogo vuoto => pagina non mostra nulla. */}
        <Route path="/noleggio-mare" element={<NoleggioServicePage serviceType="boat_rental" title={{ it: "Noleggio Mare", en: "Sea Rentals" }} subtitle={{ it: "La nostra selezione di imbarcazioni per il tuo charter in Sardegna.", en: "Our selection of boats for your charter in Sardinia." }} asset={{ it: "la barca", en: "the boat" }} />} />
        <Route path="/noleggio-aria" element={<NoleggioServicePage serviceType="heli_rental" title={{ it: "Noleggio Aria", en: "Air Rentals" }} subtitle={{ it: "Elicotteri e voli privati su misura, con il nostro servizio dedicato.", en: "Helicopters and bespoke private flights, with our dedicated service." }} asset={{ it: "l'elicottero", en: "the helicopter" }} />} />
        <Route path="/soggiorni" element={<NoleggioServicePage serviceType="stay_rental" title={{ it: "Soggiorni & Ospitalità", en: "Stays & Hospitality" }} subtitle={{ it: "Case, ville e alloggi selezionati per il tuo soggiorno in Sardegna.", en: "Selected homes, villas and accommodation for your stay in Sardinia." }} asset={{ it: "l'alloggio", en: "the accommodation" }} />} />
        <Route path="/supercar-luxury" element={<RentalPage categoryId="cars" />} />
        <Route path="/urban" element={<Navigate to="/supercar-luxury" replace />} />
        <Route path="/prime-wash" element={<CarWashServicesPage />} />
        <Route path="/contact" element={<ContactPage />} />

        {/* Legacy redirects */}
        <Route path="/cars" element={<Navigate to="/supercar-luxury" replace />} />
        <Route path="/urban-cars" element={<Navigate to="/urban" replace />} />
        <Route path="/car-wash-services" element={<Navigate to="/prime-wash" replace />} />

        <Route path="/car-wash-booking" element={<CarWashBookingPage />} />
        <Route path="/mechanical-services" element={<MechanicalServicesPage />} />
        <Route path="/mechanical-booking" element={<MechanicalBookingPage />} />
        {RENTAL_CATEGORIES
          .filter(category => !['cars', 'urban-cars', 'car-wash-services', 'mechanical-services', 'membership', 'credit-wallet'].includes(category.id))
          .map(category => (
            <Route
              key={category.id}
              path={`/${category.id}`}
              element={<RentalPage categoryId={category.id} />}
            />
          ))}
        {/* Route dinamiche per ogni categoria definita in Centralina Pro
            (admin → Veicoli → Categorie). Aggiungere una nuova categoria
            in admin abilita automaticamente /<id> sul sito, con la lista
            dei veicoli della categoria. Non sovrascrivere le route legacy
            (RESERVED_PATHS). */}
        {dynamicCategories
          .filter(c => !RESERVED_PATHS.has(c.id))
          .map(c => (
            <Route
              key={`dyn-${c.id}`}
              path={`/${c.id}`}
              element={<RentalPage categoryId={c.id} />}
            />
          ))}
        <Route
          path="/book/:category/:itemId"
          element={<ProtectedRoute><BookingPage /></ProtectedRoute>}
        />
        <Route path="/membership" element={<MembershipPage />} />
        <Route path="/membership/enroll/:tierId" element={
          <ProtectedRoute>
            <MembershipEnrollmentPage />
          </ProtectedRoute>
        } />
        <Route path="/credit-wallet" element={<CreditWalletPage />} />
        <Route
          path="/cancellation-policy"
          element={<CancellationPolicyPage />}
        />
        <Route path="/account" element={
          <ProtectedRoute role="personal">
            <AccountPage />
          </ProtectedRoute>
        }>
          <Route index element={<ProfileSettings />} />
          <Route path="profile" element={<ProfileSettings />} />
          <Route path="security" element={<SecuritySettings />} />
          <Route path="documents" element={<DocumentsVerification />} />
          <Route path="club" element={<DR7Club />} />
          <Route path="membership" element={<MembershipStatus />} />
          <Route path="bookings" element={<MyBookings />} />
          <Route path="preventivi" element={<MyPreventivi />} />
          <Route path="referral" element={<ReferralProgram />} />
          <Route path="notifications" element={<NotificationSettings />} />
        </Route>

        <Route path="/partner" element={
          <ProtectedRoute role="business">
            <PartnerDashboardLayout />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="/partner/dashboard" replace />} />
          <Route path="dashboard" element={<PartnerDashboardPage />} />
          <Route path="listings/new" element={<CreateListingPage />} />
          <Route path="verification" element={<PartnerVerificationPage />} />
          <Route path="settings" element={<Navigate to="/partner/settings/profile" replace />} />
          <Route path="settings/profile" element={<PartnerProfileSettings />} />
          <Route path="settings/security" element={<PartnerSecuritySettings />} />
          <Route path="settings/notifications" element={<PartnerNotificationSettings />} />
          <Route path="settings/payouts" element={<PartnerPayoutSettings />} />
        </Route>

        <Route path="/about" element={<AboutPage />} />
        <Route path="/investitori" element={<InvestitoriPage />} />
        <Route path="/token" element={<TokenPage />} />
        <Route path="/terms" element={<TermsOfServicePage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/rental-agreement" element={<RentalAgreementPage />} />
        <Route path="/cookie-policy" element={<CookiePolicyPage />} />
        <Route path="/careers" element={<CareersPage />} />
        <Route path="/franchising" element={<FranchisingPage />} />
        <Route path="/press" element={<PressPage />} />
        <Route path="/faq" element={<FAQPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/signin" element={<AuthPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/registrazione-cliente/:token" element={<RegistrazioneClientePage />} />
        <Route path="/check-email" element={<CheckEmailPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/auth/v1/verify" element={<AuthVerifyPage />} />
        <Route path="/confirmation-success" element={<ConfirmationSuccessPage />} />
        <Route path="/car-booking-success" element={<CarBookingConfirmationPage />} />
        <Route path="/booking-success" element={<ConfirmationSuccessPage />} />
        <Route path="/pay" element={<PaymentPage />} />
        <Route path="/payment-success" element={<PaymentSuccessPage />} />
        <Route path="/payment-cancel" element={<PaymentCancelPage />} />
        <Route path="/post/:id" element={<PostPage />} />
      </Routes>
    </AnimatePresence>
  );
};

const PageWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
      className="min-h-screen"
    >
      {children}
    </motion.div>
  );
};

// Nexi payment - no Stripe promise needed

const MainContent = () => {
  const { isCarWizardOpen, closeCarWizard, selectedCar, wizardCategory } = useBooking();
  const navigate = useNavigate();

  const handleBookingComplete = (booking: any) => {
    closeCarWizard();
    navigate('/car-booking-success', { state: { booking } });
  };

  return (
    <>
      <div className="bg-black min-h-screen font-sans antialiased relative overflow-x-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-grid-white/[0.05] z-0"></div>
        <div className="relative z-10 flex flex-col min-h-screen">
          <Header />
          <main className="flex-grow">
            <AnimatedRoutes />
          </main>
          <Footer />
        </div>
        <BookingModal />
        <VerificationModal />
        <CookieBanner />
        <ConsentPopupManager />
        <AutoBookingPopup />
        <HeliTourPopup />
        <DR7AIFloatingButton />
        <AnimatePresence>
          {isCarWizardOpen && selectedCar && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto"
            >
              <motion.div
                initial={{ scale: 0.95, y: -30 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: -30 }}
                className="relative w-full max-w-7xl mx-auto my-6"
              >
                <CarBookingWizard
                  item={selectedCar}
                  categoryContext={wizardCategory || undefined}
                  onClose={closeCarWizard}
                  onBookingComplete={handleBookingComplete}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};


const App = () => {
  return (
    <HelmetProvider>
    <LanguageProvider>
      <CurrencyProvider>
        <BookingProvider>
          <AuthProvider>
            <VerificationProvider>
              <BrowserRouter>
                <ScrollToTop />
                <Routes>
                  <Route path="/firma/:token" element={<FirmaPage />} />
                  <Route path="*" element={<><AuthRedirector /><MainContent /></>} />
                </Routes>
              </BrowserRouter>
            </VerificationProvider>
          </AuthProvider>
        </BookingProvider>
      </CurrencyProvider>
    </LanguageProvider>
    </HelmetProvider>
  );
};

export default App;

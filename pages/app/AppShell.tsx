import React, { useEffect, useState } from 'react';
import { Routes, Route, NavLink, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import './app.css';

import { useAuth } from '../../hooks/useAuth';
import { useBooking } from '../../hooks/useBooking';
import { useTranslation } from '../../hooks/useTranslation';
import { getAspettoCopy, DEFAULT_ASPETTO, type AspettoCopy } from '../../utils/siteCopy';

import CarBookingWizard from '../../components/ui/CarBookingWizard';
import BookingModal from '../../components/ui/BookingModal';
import VerificationModal from '../../components/ui/VerificationModal';
import CarrelloDrawer from '../../components/ui/CarrelloDrawer';

// Pagine del sito riusate cosi' come sono: stessa logica, stessi dati.
import NoleggioServicePage from '../NoleggioServicePage';
import CarWashServicesPage from '../CarWashServicesPage';
import PrevenditePage from '../PrevenditePage';
import MembershipPage from '../MembershipPage';
import CreditWalletPage from '../CreditWalletPage';
import AuthPage from '../AuthPage';
import SignUpPage from '../SignUpPage';
import ForgotPasswordPage from '../ForgotPasswordPage';
import CarBookingConfirmationPage from '../../components/ui/CarBookingConfirmationPage';
import MyBookings from '../account/MyBookings';
import ProfileSettings from '../account/ProfileSettings';
import DocumentsVerification from '../account/DocumentsVerification';
import NotificationSettings from '../account/NotificationSettings';
import MiePrevendite from '../account/MiePrevendite';
import DR7Club from '../account/DR7Club';

import AppHome from './AppHome';
import AppTerra from './AppTerra';
import AppVeicolo from './AppVeicolo';
import AppViaggi from './AppViaggi';
import AppConcierge from './AppConcierge';
import AppAccount from './AppAccount';
import { startPush, linkPushToUser } from './appPush';

const Icon = {
  home: <path d="M4 11 12 4l8 7v9H4z" />,
  terra: (<><path d="M3 15h18l-1.6-4.3A2 2 0 0 0 17.5 9.4H8.2a2 2 0 0 0-1.6.8L4 13.5" /><circle cx="7.5" cy="16.5" r="1.7" /><circle cx="16.5" cy="16.5" r="1.7" /></>),
  concierge: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  viaggi: (<><rect x="4" y="5" width="16" height="15" /><path d="M8 3v4M16 3v4M4 10h16" /></>),
  account: (<><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c1-4 4-6 7-6s6 2 7 6" /></>),
};

const TABS: Array<{ to: string; key: keyof typeof Icon; it: string; en: string }> = [
  { to: '/app', key: 'home', it: 'Home', en: 'Home' },
  { to: '/app/terra', key: 'terra', it: 'Terra', en: 'Land' },
  { to: '/app/concierge', key: 'concierge', it: 'Concierge', en: 'Concierge' },
  { to: '/app/viaggi', key: 'viaggi', it: 'Viaggi', en: 'Trips' },
  { to: '/app/account', key: 'account', it: 'Account', en: 'Account' },
];

/** Le sezioni con la barra in basso; le altre hanno la freccia indietro. */
const TAB_ROOTS = new Set(TABS.map((t) => t.to));

/** Come ProtectedRoute del sito, ma l'accesso si fa dentro l'app. */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-[50vh]" aria-busy="true" />;
  if (!user) return <Navigate to="/app/accedi" state={{ from: location }} replace />;
  return <>{children}</>;
};

/** Pagina del sito riusata dentro la cornice dell'app. */
const Embed: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="app-embed">{children}</div>
);

const AppShell: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { isCarWizardOpen, closeCarWizard, selectedCar, wizardCategory } = useBooking();
  const [aspetto, setAspetto] = useState<Required<AspettoCopy>>(DEFAULT_ASPETTO);
  const [solid, setSolid] = useState(false);

  useEffect(() => { getAspettoCopy().then(setAspetto).catch(() => undefined); }, []);

  // Notifiche: si avviano una volta; il token si lega al cliente quando entra.
  useEffect(() => { void startPush(user?.id ?? null, (url) => navigate(url)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void linkPushToUser(user?.id ?? null); }, [user?.id]);

  // La barra in alto diventa piena quando la pagina scorre.
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [location.pathname]);
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  const path = location.pathname.replace(/\/+$/, '') || '/app';
  const isRoot = TAB_ROOTS.has(path);
  const isHome = path === '/app';
  const isVehicle = path.startsWith('/app/auto/');

  const handleBookingComplete = (booking: unknown) => {
    closeCarWizard();
    navigate('/app/confermata', { state: { booking } });
  };

  return (
    <div className="dr7app font-sans antialiased">
      <Helmet>
        <title>DR7</title>
        <meta name="robots" content="noindex" />
        <meta name="theme-color" content="#000000" />
      </Helmet>

      <header className={`app-top ${solid || !isHome ? 'solid' : ''}`}>
        <div>
          {isRoot ? (
            <NavLink to="/app/account" className="t-nav">{t({ it: 'Menu', en: 'Menu' })}</NavLink>
          ) : (
            <button className="back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/app'))} aria-label={t({ it: 'Indietro', en: 'Back' })}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="m15 6-6 6 6 6" /></svg>
            </button>
          )}
        </div>
        <NavLink to="/app" aria-label="DR7">
          <img src={aspetto.logo_url} alt="DR7" className="app-logo logo-bianco" />
        </NavLink>
        <div className="end">
          <NavLink to="/app/prevendite" className="t-nav" style={{ color: '#e5322d' }}>{t({ it: 'Offerte', en: 'Offers' })}</NavLink>
        </div>
      </header>

      <main className={`app-main ${isHome ? '' : 'with-top'}`}>
        <Routes>
          <Route index element={<AppHome />} />
          <Route path="terra" element={<AppTerra />} />
          <Route path="auto/:id" element={<AppVeicolo />} />
          <Route path="concierge" element={<AppConcierge />} />
          <Route path="viaggi" element={<ProtectedRoute><AppViaggi /></ProtectedRoute>} />
          <Route path="viaggi/gestisci" element={<ProtectedRoute><Embed><MyBookings /></Embed></ProtectedRoute>} />
          <Route path="viaggi/prevendite" element={<ProtectedRoute><Embed><MiePrevendite /></Embed></ProtectedRoute>} />
          <Route path="account" element={<AppAccount />} />
          <Route path="account/profilo" element={<ProtectedRoute><Embed><ProfileSettings /></Embed></ProtectedRoute>} />
          <Route path="account/documenti" element={<ProtectedRoute><Embed><DocumentsVerification /></Embed></ProtectedRoute>} />
          <Route path="account/notifiche" element={<ProtectedRoute><Embed><NotificationSettings /></Embed></ProtectedRoute>} />
          <Route path="club" element={<Embed><MembershipPage /></Embed>} />
          <Route path="club/area" element={<ProtectedRoute><Embed><DR7Club /></Embed></ProtectedRoute>} />
          <Route path="wallet" element={<Embed><CreditWalletPage /></Embed>} />
          <Route path="prevendite" element={<Embed><PrevenditePage /></Embed>} />
          <Route path="mare" element={<Embed><NoleggioServicePage serviceType="boat_rental" heroVideo={{ src: '/video-mare.mp4', poster: '/video-mare-poster.jpg' }} /></Embed>} />
          <Route path="aria" element={<Embed><NoleggioServicePage serviceType="heli_rental" heroVideo={{ src: '/video-aria.mp4', poster: '/video-aria-poster.jpg' }} /></Embed>} />
          <Route path="soggiorni" element={<Embed><NoleggioServicePage serviceType="stay_rental" heroVideo={{ src: '/video-soggiorni.mp4', poster: '/video-soggiorni-poster.jpg' }} /></Embed>} />
          <Route path="lavaggio" element={<Embed><CarWashServicesPage /></Embed>} />
          <Route path="accedi" element={<Embed><AuthPage /></Embed>} />
          <Route path="registrati" element={<Embed><SignUpPage /></Embed>} />
          <Route path="password" element={<Embed><ForgotPasswordPage /></Embed>} />
          <Route path="confermata" element={<Embed><CarBookingConfirmationPage /></Embed>} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </main>

      {!isVehicle && (
        <nav className="app-tabs" aria-label={t({ it: 'Sezioni', en: 'Sections' })}>
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.to === '/app'} className={({ isActive }) => `app-tab ${isActive ? 'active' : ''}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2}>{Icon[tab.key]}</svg>
              {t({ it: tab.it, en: tab.en })}
            </NavLink>
          ))}
        </nav>
      )}

      <BookingModal />
      <CarrelloDrawer />
      <VerificationModal />

      {/* Lo stesso wizard di prenotazione del sito: prezzi, disponibilita',
          assicurazioni e pagamento Nexi arrivano da Centralina Pro. */}
      <AnimatePresence>
        {isCarWizardOpen && selectedCar && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] overflow-y-auto bg-black"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <CarBookingWizard
              item={selectedCar}
              categoryContext={wizardCategory || undefined}
              onClose={closeCarWizard}
              onBookingComplete={handleBookingComplete}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AppShell;

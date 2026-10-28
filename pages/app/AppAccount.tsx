import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import { useLanguage } from '../../contexts/LanguageContext';
import { getUserCreditBalance } from '../../utils/creditWallet';
import { formatEur } from './appFleet';

const Chevron = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} style={{ opacity: 0.5 }}><path d="m9 6 6 6-6 6" /></svg>
);

/** Le stesse voci del menu del sito, aperte dentro l'app. */
const MENU = [
  { to: '/app/prevendite', it: 'Prevendita e Promozioni', en: 'Presales & Promotions', sit: 'Pacchetti pagati in anticipo e offerte esclusive', sen: 'Prepaid packages and exclusive offers', red: true },
  { to: '/app/terra', it: 'Terra', en: 'Land', sit: 'Auto esclusive per ogni esperienza su strada', sen: 'Exclusive cars for every experience on the road' },
  { to: '/app/mare', it: 'Mare', en: 'Sea', sit: 'Yacht, barche e esperienze esclusive in mare', sen: 'Yachts, boats and exclusive experiences at sea' },
  { to: '/app/aria', it: 'Aria', en: 'Air', sit: 'Voli privati ed elicotteri per viaggiare senza confini', sen: 'Private jets and helicopters to travel without limits' },
  { to: '/app/soggiorni', it: 'Soggiorni & Ospitalità', en: 'Stays & Hospitality', sit: 'Ville, appartamenti e residenze selezionate', sen: 'Villas, apartments and selected residences' },
  { to: '/app/lavaggio', it: 'Lavaggio & Meccanica', en: 'Car Wash & Mechanics', sit: 'Lavaggio auto premium e officina meccanica', sen: 'Premium car wash and mechanical workshop' },
  { to: '/app/wallet', it: 'Credit Wallet', en: 'Credit Wallet', sit: 'Il tuo credito DR7 Wallet per prenotare e ricaricare', sen: 'Your DR7 Wallet credit to book and top up' },
  { to: '/app/club', it: 'DR7 Club', en: 'DR7 Club', sit: 'Accesso esclusivo, eventi riservati e vantaggi unici', sen: 'Exclusive access, private events and unique benefits' },
];

const AppAccount: React.FC = () => {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const L = language === 'it' ? 'it' : 'en';
  const navigate = useNavigate();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => { if (user) getUserCreditBalance(user.id).then(setBalance).catch(() => setBalance(null)); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app-gutter pt-6">
      <span className="t-eyebrow block">{t({ it: 'Account', en: 'Account' })}</span>
      {user ? (
        <>
          <h1 className="t-display mt-4">{user.fullName || user.email}</h1>
          <p className="t-small mt-2" style={{ color: 'var(--fg-dim)' }}>{user.email}</p>
          <Link to="/app/wallet" className="app-panel mt-8 flex items-end justify-between gap-4 p-5">
            <span>
              <span className="t-eyebrow block">DR7 Credit Wallet</span>
              <span className="mt-3 block font-serif" style={{ fontSize: '2.25rem', lineHeight: 1 }}>{balance === null ? '—' : formatEur(balance)}</span>
            </span>
            <span className="t-nav">{t({ it: 'Ricarica', en: 'Top up' })}</span>
          </Link>
          <div className="mt-6">
            {[
              { to: '/app/account/profilo', it: 'Profilo', en: 'Profile' },
              { to: '/app/account/documenti', it: 'Documenti', en: 'Documents' },
              { to: '/app/account/notifiche', it: 'Notifiche', en: 'Notifications' },
              { to: '/app/club/area', it: 'La mia area DR7 Club', en: 'My DR7 Club area' },
              { to: '/app/viaggi/prevendite', it: 'Le mie prevendite', en: 'My presales' },
            ].map((r) => (
              <Link key={r.to} to={r.to} className="app-row"><span className="grow">{L === 'it' ? r.it : r.en}</span><Chevron /></Link>
            ))}
          </div>
        </>
      ) : (
        <>
          <h1 className="t-display mt-4">{t({ it: 'Benvenuto in DR7', en: 'Welcome to DR7' })}</h1>
          <p className="t-body mt-3" style={{ color: 'var(--fg-dim)' }}>{t({ it: 'Accedi per prenotare, vedere i tuoi viaggi e usare il Wallet.', en: 'Sign in to book, see your trips and use your Wallet.' })}</p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <Link to="/app/accedi" state={{ from: { pathname: '/app/account' } }} className="btn btn-primary">{t({ it: 'Accedi', en: 'Sign in' })}</Link>
            <Link to="/app/registrati" className="btn btn-secondary">{t({ it: 'Registrati', en: 'Sign up' })}</Link>
          </div>
        </>
      )}

      <span className="t-eyebrow mt-12 block">Menu</span>
      <div className="mt-2">
        {MENU.map((m) => (
          <Link key={m.to} to={m.to} className="app-row">
            <span className="grow">
              <span className="t-h3 block" style={m.red ? { color: '#e5322d' } : undefined}>{L === 'it' ? m.it : m.en}</span>
              <span className="t-small block" style={{ color: 'var(--fg-dim)' }}>{L === 'it' ? m.sit : m.sen}</span>
            </span>
            <Chevron />
          </Link>
        ))}
      </div>

      <span className="t-eyebrow mt-12 block">{t({ it: 'Contattaci', en: 'Contact us' })}</span>
      <div className="mt-2">
        <div className="app-row"><span className="grow t-small">DR7 S.p.A. · Viale Marconi 229, 09131 Cagliari</span></div>
        <a href="tel:+393457905205" className="app-row"><span className="grow t-meta">+39 345 790 5205</span><Chevron /></a>
        <div className="app-row">
          <span className="grow">{t({ it: 'Lingua', en: 'Language' })}</span>
          <div className="flex gap-2">
            {(['it', 'en'] as const).map((l) => (
              <button key={l} onClick={() => setLanguage(l)} className={`app-chip ${language === l ? 'active' : ''}`} style={{ padding: '0.5rem 0.75rem' }}>{l.toUpperCase()}</button>
            ))}
          </div>
        </div>
      </div>

      {user && (
        <button className="btn btn-text mt-10" onClick={async () => { await logout(); navigate('/app', { replace: true }); }}>
          {t({ it: 'Esci', en: 'Sign out' })}
        </button>
      )}
      <p className="t-eyebrow mt-12 pb-4 text-center">DR7 S.p.A.</p>
    </div>
  );
};

export default AppAccount;

import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { useAuth } from '../hooks/useAuth';
import SfondoVideo from '../components/ui/SfondoVideo';
import { useFilmato } from '../hooks/useFilmato';

const AccountPage = () => {
    const { t } = useTranslation();
    const { user, logout } = useAuth();
    const location = useLocation();

    const navItems = [
        { path: '/account/profile', label: t('Profile') },
        { path: '/account/security', label: t('Security') },
        { path: '/account/documents', label: t('Documents') },
        { path: '/account/club', label: 'DR7 Club' },
        // Il Credit Wallet e' uscito dalla barra in alto del sito: il saldo si
        // guarda da qui dentro, come le altre cose dell'area cliente.
        { path: '/credit-wallet', label: 'Credit Wallet' },
        { path: '/account/membership', label: t('My_Membership') },
        { path: '/account/bookings', label: t('My_Bookings') },
        { path: '/account/preventivi', label: t({ it: 'I Miei Preventivi', en: 'My Quotes' }) },
        { path: '/account/referral', label: t({ it: 'Invita un Amico', en: 'Invite a Friend' }) },
        { path: '/account/notifications', label: t('Notifications') },
    ];

    // Il filmato dell'apertura, scelto da Sito > Aspetto & Funzionalita'.
    const filmato = useFilmato('account');

    // Normalize path for accurate matching (e.g., /account/ -> /account/profile)
    const currentPath = location.pathname.endsWith('/account') || location.pathname.endsWith('/account/')
        ? '/account/profile'
        : location.pathname;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="pb-24 min-h-screen"
        >
            {/* 10/09/2026 — il filmato dietro all'apertura dell'area cliente,
                scelto da Sito > Aspetto & Funzionalita'. Niente `bg-black`
                sul contenitore: richiuderebbe il filmato. */}
            <SfondoVideo
                src={filmato.src}
                poster={filmato.poster}
                ariaLabel={t('Account_Settings')}
                compatta
            >
                <div className="container mx-auto px-4 md:px-6 text-center">
                    <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white">{t('Account_Settings')}</h1>
                </div>
            </SfondoVideo>

            <div className="container mx-auto px-4 md:px-6 pt-8">

                <div className="flex flex-col md:flex-row gap-8 lg:gap-12">
                    <aside className="md:w-1/4 lg:w-1/5">
                        <nav className="flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible -mx-4 px-4 md:mx-0 md:px-0 space-x-2 md:space-x-0 md:space-y-2">
                            {navItems.map(item => (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    className={({ isActive }) =>
                                        `flex items-center min-h-[44px] border p-3 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ` +
                                        (isActive ? 'border-white/30 bg-gray-800 text-white' : 'border-transparent text-gray-400 hover:border-white/15 hover:bg-gray-800/50 hover:text-white')
                                    }
                                >
                                    {item.label}
                                </NavLink>
                            ))}
                            {/* Esci sta qui, non piu' in alto a destra nel sito:
                                e' un'azione dell'area cliente, e in barra
                                occupava un posto a ogni schermata. */}
                            <button
                                onClick={logout}
                                className="flex min-h-[44px] shrink-0 items-center whitespace-nowrap border border-white/15 p-3 text-sm font-medium text-gray-400 transition-colors hover:border-white/35 hover:text-white md:mt-6"
                            >
                                {t('Sign_Out')}
                            </button>
                        </nav>
                    </aside>
                    <main className="flex-1">
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3 }}
                        >
                            <Outlet />
                        </motion.div>
                    </main>
                </div>
            </div>
        </motion.div>
    );
};

export default AccountPage;
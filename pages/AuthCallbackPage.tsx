import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../hooks/useAuth';

const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth(); // facultatif pour la redirection finale

  useEffect(() => {
    const run = async () => {
      console.log('[Auth] Starting authentication callback...');

      // L'app usa il flow IMPLICIT (default di supabase-js): la CONFERMA EMAIL
      // torna a /auth/callback con la sessione nello HASH (#access_token=...),
      // gestita in automatico da `detectSessionInUrl` (attivo di default). Solo
      // OAuth/PKCE torna con ?code= e va scambiato esplicitamente.
      // BUG (2026-06): qui si chiamava SEMPRE exchangeCodeForSession() (solo
      // PKCE). Con la conferma email (hash) falliva → l'utente finiva su
      // /signin "Authentication failed" pur avendo una sessione valida =
      // "il link di verifica non funziona".
      const hasCode = new URLSearchParams(window.location.search).has('code');

      if (hasCode) {
        // OAuth / PKCE: scambia il code per una sessione.
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (error) {
          console.error('[Auth] exchangeCodeForSession failed:', error);
          navigate('/signin', {
            replace: true,
            state: { error: `Authentication failed: ${error.message}` },
          });
          return;
        }
      }

      // Sessione impostata da exchangeCodeForSession (code) OPPURE da
      // detectSessionInUrl (hash della conferma email). Piccolo retry per dare
      // tempo al parsing dello hash prima di leggere l'utente.
      let freshUser = null;
      for (let i = 0; i < 6; i++) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) { freshUser = user; break; }
        await new Promise(r => setTimeout(r, 200));
      }

      if (!freshUser) {
        console.error('[Auth] No session after callback');
        navigate('/signin', { replace: true, state: { error: 'Verifica non riuscita. Prova ad accedere.' } });
        return;
      }

      console.log('[Auth] User retrieved:', freshUser.email, 'Role:', freshUser.user_metadata?.role);
      const destination =
        freshUser?.user_metadata?.role === 'business' ? '/partner/dashboard' : '/account';
      navigate(destination, { replace: true });
    };

    run();
  }, [navigate]);

  // petit spinner
  return (
    <div className="min-h-screen flex items-center justify-center pt-24 pb-12 px-4 sm:px-6 lg:px-8 text-white">
      <div className="flex flex-col items-center text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-4 border-t-white border-gray-700 rounded-full mb-6"
        />
        <h1 className="text-3xl font-bold">Authenticating...</h1>
        <p className="text-gray-400 mt-2">Please wait while we securely sign you in.</p>
      </div>
    </div>
  );
};

export default AuthCallbackPage;

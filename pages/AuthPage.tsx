import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const AuthPage: React.FC = () => {
  const { t } = useTranslation();
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as any)?.from?.pathname || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState((location.state as any)?.error || '');

  useEffect(() => {
    if (!loading && user) {
      const destination = from !== '/' && from !== '/signin' && from !== '/signup'
          ? from
          : (user.role === 'business' ? '/partner/dashboard' : '/account');
      navigate(destination, { replace: true });
    }
  }, [user, loading, navigate, from]);
  
  const handleEmailLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setIsSubmitting(true);
      try {
          const { error } = await login(email, password);
          if (error) throw error;
          // Navigation is handled by useEffect
      } catch (err: any) {
          setError(err.message || t('Something_went_wrong'));
      } finally {
          setIsSubmitting(false);
      }
  };


  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="min-h-screen flex items-center justify-center pt-24 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="bg-black/70 backdrop-blur-sm border border-white/10 rounded-lg shadow-2xl shadow-black/60 p-8 space-y-6"
          >
            <div className="text-center">
              <h2 className="text-3xl font-bold text-white">{t('Access_Your_Account')}</h2>
              <p className="mt-2 text-sm text-gray-400">
                {t('Welcome_back_to_the_world_of_luxury')}
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded p-3 text-center">
                {error}
              </p>
            )}

            <form className="space-y-4" onSubmit={handleEmailLogin} noValidate>
              <input type="email" placeholder={t('Email_Address')} value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full bg-gray-800 border-gray-700 rounded-md p-3 text-white placeholder-gray-400"/>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} placeholder={t('Password')} value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full bg-gray-800 border-gray-700 rounded-md p-3 text-white placeholder-gray-400"/>
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-white transition-colors">
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
              <div className="text-right text-sm">
                <Link to="/forgot-password" className="font-medium text-white hover:text-gray-300">{t('Forgot_Password')}</Link>
              </div>
              <button type="submit" disabled={isSubmitting} className="w-full py-3 px-4 text-white font-bold transition-all disabled:opacity-60 bg-gradient-to-r from-[#0A8FA3] via-[#19C2D6] to-[#4DE3F0] hover:from-[#19C2D6] hover:via-[#4DE3F0] hover:to-[#19C2D6]">{isSubmitting ? t('Please_wait') : t('Sign_In')}</button>
            </form>

            <div className="text-sm text-center pt-2">
              <p className="text-gray-400">
                {t('Dont_have_an_account')}{' '}
                <Link to="/signup" className="font-medium text-white hover:text-gray-300">
                  {t('Sign_Up')}
                </Link>
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default AuthPage;

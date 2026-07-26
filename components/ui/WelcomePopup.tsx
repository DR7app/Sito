import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';

const WelcomePopup: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    // Don't show if user is logged in
    if (user) {
      return;
    }

    const hasSeenPopup = sessionStorage.getItem('dr7-welcome-popup-seen');
    if (!hasSeenPopup) {
      setIsVisible(true);
      sessionStorage.setItem('dr7-welcome-popup-seen', 'true');
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 1000); // 1 second display time
      return () => clearTimeout(timer);
    }
  }, [user]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-lg"
          role="dialog"
          aria-live="polite"
          aria-label="Messaggio di benvenuto"
        >
          <div className="text-center">
            <h2 className="text-4xl font-bold text-white uppercase tracking-widest">
              Benvenuti in DR7
            </h2>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WelcomePopup;
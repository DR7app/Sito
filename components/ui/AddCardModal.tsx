import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from './Button';
import type { StripeCardElementOptions } from '@stripe/stripe-js';

interface AddCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCardAdded: () => void;
  clientSecret: string | null;
  setClientSecret: (secret: string | null) => void;
  stripeCustomerId: string | null;
  setStripeCustomerId: (id: string | null) => void;
}

const CARD_OPTIONS: StripeCardElementOptions = {
    iconStyle: 'solid',
    style: {
        base: {
            iconColor: '#a0aec0',
            color: '#ffffff',
            fontWeight: '500',
            fontFamily: '"Exo 2", sans-serif',
            fontSize: '16px',
            fontSmoothing: 'antialiased',
            ':-webkit-autofill': {
                color: '#fce883',
            },
            '::placeholder': {
                color: '#a0aec0',
            },
        },
        invalid: {
            iconColor: '#ef4444',
            color: '#ef4444',
        },
    },
    hidePostalCode: true
};

const AddCardModal: React.FC<AddCardModalProps> = ({
  isOpen,
  onClose,
  onCardAdded,
  clientSecret,
  setClientSecret,
  stripeCustomerId,
  setStripeCustomerId
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const { user, updateUser } = useAuth();
  const { t } = useTranslation();

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements || !clientSecret || !user) {
      setError("Il sistema di pagamento non è pronto. Riprova tra un istante.");
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
        setError("Impossibile trovare i dati della carta. Riprova.");
        return;
    }

    setIsProcessing(true);
    setError(null);

    const { setupIntent, error: setupError } = await stripe.confirmCardSetup(clientSecret, {
      payment_method: {
        card: cardElement,
        billing_details: {
          name: user.fullName,
          email: user.email,
        },
      },
    });

    if (setupError) {
      setError(setupError.message || "Si è verificato un errore imprevisto.");
      setIsProcessing(false);
      return;
    }

    if (setupIntent.status === 'succeeded') {
      const paymentMethod = setupIntent.payment_method;

      // Get the payment method details to get brand and last4
      const newPaymentMethodDetails = await stripe.retrievePaymentMethod(typeof paymentMethod === 'string' ? paymentMethod : paymentMethod.id);

      if (newPaymentMethodDetails.error || !newPaymentMethodDetails.paymentMethod.card) {
          setError(newPaymentMethodDetails.error?.message || "Impossibile recuperare i dati della carta.");
          setIsProcessing(false);
          return;
      }

      const newCard = {
          id: newPaymentMethodDetails.paymentMethod.id,
          brand: newPaymentMethodDetails.paymentMethod.card.brand,
          last4: newPaymentMethodDetails.paymentMethod.card.last4,
          isDefault: user.paymentMethods.length === 0, // Set as default if it's the first card
      };

      const updatedPaymentMethods = [...user.paymentMethods, newCard];

      // Update user in your database
      await updateUser({
          paymentMethods: updatedPaymentMethods,
          stripeCustomerId: stripeCustomerId // Save the new Stripe customer ID
      });

      setIsProcessing(false);
      onCardAdded();
      onClose();
    }
  };

  useEffect(() => {
      // Reset state when modal is closed/opened
      setError(null);
      setIsProcessing(false);
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" aria-modal="true" role="dialog">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="relative bg-gray-900/80 border border-gray-700 rounded-lg shadow-2xl shadow-black/50 w-full max-w-md"
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-700">
                <h2 className="text-xl font-bold text-white flex items-center">
                    
                    {t('Add_New_Card')}
                </h2>
                <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors" aria-label={t('Close')}>
                    
                </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
                {!clientSecret ? (
                     <div className="flex items-center justify-center h-24">
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-6 h-6 border-2 border-t-white border-gray-600 rounded-full"/>
                    </div>
                ) : (
                    <>
                        <label className="text-sm font-medium text-gray-300 block mb-2">{t('Card_Details')}</label>
                        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                            <CardElement options={CARD_OPTIONS} />
                        </div>
                    </>
                )}

              {error && <p className="text-xs text-red-400 mt-3 text-center">{error}</p>}

              <div className="mt-8 flex justify-end">
                <Button type="submit" variant="primary" size="md" disabled={!stripe || isProcessing || !clientSecret}>
                  {isProcessing ? t('Processing') : t('Save_Changes')}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default AddCardModal;
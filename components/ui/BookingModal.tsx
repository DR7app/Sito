import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { useBooking } from '../../hooks/useBooking';
import { useTranslation } from '../../hooks/useTranslation';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../supabaseClient';
import type { Booking } from '../../types';
import NewClientModal from '../NewClientModal';
import { isBlockedDate } from '../../utils/blockedDates';
import { useContactInfo } from '../../hooks/useContactInfo';

const BookingModal: React.FC = () => {
  const { isBookingOpen, closeBooking, bookingItem, bookingCategory } = useBooking();
  const contact = useContactInfo();
  const { t, lang } = useTranslation();
  const { currency } = useCurrency();
  const { user } = useAuth();

  const [pickupDate, setPickupDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [completedBooking, setCompletedBooking] = useState<Booking | null>(null);
  const [showClientModal, setShowClientModal] = useState(false);
  const [hasClientRecord, setHasClientRecord] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const isCar = bookingCategory === 'cars';

  const isYacht = bookingCategory === 'yachts';

  useEffect(() => {
    if (user) {
      setFullName((user as any).fullName || '');
      setEmail(user.email || '');
    } else {
      setFullName('');
      setEmail('');
    }
  }, [user, isBookingOpen]);

  // Check if user has a client record in customers_extended
  useEffect(() => {
    const checkClientRecord = async () => {
      if (!user) {
        setHasClientRecord(false);
        setClientId(null);
        return;
      }

      const { data, error } = await supabase
        .from('customers_extended')
        .select('id')
        .eq('email', user.email)
        .maybeSingle();

      if (error) {
        console.error('Error checking client record:', error);
        setHasClientRecord(false);
        setClientId(null);
      } else if (data) {
        setHasClientRecord(true);
        setClientId(data.id);
      } else {
        setHasClientRecord(false);
        setClientId(null);
      }
    };

    if (isBookingOpen) {
      checkClientRecord();
    }
  }, [user, isBookingOpen]);

  const { totalDays, totalPrice } = useMemo(() => {
    if (pickupDate && returnDate && bookingItem) {
      const start = new Date(pickupDate);
      const end = new Date(returnDate);
      if (start < end) {
        const diffDays = Math.ceil((end.getTime() - start.getTime()) / 86400000);
        const pricePerDay = bookingItem.pricePerDay?.[currency] ?? 0;
        return { totalDays: diffDays, totalPrice: diffDays * pricePerDay };
      }
    }
    return { totalDays: 0, totalPrice: 0 };
  }, [pickupDate, returnDate, currency, bookingItem]);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat(currency === 'eur' ? 'it-IT' : 'en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
    }).format(price || 0);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString(lang === 'it' ? 'it-IT' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  const handleClose = () => {
    closeBooking();
    setTimeout(() => {
      setIsConfirmed(false);
      setCompletedBooking(null);
      setPickupDate('');
      setReturnDate('');
      setPhone('');
      setShowClientModal(false);
      if (!user) {
        setFullName('');
        setEmail('');
      }
    }, 300);
  };

  const handleClientCreated = async (newClientId: string) => {
    setClientId(newClientId);
    setHasClientRecord(true);
    setShowClientModal(false);
    // Automatically submit the booking after client creation
    if (bookingItem && totalDays > 0 && bookingCategory) {
      if (isYacht) {
        handleYachtQuoteRequest();
      } else {
        // Proceed with booking
        const unitLabel = isCar
          ? (totalDays === 1 ? t('Day') : t('Days'))
          : (totalDays === 1 ? t('Night') : t('Nights'));

        const newBookingData: Omit<Booking, 'bookingId'> = {
          userId: user ? user.id : 'guest-user',
          itemId: bookingItem.id,
          itemName: bookingItem.name,
          image: bookingItem.image,
          itemCategory: bookingCategory,
          pickupDate,
          pickupTime: isCar ? '10:00' : '15:00',
          returnDate,
          returnTime: isCar ? '10:00' : '11:00',
          duration: `${totalDays} ${unitLabel}`,
          totalPrice,
          currency: currency.toUpperCase() as 'USD' | 'EUR',
          customer: { fullName, email, phone, age: 0, countryOfResidency: '' },
          driverLicenseImage: '',
          paymentMethod: 'stripe',
          bookedAt: new Date().toISOString(),
          insuranceOption: 'none',
          extras: [],
          pickupLocation: (bookingItem as any).location ?? '',
        };

        const { data, error } = await supabase
          .from('bookings')
          .insert(newBookingData)
          .select()
          .single();

        if (error) {
          console.error('Error creating booking in modal:', error);
          return;
        }

        setCompletedBooking(data);
        setIsConfirmed(true);
      }
    }
  };

  const handleYachtQuoteRequest = () => {
    if (!bookingItem || !pickupDate || !returnDate) return;

    const formattedPickup = formatDate(pickupDate);
    const formattedReturn = formatDate(returnDate);

    const message = `Ciao! Sono interessato a noleggiare ${bookingItem.name}.\n\nDettagli:\n• Data inizio: ${formattedPickup}\n• Data fine: ${formattedReturn}\n• Nome: ${fullName}\n• Email: ${email}\n• Telefono: ${phone}\n\nPotreste fornirmi un preventivo? Grazie!`;
    const whatsappUrl = `${contact.whatsapp_url}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingItem || totalDays <= 0 || !bookingCategory) return;

    // Check if user has a client record, if not show NewClientModal
    if (!hasClientRecord) {
      setShowClientModal(true);
      return;
    }

    // For yachts, just open WhatsApp with quote request
    if (isYacht) {
      handleYachtQuoteRequest();
      return;
    }

    const unitLabel = isCar
      ? (totalDays === 1 ? t('Day') : t('Days'))
      : (totalDays === 1 ? t('Night') : t('Nights'));

    const newBookingData: Omit<Booking, 'bookingId'> = {
      userId: user ? user.id : 'guest-user',
      itemId: bookingItem.id,
      itemName: bookingItem.name,
      image: bookingItem.image,
      itemCategory: bookingCategory,
      pickupDate,
      pickupTime: isCar ? '10:00' : '15:00',
      returnDate,
      returnTime: isCar ? '10:00' : '11:00',
      duration: `${totalDays} ${unitLabel}`,
      totalPrice,
      currency: currency.toUpperCase() as 'USD' | 'EUR',
      customer: { fullName, email, phone, age: 0, countryOfResidency: '' },
      driverLicenseImage: '',
      paymentMethod: 'stripe',
      bookedAt: new Date().toISOString(),
      insuranceOption: 'none',
      extras: [],
      pickupLocation: (bookingItem as any).location ?? '',
    };

    const { data, error } = await supabase
      .from('bookings')
      .insert(newBookingData)
      .select()
      .single();

    if (error) {
      console.error('Error creating booking in modal:', error);
      return;
    }

    setCompletedBooking(data);
    setIsConfirmed(true);
  };

  if (!bookingItem) return null;

  return (
    <AnimatePresence>
      {isBookingOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
          aria-modal="true"
          role="dialog"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="relative bg-gray-900/80 border border-gray-700 rounded-t-lg sm:rounded-lg shadow-2xl shadow-black/50 w-full max-w-4xl max-h-[90dvh] overflow-y-auto overscroll-contain"
          >
            <button
              onClick={handleClose}
              className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors z-10"
              aria-label={t('Close')}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>

            {!isConfirmed ? (
              <form onSubmit={handleSubmit}>
                <div className="grid md:grid-cols-2">
                  <div className="p-8 border-b md:border-b-0 md:border-r border-gray-700">
                    <h2 className="text-2xl font-bold text-white mb-2">{t('Book_Your_Experience')}</h2>
                    <h3 className="text-3xl font-bold text-white mb-6">{bookingItem.name}</h3>

                    <div className="space-y-4">
                      <div>
                        <label htmlFor="pickupDate" className="block text-sm font-medium text-gray-300">
                          {isCar ? t('Pickup_Date') : t('Check_in_Date')}
                        </label>
                        <DatePicker
                          id="pickupDate"
                          selected={pickupDate ? new Date(pickupDate + 'T12:00:00') : null}
                          onChange={(date: Date | null) => {
                            if (!date) return;
                            const yyyy = date.getFullYear();
                            const mm = String(date.getMonth() + 1).padStart(2, '0');
                            const dd = String(date.getDate()).padStart(2, '0');
                            setPickupDate(`${yyyy}-${mm}-${dd}`);
                          }}
                          filterDate={(date: Date) => !isBlockedDate(date)}
                          minDate={new Date()}
                          dateFormat="dd/MM/yyyy"
                          placeholderText={t({ it: "Seleziona data", en: "Select a date" })}
                          required
                          className="mt-1 block w-full bg-gray-800 border-gray-600 rounded-md shadow-sm text-white focus:ring-white focus:border-white px-3 py-2"
                        />
                      </div>

                      <div>
                        <label htmlFor="returnDate" className="block text-sm font-medium text-gray-300">
                          {isCar ? t('Return_Date') : t('Check_out_Date')}
                        </label>
                        <DatePicker
                          id="returnDate"
                          selected={returnDate ? new Date(returnDate + 'T12:00:00') : null}
                          onChange={(date: Date | null) => {
                            if (!date) return;
                            const yyyy = date.getFullYear();
                            const mm = String(date.getMonth() + 1).padStart(2, '0');
                            const dd = String(date.getDate()).padStart(2, '0');
                            setReturnDate(`${yyyy}-${mm}-${dd}`);
                          }}
                          filterDate={(date: Date) => !isBlockedDate(date)}
                          minDate={pickupDate ? new Date(pickupDate + 'T12:00:00') : new Date()}
                          disabled={!pickupDate}
                          dateFormat="dd/MM/yyyy"
                          placeholderText={t({ it: "Seleziona data", en: "Select a date" })}
                          required
                          className="mt-1 block w-full bg-gray-800 border-gray-600 rounded-md shadow-sm text-white focus:ring-white focus:border-white px-3 py-2"
                        />
                        <p className="text-xs text-yellow-400 mt-1">{t({ it: "Chiusi domenica e festivi", en: "Closed on Sundays and public holidays" })}</p>
                      </div>

                      <div>
                        <label htmlFor="fullName" className="block text-sm font-medium text-gray-300">{t('Full_Name')}</label>
                        <input
                          type="text"
                          id="fullName"
                          value={fullName}
                          onChange={e => setFullName(e.target.value)}
                          required
                          className="mt-1 block w-full bg-gray-800 border-gray-600 rounded-md shadow-sm text-white focus:ring-white focus:border-white"
                        />
                      </div>

                      <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-300">{t('Email_Address')}</label>
                        <input
                          type="email"
                          id="email"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          required
                          className="mt-1 block w-full bg-gray-800 border-gray-600 rounded-md shadow-sm text-white focus:ring-white focus:border-white"
                        />
                      </div>

                      <div>
                        <label htmlFor="phone" className="block text-sm font-medium text-gray-300">{t('Phone_Number')}</label>
                        <input
                          type="tel"
                          id="phone"
                          value={phone}
                          onChange={e => setPhone(e.target.value)}
                          required
                          className="mt-1 block w-full bg-gray-800 border-gray-600 rounded-md shadow-sm text-white focus:ring-white focus:border-white"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-8 flex flex-col">
                    <img
                      src={bookingItem.image}
                      alt={bookingItem.name}
                      className="w-full h-64 object-cover rounded-lg mb-6"
                    />

                    <div className="flex-grow">
                      {!isYacht && (
                        <div className="flex justify-between items-center text-white font-bold text-xl">
                          <span>{t('Total_Price')}</span>
                          <span>{formatPrice(totalPrice)}</span>
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={totalDays <= 0}
                      className="w-full mt-6 bg-white text-black px-6 py-3 rounded-full font-bold uppercase tracking-wider text-sm hover:bg-gray-200 transition-all duration-300 transform hover:scale-105 disabled:bg-gray-600 disabled:cursor-not-allowed disabled:scale-100"
                    >
                      {isYacht ? t('Request_Quote') : t('Confirm_Booking')}
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="p-8">
                <div className="text-center mb-6">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                    className="w-16 h-16 bg-gray-500/20 text-gray-300 rounded-full flex items-center justify-center mx-auto mb-4"
                  >
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </motion.div>
                  <h2 className="text-3xl font-bold text-white mb-2">{t('Booking_Confirmed')}</h2>
                  <p className="text-gray-300">{t('Your_booking_is_confirmed')}</p>
                  <p className="text-gray-400 text-sm">{t('A_confirmation_email_has_been_sent')}</p>
                </div>

                {completedBooking && (
                  <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 space-y-3 text-sm max-w-md mx-auto">
                    <h3 className="text-lg font-bold text-white text-center mb-4">{t('Booking_Details')}</h3>
                    <div className="flex justify-between">
                      <span className="text-gray-400">{t('Item')}</span>
                      <span className="font-semibold text-white text-right">{completedBooking.itemName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">{t('Dates')}</span>
                      <span className="font-semibold text-white text-right">
                        {formatDate(completedBooking.pickupDate)} - {formatDate(completedBooking.returnDate)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">{t('Duration')}</span>
                      <span className="font-semibold text-white text-right">{completedBooking.duration}</span>
                    </div>
                    <div className="flex justify-between items-center text-lg border-t border-gray-700 pt-3">
                      <span className="text-gray-300 font-bold">{t('Total_Price')}</span>
                      <span className="font-bold text-white">{formatPrice(completedBooking.totalPrice)}</span>
                    </div>
                  </div>
                )}

                <div className="text-center mt-8">
                  <button
                    onClick={handleClose}
                    className="bg-gray-700 text-white px-6 py-2 rounded-full font-semibold text-sm hover:bg-gray-600 transition-colors"
                  >
                    {t('Close')}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* New Client Modal - shown when user doesn't have a client record */}
      <NewClientModal
        isOpen={showClientModal}
        onClose={() => setShowClientModal(false)}
        onClientCreated={handleClientCreated}
      />
    </AnimatePresence>
  );
};

export default BookingModal;

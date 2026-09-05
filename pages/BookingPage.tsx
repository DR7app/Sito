import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { useCurrency } from '../contexts/CurrencyContext';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../supabaseClient';
import { RENTAL_CATEGORIES, YACHT_PICKUP_MARINAS as DEFAULT_YACHT_PICKUP_MARINAS, AIRPORTS as DEFAULT_AIRPORTS, HELI_DEPARTURE_POINTS as DEFAULT_HELI_DEPARTURE_POINTS, HELI_ARRIVAL_POINTS as DEFAULT_HELI_ARRIVAL_POINTS } from '../constants';
import { getYachtFleet, getJetFleet } from '../utils/getAviationFleet';
import type { RentalItem } from '../types';
import type { Booking, Inquiry, RentalItem } from '../types';
import CarBookingWizard from '../components/ui/CarBookingWizard';
import BookingErrorBoundary from '../components/ui/BookingErrorBoundary';
import HelicopterBookingForm from '../components/ui/HelicopterBookingForm';
import { getBookingCopy, type BookingCopy, getMessageTemplateBody } from '../utils/siteCopy';
import { getAirports, getYachtMarinas, getHeliDeparturePoints, getHeliArrivalPoints } from '../utils/getLocations';
import { dateLocale } from '../utils/i18nDate';

// Token substitution for WhatsApp templates loaded from system_messages.
function applyTokens(tpl: string, tokens: Record<string, string>): string {
  let out = tpl;
  for (const [k, v] of Object.entries(tokens)) out = out.split(`{${k}}`).join(v);
  return out;
}

const WHATSAPP_RECIPIENT = '393457905205';



// Safely access the Stripe publishable key from Vite's environment variables.
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';

const BookingPage: React.FC = () => {
  const { category: categoryId, itemId } = useParams<{ category: 'cars' | 'yachts' | 'jets' | 'helicopters'; itemId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, lang, getTranslated } = useTranslation();
  const { currency } = useCurrency();
  const { user, loading } = useAuth();

  const [step, setStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [completedBooking, setCompletedBooking] = useState<Booking | Inquiry | null>(null);
  const today = new Date().toISOString().split('T')[0];
  const [copy, setCopy] = useState<BookingCopy | null>(null);
  const copyRef = useRef<BookingCopy | null>(null);
  useEffect(() => {
    let cancelled = false;
    getBookingCopy().then(c => { if (cancelled) return; copyRef.current = c; setCopy(c); });
    return () => { cancelled = true; };
  }, []);
  const b = (it: keyof BookingCopy, en: keyof BookingCopy): string => {
    const cur = copyRef.current;
    if (!cur) return '';
    return cur[lang === 'it' ? it : en] as string;
  };

  // Live location lists from Sito CMS — fall back to constants until loaded.
  const [airports, setAirports] = useState(DEFAULT_AIRPORTS);
  const [yachtMarinas, setYachtMarinas] = useState(DEFAULT_YACHT_PICKUP_MARINAS);
  const [heliDeparturePoints, setHeliDeparturePoints] = useState(DEFAULT_HELI_DEPARTURE_POINTS);
  const [heliArrivalPoints, setHeliArrivalPoints] = useState(DEFAULT_HELI_ARRIVAL_POINTS);
  useEffect(() => {
    let cancelled = false;
    Promise.all([getAirports(), getYachtMarinas(), getHeliDeparturePoints(), getHeliArrivalPoints()]).then(([ap, ym, hd, ha]) => {
      if (cancelled) return;
      setAirports(ap);
      setYachtMarinas(ym);
      setHeliDeparturePoints(hd);
      setHeliArrivalPoints(ha);
    });
    return () => { cancelled = true; };
  }, []);

  const [formData, setFormData] = useState({
    fullName: '', email: '', phone: '',
    checkinDate: location.state?.checkinDate || today,
    checkoutDate: location.state?.checkoutDate || '',
    guests: location.state?.guests || 1,
    paymentMethod: 'stripe',
    tripType: location.state?.tripType || 'one-way' as 'one-way' | 'round-trip',
    departurePoint: location.state?.departurePoint || '',
    arrivalPoint: location.state?.arrivalPoint || '',
    departureDate: location.state?.departureDate || today,
    departureTime: '12:00',
    returnDateQuote: location.state?.returnDate || '',
    returnTimeQuote: '12:00',
    passengers: location.state?.passengers || 1,
    petsAllowed: location.state?.petsAllowed || false,
    smokingAllowed: location.state?.smokingAllowed || false,
    pickupMarina: DEFAULT_YACHT_PICKUP_MARINAS[0].id,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const cardElementRef = useRef<HTMLDivElement>(null);
  const [stripe, setStripe] = useState<any>(null);
  const [cardElement, setCardElement] = useState<any>(null);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isClientSecretLoading, setIsClientSecretLoading] = useState(false);

  const [yachtFleet, setYachtFleet] = useState<RentalItem[]>([]);
  const [jetFleet, setJetFleet] = useState<RentalItem[]>([]);
  useEffect(() => {
    let cancelled = false;
    getYachtFleet().then((f) => { if (!cancelled) setYachtFleet(f); });
    getJetFleet().then((f) => { if (!cancelled) setJetFleet(f); });
    return () => { cancelled = true; };
  }, []);

  const { category, item, isCar, isJet, isHelicopter, isYacht, isQuoteRequest } = useMemo(() => {
    const cat = RENTAL_CATEGORIES.find(c => c.id === categoryId);
    // Aviation/marine items come from the admin catalog (centralina_pro_config.site_copy.aviationMarine).
    // Static RENTAL_CATEGORIES still provides id/label/icon for navigation.
    const adminItems = cat?.id === 'yachts' ? yachtFleet
      : cat?.id === 'jets' ? jetFleet
      : cat?.data || [];
    const itm = adminItems.find(i => i.id === itemId);
    const car = cat?.id === 'cars';
    const jet = cat?.id === 'jets';
    const helicopter = cat?.id === 'helicopters';
    const yacht = cat?.id === 'yachts';
    const quote = jet;
    return { category: cat, item: itm, isCar: car, isJet: jet, isHelicopter: helicopter, isYacht: yacht, isQuoteRequest: quote };
  }, [categoryId, itemId, yachtFleet, jetFleet]);

  useEffect(() => {
    if ((window as any).Stripe) {
      if (!STRIPE_PUBLISHABLE_KEY || STRIPE_PUBLISHABLE_KEY.startsWith('YOUR_')) {
        console.error("Stripe.js has loaded, but the publishable key is not set. Please replace 'YOUR_STRIPE_PUBLISHABLE_KEY' with your actual key.");
        setStripeError(b('err_payment_not_configured_it', 'err_payment_not_configured_en'));
        return;
      }
      setStripe((window as any).Stripe(STRIPE_PUBLISHABLE_KEY));
    } else {
      console.error("Stripe.js has not loaded.");
    }
  }, []);

  const {
    rentalCost, subtotal, taxes, total, nights
  } = useMemo(() => {
    const zeroState = { rentalCost: 0, subtotal: 0, taxes: 0, total: 0, nights: 0 };
    if (!item || !item.pricePerDay) return zeroState;

    const pricePerDay = item.pricePerDay[currency];

    if (isYacht) {
      const checkinKey = 'checkinDate';
      const checkoutKey = 'checkoutDate';

      if (!formData[checkinKey] || !formData[checkoutKey]) return zeroState;
      const start = new Date(formData[checkinKey]);
      const end = new Date(formData[checkoutKey]);
      if (start >= end) return zeroState;

      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      const calculatedRentalCost = diffDays * pricePerDay;
      // ALL PRICES ARE TAX-INCLUSIVE (IVA/TVA already included)
      const calculatedSubtotal = calculatedRentalCost;
      const calculatedTaxes = 0;
      const calculatedTotal = calculatedSubtotal;

      return { ...zeroState, rentalCost: calculatedRentalCost, subtotal: calculatedSubtotal, taxes: calculatedTaxes, total: calculatedTotal, nights: diffDays };
    }
    return zeroState;
  }, [formData, item, currency, isYacht]);

  useEffect(() => {
    if (step === 2 && !isCar && !isQuoteRequest && total > 0) {
      setIsClientSecretLoading(true); setClientSecret(null); setStripeError(null);
      fetch('/.netlify/functions/create-payment-intent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: total, currency }) })
        .then(res => res.json()).then(data => { if (data.error) { setStripeError(data.error); } else { setClientSecret(data.clientSecret); } })
        .catch(error => { console.error('Failed to fetch client secret:', error); setStripeError(b('err_payment_server_down_it', 'err_payment_server_down_en')); })
        .finally(() => { setIsClientSecretLoading(false); });
    }
  }, [step, isQuoteRequest, total, currency, isCar]);

  useEffect(() => {
    let card: any = null;
    if (stripe && step === 2 && !isCar && !isQuoteRequest && formData.paymentMethod === 'stripe' && cardElementRef.current && clientSecret) {
      const elements = stripe.elements();
      card = elements.create('card', { style: { base: { color: '#ffffff', fontFamily: '"Jost", system-ui, sans-serif', fontSmoothing: 'antialiased', fontSize: '16px', '::placeholder': { color: '#a0aec0' } }, invalid: { color: '#ef4444', iconColor: '#ef4444' } }, hidePostalCode: true });
      setCardElement(card); card.mount(cardElementRef.current);
      card.on('change', (event: any) => { setStripeError(event.error ? event.error.message : null); });
    }
    return () => { if (card) { card.destroy(); setCardElement(null); } };
  }, [stripe, step, formData.paymentMethod, clientSecret, isQuoteRequest, isCar]);

  useEffect(() => { if (user) { setFormData(prev => ({ ...prev, fullName: user.fullName || '', email: user.email || '' })); } }, [user]);

  const formatPrice = (price: number) => new Intl.NumberFormat(currency === 'eur' ? 'it-IT' : 'en-US', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 2 }).format(price);
  const formatDate = (date: string) => new Date(date).toLocaleDateString(dateLocale(lang), { year: 'numeric', month: 'long', day: 'numeric' });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const { checked } = e.target as HTMLInputElement;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const validateStep = () => {
    // Validation for non-car categories can be added here if needed
    return true;
  };

  const handleNext = () => validateStep() && setStep(s => s + 1);
  const handleBack = () => setStep(s => s - 1);

  const finalizeBooking = async () => {
    if (!item) return;

    if (isQuoteRequest) {
      if (categoryId !== 'jets' && categoryId !== 'helicopters') return;
      const newInquiry: Inquiry = {
        inquiryId: crypto.randomUUID(), userId: user ? user.id : 'guest', itemId: item.id, itemName: item.name, image: item.image, itemCategory: categoryId,
        customer: { fullName: formData.fullName, email: formData.email, phone: formData.phone },
        details: { tripType: formData.tripType, departurePoint: formData.departurePoint, arrivalPoint: formData.arrivalPoint, departureDate: formData.departureDate, departureTime: formData.departureTime, returnDate: formData.returnDateQuote, returnTime: formData.returnTimeQuote, passengers: Number(formData.passengers), petsAllowed: formData.petsAllowed, smokingAllowed: formData.smokingAllowed },
        inquiredAt: new Date().toISOString(),
      };
      const existing = JSON.parse(localStorage.getItem('inquiries') || '[]');
      localStorage.setItem('inquiries', JSON.stringify([...existing, newInquiry]));
      setCompletedBooking(newInquiry);

      // WhatsApp messages now live in system_messages (Messaggi di Sistema Pro):
      //   pro_booking_helicopter_inquiry / pro_booking_jet_inquiry
      // Operators edit the template; we substitute tokens at send time.
      if (isHelicopter || isJet) {
        const isHeli = isHelicopter;
        const points = isHeli ? heliDeparturePoints : airports;
        const arrivals = isHeli ? heliArrivalPoints : airports;
        const departureName = isHeli
          ? (points as typeof heliDeparturePoints).find(p => p.id === formData.departurePoint)?.name || formData.departurePoint
          : (() => {
              const a = (points as typeof airports).find(p => p.iata === formData.departurePoint);
              return a ? `${a.name} (${a.iata})` : formData.departurePoint;
            })();
        const arrivalName = isHeli
          ? (arrivals as typeof heliArrivalPoints).find(p => p.id === formData.arrivalPoint)?.name || formData.arrivalPoint
          : (() => {
              const a = (arrivals as typeof airports).find(p => p.iata === formData.arrivalPoint);
              return a ? `${a.name} (${a.iata})` : formData.arrivalPoint;
            })();

        const templateKey = isHeli ? 'pro_booking_helicopter_inquiry' : 'pro_booking_jet_inquiry';
        const template = await getMessageTemplateBody(templateKey);
        if (template) {
          const message = applyTokens(template, {
            nome: formData.fullName,
            email: formData.email,
            telefono: formData.phone,
            partenza: departureName,
            arrivo: arrivalName,
            data_partenza: formatDate(formData.departureDate),
            ora_partenza: formData.departureTime,
            data_ritorno: formData.tripType === 'round-trip' && formData.returnDateQuote ? formatDate(formData.returnDateQuote) : '',
            ora_ritorno: formData.tripType === 'round-trip' && formData.returnTimeQuote ? formData.returnTimeQuote : '',
            passeggeri: String(formData.passengers),
            veicolo: item.name,
            tipo_viaggio: formData.tripType === 'one-way' ? 'Solo andata' : 'Andata e ritorno',
            animali: formData.petsAllowed ? 'Sì' : 'No',
            fumo: formData.smokingAllowed ? 'Sì' : 'No',
          });
          const whatsappUrl = `https://wa.me/${WHATSAPP_RECIPIENT}?text=${encodeURIComponent(message)}`;
          window.open(whatsappUrl, '_blank');
        }
      }
    } else {
      const commonData = {
        userId: user ? user.id : 'guest-user', itemId: item.id, itemName: item.name, image: item.image,
        itemCategory: categoryId,
        totalPrice: total, currency: currency.toUpperCase() as 'USD' | 'EUR',
        customer: { fullName: formData.fullName, email: formData.email, phone: formData.phone },
        paymentMethod: formData.paymentMethod, bookedAt: new Date().toISOString(),
      };

      let newBookingData: Omit<Booking, 'bookingId'> | undefined;
      if (isYacht) {
        newBookingData = { ...commonData, itemCategory: 'yachts', pickupDate: formData.checkinDate, pickupTime: '15:00', returnDate: formData.checkoutDate, returnTime: '11:00', duration: `${nights} ${nights === 1 ? t('Night') : t('Nights')}`, driverLicenseImage: '', extras: [], pickupLocation: formData.pickupMarina, insuranceOption: 'none' };
      }

      if (!newBookingData) {
        console.error("Unsupported category for booking.");
        setErrors(prev => ({ ...prev, form: b('err_category_unsupported_it', 'err_category_unsupported_en') }));
        setIsProcessing(false);
        return;
      }

      const { data, error } = await supabase
        .from('bookings')
        .insert(newBookingData)
        .select()
        .single();

      if (error) {
        console.error('Error creating booking:', error);
        setErrors(prev => ({ ...prev, form: b('err_save_failed_it', 'err_save_failed_en') }));
        setIsProcessing(false);
        return;
      }

      setCompletedBooking(data);

      // WhatsApp template lives in system_messages: pro_booking_yacht_confirm
      if (isYacht) {
        const marinaName = yachtMarinas.find(m => m.id === formData.pickupMarina);
        const marinaLabel = marinaName ? getTranslated(marinaName.label) : formData.pickupMarina;
        const template = await getMessageTemplateBody('pro_booking_yacht_confirm');
        if (template) {
          const message = applyTokens(template, {
            nome: formData.fullName,
            email: formData.email,
            telefono: formData.phone,
            yacht_name: item.name,
            marina: marinaLabel,
            check_in: formatDate(formData.checkinDate),
            check_out: formatDate(formData.checkoutDate),
            nights: String(nights),
            passeggeri: String(formData.guests),
            totale: formatPrice(total),
          });
          const whatsappUrl = `https://wa.me/${WHATSAPP_RECIPIENT}?text=${encodeURIComponent(message)}`;
          setTimeout(() => { window.open(whatsappUrl, '_blank'); }, 1000);
        }
      }
    }
    setStep(steps.length + 1);
    setIsProcessing(false);
  };

  const isSubmittingRef = useRef(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!validateStep() || !item) return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsProcessing(true);
    if (isQuoteRequest) { await finalizeBooking(); isSubmittingRef.current = false; return; }
    if (formData.paymentMethod === 'stripe') {
      setStripeError(null); if (!stripe || !cardElement || !clientSecret) { setStripeError(b('err_payment_not_ready_it', 'err_payment_not_ready_en')); setIsProcessing(false); isSubmittingRef.current = false; return; }
      const { error } = await stripe.confirmCardPayment(clientSecret, { payment_method: { card: cardElement, billing_details: { name: formData.fullName, email: formData.email, phone: formData.phone } }, });
      if (error) { setStripeError(error.message || b('err_unexpected_it', 'err_unexpected_en')); setIsProcessing(false); isSubmittingRef.current = false; } else { await finalizeBooking(); isSubmittingRef.current = false; }
    } else { await finalizeBooking(); isSubmittingRef.current = false; }
  };

  const steps = useMemo(() => {
    if (isQuoteRequest) return [{ id: 1, name: t('Itinerary') }, { id: 2, name: t('Personal_Information') }, { id: 3, name: t('Review_and_Submit') }];
    if (isYacht) return [{ id: 1, name: t('Review_your_booking') }, { id: 2, name: t('Payment') }];
    return [];
  }, [isQuoteRequest, isYacht, t]);

  const handleBookingComplete = (booking: Booking) => {
    setCompletedBooking(booking);
    setStep(99); // A step number that indicates completion
  };

  if (!item) return <div className="pt-32 text-center text-white">{b('item_not_found_it', 'item_not_found_en')}</div>;

  const renderContent = () => {
    if (completedBooking) {
      if (isQuoteRequest) return (
        <div className="text-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }} className="w-16 h-16 bg-gray-500/20 text-gray-300 rounded-full flex items-center justify-center mx-auto mb-4"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg></motion.div>
          <h2 className="text-3xl font-bold text-white mb-2">{t('Inquiry_Sent')}</h2>
          <p className="text-gray-300 max-w-md mx-auto">{t('Our_team_will_contact_you_shortly_with_a_quote')}</p>
          <button type="button" onClick={() => navigate('/')} className="mt-8 bg-white text-black px-6 py-2 font-semibold text-sm hover:bg-gray-200 transition-colors">{t('Go_to_Home')}</button>
        </div>
      );
      return (
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-2">{b('booking_confirmed_title_it', 'booking_confirmed_title_en')}</h2>
          <p className="text-gray-300 max-w-md mx-auto">{b('booking_confirmed_body_it', 'booking_confirmed_body_en')}</p>
          <button type="button" onClick={() => navigate('/account')} className="mt-8 bg-white text-black px-6 py-2 font-semibold text-sm hover:bg-gray-200 transition-colors">{b('booking_confirmed_cta_bookings_it', 'booking_confirmed_cta_bookings_en')}</button>
        </div>
      );
    }

    if (isCar) {
      return (
        <BookingErrorBoundary>
          <CarBookingWizard item={item} onBookingComplete={handleBookingComplete} onClose={() => location.state?.from ? navigate(location.state.from) : navigate('/')} />
        </BookingErrorBoundary>
      );
    }

    if (isHelicopter) {
      return (
        <div className="max-w-2xl mx-auto">
          <HelicopterBookingForm />
        </div>
      );
    }

    const renderStepContent = () => {
      if (step > steps.length) {
        if (isQuoteRequest) return (
          <div className="text-center">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }} className="w-16 h-16 bg-gray-500/20 text-gray-300 rounded-full flex items-center justify-center mx-auto mb-4"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg></motion.div>
            <h2 className="text-3xl font-bold text-white mb-2">{t('Inquiry_Sent')}</h2>
            <p className="text-gray-300 max-w-md mx-auto">{t('Our_team_will_contact_you_shortly_with_a_quote')}</p>
            <button type="button" onClick={() => navigate('/')} className="mt-8 bg-white text-black px-6 py-2 font-semibold text-sm hover:bg-gray-200 transition-colors">{b('inquiry_sent_cta_home_it', 'inquiry_sent_cta_home_en')}</button>
          </div>
        );
        return (
          <div className="text-center">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }} className="w-16 h-16 bg-gray-500/20 text-gray-300 rounded-full flex items-center justify-center mx-auto mb-4"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg></motion.div>
            <h2 className="text-3xl font-bold text-white mb-2">{t('Booking_Request_Sent')}</h2>
            <p className="text-gray-300 max-w-md mx-auto">{t('We_will_confirm_your_booking_shortly')}</p>
            <button type="button" onClick={() => navigate('/')} className="mt-8 bg-white text-black px-6 py-2 font-semibold text-sm hover:bg-gray-200 transition-colors">{b('inquiry_sent_cta_home_it', 'inquiry_sent_cta_home_en')}</button>
          </div>
        );
      }

      const paymentStepContent = (
        <div>
          <div className="flex border-b border-gray-700">
            <button type="button" onClick={() => setFormData(p => ({ ...p, paymentMethod: 'stripe' }))} className={`flex-1 py-2 text-sm font-semibold transition-colors flex items-center justify-center gap-2 text-white border-b-2 border-white`}>{t('Credit_Card')}</button>
          </div>
          <div className="mt-6">
            <div className="space-y-4">
              <label className="text-sm font-medium text-gray-300 block">{t('Credit_Card')}</label>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 min-h-[56px] flex items-center">
                {isClientSecretLoading ? <div className="flex items-center text-gray-400 text-sm"><motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-4 h-4 border-2 border-t-white border-gray-600 rounded-full mr-2" /><span>{b('payment_initializing_it', 'payment_initializing_en')}</span></div> : <div ref={cardElementRef} className="w-full" />}
              </div>
              {stripeError && <p className="text-xs text-red-400 mt-1">{stripeError}</p>}
            </div>
          </div>
        </div>
      );

      if (isQuoteRequest) {
        const departurePoints = isJet ? airports : heliDeparturePoints;
        const arrivalPoints = isJet ? airports : heliArrivalPoints;
        switch (step) {
          // FIX: Correctly handle union type for airport/heliport locations by checking for 'iata' or 'id' property.
          case 1: return <div className="space-y-6"><div><label className="text-sm text-gray-400 block mb-2">{t('Trip_Type')}</label><div className="flex border border-gray-700 p-1"><button type="button" onClick={() => setFormData(p => ({ ...p, tripType: 'one-way' }))} className={`flex-1 py-1 text-sm transition-colors ${formData.tripType === 'one-way' ? 'bg-white text-black' : 'text-gray-300'}`}>{t('One_Way')}</button><button type="button" onClick={() => setFormData(p => ({ ...p, tripType: 'round-trip' }))} className={`flex-1 py-1 text-sm transition-colors ${formData.tripType === 'round-trip' ? 'bg-white text-black' : 'text-gray-300'}`}>{t('Round_Trip')}</button></div></div><div className="grid grid-cols-2 gap-4"><div><label className="text-sm text-gray-400">{isJet ? t('Departure_Airport') : t('Departure_Point')}</label><select name="departurePoint" value={formData.departurePoint} onChange={handleChange} className="w-full bg-gray-800 border-gray-700 rounded-md p-2 mt-1 text-white"><option value="">{b('select_option_default_it', 'select_option_default_en')}</option>{departurePoints.map(p => { const val = 'iata' in p ? p.iata : p.id; return <option key={val} value={val}>{p.name}</option>; })}</select></div><div><label className="text-sm text-gray-400">{isJet ? t('Arrival_Airport') : t('Arrival_Point')}</label><select name="arrivalPoint" value={formData.arrivalPoint} onChange={handleChange} className="w-full bg-gray-800 border-gray-700 rounded-md p-2 mt-1 text-white"><option value="">{b('select_option_default_it', 'select_option_default_en')}</option>{arrivalPoints.map(p => { const val = 'iata' in p ? p.iata : p.id; return <option key={val} value={val}>{p.name}</option>; })}</select></div><div><label className="text-sm text-gray-400">{t('Departure_Date')}</label><input type="date" name="departureDate" value={formData.departureDate} onChange={handleChange} min={today} className="w-full bg-gray-800 border-gray-700 rounded-md p-2 mt-1 text-white" /></div><div><label className="text-sm text-gray-400">{t('Departure_Time')}</label><input type="time" name="departureTime" value={formData.departureTime} onChange={handleChange} className="w-full bg-gray-800 border-gray-700 rounded-md p-2 mt-1 text-white" /></div></div><AnimatePresence>{formData.tripType === 'round-trip' && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="grid grid-cols-2 gap-4"><div><label className="text-sm text-gray-400">{t('Return_Date')}</label><input type="date" name="returnDateQuote" value={formData.returnDateQuote} onChange={handleChange} min={formData.departureDate || today} className="w-full bg-gray-800 border-gray-700 rounded-md p-2 mt-1 text-white" /></div><div><label className="text-sm text-gray-400">{t('Return_Time')}</label><input type="time" name="returnTimeQuote" value={formData.returnTimeQuote} onChange={handleChange} className="w-full bg-gray-800 border-gray-700 rounded-md p-2 mt-1 text-white" /></div></motion.div>}</AnimatePresence><div><label className="text-sm text-gray-400">{t('Number_of_Passengers')}</label><input type="number" name="passengers" value={formData.passengers} onChange={handleChange} min="1" className="w-full bg-gray-800 border-gray-700 rounded-md p-2 mt-1 text-white" /></div></div>;
          case 2: return <div className="space-y-4"><div className="grid grid-cols-2 gap-4"><div><label className="text-sm text-gray-400">{t('Full_Name')}</label><input type="text" name="fullName" value={formData.fullName} onChange={handleChange} className="w-full bg-gray-800 border-gray-700 rounded-md p-2 mt-1 text-white" /></div><div><label className="text-sm text-gray-400">{t('Email_Address')}</label><input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full bg-gray-800 border-gray-700 rounded-md p-2 mt-1 text-white" /></div></div><div><label className="text-sm text-gray-400">{t('Phone_Number')}</label><input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="w-full bg-gray-800 border-gray-700 rounded-md p-2 mt-1 text-white" /></div></div>
          case 3: return <div className="text-center"><h3 className="text-2xl font-bold text-white mb-4">{b('quote_review_title_it', 'quote_review_title_en')}</h3><p className="text-gray-400">{b('quote_review_body_it', 'quote_review_body_en')}</p></div>;
        }
      }

      if (isYacht) {
        switch (step) {
          case 1: return (
            <div className="space-y-6">
              {isYacht && (
                <div className="space-y-4 pb-6 border-b border-gray-700">
                  <h3 className="text-lg font-semibold text-white">{t('Configuration')}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-sm text-gray-400">{t('Check_in_Date')}</label><input type="date" name="checkinDate" value={formData.checkinDate} onChange={handleChange} min={today} className="w-full bg-gray-800 border-gray-700 rounded-md p-2 mt-1 text-white" /></div>
                    <div><label className="text-sm text-gray-400">{t('Check_out_Date')}</label><input type="date" name="checkoutDate" value={formData.checkoutDate} onChange={handleChange} min={formData.checkinDate || today} className="w-full bg-gray-800 border-gray-700 rounded-md p-2 mt-1 text-white" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-gray-400">{t('Pickup_Marina')}</label>
                      <select name="pickupMarina" value={formData.pickupMarina} onChange={handleChange} className="w-full bg-gray-800 border-gray-700 rounded-md p-2 mt-1 text-white">
                        {yachtMarinas.map(loc => (<option key={loc.id} value={loc.id}>{getTranslated(loc.label)}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-400">{t('Number_of_Passengers')}</label>
                      <input type="number" name="guests" value={formData.guests} onChange={handleChange} min="1" className="w-full bg-gray-800 border-gray-700 rounded-md p-2 mt-1 text-white" />
                    </div>
                  </div>
                </div>
              )}
              <h3 className="text-lg font-semibold text-white">{t('Personal_Information')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="text-sm text-gray-400">{t('Full_Name')}</label><input type="text" name="fullName" value={formData.fullName} onChange={handleChange} className="w-full bg-gray-800 border-gray-700 rounded-md p-2 mt-1 text-white" /></div>
                <div><label className="text-sm text-gray-400">{t('Email_Address')}</label><input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full bg-gray-800 border-gray-700 rounded-md p-2 mt-1 text-white" /></div>
                <div className="md:col-span-2"><label className="text-sm text-gray-400">{t('Phone_Number')}</label><input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="w-full bg-gray-800 border-gray-700 rounded-md p-2 mt-1 text-white" /></div>
              </div>
            </div>
          );
          case 2: return paymentStepContent;
        }
      }

      return null;
    };

    return null;
  };

  // Show loading while checking authentication
  if (loading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-32 pb-24 bg-black min-h-screen">
        <div className="container mx-auto px-6 flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-dr7-gold mx-auto mb-4"></div>
            <p className="text-white text-lg">{b('loading_it', 'loading_en')}</p>
          </div>
        </div>
      </motion.div>
    );
  }

  // Require authentication for booking
  if (!user) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-32 pb-24 bg-black min-h-screen">
        <div className="container mx-auto px-6 max-w-2xl">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-8 text-center">
            <div className="mb-6">
              <svg className="w-20 h-20 mx-auto text-dr7-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">
              {b('auth_required_title_it', 'auth_required_title_en')}
            </h2>
            <p className="text-gray-400 mb-8">
              {b('auth_required_body_it', 'auth_required_body_en')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => navigate('/signin', { state: { from: location.pathname } })}
                className="px-8 py-3 bg-dr7-gold text-black font-bold hover:bg-dr7-gold/90 transition-colors"
              >
                {b('auth_required_login_cta_it', 'auth_required_login_cta_en')}
              </button>
              <button
                onClick={() => navigate('/signup', { state: { from: location.pathname } })}
                className="px-8 py-3 bg-gray-700 text-white font-bold hover:bg-gray-600 transition-colors"
              >
                {b('auth_required_signup_cta_it', 'auth_required_signup_cta_en')}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="pt-32 pb-24 bg-black min-h-screen">
      <div className="container mx-auto px-6">
        <h1 className="text-5xl md:text-6xl font-bold text-white text-center mb-4">{t('Book_Your')} <span className="text-white">{item.name}</span></h1>
        {renderContent()}
      </div>
    </motion.div>
  );
};

export default BookingPage;

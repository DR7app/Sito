import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { dateLocale } from '../../utils/i18nDate';
import { useCurrency } from '../../contexts/CurrencyContext';
import { PICKUP_LOCATIONS as DEFAULT_PICKUP_LOCATIONS } from '../../constants';
import { getPickupLocations } from '../../utils/getLocations';
import { getContactCopy } from '../../utils/siteCopy';
import { useContactInfo } from '../../hooks/useContactInfo';
import { trackBookingCompleted } from '../../utils/analytics';

const CarBookingConfirmationPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, getTranslated, lang } = useTranslation();
  const { currency } = useCurrency();
  const { booking } = (location.state || {}) as { booking?: any };
  const [pickupLocs, setPickupLocs] = useState(DEFAULT_PICKUP_LOCATIONS);
  const [officeAddress, setOfficeAddress] = useState('Viale Marconi 229, Cagliari 09131');
  const contact = useContactInfo();
  useEffect(() => {
    let c = false;
    getPickupLocations().then(l => { if (!c) setPickupLocs(l); });
    getContactCopy().then(cp => {
      if (c) return;
      const next = lang === 'it' ? cp.office_address_it : cp.office_address_en;
      if (next) setOfficeAddress(next);
    });
    return () => { c = true; };
  }, [lang]);

  useEffect(() => {
    if (booking) trackBookingCompleted(booking);
  }, [booking]);

  if (!booking) {
    return <Navigate to="/" replace />;
  }

  const formatPrice = (priceInCents: number) => 
    new Intl.NumberFormat(currency === 'eur' ? 'it-IT' : 'en-US', { 
      style: 'currency', 
      currency: currency.toUpperCase(), 
      minimumFractionDigits: 2 
    }).format(priceInCents / 100);

  const pickupDate = new Date(booking.pickup_date);
  const dropoffDate = new Date(booking.dropoff_date);
  const pickupLocationDetails = pickupLocs.find(loc => loc.id === booking.pickup_location);
  const customerEmail = booking.booking_details?.customer?.email || 'N/A';

  // Cauzione: prefer the explicit booking column, fall back to the snapshot
  // in booking_details. Renders Senza Cauzione for the no_deposit path.
  const depositAmount = Number(booking.deposit_amount || booking.booking_details?.deposit || 0);
  const depositOption = booking.booking_details?.depositOption;
  const isNoDeposit = depositOption === 'no_deposit';
  const cauzioneLabel = isNoDeposit
    ? t({ it: 'Senza Cauzione (in attesa di approvazione DR7)', en: 'No Deposit (pending DR7 approval)' })
    : depositAmount > 0
      ? `${t({ it: 'Cauzione:', en: 'Deposit:' })} €${depositAmount.toLocaleString(dateLocale(lang))} ${t({ it: '(al ritiro)', en: '(at pick-up)' })}`
      : t({ it: 'Cauzione', en: 'Deposit' });

  const getPickupAddress = () => officeAddress;

  return (
    <div className="min-h-screen bg-black pt-32 pb-24 px-4">
      <div className="bg-gray-900/50 p-8 rounded-lg border border-gray-800 text-white max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-500/20 text-green-300 rounded-full flex items-center justify-center mx-auto mb-6">
            
          </div>
          <h1 className="text-4xl font-bold text-white">{t({ it: "PRENOTAZIONE CONFERMATA!", en: "BOOKING CONFIRMED!" })}</h1>
          <p className="text-gray-300 mt-2">{t({ it: "Grazie per la tua prenotazione!", en: "Thank you for your booking!" })}</p>
          <p className="text-gray-300 mt-1">
            {t({ it: 'Riceverai una conferma via WhatsApp', en: 'You will receive a confirmation via WhatsApp' })}
          </p>
          <p className="text-lg mt-4">
            {t({ it: 'NUMERO PRENOTAZIONE:', en: 'BOOKING NUMBER:' })} <span className="font-bold tracking-wider">{`DR7-${booking.id.substring(0, 4).toUpperCase()}-${booking.id.substring(4, 8).toUpperCase()}`}</span>
          </p>
        </div>

        <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 mb-8">
          <h2 className="text-2xl font-bold mb-4">{t({ it: "Riepilogo della Prenotazione", en: "Booking Summary" })}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="font-semibold">{booking.vehicle_name}</p>
              {booking.vehicle_image_url && (
                <img src={booking.vehicle_image_url} alt={booking.vehicle_name} className="rounded-lg mt-2 w-full h-40 object-cover" />
              )}
            </div>
            <div>
              <p><span className="font-semibold">{t({ it: "Ritiro:", en: "Pick-up:" })}</span> {pickupDate.toLocaleDateString(dateLocale(lang), { timeZone: 'Europe/Rome' })} {t({ it: 'alle', en: 'at' })} {pickupDate.toLocaleTimeString(dateLocale(lang), { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })}</p>
              <p><span className="font-semibold">{t({ it: "Riconsegna:", en: "Drop-off:" })}</span> {dropoffDate.toLocaleDateString(dateLocale(lang), { timeZone: 'Europe/Rome' })} {t({ it: 'alle', en: 'at' })} {dropoffDate.toLocaleTimeString(dateLocale(lang), { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })}</p>
              <p><span className="font-semibold">{t({ it: "Luogo:", en: "Location:" })}</span> {pickupLocationDetails ? getTranslated(pickupLocationDetails.label) : booking.pickup_location}</p>
              <p className="text-2xl font-bold mt-4">{formatPrice(booking.price_total)}</p>
              {!isNoDeposit && depositAmount > 0 && (
                <p className="text-sm text-gray-300 mt-1">
                  {t({ it: 'Cauzione al ritiro:', en: 'Deposit at pick-up:' })} <span className="font-semibold text-white">€{depositAmount.toLocaleString(dateLocale(lang))}</span>
                </p>
              )}
              {isNoDeposit && (
                <p className="text-sm text-amber-300 mt-1">
                  {t({ it: 'Senza Cauzione (in attesa di approvazione)', en: 'No Deposit (pending approval)' })}
                </p>
              )}
              {booking.payment_method === 'agency' && (
                <p className="text-sm text-yellow-400 mt-2">{t({ it: "Da pagare in sede", en: "To be paid on site" })}</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
            <h3 className="text-xl font-bold mb-4">{t({ it: "COSA PORTARE AL RITIRO:", en: "WHAT TO BRING AT PICK-UP:" })}</h3>
            <ul className="space-y-2 text-gray-300">
              <li>{t({ it: "Carta d'identità o passaporto valido", en: "Valid ID card or passport" })}</li>
              <li>{t({ it: "Patente di guida valida", en: "Valid driving licence" })}</li>
              <li>{cauzioneLabel}</li>
              <li>{t({ it: 'Codice prenotazione:', en: 'Booking code:' })} <span className="font-mono">{`DR7-${booking.id.substring(0, 8).toUpperCase()}`}</span></li>
            </ul>
          </div>
          <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
            <h3 className="text-xl font-bold mb-4">{t({ it: "INDIRIZZO RITIRO:", en: "PICK-UP ADDRESS:" })}</h3>
            <p className="text-gray-300">{getPickupAddress()}</p>
            <h3 className="text-xl font-bold mt-6 mb-4">{t({ it: "CONTATTI:", en: "CONTACTS:" })}</h3>
            <div className="flex items-center space-x-4">
              <span>{t({ it: 'Tel:', en: 'Phone:' })} {contact.phone_display}</span>
            </div>
            <div className="flex items-center space-x-4 mt-2">
              <span>Email: {contact.email_address}</span>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col md:flex-row justify-center items-center gap-4">
          <button
            onClick={() => navigate('/account')}
            className="w-full md:w-auto px-6 py-3 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-colors"
          >
            {t({ it: "Vai al Mio Account", en: "Go to My Account" })}
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full md:w-auto px-6 py-3 bg-gray-700 text-white font-bold rounded-full hover:bg-gray-600 transition-colors"
          >
            {t({ it: "Torna alla pagina iniziale", en: "Back to Home" })}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CarBookingConfirmationPage;

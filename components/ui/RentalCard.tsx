import React from 'react';
import type { RentalItem } from '../../types';
import { useTranslation } from '../../hooks/useTranslation';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useContactInfo } from '../../hooks/useContactInfo';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

interface RentalCardProps {
  item: RentalItem;
  onBook: (item: RentalItem) => void;
  marketingPrice?: number;
  marketingTooltip?: string;
  categoryId?: string;
  totalPrice?: number;
  totalDays?: number;
  hidePrice?: boolean;
  hideBookButton?: boolean;
  availableFrom?: string | null;
  jetSearchData?: {
    departure?: string;
    arrival?: string;
    departureDate?: string;
    returnDate?: string;
    passengers?: number;
    tripType?: string;
  };
}

const RentalCard: React.FC<RentalCardProps> = ({ item, onBook, marketingPrice, marketingTooltip, categoryId, totalPrice, totalDays, hidePrice, hideBookButton, jetSearchData, availableFrom }) => {
  const { t, getTranslated } = useTranslation();
  const { currency } = useCurrency();
  const contact = useContactInfo();

  const isVilla = item.id.startsWith('villa');
  const isJet = item.id.startsWith('jet');
  const isHelicopter = item.id.startsWith('heli');
  const isYacht = item.id.startsWith('yacht');
  const isCar = item.id.startsWith('car-');
  // Hide booking button for vehicles with booking_disabled flag in metadata
  const isBlockedCar = isCar && (item as any).bookingDisabled;

  // 2026-06-17: barche (yacht) e aerei (jet/elicottero) usano lo STESSO formato
  // verticale 9/16 delle auto — la card boat/plane deve essere identica alla
  // card auto (richiesta direzione). Le ville restano 4/5.
  const imageAspectRatio = (isJet || isYacht || isHelicopter || isCar) ? 'aspect-[9/16]' : 'aspect-[4/5]';

  const formatPrice = (price: number) => {
    const hasDecimals = price % 1 !== 0;
    return new Intl.NumberFormat(currency === 'eur' ? 'it-IT' : 'en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: hasDecimals ? 2 : 0,
    }).format(price);
  };

  const handleJetQuote = () => {
    let message = `Ciao! Sono interessato a prenotare ${item.name}.\\n\\n`;

    if (jetSearchData) {
      message += `Dettagli del volo:\\n`;
      message += `• Tipo di viaggio: ${jetSearchData.tripType === 'round-trip' ? 'Andata e ritorno' : 'Solo andata'}\\n`;
      if (jetSearchData.departure) message += `• Partenza: ${jetSearchData.departure}\\n`;
      if (jetSearchData.arrival) message += `• Arrivo: ${jetSearchData.arrival}\\n`;
      if (jetSearchData.departureDate) message += `• Data di partenza: ${jetSearchData.departureDate}\\n`;
      if (jetSearchData.returnDate && jetSearchData.tripType === 'round-trip') {
        message += `• Data di ritorno: ${jetSearchData.returnDate}\\n`;
      }
      if (jetSearchData.passengers) message += `• Passeggeri: ${jetSearchData.passengers}\\n`;
      message += `\\n`;
    }

    message += `Potrebbe fornirmi un preventivo? Grazie!`;

    const whatsappUrl = `${contact.whatsapp_url}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  // In flotta mode (no price, no button), card is image-only with overlay name
  const isFlottaMode = hidePrice && hideBookButton;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="bg-black border border-gray-800 rounded-lg overflow-hidden group transition-all duration-300 hover:border-white/50 hover:shadow-2xl hover:shadow-white/10 flex flex-col"
    >
      <div className="relative overflow-hidden">
        <img src={item.image} alt={item.name} className={`w-full ${isFlottaMode ? '' : imageAspectRatio + ' object-cover'} transition-transform duration-500 group-hover:scale-105`} />
        {/* No overlay — show true car colors */}
      </div>
      {!isFlottaMode && <div className="px-6 pt-6 pb-4 flex-grow flex flex-col">
        <div className="mt-auto space-y-2">
          {!hidePrice && (
            <>
              <div>
                {totalPrice && totalDays ? (
                  <div>
                    <p className="text-[11px] text-gray-500 italic mb-0.5">{t({ it: "o similare", en: "or similar" })}</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-white">{formatPrice(totalPrice)}</span>
                      <span className="text-sm text-gray-400">{t({ it: "totale", en: "total" })}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {totalDays} {totalDays === 1 ? t({ it: "giorno", en: "day" }) : t({ it: "giorni", en: "days" })}
                      {item.pricePerDay && (
                        <> — {formatPrice(item.pricePerDay[currency])}/giorno</>
                      )}
                    </div>
                  </div>
                ) : marketingPrice ? (
                  <div className="flex items-baseline flex-wrap gap-x-1">
                    <span className="text-sm text-gray-400">Da </span>
                    <span className="text-2xl font-bold text-white">{formatPrice(marketingPrice)}</span>
                    <span className="text-sm text-gray-400">/{t('per_day')}</span>
                    {marketingTooltip && (
                      <span className="relative group/tip inline-flex items-center ml-1 self-center">
                        <svg className="w-3.5 h-3.5 text-gray-500 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 bg-gray-800 border border-gray-700 text-gray-300 text-[10px] leading-tight rounded whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                          {marketingTooltip}
                        </span>
                      </span>
                    )}
                  </div>
                ) : item.pricePerDay && !isYacht ? (
                  <>
                    <span className="text-xl font-bold text-white">{formatPrice(item.pricePerDay[currency])}</span>
                    <span className="text-sm text-gray-400 ml-1">/{t('per_day')}</span>
                  </>
                ) : null}
              </div>
              {isCar && (
                <div className="flex items-center text-xs text-green-400">
                  <svg className="h-4 w-4 mr-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span>{t({ it: "Assicurazione inclusa", en: "Insurance included" })}</span>
                </div>
              )}
            </>
          )}
        </div>
        {!hideBookButton && (<div className={`mt-3 ${categoryId === 'cars' ? 'text-right' : ''}`}>
          {isVilla ? (
            <Link
              to={`/villas/${item.id}`}
              className="bg-transparent border-2 border-white text-white px-6 py-2 rounded-full font-semibold text-sm transform transition-all duration-300 group-hover:bg-white group-hover:text-black group-hover:scale-105"
            >
              {t('Discover_More')}
            </Link>
          ) : isBlockedCar ? null : (
            <div className="flex flex-col items-end gap-1">
              {availableFrom && (
                <span className="text-xs text-amber-400 font-medium">
                  Disponibile dalle {new Date(availableFrom).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })}
                </span>
              )}
              <button
                onClick={() => {
                  console.log('RentalCard button clicked for:', item.name, 'ID:', item.id, 'isJet:', isJet);
                  if (isJet) handleJetQuote();
                  else {
                    // Attach availableFrom to item so wizard can auto-adjust pickup time
                    if (availableFrom && typeof availableFrom === 'string') {
                      (item as any)._availableFrom = availableFrom;
                    }
                    onBook(item);
                  }
                }}
                className="bg-transparent border-2 border-white text-white px-6 py-2 rounded-full font-semibold text-sm transform transition-all duration-300 group-hover:bg-white group-hover:text-black group-hover:scale-105 whitespace-nowrap"
              >
                {t('Book_Now')}
              </button>
            </div>
          )}
        </div>)}
      </div>}
    </motion.div >
  );
};

export default RentalCard;
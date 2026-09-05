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
  /**
   * Click sulla scheda intera (immagine + nome). In pagina Flotta apre il
   * calendario disponibilita' del veicolo. Se non passata, la scheda resta
   * quello che era: statica, con il suo bottone "Prenota Ora".
   */
  onCardClick?: (item: RentalItem) => void;
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

/**
 * La scheda di collezione.
 *
 * Composizione: l'immagine prende quasi tutta la scheda, le informazioni
 * stanno sotto in una fascia stretta. Niente riquadro, niente ombra: la
 * profondita' viene dal contrasto e dal movimento dell'immagine dentro una
 * cornice che resta ferma.
 *
 * La logica non e' cambiata: stesse prop, stessi rami (villa, jet, veicolo
 * bloccato, prezzo totale/marketing/giornaliero, orario di disponibilita'),
 * stesse azioni. E' cambiata solo l'impaginazione — piu' il NOME del
 * veicolo, che in modalita' flotta prima non compariva affatto.
 */
const RentalCard: React.FC<RentalCardProps> = ({ item, onBook, marketingPrice, marketingTooltip, categoryId, totalPrice, totalDays, hidePrice, hideBookButton, onCardClick, jetSearchData, availableFrom }) => {
  const { t } = useTranslation();
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
    <motion.article
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
      className="group flex flex-col"
    >
      {/* Con `onCardClick` la locandina diventa il bottone della scheda:
          in Flotta e' il gesto che apre il calendario del veicolo. */}
      {onCardClick ? (
        <button
          type="button"
          onClick={() => onCardClick(item)}
          aria-label={item.name}
          className={`media block w-full cursor-pointer text-left ${isFlottaMode ? '' : imageAspectRatio}`}
        >
          <img
            src={item.image}
            alt={item.name}
            loading="lazy"
            decoding="async"
            className={isFlottaMode ? 'w-full' : 'h-full w-full object-cover'}
          />
        </button>
      ) : (
        <div className={`media ${isFlottaMode ? '' : imageAspectRatio}`}>
          <img
            src={item.image}
            alt={item.name}
            loading="lazy"
            decoding="async"
            className={isFlottaMode ? 'w-full' : 'h-full w-full object-cover'}
          />
        </div>
      )}

      {/* Fascia informazioni.
          Il nome del veicolo e' GIA' STAMPATO dentro la locandina (marca,
          modello e scheda tecnica fanno parte dell'immagine, vedi AUDIT.md
          § 3.1). Ripeterlo qui con un titolo grande lo direbbe due volte
          nella stessa card. Resta quindi una riga breve in monospazio, che
          serve a scorrere l'elenco e a chi legge con uno screen reader, senza
          entrare in concorrenza con la tavola. */}
      <div className="flex flex-grow flex-col pt-5">
        <div className="flex items-baseline justify-between gap-5">
          <h3 className="t-meta min-w-0 truncate" style={{ color: 'var(--fg-dim)' }} title={item.name}>
            {item.name}
          </h3>
          {isCar && !hidePrice && (
            <span className="t-eyebrow shrink-0 whitespace-nowrap">
              {t({ it: "Assicurazione inclusa", en: "Insurance included" })}
            </span>
          )}
        </div>

        {/* In Flotta la scheda non ha bottone: questa riga dice che si puo'
            cliccare, altrimenti il calendario resta nascosto dietro una
            locandina che sembra un'immagine e basta. */}
        {onCardClick && (
          <button
            type="button"
            onClick={() => onCardClick(item)}
            className="btn-text mt-3 self-start text-[10px] uppercase tracking-[0.2em]"
            style={{ color: 'var(--c-metal)' }}
          >
            {t({ it: 'Vedi disponibilita', en: 'See availability' })}
          </button>
        )}

        {!isFlottaMode && (
          <div className="mt-5 flex flex-grow flex-col">
            <span className="seam-line" />
            <div className="mt-5">
              {!hidePrice && (
                <div>
                  {totalPrice && totalDays ? (
                    <div>
                      <p className="t-eyebrow">{t({ it: "o similare", en: "or similar" })}</p>
                      <div className="mt-3 flex items-baseline gap-2.5">
                        <span className="t-h2">{formatPrice(totalPrice)}</span>
                        <span className="t-eyebrow">{t({ it: "totale", en: "total" })}</span>
                      </div>
                      <div className="t-meta mt-2.5" style={{ color: 'var(--fg-dim)' }}>
                        {totalDays} {totalDays === 1 ? t({ it: "giorno", en: "day" }) : t({ it: "giorni", en: "days" })}
                        {item.pricePerDay && (
                          <> — {formatPrice(item.pricePerDay[currency])}/giorno</>
                        )}
                      </div>
                    </div>
                  ) : marketingPrice ? (
                    <div className="flex flex-wrap items-baseline gap-x-2.5">
                      <span className="t-eyebrow">Da</span>
                      <span className="t-h2">{formatPrice(marketingPrice)}</span>
                      <span className="t-eyebrow">/{t('per_day')}</span>
                      {marketingTooltip && (
                        <span className="group/tip relative ml-1 inline-flex items-center self-center">
                          <svg className="h-3.5 w-3.5 cursor-help" style={{ color: 'var(--fg-dim)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap border border-[color:var(--line-strong)] bg-[color:var(--c-graphite)] px-3 py-1.5 text-[10px] leading-tight opacity-0 transition-opacity duration-300 group-hover/tip:opacity-100">
                            {marketingTooltip}
                          </span>
                        </span>
                      )}
                    </div>
                  ) : item.pricePerDay && !isYacht ? (
                    <div className="flex flex-wrap items-baseline gap-x-2.5">
                      <span className="t-h2">{formatPrice(item.pricePerDay[currency])}</span>
                      <span className="t-eyebrow">/{t('per_day')}</span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {!hideBookButton && (
              <div className="mt-auto pt-7">
                {isVilla ? (
                  <Link to={`/villas/${item.id}`} className="btn btn-secondary btn-sm w-full sm:w-auto">
                    {t('Discover_More')}
                  </Link>
                ) : isBlockedCar ? null : (
                  <div className="flex flex-col gap-2.5">
                    {availableFrom && (
                      <span className="t-meta" style={{ color: 'var(--c-metal)' }}>
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
                      className="btn btn-secondary btn-sm w-full sm:w-auto"
                    >
                      {t('Book_Now')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.article>
  );
};

export default RentalCard;

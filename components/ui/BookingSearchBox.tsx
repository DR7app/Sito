import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import LocationAutocomplete from './LocationAutocomplete';
import { DR7_OFFICE_LOCATION, type SardegnaLocation } from '../../data/sardegnaLocations';
import { isBlockedDate } from '../../utils/blockedDates';
import {
  getPickupTimesForDateString as getPickupTimes,
  getReturnTimesForDateString as getReturnTimes,
} from '../../utils/noleggioHours';
import { useTranslation } from '../../hooks/useTranslation';
import { dateLocale } from '../../utils/i18nDate';
import { getBookingSearchBoxCopy, type BookingSearchBoxCopy } from '../../utils/siteCopy';

// Pickup/return office hours come from Centralina Pro > Orari Noleggio.

function calcAutoReturnTime(pickupTime: string, returnDateStr: string, pickupDateStr?: string): string {
  const validTimes = getReturnTimes(returnDateStr);
  if (validTimes.length === 0) return '09:00';
  const [h, m] = pickupTime.split(':').map(Number);
  const pickupMin = h * 60 + m;

  // Same-day rental → pick the LATEST available return slot that is still
  // strictly after the pickup time. This way a 10:30 pickup defaults to
  // a 17:00 return (the last weekday slot) rather than 09:00.
  if (pickupDateStr && pickupDateStr === returnDateStr) {
    let bestAfter = '';
    for (const t of validTimes) {
      const [th, tm] = t.split(':').map(Number);
      const tMin = th * 60 + tm;
      if (tMin > pickupMin) bestAfter = t;
    }
    return bestAfter || validTimes[validTimes.length - 1];
  }

  // Multi-day rental → pick the latest slot at or before (pickup − 90min)
  // on the return day so the customer doesn't get billed an extra day.
  const idealMin = pickupMin - 90;
  let best = validTimes[0];
  for (const t of validTimes) {
    const [th, tm] = t.split(':').map(Number);
    if (th * 60 + tm <= idealMin) best = t;
  }
  return best;
}

function formatDateLabel(dateStr: string, lang: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  const dayName = d.toLocaleDateString(dateLocale(lang), { weekday: 'short' });
  const dayNum = d.getDate();
  const month = d.toLocaleDateString(dateLocale(lang), { month: 'short' });
  return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${dayNum} ${month.charAt(0).toUpperCase() + month.slice(1)}`;
}

interface BookingSearchBoxProps {
  variant?: 'hero' | 'popup';
  onClose?: () => void;
}

const BookingSearchBox: React.FC<BookingSearchBoxProps> = ({ variant = 'hero', onClose }) => {
  const navigate = useNavigate();
  const { lang } = useTranslation();
  const [copy, setCopy] = useState<BookingSearchBoxCopy | null>(null);
  const copyRef = useRef<BookingSearchBoxCopy | null>(null);
  useEffect(() => {
    let cancelled = false;
    getBookingSearchBoxCopy().then(c => { if (cancelled) return; copyRef.current = c; setCopy(c); });
    return () => { cancelled = true; };
  }, []);
  const b = (it: keyof BookingSearchBoxCopy, en: keyof BookingSearchBoxCopy): string => {
    const cur = copyRef.current;
    if (!cur) return '';
    return cur[lang === 'it' ? it : en] as string;
  };
  const [pickupLocation, setPickupLocation] = useState<SardegnaLocation>(DR7_OFFICE_LOCATION);
  const [returnLocation, setReturnLocation] = useState<SardegnaLocation>(DR7_OFFICE_LOCATION);
  const [sameReturn, setSameReturn] = useState(true);
  const [pickupDate, setPickupDate] = useState('');
  const [pickupTime, setPickupTimeRaw] = useState('10:30');
  const [returnDate, setReturnDate] = useState('');
  const [returnTime, setReturnTime] = useState('09:00');
  const [returnTimeManual, setReturnTimeManual] = useState(false);
  const [error, setError] = useState('');

  // Delivery fee calculation
  const [deliveryFee, setDeliveryFee] = useState<{ pickupFee: number; returnFee: number; pickupKm: number; returnKm: number; pricePerKm: number } | null>(null);
  const [isCalculatingDelivery, setIsCalculatingDelivery] = useState(false);
  const deliveryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOffice = (loc: SardegnaLocation) => loc.id === 'dr7_cagliari';

  // Calculate delivery fee when location changes
  useEffect(() => {
    if (deliveryDebounceRef.current) clearTimeout(deliveryDebounceRef.current);

    const pickupNeedsDelivery = !isOffice(pickupLocation);
    const returnNeedsDelivery = !sameReturn && !isOffice(returnLocation);

    if (!pickupNeedsDelivery && !returnNeedsDelivery) {
      setDeliveryFee(null);
      setIsCalculatingDelivery(false);
      return;
    }

    setIsCalculatingDelivery(true);

    deliveryDebounceRef.current = setTimeout(async () => {
      try {
        let pickupFee = 0, returnFee = 0, pickupKm = 0, returnKm = 0;

        const calcDistance = async (loc: SardegnaLocation) => {
          const body: any = {};
          if (loc.lat && loc.lon) {
            body.lat = loc.lat;
            body.lon = loc.lon;
          } else {
            body.address = loc.label;
          }
          // 2026-05-29: niente `category` qui — questo e' il search box
          // homepage, il cliente non ha ancora scelto un veicolo. La fn
          // cade sul flat `delivery.price_per_km` come stima alta. La
          // tariffa esatta per categoria viene applicata nel CarBookingWizard.
          const res = await fetch('/.netlify/functions/calculate-delivery-distance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) return null;
          return res.json();
        };

        let pricePerKm = 3;

        if (pickupNeedsDelivery) {
          const data = await calcDistance(pickupLocation);
          if (data) { pickupFee = data.deliveryFee; pickupKm = data.distanceKm; pricePerKm = data.pricePerKm; }
        }

        if (returnNeedsDelivery) {
          const data = await calcDistance(returnLocation);
          if (data) { returnFee = data.deliveryFee; returnKm = data.distanceKm; pricePerKm = data.pricePerKm; }
        }

        // If same return, the driver does one round trip (not two)
        if (sameReturn && pickupNeedsDelivery) {
          setDeliveryFee({ pickupFee, returnFee: 0, pickupKm, returnKm: 0, pricePerKm });
        } else {
          setDeliveryFee({ pickupFee, returnFee, pickupKm, returnKm, pricePerKm });
        }
      } catch {
        setDeliveryFee(null);
      } finally {
        setIsCalculatingDelivery(false);
      }
    }, 800);

    return () => { if (deliveryDebounceRef.current) clearTimeout(deliveryDebounceRef.current); };
  }, [pickupLocation, returnLocation, sameReturn]);

  const totalDeliveryFee = deliveryFee ? deliveryFee.pickupFee + deliveryFee.returnFee : 0;

  const setPickupTime = useCallback((time: string) => {
    setPickupTimeRaw(time);
    if (!returnTimeManual && returnDate) {
      setReturnTime(calcAutoReturnTime(time, returnDate, pickupDate));
    }
  }, [returnTimeManual, returnDate, pickupDate]);

  const handleReturnTimeChange = useCallback((time: string) => {
    setReturnTime(time);
    setReturnTimeManual(true);
  }, []);

  const today = new Date().toISOString().split('T')[0];
  const pickupTimes = useMemo(() => getPickupTimes(pickupDate), [pickupDate]);
  const returnTimes = useMemo(() => getReturnTimes(returnDate), [returnDate]);

  const days = (() => {
    if (!pickupDate || !returnDate) return 0;
    // Same-day rental → always 1 day. The "return is less than 90min before
    // pickup → +1 day" rule only applies when pickup and return are on
    // different calendar days; on the same day there is no "next day" to
    // bill for.
    if (pickupDate === returnDate) return 1;
    const baseDays = Math.max(1, Math.ceil((new Date(returnDate).getTime() - new Date(pickupDate).getTime()) / (1000 * 60 * 60 * 24)));
    const [pH, pM] = pickupTime.split(':').map(Number);
    const [rH, rM] = returnTime.split(':').map(Number);
    if ((pH * 60 + pM) - (rH * 60 + rM) < 90) return baseDays + 1;
    return baseDays;
  })();

  const isSunday = (d: string) => d && new Date(d + 'T12:00:00').getDay() === 0;
  const isBlocked = (d: string) => d && isBlockedDate(new Date(d + 'T12:00:00'));

  const handleSearch = () => {
    setError('');
    if (!pickupDate) { setError(b('err_pickup_date_required_it', 'err_pickup_date_required_en')); return; }
    if (!returnDate) { setError(b('err_return_date_required_it', 'err_return_date_required_en')); return; }
    if (isBlocked(pickupDate)) { setError(b('err_blocked_pickup_it', 'err_blocked_pickup_en')); return; }
    if (isBlocked(returnDate)) { setError(b('err_blocked_return_it', 'err_blocked_return_en')); return; }
    if (returnDate < pickupDate) { setError(b('err_return_before_pickup_it', 'err_return_before_pickup_en')); return; }
    if (returnDate === pickupDate && returnTime <= pickupTime) {
      setError(b('err_return_time_before_pickup_it', 'err_return_time_before_pickup_en'));
      return;
    }

    const params = new URLSearchParams({
      pickup: pickupDate, pickupTime,
      return: returnDate, returnTime,
      pickupLoc: pickupLocation.id,
      pickupLocLabel: pickupLocation.label,
      returnLoc: sameReturn ? pickupLocation.id : returnLocation.id,
      returnLocLabel: sameReturn ? pickupLocation.label : returnLocation.label,
    });
    if (onClose) onClose();
    navigate(`/supercar-luxury?${params.toString()}`);
  };

  const isPopup = variant === 'popup';

  return (
    <div className={isPopup ? '' : 'bg-[#1c1c1e]/80 backdrop-blur-2xl border border-white/[0.06] rounded-[20px] p-6 max-w-[420px] w-full'}>
      {!isPopup && (
        <h3 className="text-[17px] font-semibold text-white text-center mb-5">{b('title_it', 'title_en')}</h3>
      )}

      <div className="space-y-4">
        {/* Location */}
        <LocationAutocomplete
          value={pickupLocation.label}
          onChange={(loc) => { setPickupLocation(loc); if (sameReturn) setReturnLocation(loc); }}
          label={b('pickup_location_label_it', 'pickup_location_label_en')}
          placeholder={b('pickup_location_placeholder_it', 'pickup_location_placeholder_en')}
        />

        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <div className={`w-[22px] h-[22px] rounded-[7px] flex items-center justify-center transition-colors ${sameReturn ? 'bg-white' : 'bg-white/10 border border-white/20'}`}>
            {sameReturn && <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          </div>
          <input type="checkbox" checked={sameReturn} onChange={(e) => { setSameReturn(e.target.checked); if (e.target.checked) setReturnLocation(pickupLocation); }} className="sr-only" />
          <span className="text-[13px] text-white/50">{b('same_return_note_it', 'same_return_note_en')}</span>
        </label>

        {!sameReturn && (
          <LocationAutocomplete value={returnLocation.label} onChange={setReturnLocation} label={b('return_location_label_it', 'return_location_label_en')} placeholder={b('return_location_placeholder_it', 'return_location_placeholder_en')} />
        )}

        {/* ── PICKUP ── */}
        <div>
          <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">{b('pickup_section_label_it', 'pickup_section_label_en')}</p>
          <div className="flex gap-2">
            <DatePicker
              selected={pickupDate ? new Date(pickupDate + 'T12:00:00') : null}
              onChange={(date: Date | null) => {
                if (!date) return;
                const yyyy = date.getFullYear();
                const mm = String(date.getMonth() + 1).padStart(2, '0');
                const dd = String(date.getDate()).padStart(2, '0');
                const val = `${yyyy}-${mm}-${dd}`;
                setPickupDate(val);
                const times = getPickupTimes(val);
                if (times.length > 0 && !times.includes(pickupTime)) setPickupTimeRaw(times[0]);
                if (!returnDate || val >= returnDate) {
                  const next = new Date(val); next.setDate(next.getDate() + 1);
                  const nextStr = next.toISOString().split('T')[0];
                  setReturnDate(nextStr);
                  if (!returnTimeManual) setReturnTime(calcAutoReturnTime(pickupTime, nextStr, val));
                }
              }}
              filterDate={(date: Date) => !isBlockedDate(date)}
              minDate={new Date()}
              dateFormat="dd/MM/yyyy"
              placeholderText={b('date_placeholder_it', 'date_placeholder_en')}
              className="flex-1 bg-white/[0.06] text-white text-[15px] font-medium rounded-xl px-4 py-3.5 min-h-[50px] border-0 outline-none cursor-pointer w-full"
            />
            <select
              value={pickupTime}
              onChange={(e) => setPickupTime(e.target.value)}
              style={{ colorScheme: 'dark', WebkitAppearance: 'none', appearance: 'none' }}
              className="bg-[#2c2c2e] text-white text-[15px] font-semibold rounded-xl px-3 py-3.5 min-h-[50px] border border-white/10 outline-none cursor-pointer w-[85px] text-center appearance-none"
            >
              {pickupTimes.length > 0
                ? pickupTimes.map(t => <option key={t} value={t} className="bg-[#2c2c2e] text-white">{t}</option>)
                : <option value={pickupTime} className="bg-[#2c2c2e] text-white">{pickupTime}</option>}
            </select>
          </div>
          {isBlocked(pickupDate) && <p className="text-xs text-red-400 mt-1.5">{b('closed_message_it', 'closed_message_en')}</p>}
        </div>

        {/* ── RETURN ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">{b('return_section_label_it', 'return_section_label_en')}</p>
            {days > 0 && (
              <span className="text-xs font-bold text-white bg-white/10 px-3 py-1">
                {days} {days === 1 ? 'giorno' : 'giorni'}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <DatePicker
              selected={returnDate ? new Date(returnDate + 'T12:00:00') : null}
              onChange={(date: Date | null) => {
                if (!date) return;
                const yyyy = date.getFullYear();
                const mm = String(date.getMonth() + 1).padStart(2, '0');
                const dd = String(date.getDate()).padStart(2, '0');
                const val = `${yyyy}-${mm}-${dd}`;
                setReturnDate(val);
                const times = getReturnTimes(val);
                if (times.length > 0 && !times.includes(returnTime)) {
                  if (!returnTimeManual) setReturnTime(calcAutoReturnTime(pickupTime, val, pickupDate));
                  else setReturnTime(times[0]);
                }
              }}
              filterDate={(date: Date) => !isBlockedDate(date)}
              minDate={pickupDate ? new Date(pickupDate + 'T12:00:00') : new Date()}
              dateFormat="dd/MM/yyyy"
              placeholderText={b('date_placeholder_it', 'date_placeholder_en')}
              style={{ colorScheme: 'dark' }}
              className="flex-1 bg-white/[0.06] text-white text-[15px] font-medium rounded-xl px-4 py-3.5 min-h-[50px] border-0 outline-none cursor-pointer"
            />
            <select
              value={returnTime}
              onChange={(e) => handleReturnTimeChange(e.target.value)}
              style={{ colorScheme: 'dark', WebkitAppearance: 'none', appearance: 'none' }}
              className="bg-[#2c2c2e] text-white text-[15px] font-semibold rounded-xl px-3 py-3.5 min-h-[50px] border border-white/10 outline-none cursor-pointer w-[85px] text-center appearance-none"
            >
              {returnTimes.length > 0
                ? returnTimes.map(t => <option key={t} value={t} className="bg-[#2c2c2e] text-white">{t}</option>)
                : <option value={returnTime} className="bg-[#2c2c2e] text-white">{returnTime}</option>}
            </select>
          </div>
          {isBlocked(returnDate) && <p className="text-xs text-red-400 mt-1.5">{b('closed_message_it', 'closed_message_en')}</p>}
        </div>

        {error && <p className="text-xs text-red-400 text-center font-medium">{error}</p>}
        {/* Tariff warning — only relevant for MULTI-day rentals where a late
            return triggers the "+1 day" billing rule. For 1-day rentals
            (same-day OR a single calendar-day cross-over) the warning would
            be misleading: the customer is already paying for the only day
            they have, so there's no extra-day risk to flag. */}
        {(() => {
          if (!pickupTime || !returnTime || !returnDate) return null;
          if (days <= 1) return null;
          const [pH, pM] = pickupTime.split(':').map(Number);
          const [rH, rM] = returnTime.split(':').map(Number);
          const defaultReturnMin = pH * 60 + pM - 90;
          const returnMin = rH * 60 + rM;
          if (returnMin < defaultReturnMin + 30) return null;
          return (
            <div className="text-center space-y-0.5">
              <p className="text-[12px] text-red-400 font-semibold">{b('rate_warning_title_it', 'rate_warning_title_en')}</p>
              <p className="text-[10px] text-red-400/60">{b('rate_warning_body_it', 'rate_warning_body_en')}</p>
            </div>
          );
        })()}

        {/* Delivery fee display */}
        {isCalculatingDelivery && (
          <p className="text-[12px] text-white/40 text-center">{b('delivery_calc_loading_it', 'delivery_calc_loading_en')}</p>
        )}
        {!isCalculatingDelivery && totalDeliveryFee > 0 && (
          <div className="p-3 bg-white/[0.04] border border-white/10 rounded-xl">
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/60">{b('delivery_label_it', 'delivery_label_en')}</span>
              <span className="text-white font-semibold">+€{totalDeliveryFee.toFixed(0)}</span>
            </div>
            {deliveryFee && (
              <p className="text-[11px] text-white/30 mt-1">
                {deliveryFee.pickupKm > 0 && `${b('delivery_breakdown_consegna_it', 'delivery_breakdown_consegna_en')}: ${deliveryFee.pickupKm} km × €${deliveryFee.pricePerKm}/km`}
                {deliveryFee.returnKm > 0 && deliveryFee.pickupKm > 0 && ' + '}
                {deliveryFee.returnKm > 0 && `${b('delivery_breakdown_riconsegna_it', 'delivery_breakdown_riconsegna_en')}: ${deliveryFee.returnKm} km × €${deliveryFee.pricePerKm}/km`}
              </p>
            )}
          </div>
        )}

        <button
          onClick={handleSearch}
          disabled={!pickupDate || !returnDate}
          className={`w-full py-4 font-bold text-[16px] transition-all ${
            pickupDate && returnDate
              ? 'bg-white text-black hover:bg-white/90 active:scale-[0.97]'
              : 'bg-white/[0.06] text-white/20 cursor-not-allowed'
          }`}
        >
          {b('search_cta_it', 'search_cta_en')}
        </button>
      </div>
    </div>
  );
};

export default BookingSearchBox;

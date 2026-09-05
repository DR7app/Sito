/**
 * Noleggio (rental) hours helper — website browser side.
 *
 * Reads `centralina_pro_config.config.noleggio_hours` once at module load
 * (cached), exposes synchronous helpers for the customer-facing rental
 * booking flow (CarBookingWizard, VehicleSearchForm, BookingSearchBox).
 *
 * Default fallback matches the legacy hardcoded schedule:
 *   Pickup
 *     Lun-Ven: 10:30-12:30 + 16:30-18:30
 *     Sab:     10:30-16:30
 *     Dom:     CHIUSO
 *   Riconsegna
 *     Lun-Ven: 09:00-11:00 + 15:00-17:00
 *     Sab:     09:00-15:00
 *     Dom:     CHIUSO
 *
 * Operators edit the schedule in admin > Centralina Pro > Orari Noleggio.
 * Changes take effect on next page reload.
 */

import { supabase } from '../supabaseClient';
import { getHolidayForDate } from './italianHolidays';

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface TimeWindow { start: string; end: string }
export interface DayHours { is_open: boolean; windows: TimeWindow[] }
export type WeekHours = Record<DayKey, DayHours>;
export interface NoleggioHoursConfig {
  hours_pickup: WeekHours;
  hours_return: WeekHours;
  slot_minutes: number;
}

const PICKUP_WEEKDAY: DayHours = { is_open: true, windows: [{ start: '10:30', end: '12:30' }, { start: '16:30', end: '18:30' }] };
const PICKUP_SAT: DayHours = { is_open: true, windows: [{ start: '10:30', end: '16:30' }] };
const RETURN_WEEKDAY: DayHours = { is_open: true, windows: [{ start: '09:00', end: '11:00' }, { start: '15:00', end: '17:00' }] };
const RETURN_SAT: DayHours = { is_open: true, windows: [{ start: '09:00', end: '15:00' }] };
const CLOSED: DayHours = { is_open: false, windows: [] };

const DEFAULT_CONFIG: NoleggioHoursConfig = {
  slot_minutes: 15,
  hours_pickup: {
    mon: PICKUP_WEEKDAY, tue: PICKUP_WEEKDAY, wed: PICKUP_WEEKDAY,
    thu: PICKUP_WEEKDAY, fri: PICKUP_WEEKDAY, sat: PICKUP_SAT, sun: CLOSED,
  },
  hours_return: {
    mon: RETURN_WEEKDAY, tue: RETURN_WEEKDAY, wed: RETURN_WEEKDAY,
    thu: RETURN_WEEKDAY, fri: RETURN_WEEKDAY, sat: RETURN_SAT, sun: CLOSED,
  },
};

let CONFIG: NoleggioHoursConfig = DEFAULT_CONFIG;

/**
 * La lettura degli orari da Centralina Pro parte al caricamento del modulo
 * e sostituisce `CONFIG` quando arriva. Chi legge gli orari in modo
 * SINCRONO mentre disegna (il calendario disponibilita' costruisce la
 * griglia dei mesi una volta sola) userebbe i valori di fabbrica e non si
 * ridisegnerebbe mai piu': `orariPronti()` esiste per aspettare quel
 * momento. Chi legge gli orari a ogni interazione (il wizard) non ne ha
 * bisogno e non cambia.
 */
const CARICAMENTO: Promise<void> = (async () => {
  try {
    const { data } = await supabase
      .from('centralina_pro_config')
      .select('config')
      .eq('id', 'main')
      .maybeSingle();
    const cfg = (data?.config ?? null) as Record<string, unknown> | null;
    const nh = cfg?.noleggio_hours as Partial<NoleggioHoursConfig> | undefined;
    if (nh && (nh.hours_pickup || nh.hours_return)) {
      const slot = typeof nh.slot_minutes === 'number' && nh.slot_minutes > 0 ? nh.slot_minutes : DEFAULT_CONFIG.slot_minutes;
      CONFIG = {
        slot_minutes: slot,
        hours_pickup: { ...DEFAULT_CONFIG.hours_pickup, ...(nh.hours_pickup || {}) } as WeekHours,
        hours_return: { ...DEFAULT_CONFIG.hours_return, ...(nh.hours_return || {}) } as WeekHours,
      };
    }
  } catch {
    // keep DEFAULT_CONFIG
  }
})();

/** Si risolve quando gli orari sono stati letti (o la lettura e' fallita
 *  e restano quelli di fabbrica). Non rifiuta mai. */
export function orariPronti(): Promise<void> {
  return CARICAMENTO;
}

const DAY_INDEX: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function dayKeyFromDate(date: Date): DayKey {
  return DAY_INDEX[date.getDay()];
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function getSlotMinutes(): number {
  return CONFIG.slot_minutes || DEFAULT_CONFIG.slot_minutes;
}

// 2026-05-30: festività nazionali italiane chiuse come domenica.
const HOLIDAY_CLOSED: DayHours = { is_open: false, windows: [] };

export function getPickupDayHours(date: Date): DayHours {
  if (getHolidayForDate(date)) return HOLIDAY_CLOSED;
  const key = dayKeyFromDate(date);
  return CONFIG.hours_pickup[key] ?? DEFAULT_CONFIG.hours_pickup[key];
}

export function getReturnDayHours(date: Date): DayHours {
  if (getHolidayForDate(date)) return HOLIDAY_CLOSED;
  const key = dayKeyFromDate(date);
  return CONFIG.hours_return[key] ?? DEFAULT_CONFIG.hours_return[key];
}

function generateSlots(day: DayHours, step: number): string[] {
  if (!day.is_open) return [];
  const out: string[] = [];
  for (const w of day.windows) {
    const startMin = timeToMinutes(w.start);
    const endMin = timeToMinutes(w.end);
    // include endpoints: 10:30, 10:45, ..., 12:30
    for (let m = startMin; m <= endMin; m += step) {
      out.push(minutesToTime(m));
    }
  }
  return out;
}

/** All bookable pickup times for the date. Returns [] if closed. */
export function getPickupTimesForDate(date: Date): string[] {
  return generateSlots(getPickupDayHours(date), getSlotMinutes());
}

/** All bookable return times for the date. Returns [] if closed. */
export function getReturnTimesForDate(date: Date): string[] {
  return generateSlots(getReturnDayHours(date), getSlotMinutes());
}

/** Accepts 'YYYY-MM-DD' string and returns pickup slots for that date. */
export function getPickupTimesForDateString(dateStr: string): string[] {
  if (!dateStr) return [];
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return [];
  return getPickupTimesForDate(d);
}

/** Accepts 'YYYY-MM-DD' string and returns return slots for that date. */
export function getReturnTimesForDateString(dateStr: string): string[] {
  if (!dateStr) return [];
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return [];
  return getReturnTimesForDate(d);
}

/** True if pickup is closed on the given date. */
export function isPickupClosed(date: Date): boolean {
  return !getPickupDayHours(date).is_open;
}

/** True if return is closed on the given date. */
export function isReturnClosed(date: Date): boolean {
  return !getReturnDayHours(date).is_open;
}

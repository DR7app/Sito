import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../hooks/useAuth';

/** Una riga di `bookings`, con i soli campi che l'app mostra. */
export interface AppBooking {
  id: string;
  service_type: string | null;
  service_name: string | null;
  vehicle_name: string | null;
  vehicle_plate: string | null;
  pickup_date: string | null;
  dropoff_date: string | null;
  appointment_date: string | null;
  appointment_time: string | null;
  pickup_location: string | null;
  price_total: number | null; // centesimi
  payment_status: string | null;
  status: string | null;
  booked_at: string | null;
}

const CLOSED = new Set(['cancelled', 'annullata', 'completed', 'completata']);
export const isOpenBooking = (b: AppBooking) => !CLOSED.has((b.status || '').toLowerCase());

export const bookingStart = (b: AppBooking) => {
  const s = b.pickup_date || (b.appointment_date ? `${b.appointment_date}T${b.appointment_time || '00:00'}` : null);
  return s ? new Date(s) : null;
};
export const bookingEnd = (b: AppBooking) => (b.dropoff_date ? new Date(b.dropoff_date) : bookingStart(b));

/**
 * Le prenotazioni del cliente, lette dalla stessa tabella del sito e del
 * gestionale. Si aggiornano da sole quando il gestionale cambia una riga.
 */
export function useMyBookings() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AppBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setRows([]); setLoading(false); return; }
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from('bookings')
        .select('id,service_type,service_name,vehicle_name,vehicle_plate,pickup_date,dropoff_date,appointment_date,appointment_time,pickup_location,price_total,payment_status,status,booked_at')
        .eq('user_id', user.id)
        .order('booked_at', { ascending: false })
        .limit(50);
      if (alive) { setRows((data as AppBooking[]) || []); setLoading(false); }
    };
    void load();
    const ch = supabase
      .channel(`app-bookings-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `user_id=eq.${user.id}` }, () => { void load(); })
      .subscribe();
    return () => { alive = false; void supabase.removeChannel(ch); };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = Date.now();
  const upcoming = rows
    .filter((b) => isOpenBooking(b) && (bookingEnd(b)?.getTime() ?? 0) >= now)
    .sort((a, b) => (bookingStart(a)?.getTime() ?? 0) - (bookingStart(b)?.getTime() ?? 0));
  const past = rows.filter((b) => !upcoming.includes(b));

  return { rows, upcoming, past, next: upcoming[0] ?? null, loading };
}

export const fmtDay = (d: Date | null, lang: 'it' | 'en' = 'it') =>
  d ? d.toLocaleDateString(lang === 'it' ? 'it-IT' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Rome' }) : '—';
export const fmtTime = (d: Date | null) =>
  d ? d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : '';

/** "tra 3 giorni", "tra 5 ore", "in corso". */
export function untilLabel(b: AppBooking, lang: 'it' | 'en' = 'it') {
  const s = bookingStart(b)?.getTime(); const e = bookingEnd(b)?.getTime();
  if (!s) return '';
  const now = Date.now();
  if (now >= s && (!e || now <= e)) return lang === 'it' ? 'In corso' : 'In progress';
  const h = Math.round((s - now) / 36e5);
  if (h < 1) return lang === 'it' ? 'Tra meno di un\'ora' : 'In under an hour';
  if (h < 36) return lang === 'it' ? `Tra ${h} ${h === 1 ? 'ora' : 'ore'}` : `In ${h} h`;
  const d = Math.round(h / 24);
  return lang === 'it' ? `Tra ${d} giorni` : `In ${d} days`;
}

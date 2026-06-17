import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import type { NoleggioCatalogItem } from '../../hooks/useNoleggioCatalog';

const FUNCTIONS_BASE =
  (import.meta as any).env?.VITE_FUNCTIONS_BASE ??
  (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:8888' : (typeof window !== 'undefined' ? window.location.origin : ''));

interface Departure {
  id: string;
  departure_date: string;   // yyyy-mm-dd
  departure_time: string;   // HH:MM:SS
  price_per_seat_cents: number | null;
}
interface Seat {
  id: string;
  seat_label: string;
  seat_position: number;
  price_cents: number | null;
  status: string;
}

function eur(cents: number): string {
  return (cents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}
function fmtDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
}

interface Props {
  item: NoleggioCatalogItem;
  waHref: string;          // fallback WhatsApp se non ci sono date
  onClose: () => void;
}

const SEAT_BASE = 'w-12 h-12 rounded-lg border text-sm font-semibold flex items-center justify-center transition-colors';

export default function TourBookingModal({ item, waHref, onClose }: Props) {
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState<string>('');
  const [departureId, setDepartureId] = useState<string>('');
  const [seats, setSeats] = useState<Seat[]>([]);
  const [seatsLoading, setSeatsLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cust, setCust] = useState({ name: '', email: '', phone: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const todayYmd = new Date().toLocaleDateString('en-CA');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('noleggio_tour_departures')
        .select('id, departure_date, departure_time, price_per_seat_cents, status')
        .eq('catalog_id', item.id)
        .eq('status', 'scheduled')
        .gte('departure_date', todayYmd)
        .order('departure_date', { ascending: true })
        .order('departure_time', { ascending: true });
      if (cancelled) return;
      setDepartures((data || []) as Departure[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const dates = useMemo(() => Array.from(new Set(departures.map(d => d.departure_date))), [departures]);
  const timesForDate = useMemo(() => departures.filter(d => d.departure_date === date), [departures, date]);
  const departure = useMemo(() => departures.find(d => d.id === departureId) || null, [departures, departureId]);

  // Carica i posti quando si sceglie la partenza
  useEffect(() => {
    if (!departureId) { setSeats([]); setSelected(new Set()); return; }
    let cancelled = false;
    (async () => {
      setSeatsLoading(true);
      const { data } = await supabase
        .from('noleggio_tour_seats')
        .select('id, seat_label, seat_position, price_cents, status')
        .eq('departure_id', departureId)
        .order('seat_position', { ascending: true });
      if (cancelled) return;
      setSeats((data || []) as Seat[]);
      setSelected(new Set());
      setSeatsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [departureId]);

  function toggleSeat(s: Seat) {
    if (s.status !== 'available') return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
      return next;
    });
  }

  const seatPriceCents = (s: Seat) =>
    s.price_cents != null ? s.price_cents
      : departure?.price_per_seat_cents != null ? departure.price_per_seat_cents
        : item.price_per_day;
  const totalCents = useMemo(
    () => seats.filter(s => selected.has(s.id)).reduce((sum, s) => sum + seatPriceCents(s), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seats, selected, departure],
  );

  async function submit() {
    setError('');
    if (selected.size === 0) { setError('Seleziona almeno un posto.'); return; }
    if (!cust.name.trim() || !cust.phone.trim()) { setError('Inserisci nome e telefono.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${FUNCTIONS_BASE}/.netlify/functions/book-tour`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departureId, seatIds: Array.from(selected), customer: { name: cust.name.trim(), email: cust.email.trim(), phone: cust.phone.trim() } }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || 'Errore prenotazione.'); setSubmitting(false); return; }

      // Richiedi il link di pagamento Nexi e reindirizza
      const payRes = await fetch(`${FUNCTIONS_BASE}/.netlify/functions/create-nexi-payment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: data.amountEuros, currency: 'eur', description: data.description, orderId: data.bookingId, customerEmail: cust.email.trim(), customerName: cust.name.trim() }),
      });
      const payData = await payRes.json();
      if (!payRes.ok || !payData?.paymentUrl) { setError(payData?.error || 'Prenotazione creata ma errore nel link di pagamento. Ti contatteremo su WhatsApp.'); setSubmitting(false); return; }
      window.location.href = payData.paymentUrl;
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={() => !submitting && onClose()}>
      <div className="bg-black border border-gray-800 rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="text-xl font-semibold text-white">Prenota: {item.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400">Caricamento date…</div>
        ) : departures.length === 0 ? (
          <div className="py-8 text-center space-y-4">
            <p className="text-gray-400">Nessuna data disponibile al momento.</p>
            <a href={waHref} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center px-5 py-3 rounded-full border-2 border-white text-white font-semibold hover:bg-white hover:text-black transition-colors">
              Richiedi su WhatsApp
            </a>
          </div>
        ) : (
          <div className="space-y-5">
            {/* 1. Data */}
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider">1. Scegli la data</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {dates.map(d => (
                  <button key={d} onClick={() => { setDate(d); setDepartureId(''); }}
                    className={`px-3 py-2 rounded-lg border text-sm capitalize ${date === d ? 'border-white bg-white text-black font-semibold' : 'border-gray-700 text-gray-300 hover:border-white'}`}>
                    {fmtDate(d)}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Orario */}
            {date && (
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider">2. Scegli l'orario</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {timesForDate.map(t => (
                    <button key={t.id} onClick={() => setDepartureId(t.id)}
                      className={`px-3 py-2 rounded-lg border text-sm tabular-nums ${departureId === t.id ? 'border-white bg-white text-black font-semibold' : 'border-gray-700 text-gray-300 hover:border-white'}`}>
                      {t.departure_time.slice(0, 5)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Posti */}
            {departureId && (
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider">3. Scegli i posti</label>
                {seatsLoading ? (
                  <div className="mt-2 text-gray-400 text-sm">Caricamento posti…</div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {seats.map(s => {
                      const isSel = selected.has(s.id);
                      const avail = s.status === 'available';
                      return (
                        <button key={s.id} onClick={() => toggleSeat(s)} disabled={!avail}
                          className={`${SEAT_BASE} ${isSel ? 'border-white bg-white text-black' : avail ? 'border-emerald-500/60 text-emerald-300 hover:border-white' : 'border-gray-800 text-gray-600 line-through cursor-not-allowed'}`}
                          title={avail ? 'Disponibile' : 'Occupato'}>
                          {s.seat_label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 4. Cliente */}
            {selected.size > 0 && (
              <div className="space-y-2">
                <label className="text-xs text-gray-400 uppercase tracking-wider">4. I tuoi dati</label>
                <input className="w-full px-3 py-2 bg-white/5 border border-gray-700 rounded-lg text-white placeholder:text-gray-500" placeholder="Nome e cognome" value={cust.name} onChange={e => setCust({ ...cust, name: e.target.value })} />
                <input className="w-full px-3 py-2 bg-white/5 border border-gray-700 rounded-lg text-white placeholder:text-gray-500" placeholder="Telefono (WhatsApp)" value={cust.phone} onChange={e => setCust({ ...cust, phone: e.target.value })} />
                <input className="w-full px-3 py-2 bg-white/5 border border-gray-700 rounded-lg text-white placeholder:text-gray-500" placeholder="Email (opzionale)" value={cust.email} onChange={e => setCust({ ...cust, email: e.target.value })} />
              </div>
            )}

            {error && <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}

            {/* Riepilogo + CTA */}
            {selected.size > 0 && (
              <div className="border-t border-gray-800 pt-4 flex items-center justify-between gap-3">
                <div className="text-white">
                  <div className="text-sm text-gray-400">{selected.size} posto/i</div>
                  <div className="text-xl font-bold">{totalCents > 0 ? eur(totalCents) : 'Prezzo da definire'}</div>
                </div>
                <button onClick={submit} disabled={submitting || totalCents <= 0}
                  className="px-6 py-3 rounded-full bg-white text-black font-semibold hover:opacity-90 disabled:opacity-50">
                  {submitting ? 'Attendi…' : 'Prenota e paga'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

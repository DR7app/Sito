import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../hooks/useAuth';
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
  hold_expires_at?: string | null;
}

// Un posto e' prenotabile se 'available' OPPURE in 'held' ma con hold scaduto
// (pagamento mai completato): l'hold non paga e dopo la scadenza torna libero.
function seatIsAvailable(s: Seat): boolean {
  if (s.status === 'available') return true;
  if (s.status === 'held' && s.hold_expires_at) return s.hold_expires_at < new Date().toISOString();
  return false;
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

// Posizioni posti (% sulla foto cabina) — Bell 407 GX/GXP: 1 anteriore, 2-3 centrali, 4-5-6 posteriori.
const HELI_407_SEATS: Record<number, { x: number; y: number }> = {
  1: { x: 50, y: 24 },
  2: { x: 44, y: 41 }, 3: { x: 56, y: 41 },
  4: { x: 40, y: 49 }, 5: { x: 50, y: 49 }, 6: { x: 59, y: 49 },
};

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
  const { user } = useAuth();

  // Cliente loggato: precompila nome + email dall'account (non li richiediamo di
  // nuovo). Chiediamo solo il telefono (per la conferma WhatsApp) se mancante.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const u = user as any;
      const meta = u.user_metadata || {};
      let name = meta.full_name || [meta.nome, meta.cognome].filter(Boolean).join(' ').trim() || meta.name || '';
      let phone = meta.phone || meta.telefono || '';
      const email = u.email || meta.email || '';
      // Profilo completo da customers_extended (i metadata auth spesso non hanno
      // nome/telefono): così il cliente loggato NON deve reinserire nulla.
      try {
        let prof: { nome?: string; cognome?: string; telefono?: string } | null = null;
        const byId = await supabase.from('customers_extended').select('nome, cognome, telefono').eq('user_id', u.id).maybeSingle();
        prof = byId.data;
        if (!prof && email) {
          const byEmail = await supabase.from('customers_extended').select('nome, cognome, telefono').ilike('email', email).maybeSingle();
          prof = byEmail.data;
        }
        if (prof) {
          if (!name) name = [prof.nome, prof.cognome].filter(Boolean).join(' ').trim();
          if (!phone) phone = prof.telefono || '';
        }
      } catch { /* profilo opzionale */ }
      if (cancelled) return;
      setCust(c => ({
        name: c.name || name,
        email: c.email || email,
        phone: c.phone || phone,
      }));
    })();
    return () => { cancelled = true; };
  }, [user]);

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
        .select('id, seat_label, seat_position, price_cents, status, hold_expires_at')
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
    if (!seatIsAvailable(s)) return;
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
    // Loggato: l'identità arriva dall'account (nome/email), serve solo il
    // telefono per la conferma WhatsApp. Non loggato: nome + telefono.
    if (!cust.phone.trim()) { setError('Inserisci il numero di telefono.'); return; }
    if (!user && !cust.name.trim()) { setError('Inserisci nome e telefono.'); return; }
    // Nome effettivo: quello del profilo, altrimenti l'email dell'account.
    const effName = cust.name.trim() || cust.email.trim() || 'Cliente';
    setSubmitting(true);
    try {
      const res = await fetch(`${FUNCTIONS_BASE}/.netlify/functions/book-tour`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departureId,
          seatIds: Array.from(selected),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          userId: (user as any)?.id || null,
          customer: { name: effName, email: cust.email.trim(), phone: cust.phone.trim() },
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || 'Errore prenotazione.'); setSubmitting(false); return; }

      // Checkout carta standard Nexi (come il noleggio auto): amount in CENTESIMI,
      // currency 'EUR', orderId = nexiOrderId (alfanumerico, ritrovabile dal
      // callback). Salviamo l'orderId per il fallback di PaymentSuccessPage.
      const orderId = data.nexiOrderId || data.bookingId;
      try { sessionStorage.setItem('dr7_pending_order', orderId); } catch { /* ignore */ }
      const amountCents = data.amountCents != null ? data.amountCents : Math.round((data.amountEuros || 0) * 100);
      const payRes = await fetch(`${FUNCTIONS_BASE}/.netlify/functions/create-nexi-payment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountCents, currency: 'EUR', description: data.description, orderId,
          customerEmail: cust.email.trim(), customerName: effName,
          // Checkout carta standard che TOKENIZZA la carta (CONTRACT_CREATION),
          // così l'admin può eventualmente addebitare in seguito (Addebito MIT),
          // come per le ricariche wallet. contractId = orderId.
          recurringType: 'MIT_UNSCHEDULED',
        }),
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
                ) : item.service_type === 'heli_rental' && seats.some(s => HELI_407_SEATS[s.seat_position]) ? (
                  <div className="mt-3 relative mx-auto w-full max-w-[260px] select-none">
                    <img src="/heli-407-seatmap.png" alt="Mappa posti elicottero" draggable={false}
                      className="w-full rounded-xl border border-gray-800" />
                    {seats.map(s => {
                      const posn = HELI_407_SEATS[s.seat_position];
                      if (!posn) return null;
                      const isSel = selected.has(s.id);
                      const avail = seatIsAvailable(s);
                      const cls = isSel ? 'bg-white text-black ring-white'
                        : avail ? 'bg-emerald-500/90 text-white ring-emerald-300 hover:scale-110'
                        : 'bg-red-600/80 text-white ring-red-400 cursor-not-allowed';
                      return (
                        <button key={s.id} type="button" onClick={() => avail && toggleSeat(s)} disabled={!avail}
                          style={{ left: `${posn.x}%`, top: `${posn.y}%` }}
                          className={`absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full text-sm font-bold flex items-center justify-center ring-2 shadow-lg transition ${cls}`}
                          title={avail ? `Posto ${s.seat_label} disponibile` : 'Occupato'}>
                          {s.seat_label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {seats.map(s => {
                      const isSel = selected.has(s.id);
                      const avail = seatIsAvailable(s);
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
                {user ? (
                  <>
                    {/* Loggato: nome + email dall'account, chiediamo solo il telefono. */}
                    {(cust.name || cust.email) && (
                      <div className="text-xs text-gray-400">
                        Prenoti come <span className="text-white">{cust.name || cust.email}</span>{cust.name && cust.email ? ` · ${cust.email}` : ''}
                      </div>
                    )}
                    <input className="w-full px-3 py-2 bg-white/5 border border-gray-700 rounded-lg text-white placeholder:text-gray-500" placeholder="Telefono (WhatsApp)" value={cust.phone} onChange={e => setCust({ ...cust, phone: e.target.value })} />
                  </>
                ) : (
                  <>
                    <input className="w-full px-3 py-2 bg-white/5 border border-gray-700 rounded-lg text-white placeholder:text-gray-500" placeholder="Nome e cognome" value={cust.name} onChange={e => setCust({ ...cust, name: e.target.value })} />
                    <input className="w-full px-3 py-2 bg-white/5 border border-gray-700 rounded-lg text-white placeholder:text-gray-500" placeholder="Telefono (WhatsApp)" value={cust.phone} onChange={e => setCust({ ...cust, phone: e.target.value })} />
                    <input className="w-full px-3 py-2 bg-white/5 border border-gray-700 rounded-lg text-white placeholder:text-gray-500" placeholder="Email (opzionale)" value={cust.email} onChange={e => setCust({ ...cust, email: e.target.value })} />
                  </>
                )}
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

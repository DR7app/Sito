import { createClient } from "@supabase/supabase-js";
import { getCorsOrigin } from './utils/cors';

// Prenotazione biglietti Tour (Noleggio Aria/Mare): valida i posti scelti,
// crea la prenotazione (service_type heli_rental/boat_rental), marca i posti
// come venduti e collega il booking. Il front-end poi chiede a
// create-nexi-payment il link di pagamento usando il bookingId restituito.
// Service role: bypassa RLS (il sito anon non puo' scrivere i posti).

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handler = async (event: any) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': getCorsOrigin(event.headers?.origin || event.headers?.Origin),
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { departureId, seatIds, customer } = JSON.parse(event.body || '{}');
    if (!departureId || !Array.isArray(seatIds) || seatIds.length === 0 || !customer?.name) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Dati mancanti (partenza, posti o cliente).' }) };
    }

    // Partenza + tour (catalogo)
    const { data: dep, error: depErr } = await supabase
      .from('noleggio_tour_departures')
      .select('id, catalog_id, departure_date, departure_time, price_per_seat_cents, status')
      .eq('id', departureId).single();
    if (depErr || !dep) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'Partenza non trovata.' }) };
    if (dep.status !== 'scheduled') return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Partenza non disponibile.' }) };

    const { data: tour } = await supabase
      .from('noleggio_catalog')
      .select('name, price_per_day, service_type')
      .eq('id', dep.catalog_id).single();

    // Posti richiesti: devono essere tutti available
    const { data: seats, error: seatErr } = await supabase
      .from('noleggio_tour_seats')
      .select('id, seat_label, price_cents, status')
      .eq('departure_id', departureId).in('id', seatIds);
    if (seatErr || !seats || seats.length !== seatIds.length) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Posti non validi.' }) };
    }
    const unavailable = seats.filter(s => s.status !== 'available');
    if (unavailable.length) {
      return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ error: 'Alcuni posti non sono più disponibili.', seats: unavailable.map(s => s.seat_label) }) };
    }

    // Prezzo: override posto -> override partenza -> prezzo catalogo
    const seatPriceCents = (s: { price_cents: number | null }) =>
      s.price_cents != null ? s.price_cents
        : dep.price_per_seat_cents != null ? dep.price_per_seat_cents
          : (tour?.price_per_day || 0);
    const totalCents = seats.reduce((sum, s) => sum + seatPriceCents(s), 0);
    if (totalCents <= 0) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Prezzo posto non impostato: imposta il prezzo nel pannello admin (Tour).' }) };
    }

    const seatLabels = seats.map(s => s.seat_label).join(', ');
    const pickupISO = new Date(`${dep.departure_date}T${dep.departure_time}`).toISOString();

    // Prenotazione
    const { data: booking, error: bErr } = await supabase.from('bookings').insert({
      service_type: tour?.service_type || 'heli_rental',
      vehicle_name: tour?.name || 'Tour Elicottero',
      pickup_date: pickupISO,
      dropoff_date: pickupISO,
      price_total: totalCents,
      status: 'pending',
      payment_status: 'pending',
      customer_name: customer.name,
      customer_email: customer.email || null,
      customer_phone: customer.phone || null,
      booking_details: { tour_departure_id: departureId, seats: seatLabels, seat_count: seats.length },
      created_at: new Date().toISOString(),
    }).select('id').single();
    if (bErr || !booking) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Errore creazione prenotazione: ' + (bErr?.message || '') }) };
    }

    // Marca i posti come venduti SOLO se ancora available (anti race-condition)
    const { data: updated, error: upErr } = await supabase
      .from('noleggio_tour_seats')
      .update({ status: 'sold', booking_id: booking.id, customer_name: customer.name, customer_phone: customer.phone || null })
      .in('id', seatIds).eq('status', 'available')
      .select('id');
    if (upErr || !updated || updated.length !== seatIds.length) {
      // Rollback: qualcuno ha preso un posto nel frattempo -> annulla la prenotazione
      await supabase.from('noleggio_tour_seats').update({ status: 'available', booking_id: null, customer_name: null, customer_phone: null }).eq('booking_id', booking.id);
      await supabase.from('bookings').delete().eq('id', booking.id);
      return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ error: 'Posti appena occupati da un altro cliente. Riprova con altri posti.' }) };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        bookingId: booking.id,
        amountEuros: totalCents / 100,
        description: `${tour?.name || 'Tour'} — ${seats.length} posto/i (${seatLabels})`,
      }),
    };
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: (e as Error).message }) };
  }
};

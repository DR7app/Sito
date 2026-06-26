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
    const { departureId, seatIds, customer, userId, paymentMethod } = JSON.parse(event.body || '{}');
    if (!departureId || !Array.isArray(seatIds) || seatIds.length === 0 || !customer?.name) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Dati mancanti (partenza, posti o cliente).' }) };
    }
    // Pagamento con Credit Wallet: richiede un utente loggato (il wallet e'
    // legato all'account). Tutto il flusso (validazione posti + addebito + posto
    // venduto) avviene server-side con service role, atomico, anti-oversell.
    const isWallet = paymentMethod === 'credit_wallet';
    if (isWallet && !userId) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Devi effettuare il login per pagare con Credit Wallet.' }) };
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

    // LIBERA i posti "appesi" da pagamenti mai completati PRIMA di prenotare:
    //  - sito: il posto si riserva SOLO a pagamento avvenuto. Un posto 'sold'
    //    legato a una prenotazione NON pagata e' un residuo (vecchio flusso o
    //    bug) -> liberalo. Un 'held' scaduto (cliente non ha pagato entro il
    //    tempo del link) -> liberalo. Gli 'held' ancora validi (pagamento in
    //    corso) e i 'sold' PAGATI restano intatti.
    const nowIso = new Date().toISOString();
    const { data: occ } = await supabase
      .from('noleggio_tour_seats')
      .select('id, status, hold_expires_at, booking_id')
      .eq('departure_id', departureId).in('status', ['held', 'sold']).not('booking_id', 'is', null);
    if (occ && occ.length) {
      const occBookingIds = Array.from(new Set(occ.map(s => s.booking_id)));
      const { data: bks } = await supabase.from('bookings').select('id, payment_status').in('id', occBookingIds);
      const paidSet = new Set(['paid', 'succeeded', 'completed']);
      const unpaid = new Set((bks || []).filter(b => !paidSet.has(String(b.payment_status || '').toLowerCase())).map(b => b.id));
      const toRelease = occ.filter(s => {
        if (!unpaid.has(s.booking_id)) return false;            // pagato -> mai liberare
        if (s.status === 'sold') return true;                   // venduto ma non pagato -> residuo
        return !s.hold_expires_at || s.hold_expires_at < nowIso; // hold scaduto
      }).map(s => s.id);
      if (toRelease.length) {
        await supabase.from('noleggio_tour_seats')
          .update({ status: 'available', booking_id: null, customer_name: null, customer_phone: null, hold_expires_at: null })
          .in('id', toRelease);
      }
    }

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

    // OrderId Nexi alfanumerico (sopravvive alla sanitizzazione di
    // create-nexi-payment, che rimuove i trattini). Lo salviamo sul booking
    // così nexi-callback ritrova la prenotazione (match su nexi_order_id) e
    // manda conferma/fattura. Stesso schema del noleggio auto (CarBookingWizard).
    const nexiOrderId = `DR7${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Dati comuni della prenotazione. seat_ids serve a nexi-callback per marcare
    // i posti 'sold' dopo il pagamento (flusso carta: la prenotazione nasce SOLO
    // a pagamento confermato).
    const commonBookingData: Record<string, unknown> = {
      service_type: tour?.service_type || 'heli_rental',
      vehicle_name: tour?.name || 'Tour Elicottero',
      pickup_date: pickupISO,
      dropoff_date: pickupISO,
      price_total: totalCents,
      // Cliente loggato: collega l'account (punti, "Le mie prenotazioni", ecc.).
      user_id: userId || null,
      nexi_order_id: nexiOrderId,
      customer_name: customer.name,
      customer_email: customer.email || null,
      customer_phone: customer.phone || null,
      // Soddisfa il check bookings_user_or_guest_check (user_id OPPURE guest_name).
      guest_name: customer.name,
      guest_email: customer.email || null,
      guest_phone: customer.phone || null,
      booking_details: { tour_departure_id: departureId, seats: seatLabels, seat_count: seats.length, seat_ids: seatIds, nexi_order_id: nexiOrderId },
    };

    if (isWallet) {
      // --- FLUSSO WALLET: pagamento immediato col credito -> la prenotazione
      // nasce gia' confermata/pagata. ---
      const { data: booking, error: bErr } = await supabase.from('bookings').insert({
        ...commonBookingData,
        status: 'confirmed',
        payment_status: 'succeeded',
        payment_method: 'credit_wallet',
        created_at: new Date().toISOString(),
      }).select('id').single();
      if (bErr || !booking) {
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Errore creazione prenotazione: ' + (bErr?.message || '') }) };
      }
      // --- FLUSSO WALLET: addebita PRIMA, poi marca i posti venduti ---
      // 1) Addebito atomico (RPC deduct_credits lavora in EURO, FOR UPDATE: niente
      //    double-spend). reference_id = bookingId (UUID).
      const totalEuros = totalCents / 100;
      const { data: dedData, error: dedErr } = await supabase.rpc('deduct_credits', {
        p_user_id: userId,
        p_amount: totalEuros,
        p_description: `Tour ${tour?.name || ''} — ${seats.length} posto/i (${seatLabels})`,
        p_reference_id: booking.id,
        p_transaction_type: 'tour_booking',
      });
      const dedResult = (dedData && (dedData[0] || dedData)) || null;
      if (dedErr || !dedResult?.success) {
        // Addebito fallito: nessun credito tolto -> elimina la prenotazione, niente posti.
        await supabase.from('bookings').delete().eq('id', booking.id);
        const msg = dedErr?.message || dedResult?.error_message || 'Credito insufficiente';
        return { statusCode: 402, headers: corsHeaders, body: JSON.stringify({ error: msg }) };
      }

      // 2) Posti -> 'sold' (pagamento gia' avvenuto) SOLO se ancora available (anti race).
      const { data: soldSeats, error: soldErr } = await supabase
        .from('noleggio_tour_seats')
        .update({ status: 'sold', hold_expires_at: null, booking_id: booking.id, customer_name: customer.name, customer_phone: customer.phone || null })
        .in('id', seatIds).eq('status', 'available')
        .select('id');
      if (soldErr || !soldSeats || soldSeats.length !== seatIds.length) {
        // Qualcuno ha preso un posto nel frattempo: RIMBORSA il credito e annulla tutto.
        await supabase.from('noleggio_tour_seats').update({ status: 'available', booking_id: null, customer_name: null, customer_phone: null, hold_expires_at: null }).eq('booking_id', booking.id);
        try {
          await supabase.rpc('add_credits', {
            p_user_id: userId,
            p_amount: totalEuros,
            p_description: `Rimborso automatico: posti tour non piu' disponibili`,
            p_reference_id: booking.id,
            p_reference_type: 'refund',
          });
        } catch (refundErr) {
          console.error('[book-tour] CRITICAL: refund failed after seat conflict:', refundErr);
        }
        await supabase.from('bookings').delete().eq('id', booking.id);
        return { statusCode: 409, headers: corsHeaders, body: JSON.stringify({ error: 'Posti appena occupati da un altro cliente. Riprova con altri posti.' }) };
      }

      // 3) Conferma cliente/admin via WhatsApp (stesso routing del nexi-callback:
      //    send-whatsapp-notification -> tour_new -> pro_conferma_tour). NIENTE
      //    fattura per credit_wallet (la ricarica wallet e' gia' fatturata).
      const siteUrl = process.env.URL || process.env.SITE_URL || '';
      const notify = async (body: Record<string, unknown>) => {
        try {
          await fetch(`${siteUrl}/.netlify/functions/send-whatsapp-notification`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          });
        } catch (e) { console.error('[book-tour] WhatsApp notify failed (non-fatal):', e); }
      };
      const fullBooking = {
        id: booking.id,
        service_type: tour?.service_type || 'heli_rental',
        vehicle_name: tour?.name || 'Tour Elicottero',
        pickup_date: pickupISO,
        dropoff_date: pickupISO,
        price_total: totalCents,
        payment_status: 'succeeded',
        payment_method: 'credit_wallet',
        customer_name: customer.name,
        customer_email: customer.email || null,
        customer_phone: customer.phone || null,
        booking_details: { tour_departure_id: departureId, seats: seatLabels, seat_count: seats.length },
      };
      await notify({ booking: fullBooking });                                   // admin
      if (customer.phone) await notify({ booking: fullBooking, customPhone: customer.phone }); // cliente

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          bookingId: booking.id,
          paid: true,
          paymentMethod: 'credit_wallet',
          newBalance: dedResult?.new_balance ?? null,
          amountCents: totalCents,
          amountEuros: totalEuros,
          description: `${tour?.name || 'Tour'} — ${seats.length} posto/i (${seatLabels})`,
        }),
      };
    }

    // --- FLUSSO CARTA (Nexi): NESSUN record, NESSUN posto bloccato ---
    // Se il cliente arriva su Nexi e NON paga, dal sito non resta NIENTE: nessuna
    // prenotazione "da saldare" e nessun posto riservato. Salviamo i dati in
    // pending_nexi_bookings; sara' nexi-callback, SOLO a pagamento confermato, a
    // creare la prenotazione e marcare i posti 'sold' (vedi booking_details.seat_ids).
    const { error: pendErr } = await supabase
      .from('pending_nexi_bookings')
      .insert({ nexi_order_id: nexiOrderId, booking_data: commonBookingData });
    if (pendErr) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Errore preparazione pagamento: ' + pendErr.message }) };
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        nexiOrderId,
        amountCents: totalCents,
        amountEuros: totalCents / 100,
        description: `${tour?.name || 'Tour'} — ${seats.length} posto/i (${seatLabels})`,
      }),
    };
  } catch (e) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: (e as Error).message }) };
  }
};

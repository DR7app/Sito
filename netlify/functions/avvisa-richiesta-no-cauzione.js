/**
 * Richiesta "No Cauzione" dal sito: avviso a Valerio (25/10/2026).
 *
 * Il wizard salvava la richiesta e mandava il riepilogo solo al numero admin
 * di default: Valerio, che approva, non lo riceveva. Qui il riepilogo va al
 * suo numero (scheda admin, altrimenti destinatari dei ticket), con
 * l'indicazione di dove approvare. Approvando, il cliente riceve il link di
 * pagamento e la prenotazione si chiude da sola quando paga.
 *
 * Solo richieste vere e recenti, e un avviso per richiesta: chi chiama la
 * function non sceglie ne' il destinatario ne' il testo.
 *
 * Body: { bookingId: string }
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EMAIL_APPROVA = 'valerio@dr7.app';
const MAX_ETA_MS = 30 * 60 * 1000;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function dataOra(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('it-IT', {
      timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch { return iso; }
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { bookingId } = JSON.parse(event.body || '{}');
    if (!bookingId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'bookingId mancante' }) };

    const { data: booking, error } = await supabase
      .from('bookings')
      .select('id, customer_name, customer_email, customer_phone, vehicle_name, pickup_date, dropoff_date, price_total, created_at, booking_details')
      .eq('id', bookingId)
      .maybeSingle();
    if (error) throw error;
    const dettagli = (booking && booking.booking_details) || {};
    if (!booking || dettagli.no_cauzione_request !== true) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Richiesta non trovata' }) };
    }
    if (Date.now() - new Date(booking.created_at).getTime() > MAX_ETA_MS) {
      return { statusCode: 200, headers, body: JSON.stringify({ inviato: false, motivo: 'richiesta non recente' }) };
    }
    if (dettagli.no_cauzione_avviso_valerio_at) {
      return { statusCode: 200, headers, body: JSON.stringify({ inviato: false, motivo: 'avviso gia inviato' }) };
    }

    // Numero: la scheda admin; se vuota (oggi lo e'), il destinatario
    // "Valerio" dei ticket, che si gestisce dall'admin.
    const { data: admin } = await supabase
      .from('admins')
      .select('contatto_interno')
      .eq('email', EMAIL_APPROVA)
      .maybeSingle();
    let telefono = String((admin && admin.contatto_interno) || '').replace(/\D/g, '');
    if (telefono.length < 8) {
      const { data: destinatari } = await supabase
        .from('ticket_recipients')
        .select('whatsapp')
        .ilike('nome', 'valerio%')
        .eq('attivo', true)
        .limit(1);
      telefono = String((destinatari && destinatari[0] && destinatari[0].whatsapp) || '').replace(/\D/g, '');
    }
    if (telefono.length < 8) {
      console.error('[avvisa-richiesta-no-cauzione] contatto_interno di', EMAIL_APPROVA, 'mancante');
      return { statusCode: 200, headers, body: JSON.stringify({ inviato: false, motivo: 'numero di Valerio mancante' }) };
    }

    // Prenotazione dell'invio: vince chi scrive per primo.
    const { data: prenotato } = await supabase
      .from('bookings')
      .update({ booking_details: { ...dettagli, no_cauzione_avviso_valerio_at: new Date().toISOString() } })
      .eq('id', booking.id)
      .is('booking_details->>no_cauzione_avviso_valerio_at', null)
      .select('id')
      .maybeSingle();
    if (!prenotato) {
      return { statusCode: 200, headers, body: JSON.stringify({ inviato: false, motivo: 'avviso gia inviato' }) };
    }

    const cliente = dettagli.customer || {};
    const nome = booking.customer_name || [cliente.firstName, cliente.lastName].filter(Boolean).join(' ') || 'N/A';
    const messaggio = `*RICHIESTA NO CAUZIONE DAL SITO*\n\n`
      + `*Cliente:* ${nome}\n`
      + `*Email:* ${booking.customer_email || cliente.email || 'N/A'}\n`
      + `*Tel:* ${booking.customer_phone || cliente.phone || 'N/A'}\n`
      + `*Veicolo:* ${booking.vehicle_name || 'N/A'}\n`
      + `*Periodo:* ${dataOra(booking.pickup_date)} → ${dataOra(booking.dropoff_date)}\n`
      + `*Totale:* €${(Number(booking.price_total || 0) / 100).toFixed(2)}\n`
      + `*Supplemento No Cauzione:* €${Number(dettagli.noDepositSurcharge || 0).toFixed(2)}/giorno\n\n`
      + `Approva da admin > Preventivi > Richieste No Cauzione: il cliente riceve il link di pagamento e la prenotazione si conferma quando paga.`;

    const baseUrl = process.env.URL || 'https://dr7.app';
    const res = await fetch(`${baseUrl}/.netlify/functions/send-whatsapp-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customPhone: telefono, customMessage: messaggio, skipHeader: true }),
    });
    const esito = await res.json().catch(() => ({}));
    return { statusCode: 200, headers, body: JSON.stringify({ inviato: res.ok && esito.success !== false }) };
  } catch (err) {
    console.error('[avvisa-richiesta-no-cauzione]', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Errore' }) };
  }
};

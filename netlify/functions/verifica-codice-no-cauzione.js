/**
 * Codice "No Cauzione" inserito dal cliente nel wizard (25/10/2026).
 *
 * action 'verifica': il codice vale per questo account? (non lo consuma)
 * action 'usa': consuma il codice per una prenotazione gia' creata e pagata
 *   dal wizard (Credit Wallet). Col pagamento Nexi lo consuma nexi-callback.
 *
 * POST { codice, action?: 'verifica' | 'usa', bookingId? }
 * Authorization: Bearer <jwt del cliente>
 */
const { createClient } = require('@supabase/supabase-js');
const { leggiCodiceValido, segnaUsato, normalizza } = require('./utils/codiceNoCauzione.js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const jwt = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
    if (!jwt) return { statusCode: 401, headers, body: JSON.stringify({ ok: false, errore: 'Accedi per usare il codice.' }) };
    const { data: userData } = await supabase.auth.getUser(jwt);
    const utente = userData && userData.user;
    if (!utente || !utente.email) return { statusCode: 401, headers, body: JSON.stringify({ ok: false, errore: 'Sessione non valida.' }) };

    const { codice, action, bookingId } = JSON.parse(event.body || '{}');
    if (!normalizza(codice)) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, errore: 'Inserisci il codice.' }) };

    const esito = await leggiCodiceValido(supabase, codice, utente.email);
    if (!esito.ok) return { statusCode: 200, headers, body: JSON.stringify(esito) };

    if (action === 'usa') {
      if (!bookingId) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, errore: 'Prenotazione mancante.' }) };
      // Solo una prenotazione di questo cliente che porta questo codice.
      const { data: booking } = await supabase
        .from('bookings')
        .select('id, user_id, customer_name, booking_details')
        .eq('id', bookingId)
        .maybeSingle();
      const codiceBooking = normalizza(booking && booking.booking_details && booking.booking_details.no_cauzione_codice);
      if (!booking || booking.user_id !== utente.id || codiceBooking !== normalizza(codice)) {
        return { statusCode: 403, headers, body: JSON.stringify({ ok: false, errore: 'Prenotazione non valida.' }) };
      }
      await segnaUsato(supabase, codice, booking.id, booking.customer_name);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, codice: esito.riga.code }) };
  } catch (err) {
    console.error('[verifica-codice-no-cauzione]', err);
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, errore: 'Codice non verificabile in questo momento.' }) };
  }
};

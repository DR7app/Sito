/**
 * Contratto dell'auto di cortesia per i lavaggi pagati col Credit Wallet
 * (25/11/2026). Col pagamento Nexi lo fa nexi-callback; col wallet la riga
 * ombra la crea la pagina, che poi chiama qui.
 *
 * POST { parentBookingId } — si procede solo se il lavaggio e' pagato e ha
 * un'auto di cortesia collegata. Una volta sola (vedi utils/contrattoCortesia).
 */
const { createClient } = require('@supabase/supabase-js');
const { inviaContrattoCortesia } = require('./utils/contrattoCortesia.js');

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
const PAGATO = ['paid', 'succeeded', 'completed', 'pagato'];

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  try {
    const { parentBookingId } = JSON.parse(event.body || '{}');
    if (!/^[0-9a-f-]{36}$/i.test(String(parentBookingId || ''))) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'parentBookingId richiesto' }) };
    }
    const { data: lavaggio } = await supabase
      .from('bookings').select('id, payment_status, booking_details').eq('id', parentBookingId).maybeSingle();
    if (!lavaggio) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Prenotazione non trovata' }) };
    if (!PAGATO.includes(String(lavaggio.payment_status || '').toLowerCase())) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, motivo: 'non ancora pagato' }) };
    }
    const ombraId = lavaggio.booking_details && lavaggio.booking_details.supercar_experience
      && lavaggio.booking_details.supercar_experience.shadow_booking_id;
    const esito = await inviaContrattoCortesia(supabase, ombraId);
    return { statusCode: 200, headers, body: JSON.stringify(esito) };
  } catch (e) {
    console.error('[contratto-auto-cortesia]', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Errore interno' }) };
  }
};

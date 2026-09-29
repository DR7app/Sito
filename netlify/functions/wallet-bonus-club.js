const { createClient } = require('@supabase/supabase-js');
const { getCorsOrigin } = require('./utils/cors');

/**
 * Bonus di iscrizione DR7 Club (10 EUR) sul Credit Wallet.
 *
 * 29/09/2026 — prima lo accreditava il wizard dal browser con add_credits,
 * una volta per PRENOTAZIONE: dalla console lo si poteva ripetere a piacere.
 * Qui: serve un DR7 Club attivo sull'account, e il bonus si da' una volta
 * sola per account (anche le righe storiche 'dr7_club_signup_bonus' contano).
 *
 * POST {}  —  Authorization: Bearer <jwt del cliente>
 */
const BONUS_EUR = 10;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': getCorsOrigin(event.headers.origin || event.headers.Origin),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const jwt = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
    if (!jwt) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Accesso richiesto' }) };

    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { data: userData } = await supabase.auth.getUser(jwt);
    const userId = userData && userData.user && userData.user.id;
    if (!userId) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Sessione non valida' }) };

    const { data: gia } = await supabase
      .from('credit_transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('transaction_type', 'credit')
      .in('reference_type', ['club_signup_bonus', 'dr7_club_signup_bonus'])
      .limit(1);
    if (gia && gia.length > 0) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, gia: true }) };

    const { data: club } = await supabase
      .from('dr7_club_subscriptions')
      .select('id, expires_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);
    const attivo = club && club[0] && (!club[0].expires_at || new Date(club[0].expires_at).getTime() > Date.now());
    if (!attivo) return { statusCode: 409, headers, body: JSON.stringify({ error: 'Nessun DR7 Club attivo' }) };

    const { data, error } = await supabase.rpc('add_credits', {
      p_user_id: userId,
      p_amount: BONUS_EUR,
      p_description: `DR7 Club — Bonus iscrizione €${BONUS_EUR}`,
      p_reference_id: club[0].id,
      p_reference_type: 'club_signup_bonus',
    });
    const esito = Array.isArray(data) ? data[0] : data;
    if (error || !esito || !esito.success) {
      console.error('[wallet-bonus-club] accredito fallito:', (error && error.message) || (esito && esito.error_message));
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Accredito non riuscito' }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('[wallet-bonus-club]', err && err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Errore interno' }) };
  }
};

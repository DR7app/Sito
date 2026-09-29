const { createClient } = require('@supabase/supabase-js');
const { getCorsOrigin } = require('./utils/cors');
const { finalizzaRicarica } = require('./utils/ricaricaWallet');

/**
 * Chiude una ricarica Credit Wallet dalla pagina di esito del pagamento.
 *
 * 29/09/2026 — prima era la pagina (browser) a mettere la riga a 'succeeded'
 * e ad accreditare con add_credits: bastava chiamare la RPC dalla console per
 * accreditarsi qualunque cifra. Ora il browser chiede e basta; qui si
 * controlla chi e', si chiede a Nexi quanto ha incassato e si accredita con
 * la stessa funzione del webhook (utils/ricaricaWallet.js).
 *
 * POST { orderId }  —  Authorization: Bearer <jwt del cliente>
 */
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
    const { orderId } = JSON.parse(event.body || '{}');
    if (!orderId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'orderId obbligatorio' }) };

    const jwt = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
    if (!jwt) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Accesso richiesto' }) };

    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { data: userData } = await supabase.auth.getUser(jwt);
    const userId = userData && userData.user && userData.user.id;
    if (!userId) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Sessione non valida' }) };

    const { data: purchase, error } = await supabase
      .from('credit_wallet_purchases')
      .select('*')
      .eq('nexi_order_id', orderId)
      .maybeSingle();
    if (error || !purchase) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Ricarica non trovata' }) };
    if (purchase.user_id !== userId) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Ricarica di un altro account' }) };

    const esito = await finalizzaRicarica(supabase, purchase);
    if (esito.nonPagata) {
      return { statusCode: 402, headers, body: JSON.stringify({ ok: false, error: 'Pagamento non confermato da Nexi', reason: esito.reason }) };
    }

    const { data: aggiornata } = await supabase
      .from('credit_wallet_purchases')
      .select('*')
      .eq('id', purchase.id)
      .maybeSingle();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, gia: !!esito.gia, principale: esito.principale, bonus: esito.bonus, purchase: aggiornata || purchase }),
    };
  } catch (err) {
    console.error('[wallet-ricarica-finalizza]', err && err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Errore interno' }) };
  }
};

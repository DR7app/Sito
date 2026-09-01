const crypto = require('crypto');
const { getCorsOrigin } = require('./utils/cors');

/**
 * Verifica server-to-server l'esito reale di un ordine Nexi.
 *
 * PERCHE' ESISTE
 * PaymentSuccessPage e' una pagina del BROWSER: ci si arriva anche senza aver
 * pagato (tasto indietro, refresh, ritorno dal 3DS annullato, link riaperto,
 * redirect di Nexi su esito KO). Prima di questa funzione la pagina si fidava
 * del solo fatto di essere stata raggiunta: marcava la prenotazione
 * `succeeded`, generava la fattura e faceva partire il WhatsApp "pagato" —
 * anche quando su Nexi non risultava nessun incasso.
 *
 * L'unica fonte di verita' e' Nexi. Qui interroghiamo /orders/{orderId} con la
 * chiave API (mai esposta al browser) e rispondiamo `paid` solo se l'ordine
 * risulta davvero AUTHORIZED/EXECUTED.
 *
 * FAIL-CLOSED: qualsiasi dubbio (chiave mancante, API irraggiungibile, ordine
 * sconosciuto, esito assente) => `paid: false`. Il pagamento vero viene
 * comunque finalizzato dal webhook `nexi-callback`, che parla direttamente con
 * Nexi: meglio una conferma in ritardo che un "pagato" mai incassato.
 */

// Esiti Nexi che valgono come "soldi presi".
// AUTHORIZED = autorizzato (incasso garantito), EXECUTED = eseguito.
// PENDING / DECLINED / DENIED / CANCELED / FAILED / VOIDED => NON pagato.
const ESITI_PAGATI = ['AUTHORIZED', 'EXECUTED'];

const isPagato = (esito) => ESITI_PAGATI.includes(String(esito || '').toUpperCase());

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': getCorsOrigin(event.headers['origin']),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ paid: false, reason: 'method_not_allowed' }) };
  }

  try {
    const { orderId } = JSON.parse(event.body || '{}');

    if (!orderId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ paid: false, reason: 'missing_order_id' }) };
    }

    // create-nexi-payment invia a Nexi l'orderId ripulito (solo alfanumerici,
    // max 50). Interroghiamo con la stessa forma, altrimenti Nexi risponde 404
    // su ogni ordine il cui id conteneva trattini.
    const nexiOrderId = String(orderId).replace(/[^a-zA-Z0-9]/g, '').substring(0, 50);
    if (!nexiOrderId) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ paid: false, reason: 'invalid_order_id' }) };
    }

    const apiKey = process.env.NEXI_API_KEY;
    if (!apiKey) {
      console.error('[nexi-verify-order] NEXI_API_KEY non configurata — verifica impossibile');
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ paid: false, reason: 'api_key_missing' }) };
    }

    const baseUrl = (process.env.NEXI_ENVIRONMENT || 'production') === 'production'
      ? 'https://xpay.nexigroup.com/api/phoenix-0.0/psp/api/v1'
      : 'https://xpaysandbox.nexigroup.com/api/phoenix-0.0/psp/api/v1';

    const correlationId = crypto.randomBytes(16).toString('hex')
      .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');

    const res = await fetch(`${baseUrl}/orders/${nexiOrderId}`, {
      method: 'GET',
      headers: { 'X-API-KEY': apiKey, 'Correlation-Id': correlationId },
    });

    if (!res.ok) {
      // 404 = ordine mai arrivato a Nexi (link aperto e abbandonato).
      console.warn(`[nexi-verify-order] Nexi HTTP ${res.status} per ordine ${nexiOrderId}`);
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ paid: false, reason: res.status === 404 ? 'order_not_found_on_nexi' : `nexi_http_${res.status}` }),
      };
    }

    const data = await res.json();

    // Nexi espone l'esito in piu' punti a seconda del flusso: campo diretto,
    // stato dell'ordine, oppure la lista delle operazioni.
    let esito = data.operationResult || (data.orderStatus && data.orderStatus.lastOperationResult) || null;

    if (!isPagato(esito) && Array.isArray(data.operations)) {
      // Un ordine puo' avere piu' operazioni (tentativo rifiutato + ritentativo
      // riuscito): basta UNA autorizzazione/incasso andata a buon fine.
      const op = data.operations.find(o => o && isPagato(o.operationResult)
        && ['AUTHORIZATION', 'CAPTURE'].includes(String(o.operationType || '').toUpperCase()));
      if (op) esito = op.operationResult;
    }

    const paid = isPagato(esito);
    console.log(`[nexi-verify-order] ordine ${nexiOrderId} — esito Nexi: ${esito || 'nessuno'} => paid=${paid}`);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ paid, result: esito || null, reason: paid ? null : 'not_authorized' }),
    };
  } catch (err) {
    console.error('[nexi-verify-order] Verifica fallita:', err && err.message);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ paid: false, reason: 'verify_error' }) };
  }
};

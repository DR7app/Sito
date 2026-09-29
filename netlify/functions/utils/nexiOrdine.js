const crypto = require('crypto');

/**
 * Legge da Nexi l'esito REALE di un ordine e quanto e' stato incassato.
 *
 * 29/09/2026 — Nexi dice se un ordine e' pagato, ma quello che conta per il
 * wallet e' QUANTO: l'importo mandato a Nexi lo decide il browser
 * (create-nexi-payment), e la riga della ricarica la scrive il browser. Senza
 * leggere l'importo da qui, "pago 1 EUR, ricarica da 5.000" veniva accreditata.
 *
 * Fail-closed: chiave mancante, ordine sconosciuto, API giu' => paid=false.
 */

const ESITI_PAGATI = ['AUTHORIZED', 'EXECUTED'];
const isPagato = (esito) => ESITI_PAGATI.includes(String(esito || '').toUpperCase());

async function leggiOrdineNexi(orderId) {
  const nexiOrderId = String(orderId || '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 50);
  if (!nexiOrderId) return { paid: false, reason: 'invalid_order_id', importoCents: 0 };

  const apiKey = process.env.NEXI_API_KEY;
  if (!apiKey) return { paid: false, reason: 'api_key_missing', importoCents: 0 };

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
    return { paid: false, reason: res.status === 404 ? 'order_not_found_on_nexi' : `nexi_http_${res.status}`, importoCents: 0 };
  }
  const data = await res.json();

  let esito = data.operationResult || (data.orderStatus && data.orderStatus.lastOperationResult) || null;
  let opPagata = null;
  if (Array.isArray(data.operations)) {
    opPagata = data.operations.find(o => o && isPagato(o.operationResult)
      && ['AUTHORIZATION', 'CAPTURE'].includes(String(o.operationType || '').toUpperCase())) || null;
    if (!isPagato(esito) && opPagata) esito = opPagata.operationResult;
  }
  const paid = isPagato(esito);

  // Quanto e' stato davvero preso: incassato, poi autorizzato, poi l'operazione
  // riuscita. Mai l'importo "richiesto" dell'ordine da solo.
  const stato = data.orderStatus || {};
  const importoCents = paid
    ? Number(stato.capturedAmount || 0) || Number(stato.authorizedAmount || 0) || Number(opPagata && opPagata.operationAmount) || 0
    : 0;

  // A chi appartiene l'ordine: create-nexi-payment ci mette l'email del cliente.
  const clienteOrdine = String((data.order && data.order.customerId) || '').toLowerCase();

  return { paid, esito: esito || null, importoCents, clienteOrdine, reason: paid ? null : 'not_authorized' };
}

module.exports = { leggiOrdineNexi, isPagato };

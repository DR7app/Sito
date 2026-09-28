import { Handler } from '@netlify/functions';
import { getCorsOrigin } from './utils/cors';

// 2026-06-06: admin functions live SOLO su platform.dr7ai.com. dr7ai.com e' la
// landing CRM (SPA): risponde 200 a qualunque /.netlify/functions/* (catch-all
// index.html) → un POST riceveva HTML con status 200 e generate-fattura lo
// trattava come SUCCESSO mentre NESSUNA fattura veniva creata (silent fail).
const ADMIN_URL = process.env.ADMIN_URL || 'https://platform.dr7ai.com';

/**
 * Proxy function to call the admin's generate-invoice-from-booking function.
 * This allows the website to trigger fattura generation server-to-server
 * (avoiding CORS issues from browser-side calls).
 */
export const handler: Handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': getCorsOrigin(event.headers['origin']),
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { bookingId, includeIVA, purchaseType, purchaseId, purchaseData, nexiOrderId } = body;

        // Support both booking fattura and purchase fattura (wallet/membership)
        if (!bookingId && !purchaseId) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'bookingId or purchaseId required' }) };
        }

        const payload: Record<string, any> = { includeIVA: includeIVA ?? true };
        if (bookingId) {
            payload.bookingId = bookingId;
            // L'ordine Nexi che ha portato qui: il gestionale salta la fattura
            // della prenotazione se il link era un'estensione, un saldo, ecc.
            if (nexiOrderId) payload.nexiOrderId = nexiOrderId;
            console.log(`[generate-fattura] Proxying to admin for booking ${bookingId}`);
        } else {
            payload.purchaseType = purchaseType; // 'wallet_purchase' | 'membership_purchase'
            payload.purchaseId = purchaseId;
            if (purchaseData) payload.purchaseData = purchaseData;
            console.log(`[generate-fattura] Proxying to admin for ${purchaseType} ${purchaseId}`);
        }

        const response = await fetch(`${ADMIN_URL}/.netlify/functions/generate-invoice-from-booking`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const responseText = await response.text();

        if (!response.ok) {
            console.error(`[generate-fattura] Admin returned ${response.status}:`, responseText);
            return {
                statusCode: response.status,
                headers,
                body: JSON.stringify({ error: 'Fattura generation failed', details: responseText }),
            };
        }

        console.log(`[generate-fattura] Success for booking ${bookingId}`);
        return { statusCode: 200, headers, body: responseText };
    } catch (error: any) {
        console.error('[generate-fattura] Error:', error.message);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal error', details: error.message }),
        };
    }
};

import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { getCorsOrigin } from './utils/cors';

const OPENAPI_TOKEN = process.env.OPENAPI_AUTOMOTIVE_TOKEN || '';

// 2026-06-05: rate-limit anti-costo. Ogni lookup chiama l'API a pagamento, quindi
// un singolo visitatore che prova molte targhe DIVERSE genera costi alti. Limite
// di targhe distinte per IP in una finestra (configurabile via env).
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const MAX_DISTINCT_PLATES = parseInt(process.env.TARGA_LOOKUP_MAX || '5', 10);   // targhe diverse consentite per IP
const WINDOW_HOURS = parseInt(process.env.TARGA_LOOKUP_WINDOW_H || '24', 10);    // finestra in ore

function clientIp(event: HandlerEvent): string {
  return (
    event.headers['x-nf-client-connection-ip'] ||
    event.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    event.headers['client-ip'] ||
    'unknown'
  );
}

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
    const headers = {
        'Access-Control-Allow-Origin': getCorsOrigin(event.headers['origin']),
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const plate = event.queryStringParameters?.plate?.toUpperCase().replace(/[\s\-]/g, '') || '';

    if (!plate || plate.length < 5 || plate.length > 8 || !/^[A-Z0-9]+$/.test(plate)) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Targa non valida. Inserisci una targa italiana (es. EX117YA).' }),
        };
    }

    // 2026-07-18: risolvi il token PRIMA dal config condiviso
    // (centralina_pro_config.config.openapi_automotive_token) e POI da env.
    // Cosi' si aggiorna il token con una sola SQL, senza toccare Netlify, e vale
    // sia per il sito che per l'admin (stessa tabella). Il config VINCE sull'env
    // stale/sbagliato.
    let openapiToken = OPENAPI_TOKEN;
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
        try {
            const sbTok = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
            const { data: cfgRow } = await sbTok.from('centralina_pro_config').select('config').eq('id', 'main').maybeSingle();
            const cfgTok = (cfgRow?.config as { openapi_automotive_token?: string } | null)?.openapi_automotive_token;
            if (cfgTok && typeof cfgTok === 'string' && cfgTok.trim()) openapiToken = cfgTok.trim();
        } catch (e: any) { console.warn('[lookupTarga] config token lookup failed, uso env:', e?.message); }
    }
    if (!openapiToken) {
        console.error('[lookupTarga] token OpenAPI non configurato (ne config ne env)');
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Servizio temporaneamente non disponibile.' }),
        };
    }

    // ── Rate limit: max MAX_DISTINCT_PLATES targhe DIVERSE per IP nella finestra ──
    // Evita che un singolo visitatore generi costi alti provando molte targhe.
    // Le ripetizioni della STESSA targa non contano (cap sulle targhe distinte).
    // Fail-open: un errore qui non deve mai bloccare una ricerca legittima.
    const ip = clientIp(event);
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY && ip !== 'unknown') {
        try {
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
            const sinceISO = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();
            const { data: recent } = await supabase
                .from('targa_lookup_log')
                .select('plate')
                .eq('ip', ip)
                .gte('created_at', sinceISO);
            const distinct = new Set((recent || []).map((r: { plate: string }) => r.plate));
            if (!distinct.has(plate) && distinct.size >= MAX_DISTINCT_PLATES) {
                console.warn(`[lookupTarga] RATE LIMIT ip=${ip} distinct=${distinct.size} plate=${plate} — blocked`);
                return {
                    statusCode: 429,
                    headers,
                    body: JSON.stringify({
                        error: 'Hai raggiunto il numero massimo di ricerche targa. Riprova più tardi o contattaci per assistenza.',
                        rateLimited: true,
                    }),
                };
            }
            // Registra la nuova targa (le ripetizioni non gonfiano il log né il conteggio).
            if (!distinct.has(plate)) {
                await supabase.from('targa_lookup_log').insert({ ip, plate });
            }
        } catch (e: any) {
            console.error('[lookupTarga] rate-limit check failed (fail-open):', e?.message);
        }
    }

    try {
        console.log('[lookupTarga] Looking up plate:', plate);

        const response = await fetch(`https://automotive.openapi.com/IT-car/${plate}`, {
            headers: { 'Authorization': `Bearer ${openapiToken}` },
        });

        if (response.status === 404) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'Targa non trovata. Verifica il numero e riprova.' }),
            };
        }

        if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            console.error('[lookupTarga] API error:', response.status, response.statusText, errBody.slice(0, 300));
            // Messaggio specifico per capire subito la causa reale.
            let msg = 'Errore nella ricerca. Riprova tra qualche istante.';
            if (response.status === 401 || response.status === 403) msg = 'Servizio targa non autorizzato (token non valido). Contattaci.';
            else if (response.status === 402) msg = 'Servizio targa: credito esaurito.';
            else if (response.status === 429) msg = 'Troppe ricerche targa: riprova tra poco.';
            return {
                statusCode: 502,
                headers,
                body: JSON.stringify({ error: msg, openapi_status: response.status }),
            };
        }

        const json = await response.json();

        if (!json.success || !json.data) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'Targa non trovata. Verifica il numero e riprova.' }),
            };
        }

        const { CarMake, CarModel, Description, RegistrationYear, FuelType } = json.data;
        // Brand/model: prefer CarMake/CarModel, fall back to the documented
        // MakeDescription/ModelDescription (OpenAPI IT-car returns both; the
        // readable brand name lives in either depending on the record).
        const carMake = CarMake || json.data.MakeDescription || '';
        const carModel = CarModel || json.data.ModelDescription || '';
        // NOTE (2026-06): OpenAPI IT-car has NO dedicated body-type field — the
        // schema only exposes Description / Version (e.g. "AUDI A4 4ª serie").
        // We still probe the common body-type names in case a record carries
        // one, but the Urban-vs-Maxi classifier mostly relies on model keywords.
        // Because bodyType is usually empty, the customer-facing manual
        // Urban/Maxi/Moto override is the reliable correction path.
        const bodyType = json.data.BodyType || json.data.CarBodyType || json.data.Bodywork
            || json.data.VehicleType || json.data.Body || '';
        const version = json.data.Version || json.data.Setup || json.data.Trim || Description || '';

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                plate,
                carMake,
                carModel,
                description: Description || '',
                version: version || '',
                bodyType: bodyType || '',
                registrationYear: RegistrationYear || '',
                fuelType: FuelType || '',
            }),
        };
    } catch (error: any) {
        console.error('[lookupTarga] Unexpected error:', error.message);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Errore nella ricerca. Riprova tra qualche istante.' }),
        };
    }
};

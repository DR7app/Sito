import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { getCorsOrigin } from './utils/cors';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Create Supabase client with service role key for server-side access
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
    // Enable CORS - support both www and non-www origins
    const headers = {
        'Access-Control-Allow-Origin': getCorsOrigin(event.headers['origin']),
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json',
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: '',
        };
    }

    // Only allow GET requests
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }

    try {
        // Extract user_id from query parameters
        const userId = event.queryStringParameters?.user_id;

        if (!userId) {
            console.warn('[getResidencyZone] Missing user_id parameter');
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ residency_zone: 'NON_RESIDENTE' }),
            };
        }

        // Verify the requesting user matches the requested user_id
        const authHeader = event.headers['authorization'];
        if (!authHeader) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) };
        }
        const jwt = authHeader.replace('Bearer ', '');
        const { data: { user: authUser } } = await supabase.auth.getUser(jwt);
        if (!authUser) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
        }
        if (authUser.id !== userId) {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
        }

        console.log('[getResidencyZone] Fetching residency zone', { userId, timestamp: new Date().toISOString() });

        // Query customers_extended table
        const COLONNE = 'residency_zone, nome, cognome, email, telefono, data_nascita, codice_fiscale, indirizzo, numero_civico, citta_residenza, provincia_residenza, codice_postale, cap, citta, provincia, metadata, id'
        let { data, error } = await supabase
            .from('customers_extended')
            .select(COLONNE)
            .eq('user_id', userId)
            .maybeSingle(); // Use maybeSingle to handle no rows gracefully

        // 26/08/2026 — La scheda si cercava SOLO per user_id. Una scheda
        // compilata dal gestionale (tab Clienti) spesso non ha quel legame:
        // il cliente si ritrovava a riscrivere codice fiscale e residenza al
        // pagamento, benche' in azienda fossero gia' stati inseriti. Quindi:
        // se per user_id non c'e' nulla, si cerca per email dell'account.
        // Email confrontata senza distinzione fra maiuscole e minuscole (un
        // `eq` la distingue, ed e' bastato quello per far fallire il
        // riconoscimento di clienti gia' registrati).
        if (!error && !data && authUser.email) {
            const { data: perEmail } = await supabase
                .from('customers_extended')
                .select(COLONNE)
                .ilike('email', authUser.email)
                .order('codice_fiscale', { ascending: false, nullsFirst: false })
                .limit(1);
            if (perEmail && perEmail.length > 0) {
                data = perEmail[0];
                console.log('[getResidencyZone] Scheda trovata per email (user_id non collegato)', { userId });
            }
        }

        if (error) {
            console.warn('[getResidencyZone] Supabase error (returning default):', {
                error: error.message,
                code: error.code,
                userId,
            });

            // Return default instead of error - resilient fallback
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ residency_zone: 'NON_RESIDENTE' }),
            };
        }

        // If no data found, return default
        if (!data) {
            console.log('[getResidencyZone] No customer record found, returning default', { userId });
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ residency_zone: 'NON_RESIDENTE' }),
            };
        }

        console.log('[getResidencyZone] Success:', {
            userId,
            residency_zone: data.residency_zone,
            hasName: !!(data.nome || data.cognome),
            timestamp: new Date().toISOString(),
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                residency_zone: data.residency_zone || 'NON_RESIDENTE',
                nome: data.nome,
                cognome: data.cognome,
                email: data.email,
                telefono: data.telefono,
                data_nascita: data.data_nascita,
                codice_fiscale: data.codice_fiscale,
                indirizzo: data.indirizzo,
                numero_civico: data.numero_civico,
                citta_residenza: data.citta_residenza,
                provincia_residenza: data.provincia_residenza,
                codice_postale: data.codice_postale,
                cap: data.cap,
                citta: data.citta,
                provincia: data.provincia,
                metadata: data.metadata,
                id: data.id,
            }),
        };
    } catch (error: any) {
        console.error('[getResidencyZone] Unexpected error (returning default):', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        // Return default instead of error - resilient fallback
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ residency_zone: 'NON_RESIDENTE' }),
        };
    }
};

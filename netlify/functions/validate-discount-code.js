// netlify/functions/validate-discount-code.js

const { createClient } = require('@supabase/supabase-js');
const { getCorsOrigin } = require('./utils/cors.js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Store current request origin for CORS (set per-request in handler)
let _currentOrigin = '';

/**
 * Creates a standard JSON response with CORS headers.
 */
const createResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': getCorsOrigin(_currentOrigin),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  },
  body: JSON.stringify(body),
});

/**
 * Validates a discount code and returns its details
 *
 * POST /validate-discount-code
 * Body: {
 *   code: "DR7-XXXX-XXXX",
 *   serviceType?: "noleggio" | "lavaggio" | "supercar" | "utilitaria",
 *   orderTotal?: number (in cents)
 * }
 *
 * Returns:
 * - 200: Discount code is valid and active
 * - 404: Discount code not found
 * - 400: Discount code expired, deactivated, or invalid for this context
 */
exports.handler = async (event) => {
  _currentOrigin = event.headers['origin'] || '';

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': getCorsOrigin(_currentOrigin),
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return createResponse(405, { error: 'Method Not Allowed' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const code = body.code;
    const serviceType = body.serviceType || body.service_type;
    const orderTotal = body.orderTotal || body.order_total;

    if (!code) {
      return createResponse(400, {
        error: 'Missing discount code',
        message: 'Inserisci un codice sconto'
      });
    }

    // Normalize code (uppercase, remove spaces)
    const normalizedCode = code.trim().toUpperCase().replace(/\s+/g, '');

    // Query discount code from database (unified table)
    let { data: discountCode, error: queryError } = await supabase
      .from('discount_codes')
      .select('*')
      .eq('code', normalizedCode)
      .maybeSingle();

    if (queryError) {
      console.error('[ValidateDiscountCode] Database error:', queryError);
      return createResponse(500, {
        error: 'Database error',
        message: 'Errore durante la validazione del codice'
      });
    }

    // Fallback for legacy birthday codes that were saved into the
    // birthday_discount_codes table (BDAY-XXXX-XXXX). We adapt them to the
    // shape the rest of the validator expects so a single code carries
    // both the rental credit (€100, scope=supercar) and the lavaggio
    // discount (€10, scope=lavaggi). Front-end picks the right value
    // based on serviceType requested.
    if (!discountCode) {
      const { data: birthdayCode } = await supabase
        .from('birthday_discount_codes')
        .select('*')
        .eq('code', normalizedCode)
        .maybeSingle();
      if (birthdayCode) {
        const isLavaggio = serviceType && /lavag|wash|meccan/i.test(String(serviceType));
        const valueAmount = isLavaggio
          ? Number(birthdayCode.car_wash_discount || 10)
          : Number(birthdayCode.rental_credit || 100);
        const alreadyUsed = isLavaggio ? !!birthdayCode.car_wash_used : !!birthdayCode.rental_used;
        discountCode = {
          id: birthdayCode.id,
          code: birthdayCode.code,
          code_type: 'codice_sconto',
          value_type: 'fixed',
          value_amount: valueAmount,
          scope: isLavaggio ? ['lavaggi'] : ['supercar'],
          minimum_spend: isLavaggio ? 40 : 400,
          valid_from: birthdayCode.created_at || new Date(0).toISOString(),
          valid_until: birthdayCode.expires_at || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          single_use: true,
          status: alreadyUsed ? 'deactivated' : 'active',
          customer_email: null, // legacy birthday codes are NOT per-user restricted on the website
          customer_phone: null,
          message: 'Codice compleanno',
          usage_conditions: null,
          rental_credit: birthdayCode.rental_credit,
          rental_used: birthdayCode.rental_used,
          car_wash_discount: birthdayCode.car_wash_discount,
          car_wash_used: birthdayCode.car_wash_used,
          _legacy_birthday: true,
        };
      }
    }

    if (!discountCode) {
      return createResponse(404, {
        error: 'Codice non trovato',
        message: 'Questo codice sconto non esiste'
      });
    }

    // Per-customer restriction: if the code is bound to a specific email/phone,
    // the logged-in user must match. We verify the JWT server-side — the client
    // cannot spoof this by editing the request body.
    const restrictedEmail = (discountCode.customer_email || '').toLowerCase().trim();
    const restrictedPhone = (discountCode.customer_phone || '').replace(/[\s\-+()]/g, '').trim();
    if (restrictedEmail || restrictedPhone) {
      const notLogged = () => createResponse(400, {
        error: 'Login richiesto',
        message: 'Devi effettuare il login per utilizzare questo codice'
      });
      const wrongAccount = () => createResponse(400, {
        error: 'Codice riservato',
        message: 'Questo codice è riservato a un altro cliente. Effettua il login con l\'account corretto.'
      });
      const authHeader = event.headers.authorization || event.headers.Authorization || '';
      if (!authHeader.startsWith('Bearer ')) return notLogged();
      const token = authHeader.replace('Bearer ', '');
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authUser) return notLogged();

      if (restrictedEmail) {
        const userEmail = (authUser.email || '').toLowerCase().trim();
        if (userEmail !== restrictedEmail) return wrongAccount();
      }

      if (restrictedPhone) {
        const normalize = (s) => (s || '').replace(/[\s\-+()]/g, '');
        let userPhone = normalize(authUser.phone);
        if (!userPhone) {
          const { data: cust } = await supabase
            .from('customers_extended')
            .select('telefono')
            .eq('user_id', authUser.id)
            .maybeSingle();
          if (cust?.telefono) userPhone = normalize(cust.telefono);
        }
        // Compare last 9 digits to tolerate prefix differences (+39 / 39 / 0…)
        if (!userPhone || userPhone.slice(-9) !== restrictedPhone.slice(-9)) return wrongAccount();
      }
    }

    // Check if expired by date.
    // The admin form saves valid_until as `<date>T23:59:59` (end-of-day in
    // Rome local time, then converted to UTC). So we honour the saved
    // timestamp directly — NO +24h fudge factor. Older rows that lack a
    // time component (saved at midnight) get a one-time "+1 day" so they
    // still cover the chosen day end-to-end.
    const now = new Date();
    const validUntilRaw = new Date(discountCode.valid_until);
    const isMidnightUTC = validUntilRaw.getUTCHours() === 0 && validUntilRaw.getUTCMinutes() === 0 && validUntilRaw.getUTCSeconds() === 0;
    const validUntil = isMidnightUTC
      ? new Date(validUntilRaw.getTime() + 24 * 60 * 60 * 1000 - 1)
      : validUntilRaw;
    const validFrom = new Date(discountCode.valid_from);

    if (validUntil < now) {
      return createResponse(400, {
        error: 'Codice scaduto',
        message: `Questo codice è scaduto il ${validUntil.toLocaleDateString('it-IT')}`,
        discountCode: {
          code: discountCode.code,
          status: 'expired',
          valid_until: discountCode.valid_until
        }
      });
    }

    if (validFrom > now) {
      return createResponse(400, {
        error: 'Codice non ancora valido',
        message: `Questo codice sarà valido dal ${validFrom.toLocaleDateString('it-IT')}`,
        discountCode: {
          code: discountCode.code,
          status: 'not_yet_valid',
          valid_from: discountCode.valid_from
        }
      });
    }

    // Check single-use FIRST (before generic status), so a redeemed code
    // reports "già utilizzato" instead of the vaguer "disattivato".
    if (discountCode.single_use) {
      const { count, error: usageError } = await supabase
        .from('discount_code_usages')
        .select('*', { count: 'exact', head: true })
        .eq('discount_code_id', discountCode.id);

      if (usageError) {
        console.error('[ValidateDiscountCode] Usage check error:', usageError);
      } else if (count > 0) {
        return createResponse(400, {
          error: 'Codice già utilizzato',
          message: 'Questo codice è già stato utilizzato e non è più disponibile',
          discountCode: {
            code: discountCode.code,
            status: 'already_used'
          }
        });
      }
    }

    // Status check — anything that isn't 'active' beyond single-use redemption.
    if (discountCode.status !== 'active') {
      let message = 'Questo codice non è più valido';
      if (discountCode.status === 'deactivated') {
        message = discountCode.single_use
          ? 'Questo codice è già stato utilizzato e non è più disponibile'
          : 'Questo codice è stato disattivato';
      } else if (discountCode.status === 'expired') {
        message = 'Questo codice è scaduto';
      }

      return createResponse(400, {
        error: `Codice ${discountCode.status}`,
        message,
        discountCode: {
          code: discountCode.code,
          status: discountCode.status
        }
      });
    }

    // Check service scope if serviceType provided.
    // Be defensive about the stored shape: scope may be saved as a Postgres
    // text[] (-> JS array), a single string, a JSON string, or null. Treat
    // anything we can read as an array; only completely missing scope is
    // treated as "all services" (legacy codes).
    let scopeArr = null;
    if (Array.isArray(discountCode.scope)) {
      scopeArr = discountCode.scope;
    } else if (typeof discountCode.scope === 'string' && discountCode.scope.trim()) {
      try {
        const parsed = JSON.parse(discountCode.scope);
        scopeArr = Array.isArray(parsed) ? parsed : [discountCode.scope];
      } catch {
        scopeArr = [discountCode.scope];
      }
    }
    if (serviceType && scopeArr && scopeArr.length > 0) {
      const scope = scopeArr;
      const normalizedServiceType = serviceType.toLowerCase().replace(/\s+/g, '_');

      // Rental service hierarchy: 'noleggio' is parent of 'supercar', 'utilitarie' and 'aziendali'
      const isRentalService = ['noleggio', 'supercar', 'utilitarie', 'urban-cars', 'corporate-fleet', 'aziendali'].includes(normalizedServiceType);
      // Aziendali = the corporate / commercial fleet (Furgoni + NCC)
      const isAziendaliService = normalizedServiceType === 'aziendali'
        || normalizedServiceType === 'corporate-fleet'
        || normalizedServiceType === 'corporate_fleet';
      // Prime Wash umbrella: car wash + mechanical (meccanica) both live under 'lavaggi'
      const isPrimeWashService = normalizedServiceType.includes('lavag')
        || normalizedServiceType === 'car_wash'
        || normalizedServiceType === 'car-wash'
        || normalizedServiceType === 'mechanical'
        || normalizedServiceType === 'meccanica';

      // Check if scope includes 'tutti' or 'tutti_i_servizi' or the specific service
      const isValidScope = scope.some(s => {
        const normalizedScope = s.toLowerCase().replace(/\s+/g, '_');
        return normalizedScope === 'tutti' ||
               normalizedScope === 'tutti_i_servizi' ||
               normalizedScope === normalizedServiceType ||
               // 'noleggio' scope covers ALL rental types (supercar, utilitarie, aziendali, etc.)
               (isRentalService && normalizedScope === 'noleggio') ||
               // Specific rental type matches
               (normalizedServiceType.includes('supercar') && normalizedScope === 'supercar') ||
               (normalizedServiceType.includes('utilitari') && normalizedScope === 'utilitarie') ||
               (isAziendaliService && normalizedScope === 'aziendali') ||
               // Prime Wash matching (lavaggi + meccanica both covered by 'lavaggi' scope)
               (isPrimeWashService && normalizedScope === 'lavaggi');
      });

      if (!isValidScope) {
        return createResponse(400, {
          error: 'Codice non valido per questo servizio',
          message: `Questo codice è valido solo per: ${scope.join(', ')}`,
          discountCode: {
            code: discountCode.code,
            scope: discountCode.scope
          }
        });
      }
    }

    // Check minimum spend if required
    if (discountCode.minimum_spend && orderTotal) {
      const minimumSpendCents = Math.round(discountCode.minimum_spend * 100);
      if (orderTotal < minimumSpendCents) {
        return createResponse(400, {
          error: 'Spesa minima non raggiunta',
          message: `Questo codice richiede una spesa minima di €${discountCode.minimum_spend.toFixed(2)}`,
          discountCode: {
            code: discountCode.code,
            minimum_spend: discountCode.minimum_spend
          }
        });
      }
    }

    // Calculate discount value
    let discountValue = 0;
    let discountDescription = '';

    if (discountCode.value_type === 'fixed') {
      discountValue = Math.round(discountCode.value_amount * 100); // Convert to cents
      discountDescription = `€${discountCode.value_amount.toFixed(2)}`;
    } else if (discountCode.value_type === 'percentage') {
      discountValue = discountCode.value_amount; // percentage value
      discountDescription = `${discountCode.value_amount}%`;
    }

    // Discount code is valid!
    return createResponse(200, {
      valid: true,
      message: 'Codice sconto valido',
      discountCode: {
        id: discountCode.id,
        code: discountCode.code,
        code_type: discountCode.code_type,
        value_type: discountCode.value_type,
        value_amount: discountCode.value_amount,
        discount_value: discountValue,
        discount_description: discountDescription,
        scope: discountCode.scope,
        minimum_spend: discountCode.minimum_spend,
        valid_from: discountCode.valid_from,
        valid_until: discountCode.valid_until,
        single_use: discountCode.single_use,
        message: discountCode.message,
        usage_conditions: discountCode.usage_conditions,
        // Birthday code fields
        customer_email: discountCode.customer_email || null,
        customer_phone: discountCode.customer_phone || null,
        rental_credit: discountCode.rental_credit || null,
        rental_used: discountCode.rental_used || false,
        car_wash_discount: discountCode.car_wash_discount || null,
        car_wash_used: discountCode.car_wash_used || false
      }
    });

  } catch (error) {
    console.error('[ValidateDiscountCode] Error:', error);
    return createResponse(500, {
      error: 'Internal server error',
      message: error.message
    });
  }
};

// netlify/functions/redeem-discount-code.js

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
 * Redeems a discount code by recording its usage
 *
 * POST /redeem-discount-code
 * Body: {
 *   code: "DR7-XXXX-XXXX",
 *   bookingId?: "uuid",
 *   customerId?: "uuid",
 *   customerName?: "string",
 *   serviceType: "noleggio" | "lavaggio" | "supercar" | "utilitaria",
 *   discountApplied: number (in cents),
 *   notes?: "string"
 * }
 *
 * Returns:
 * - 200: Discount code redeemed successfully
 * - 404: Discount code not found
 * - 400: Invalid, expired, or already used
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
    const bookingId = body.bookingId || body.booking_id;
    const customerId = body.customerId || body.customer_id;
    const customerName = body.customerName || body.customer_name;
    const serviceType = body.serviceType || body.service_type;
    const discountApplied = body.discountApplied || body.discount_applied;
    const notes = body.notes;

    if (!code) {
      return createResponse(400, {
        error: 'Codice mancante',
        message: 'Inserisci un codice sconto'
      });
    }

    if (!serviceType) {
      return createResponse(400, {
        error: 'Tipo servizio mancante',
        message: 'Specifica il tipo di servizio'
      });
    }

    if (!discountApplied || discountApplied <= 0) {
      return createResponse(400, {
        error: 'Importo sconto mancante',
        message: 'Specifica l\'importo dello sconto applicato'
      });
    }

    // Normalize code
    const normalizedCode = code.trim().toUpperCase().replace(/\s+/g, '');

    // Query discount code (unified table)
    let { data: discountCode, error: queryError } = await supabase
      .from('discount_codes')
      .select('*')
      .eq('code', normalizedCode)
      .maybeSingle();

    if (queryError) {
      console.error('[RedeemDiscountCode] Database error:', queryError);
      return createResponse(500, {
        error: 'Errore database',
        message: 'Errore durante il riscatto del codice'
      });
    }

    // Legacy birthday code fallback — redeem against birthday_discount_codes
    // by setting the matching used flag (rental_used / car_wash_used).
    let isLegacyBirthday = false;
    let birthdayCodeRow = null;
    if (!discountCode) {
      const { data: bday } = await supabase
        .from('birthday_discount_codes')
        .select('*')
        .eq('code', normalizedCode)
        .maybeSingle();
      if (bday) {
        isLegacyBirthday = true;
        birthdayCodeRow = bday;
        const isLavaggio = /lavag|wash|meccan/i.test(String(serviceType));
        const alreadyUsed = isLavaggio ? !!bday.car_wash_used : !!bday.rental_used;
        const valueAmount = isLavaggio
          ? Number(bday.car_wash_discount || 10)
          : Number(bday.rental_credit || 100);
        discountCode = {
          id: bday.id,
          code: bday.code,
          single_use: true,
          status: alreadyUsed ? 'deactivated' : 'active',
          customer_email: null,
          customer_phone: null,
          value_type: 'fixed',
          value_amount: valueAmount,
          valid_from: bday.created_at || new Date(0).toISOString(),
          valid_until: bday.expires_at || new Date(Date.now() + 365 * 86400000).toISOString(),
        };
      }
    }

    if (!discountCode) {
      return createResponse(404, {
        error: 'Codice non trovato',
        message: 'Questo codice sconto non esiste'
      });
    }

    // Per-customer restriction — same check as validate-discount-code.
    const restrictedEmail = (discountCode.customer_email || '').toLowerCase().trim();
    const restrictedPhone = (discountCode.customer_phone || '').replace(/[\s\-+()]/g, '').trim();
    if (restrictedEmail || restrictedPhone) {
      const notLogged = () => createResponse(400, { error: 'Login richiesto', message: 'Devi effettuare il login per utilizzare questo codice' });
      const wrongAccount = () => createResponse(400, { error: 'Codice riservato', message: 'Questo codice è riservato a un altro cliente. Effettua il login con l\'account corretto.' });
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
        if (!userPhone || userPhone.slice(-9) !== restrictedPhone.slice(-9)) return wrongAccount();
      }
    }

    // Validation checks
    const now = new Date();
    const validUntil = new Date(discountCode.valid_until);
    const validFrom = new Date(discountCode.valid_from);

    if (validUntil < now) {
      return createResponse(400, {
        error: 'Codice scaduto',
        message: `Questo codice è scaduto il ${validUntil.toLocaleDateString('it-IT')}`
      });
    }

    if (validFrom > now) {
      return createResponse(400, {
        error: 'Codice non ancora valido',
        message: `Questo codice sarà valido dal ${validFrom.toLocaleDateString('it-IT')}`
      });
    }

    if (discountCode.status !== 'active') {
      let statusMsg = 'Questo codice non è più valido';
      if (discountCode.status === 'deactivated') {
        statusMsg = discountCode.single_use
          ? 'Questo codice è già stato utilizzato e non è più disponibile'
          : 'Questo codice è stato disattivato';
      } else if (discountCode.status === 'expired') {
        statusMsg = 'Questo codice è scaduto';
      }
      return createResponse(400, {
        error: `Codice ${discountCode.status}`,
        message: statusMsg
      });
    }

    // Check if single-use and already used.
    if (discountCode.single_use) {
      if (isLegacyBirthday && birthdayCodeRow) {
        const isLavaggio = /lavag|wash|meccan/i.test(String(serviceType));
        const used = isLavaggio ? !!birthdayCodeRow.car_wash_used : !!birthdayCodeRow.rental_used;
        if (used) {
          return createResponse(400, {
            error: 'Codice già utilizzato',
            message: 'Questo codice è già stato utilizzato'
          });
        }
      } else {
        const { count, error: usageError } = await supabase
          .from('discount_code_usages')
          .select('*', { count: 'exact', head: true })
          .eq('discount_code_id', discountCode.id);

        if (usageError) {
          console.error('[RedeemDiscountCode] Usage check error:', usageError);
        } else if (count > 0) {
          return createResponse(400, {
            error: 'Codice già utilizzato',
            message: 'Questo codice è già stato utilizzato'
          });
        }
      }
    }

    // Record the usage. Skip discount_code_usages insert for legacy birthday
    // codes (they're not in discount_codes — the FK would fail). Their usage
    // is tracked via rental_used / car_wash_used flags below.
    let usage = null;
    if (!isLegacyBirthday) {
      const usageData = {
        discount_code_id: discountCode.id,
        customer_id: customerId || null,
        customer_name: customerName || null,
        service_type: serviceType,
        booking_id: bookingId || null,
        discount_applied: discountApplied / 100,
        notes: notes || null
      };

      const { data: usageRow, error: insertError } = await supabase
        .from('discount_code_usages')
        .insert(usageData)
        .select()
        .single();

      if (insertError) {
        console.error('[RedeemDiscountCode] Insert usage error:', insertError);
        return createResponse(500, {
          error: 'Errore nel salvataggio',
          message: insertError.message
        });
      }
      usage = usageRow;
    }

    // If single-use, deactivate / mark used.
    if (discountCode.single_use) {
      if (isLegacyBirthday && birthdayCodeRow) {
        // Birthday code: flip the matching used flag in birthday_discount_codes
        const isLavaggio = /lavag|wash|meccan/i.test(String(serviceType));
        const updates = isLavaggio
          ? { car_wash_used: true, car_wash_used_at: new Date().toISOString(), car_wash_booking_id: bookingId || null }
          : { rental_used: true, rental_used_at: new Date().toISOString(), rental_booking_id: bookingId || null };
        await supabase.from('birthday_discount_codes').update(updates).eq('id', birthdayCodeRow.id);
      } else {
        await supabase
          .from('discount_codes')
          .update({ status: 'deactivated', updated_at: new Date().toISOString() })
          .eq('id', discountCode.id);
      }
    }

    console.log(`[RedeemDiscountCode] Successfully redeemed ${normalizedCode} for ${discountApplied} cents`);

    return createResponse(200, {
      success: true,
      message: 'Codice sconto riscattato con successo',
      redemption: {
        code: discountCode.code,
        discount_applied: discountApplied,
        service_type: serviceType,
        usage_id: usage?.id || null,
        redeemed_at: usage?.used_at || new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[RedeemDiscountCode] Error:', error);
    return createResponse(500, {
      error: 'Errore interno',
      message: error.message
    });
  }
};

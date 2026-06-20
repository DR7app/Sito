const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { getClubCashbackPct } = require('./utils/dr7ClubCashback');

// Resolve insurance ID → display name from Centralina Pro (centralina_pro_config).
// Inline copy of utils/centralinaProLookups.ts (TS import not available in .js handler).
async function getInsuranceNameByIdNexi(sb, id) {
  if (!id) return '';
  const key = String(id).trim();
  if (!key) return '';
  try {
    const { data } = await sb.from('centralina_pro_config').select('config').eq('id', 'main').maybeSingle();
    const insurance = data && data.config && data.config.insurance;
    if (!Array.isArray(insurance)) return key;
    for (const cat of insurance) {
      const byFascia = cat.byFascia || {};
      for (const tier of Object.keys(byFascia)) {
        const opt = (byFascia[tier] || []).find(o => o && o.id === key);
        if (opt && typeof opt.name === 'string' && opt.name.trim()) return opt.name.trim();
      }
      const all = cat.all || [];
      const opt = all.find(o => o && o.id === key);
      if (opt && typeof opt.name === 'string' && opt.name.trim()) return opt.name.trim();
    }
  } catch (_) { /* fallthrough */ }
  return key;
}

/**
 * Sends the "Ingresso DR7 Club" template (from Messaggi di Sistema Pro)
 * to the customer who just subscribed. Matched by LABEL because admin-created
 * templates have auto-generated keys. No fallback body: if the template is
 * missing, disabled, or empty, nothing is sent.
 *
 * Best-effort: never throws — caller treats it as fire-and-forget.
 */
async function sendIngressoDR7ClubToCustomer(sb, userId, siteUrl) {
  if (!userId) return;
  try {
    const { data: cust } = await sb
      .from('customers_extended')
      .select('nome, cognome, telefono, full_name')
      .eq('user_id', userId)
      .maybeSingle();

    const rawPhone = cust && cust.telefono ? String(cust.telefono) : '';
    if (!rawPhone) {
      console.warn('[nexi-callback] Ingresso DR7 Club: no phone for user', userId);
      return;
    }

    const { data: rows } = await sb
      .from('system_messages')
      .select('message_body, is_enabled, updated_at, label')
      .ilike('label', 'Ingresso DR7 Club')
      .like('message_key', 'pro_%')
      .order('updated_at', { ascending: false });
    const tpl = (rows || []).find(r => r.is_enabled !== false && r.message_body) || null;
    if (!tpl || !tpl.message_body) {
      console.warn('[nexi-callback] Ingresso DR7 Club: template missing or disabled');
      return;
    }

    const firstName = (cust && cust.nome)
      || (cust && cust.full_name ? String(cust.full_name).split(' ')[0] : '')
      || '';
    const message = String(tpl.message_body).replace(/\{nome\}/g, firstName);
    if (!message.trim()) return;

    let phone = rawPhone.replace(/[\s\-+()]/g, '').replace(/[^\d]/g, '');
    if (phone.startsWith('00')) phone = phone.substring(2);
    if (phone.length === 10) phone = '39' + phone;

    await fetch(`${siteUrl}/.netlify/functions/send-whatsapp-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customPhone: phone, customMessage: message, skipHeader: true }),
    });
    console.log('[nexi-callback] Ingresso DR7 Club sent to', phone);
  } catch (e) {
    console.error('[nexi-callback] Ingresso DR7 Club send failed (non-blocking):', e);
  }
}

/**
 * Generate MAC to verify callback authenticity (old XPay format only)
 */
function generateMAC(params, macKey) {
  const sortedKeys = Object.keys(params).sort();

  let macString = '';
  for (const key of sortedKeys) {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      macString += `${key}=${params[key]}`;
    }
  }

  macString += macKey;

  return crypto.createHash('sha1').update(macString, 'utf8').digest('hex');
}

/**
 * Parse the incoming callback and normalize to a standard format.
 * Handles:
 *   1. Nexi HPP API v1 — JSON body with orderId / operationResult
 *   2. Old XPay — form-encoded body with codTrans / esito / mac
 *   3. GET redirect with query string (browser redirect fallback)
 *
 * Returns { orderId, isSuccess, authCode, errorMessage, isHPP, rawParams }
 */
function parseCallback(event) {
  let rawParams = {};
  let isHPP = false;

  if (event.httpMethod === 'GET') {
    rawParams = event.queryStringParameters || {};
  } else if (event.httpMethod === 'POST') {
    const body = (event.body || '').trim();
    const contentType = (event.headers['content-type'] || '').toLowerCase();

    // Try JSON first (HPP API v1 notification)
    if (contentType.includes('application/json') || body.startsWith('{')) {
      try {
        rawParams = JSON.parse(body);
        isHPP = true;
        console.log('Parsed as JSON (HPP API v1)');
      } catch (e) {
        console.warn('JSON parse failed, falling back to form-encoded:', e.message);
      }
    }

    // Fall back to URL-encoded form data (old XPay)
    if (!isHPP && body.includes('=')) {
      body.split('&').forEach(pair => {
        const [key, ...rest] = pair.split('=');
        if (key) {
          rawParams[decodeURIComponent(key)] = decodeURIComponent(rest.join('='));
        }
      });
      console.log('Parsed as form-encoded (old XPay)');
    }
  }

  // Normalize field names — map HPP v1 fields to our canonical names
  // HPP v1 uses: orderId, operationId, operationResult, operationType, paymentMethod, etc.
  // Old XPay uses: codTrans, esito (OK/KO), codAut, mac, importo, divisa, messaggio
  const orderId = rawParams.orderId || rawParams.codTrans || rawParams.order_id || null;

  let isSuccess = false; // May be overridden by server-side verification for HPP v1
  if (rawParams.operationResult) {
    // HPP v1: AUTHORIZED, EXECUTED, DECLINED, DENIED, CANCELLED, etc.
    isSuccess = rawParams.operationResult === 'AUTHORIZED' || rawParams.operationResult === 'EXECUTED';
  } else if (rawParams.esito) {
    // Old XPay: OK or KO
    isSuccess = rawParams.esito === 'OK';
  }

  const authCode = rawParams.authorizationCode || rawParams.codAut || rawParams.codice_autorizzazione || null;
  const errorMessage = rawParams.operationResult || rawParams.messaggio || rawParams.message || null;

  return { orderId, isSuccess, authCode, errorMessage, isHPP, rawParams };
}

/**
 * Nexi XPay Callback Handler
 * Receives payment notifications from Nexi (both old XPay and HPP API v1 formats)
 */
exports.handler = async (event) => {
  try {
    console.log('Nexi callback received:', event.httpMethod);
    console.log('Content-Type:', event.headers['content-type']);
    console.log('Raw body (first 500 chars):', (event.body || '').substring(0, 500));

    const { orderId, isSuccess, authCode, errorMessage, isHPP, rawParams } = parseCallback(event);

    console.log('Parsed callback:', { orderId, isSuccess, authCode, errorMessage, isHPP });
    console.log('Raw params:', JSON.stringify(rawParams, null, 2));

    // Verify MAC for old XPay format only (HPP v1 uses API key auth, no MAC)
    if (!isHPP) {
      const macKey = process.env.NEXI_MAC_KEY;
      const mac = rawParams.mac;

      if (!macKey) {
        console.error('NEXI_MAC_KEY not configured - rejecting old XPay callback');
        return { statusCode: 500, body: 'MAC key not configured' };
      }

      if (!mac) {
        console.error('No MAC provided in old XPay callback - rejecting');
        return { statusCode: 400, body: 'Missing MAC' };
      }

      const paramsForMAC = { ...rawParams };
      delete paramsForMAC.mac;
      const calculatedMAC = generateMAC(paramsForMAC, macKey);

      if (calculatedMAC !== mac) {
        console.error('Invalid MAC - possible fraud attempt');
        return { statusCode: 400, body: 'Invalid MAC' };
      }

      console.log('MAC verified successfully');
    } else {
      // HPP v1: Verify payment by calling Nexi's order status API (server-to-server)
      // This prevents forged callbacks — we trust Nexi's API response, not the callback body
      const apiKey = process.env.NEXI_API_KEY;
      if (!apiKey) {
        console.error('NEXI_API_KEY not configured — cannot verify HPP callback');
        return { statusCode: 500, body: 'API key not configured' };
      }

      const nexiEnv = process.env.NEXI_ENVIRONMENT || 'production';
      const verifyBaseUrl = nexiEnv === 'production'
        ? 'https://xpay.nexigroup.com/api/phoenix-0.0/psp/api/v1'
        : 'https://xpaysandbox.nexigroup.com/api/phoenix-0.0/psp/api/v1';

      const correlationId = crypto.randomBytes(16).toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');

      try {
        const verifyResponse = await fetch(`${verifyBaseUrl}/orders/${orderId}`, {
          method: 'GET',
          headers: {
            'X-API-KEY': apiKey,
            'Correlation-Id': correlationId,
          },
        });

        if (!verifyResponse.ok) {
          console.error('Nexi order verification failed:', verifyResponse.status);
          return { statusCode: 400, body: 'Order verification failed' };
        }

        const verifyData = await verifyResponse.json();
        console.log('Nexi order verification response:', JSON.stringify(verifyData, null, 2));

        // Override isSuccess with the verified status from Nexi's API
        const verifiedResult = verifyData.operationResult || verifyData.orderStatus?.lastOperationResult;
        if (verifiedResult) {
          const verifiedSuccess = verifiedResult === 'AUTHORIZED' || verifiedResult === 'EXECUTED';
          if (verifiedSuccess !== isSuccess) {
            console.warn(`Callback claimed ${isSuccess ? 'success' : 'failure'} but Nexi API says ${verifiedSuccess ? 'success' : 'failure'} — using verified result`);
            isSuccess = verifiedSuccess;
          }
        }

        // Extract contractId from verification response (needed for recurring MIT)
        // Nexi returns it in recurrence.contractId or operations[].additionalData
        if (verifyData.recurrence?.contractId) {
          rawParams.contractId = verifyData.recurrence.contractId;
          console.log('Extracted contractId from recurrence:', rawParams.contractId);
        } else if (verifyData.operations) {
          for (const op of verifyData.operations) {
            const cid = op.additionalData?.contractId || op.recurrence?.contractId;
            if (cid) {
              rawParams.contractId = cid;
              console.log('Extracted contractId from operations:', rawParams.contractId);
              break;
            }
          }
        }

        console.log('HPP API v1 notification verified via order status API');
      } catch (verifyErr) {
        console.error('Error verifying order with Nexi API:', verifyErr.message);
        return { statusCode: 500, body: 'Order verification error' };
      }
    }

    if (!orderId) {
      console.error('No orderId found in callback params');
      console.error('Full event body:', event.body);
      return { statusCode: 400, body: 'Missing orderId' };
    }

    // Initialize Supabase — require service role key (never fall back to anon key)
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('SUPABASE_SERVICE_ROLE_KEY not configured');
      return { statusCode: 500, body: 'Server configuration error' };
    }
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Find booking or credit wallet purchase by order ID
    console.log('Looking for order with orderId:', orderId);

    // 1. Try bookings first — backward compat for old pending bookings already in the table
    let bookings = null;

    const result1 = await supabase
      .from('bookings')
      .select('*')
      .or(`id.eq.${orderId},nexi_order_id.eq.${orderId}`)
      .limit(1);

    if (!result1.error && result1.data && result1.data.length > 0) {
      bookings = result1.data;
    } else {
      const result2 = await supabase
        .from('bookings')
        .select('*')
        .eq('booking_details->>nexi_order_id', orderId)
        .limit(1);

      if (!result2.error && result2.data && result2.data.length > 0) {
        bookings = result2.data;
        console.log('Found booking via booking_details JSONB fallback');
      }
    }

    if (bookings && bookings.length > 0) {
      const booking = bookings[0];
      console.log('Found existing booking:', booking.id);

      if (booking.payment_status === 'completed' || booking.payment_status === 'succeeded' || booking.payment_status === 'paid') {
        console.log('Booking already paid, skipping duplicate callback');
        return { statusCode: 200, body: 'OK' };
      }

      const updateData = {
        payment_status: isSuccess ? 'succeeded' : 'failed',
        nexi_payment_id: orderId,
        nexi_authorization_code: authCode || null,
        payment_completed_at: isSuccess ? new Date().toISOString() : null
      };

      if (isSuccess) {
        updateData.status = 'confirmed';
      } else {
        updateData.nexi_error_message = errorMessage || 'Payment failed';
        updateData.status = 'cancelled';
      }

      const { error: updateError } = await supabase
        .from('bookings')
        .update(updateData)
        .eq('id', booking.id);

      if (updateError) {
        console.error('Error updating booking:', updateError);
        return { statusCode: 500, body: 'Error updating booking' };
      }

      console.log(`Booking ${booking.id} updated: payment_status=${updateData.payment_status}`);

      // Send notifications if payment succeeded
      if (isSuccess) {
        const siteUrl = process.env.URL || 'https://dr7.app';
        try {
          await fetch(`${siteUrl}/.netlify/functions/send-booking-confirmation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking: { ...booking, ...updateData } }),
          });
        } catch (e) {
          console.error('Email notification failed:', e);
        }
        // Send WhatsApp to admin
        try {
          await fetch(`${siteUrl}/.netlify/functions/send-whatsapp-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking: { ...booking, ...updateData } }),
          });
        } catch (e) {
          console.error('WhatsApp admin notification failed:', e);
        }

        // Send WhatsApp confirmation to customer
        const custPhone = booking.customer_phone || booking.booking_details?.customer?.phone;
        if (custPhone) {
          try {
            await fetch(`${siteUrl}/.netlify/functions/send-whatsapp-notification`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ booking: { ...booking, ...updateData }, customPhone: custPhone }),
            });
          } catch (e) {
            console.error('WhatsApp customer notification failed:', e);
          }
        }

        // Fidelity Card: car wash spend earns 1 punto per €. Function is
        // idempotent (locked by booking_id) so retries / duplicate webhooks
        // can't double-count. Best-effort — never fails the callback.
        const svcType = booking.service_type || booking.booking_details?.type || '';
        if (svcType === 'car_wash' || svcType === 'carwash') {
          try {
            await fetch(`${siteUrl}/.netlify/functions/award-fidelity-points`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bookingId: booking.id }),
            });
          } catch (e) {
            console.error('Fidelity Card award failed (non-fatal):', e);
          }
        }

        // Generate contract + signing links (car rental ONLY — car wash/mechanical
        // non hanno contratto). MA la fattura va generata per TUTTI i servizi
        // pagati: bug 2026-05-18 — i lavaggi paid-by-card NON ricevevano fattura.
        const serviceType = booking.service_type || booking.booking_details?.type || '';
        const isWashOrMech = serviceType === 'car_wash' || serviceType === 'mechanical_service' || serviceType === 'mechanical';
        const adminUrl = process.env.ADMIN_URL || 'https://platform.dr7ai.com';

        if (!isWashOrMech) {
          try {
            const contractRes = await fetch(`${adminUrl}/.netlify/functions/generate-contract`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bookingId: booking.id }),
            });
            const contractData = await contractRes.json();

            if (contractRes.ok && contractData.success) {
              console.log('[nexi-callback] Contract generated:', contractData.url);

              const { data: contractRow } = await supabase
                .from('contracts')
                .select('id')
                .eq('booking_id', booking.id)
                .single();

              if (contractRow) {
                try {
                  await fetch(`${adminUrl}/.netlify/functions/signature-init`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contractId: contractRow.id, bookingId: booking.id }),
                  });
                  console.log('[nexi-callback] Signing links sent');
                } catch (sigErr) {
                  console.error('[nexi-callback] Signature init failed:', sigErr);
                }
              }
            }
          } catch (contractErr) {
            console.error('[nexi-callback] Contract generation error:', contractErr);
          }
        }

        // Fattura per TUTTI i servizi (noleggio + lavaggio + meccanica).
        try {
          const invRes = await fetch(`${adminUrl}/.netlify/functions/generate-invoice-from-booking`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookingId: booking.id, includeIVA: true }),
          });
          if (invRes.ok) {
            console.log(`[nexi-callback] Invoice generated for existing booking (service: ${serviceType || 'rental'})`);
          } else {
            console.error(`[nexi-callback] Invoice failed (${invRes.status}):`, await invRes.text().catch(() => ''));
          }
        } catch (invErr) {
          console.error('[nexi-callback] Invoice generation failed:', invErr);
        }
      }

      return { statusCode: 200, body: 'OK' };
    }

    // 2. Try pending_nexi_bookings — new flow: booking only created AFTER payment
    const { data: pendingRows, error: pendingError } = await supabase
      .from('pending_nexi_bookings')
      .select('*')
      .eq('nexi_order_id', orderId)
      .limit(1);

    if (pendingError) {
      console.error('Error fetching pending booking:', pendingError);
    }

    if (pendingRows && pendingRows.length > 0) {
      const pending = pendingRows[0];
      console.log('Found pending booking for orderId:', orderId);

      if (isSuccess) {
        // Payment succeeded — create the REAL booking now
        const bookingData = pending.booking_data;
        bookingData.status = 'confirmed';
        bookingData.payment_status = 'succeeded';
        bookingData.nexi_order_id = orderId;
        bookingData.nexi_payment_id = orderId;
        bookingData.nexi_authorization_code = authCode || null;
        bookingData.payment_completed_at = new Date().toISOString();

        const { data: newBooking, error: insertError } = await supabase
          .from('bookings')
          .insert(bookingData)
          .select()
          .single();

        if (insertError) {
          console.error('Error creating booking from pending:', insertError);
          return { statusCode: 500, body: 'Error creating booking' };
        }

        // Clean up pending record
        await supabase
          .from('pending_nexi_bookings')
          .delete()
          .eq('id', pending.id);

        console.log(`Booking ${newBooking.id} created from pending after successful payment`);

        // Fidelity Card: car wash bought online (Nexi pay-by-link / card) earns
        // 1 punto per €. In this flow the booking only exists AFTER payment, so
        // the website's client-side award call (which fires at booking creation
        // for wallet payments) never runs for card payments — award here.
        // Idempotent (locked by fidelity_point_awards.booking_id) so duplicate
        // callbacks can't double-count. Best-effort — never fails the callback.
        {
          const newSvcType = newBooking.service_type || newBooking.booking_details?.type || '';
          if (newSvcType === 'car_wash' || newSvcType === 'carwash') {
            try {
              const fidelitySiteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://dr7.app';
              await fetch(`${fidelitySiteUrl}/.netlify/functions/award-fidelity-points`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookingId: newBooking.id }),
              });
              console.log('[nexi-callback] Fidelity points awarded for car wash booking', newBooking.id);
            } catch (e) {
              console.error('[nexi-callback] Fidelity Card award failed (non-fatal):', e);
            }
          }
        }

        // ─── Supercar / Icon Experience: shadow rental block ──────────
        // The website carwash booking persists supercar_experience info
        // in booking_details when the customer picks a car at submit time.
        // After the parent booking is created here, we insert a shadow
        // rental row that blocks the supercar for the experience window
        // so isVehicleAvailable on admin + website treats it as taken.
        try {
          const supExp = newBooking.booking_details?.supercar_experience;
          if (supExp && supExp.vehicle_id && supExp.window_start && supExp.window_end) {
            const shadowPayload = {
              service_type: 'rental',
              service_name: `${supExp.service_name || 'Supercar Experience'} (${supExp.duration_label || ''})`,
              vehicle_id: supExp.vehicle_id,
              vehicle_name: supExp.vehicle_name,
              vehicle_plate: supExp.vehicle_plate || null,
              customer_name: newBooking.customer_name,
              customer_email: newBooking.customer_email,
              customer_phone: newBooking.customer_phone,
              guest_name: newBooking.customer_name,
              guest_email: newBooking.customer_email,
              guest_phone: newBooking.customer_phone,
              pickup_date: supExp.window_start,
              dropoff_date: supExp.window_end,
              pickup_location: 'DR7 - Supercar Experience',
              dropoff_location: 'DR7 - Supercar Experience',
              price_total: 0,
              currency: 'EUR',
              status: 'confirmed',
              payment_status: 'paid',
              payment_method: 'Supercar Experience (Prime Wash)',
              booking_details: {
                is_supercar_experience_block: true,
                parent_carwash_booking_id: newBooking.id,
                experience_label: supExp.duration_label || null,
                experience_service_id: supExp.service_id || null,
                experience_service_name: supExp.service_name || null,
                experience_tier: supExp.tier || 'supercar',
                duration_minutes: supExp.duration_minutes || null,
                createdBy: 'website_nexi_callback',
              },
            };
            const { data: shadowRow, error: shadowErr } = await supabase
              .from('bookings')
              .insert(shadowPayload)
              .select('id')
              .single();
            if (shadowErr) {
              console.error('[nexi-callback] supercar shadow insert failed:', shadowErr);
            } else {
              // Link the shadow id back on the parent for cascade lookups.
              const nextDetails = {
                ...(newBooking.booking_details || {}),
                supercar_experience: {
                  ...supExp,
                  shadow_booking_id: shadowRow.id,
                },
              };
              await supabase.from('bookings').update({ booking_details: nextDetails }).eq('id', newBooking.id);
              console.log(`[nexi-callback] Supercar shadow ${shadowRow.id} created for ${supExp.vehicle_name}`);
            }
          }
        } catch (supErr) {
          console.error('[nexi-callback] supercar shadow exception:', supErr);
        }

        // Send notifications
        const siteUrl = process.env.URL || 'https://dr7.app';
        try {
          await fetch(`${siteUrl}/.netlify/functions/send-booking-confirmation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking: newBooking }),
          });
        } catch (e) {
          console.error('Email notification failed:', e);
        }

        try {
          await fetch(`${siteUrl}/.netlify/functions/send-whatsapp-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking: newBooking }),
          });
        } catch (e) {
          console.error('WhatsApp notification failed:', e);
        }

        // Send WhatsApp confirmation to CUSTOMER
        const custPhone = newBooking.customer_phone || newBooking.booking_details?.customer?.phone;
        if (custPhone) {
          try {
            const custName = newBooking.customer_name || newBooking.booking_details?.customer?.fullName || 'Cliente';
            const custFirstName = custName.split(' ')[0] || 'Cliente';
            const bookingRef = newBooking.id.substring(0, 8).toUpperCase();
            const totalEur = newBooking.price_total ? (newBooking.price_total / 100).toFixed(2) : '0.00';
            const fmtDate = (d) => new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' });
            const fmtTime = (d) => new Date(d).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Rome' });

            const details = newBooking.booking_details || {};
            const vehicleName = newBooking.vehicle_name || details.vehicle?.name || 'N/A';
            const pickupDate = newBooking.pickup_date ? `${fmtDate(newBooking.pickup_date)} ${fmtTime(newBooking.pickup_date)}` : 'N/A';
            const dropoffDate = newBooking.dropoff_date ? `${fmtDate(newBooking.dropoff_date)} ${fmtTime(newBooking.dropoff_date)}` : 'N/A';
            const pickupLoc = newBooking.pickup_location || details.pickupLocation || 'Sede DR7';
            const dropoffLoc = newBooking.dropoff_location || details.dropoffLocation || pickupLoc;

            // Resolve insurance display name from Centralina Pro (no hardcoded map).
            const insuranceId = newBooking.insurance_option || (details.insurance && details.insurance.type) || '';
            const insurance = (await getInsuranceNameByIdNexi(supabase, insuranceId)) || insuranceId;

            let custMsg = '';
            custMsg += `Gentile ${custFirstName},\n\nLa sua prenotazione è stata *confermata* con successo!\n\n`;
            custMsg += `*Rif:* ${bookingRef}\n`;
            custMsg += `*Veicolo:* ${vehicleName}\n`;
            custMsg += `*Ritiro:* ${pickupDate}\n`;
            custMsg += `*Luogo ritiro:* ${pickupLoc}\n`;
            custMsg += `*Riconsegna:* ${dropoffDate}\n`;
            custMsg += `*Luogo riconsegna:* ${dropoffLoc}\n`;
            custMsg += `*Assicurazione:* ${insurance}\n`;
            custMsg += `*Totale:* €${totalEur}\n`;
            custMsg += `*Pagamento:* Pagato (Nexi)\n`;
            custMsg += `\nRiceverà a breve il contratto da firmare digitalmente.\n`;
            custMsg += `\nCordiali Saluti,\nDR7`;

            await fetch(`${siteUrl}/.netlify/functions/send-whatsapp-notification`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ customPhone: custPhone, customMessage: custMsg }),
            });
            console.log('[nexi-callback] WhatsApp booking confirmation sent to customer');
          } catch (custErr) {
            console.error('[nexi-callback] Customer WhatsApp failed:', custErr);
          }
        }

        // Contract + signing solo per noleggio. Fattura per TUTTI i servizi.
        const serviceType = newBooking.service_type || newBooking.booking_details?.type || '';
        const isWashOrMech = serviceType === 'car_wash' || serviceType === 'mechanical_service' || serviceType === 'mechanical';
        const adminUrl = process.env.ADMIN_URL || 'https://platform.dr7ai.com';

        if (!isWashOrMech) {
          try {
            const contractRes = await fetch(`${adminUrl}/.netlify/functions/generate-contract`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bookingId: newBooking.id }),
            });
            const contractData = await contractRes.json();

            if (contractRes.ok && contractData.success) {
              console.log('[nexi-callback] Contract generated:', contractData.url);

              // Fetch contract record to get ID for signature-init
              const { data: contractRow } = await supabase
                .from('contracts')
                .select('id')
                .eq('booking_id', newBooking.id)
                .single();

              if (contractRow) {
                try {
                  const sigRes = await fetch(`${adminUrl}/.netlify/functions/signature-init`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contractId: contractRow.id, bookingId: newBooking.id }),
                  });
                  const sigData = await sigRes.json();
                  console.log('[nexi-callback] Signing links sent:', sigData.success ? 'OK' : sigData.error);
                } catch (sigErr) {
                  console.error('[nexi-callback] Signature init failed:', sigErr);
                }
              }
            } else {
              console.error('[nexi-callback] Contract generation failed:', contractData.error);
            }
          } catch (contractErr) {
            console.error('[nexi-callback] Contract generation error:', contractErr);
          }
        }

        // Generate invoice/fattura — TUTTI i servizi pagati ricevono fattura.
        // Bug fix 2026-05-18: i lavaggi paid-by-card erano esclusi.
        try {
          const invRes = await fetch(`${adminUrl}/.netlify/functions/generate-invoice-from-booking`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookingId: newBooking.id, includeIVA: true }),
          });
          if (invRes.ok) {
            const invData = await invRes.json();
            console.log(`[nexi-callback] Invoice generated (service: ${serviceType || 'rental'}):`, invData.invoice?.numero_fattura || 'OK');
          } else {
            const errText = await invRes.text().catch(() => 'unknown');
            console.error(`[nexi-callback] Invoice generation failed (${invRes.status}):`, errText);
            // Retry once after 3 seconds
            setTimeout(async () => {
              try {
                const retryRes = await fetch(`${adminUrl}/.netlify/functions/generate-invoice-from-booking`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ bookingId: newBooking.id, includeIVA: true }),
                });
                console.log('[nexi-callback] Invoice retry:', retryRes.ok ? 'SUCCESS' : `FAILED (${retryRes.status})`);
              } catch (retryErr) {
                console.error('[nexi-callback] Invoice retry failed:', retryErr);
              }
            }, 3000);
          }
        } catch (invErr) {
          console.error('[nexi-callback] Invoice generation failed:', invErr);
        }

        // DR7 Club cashback — gated by active club + tier-based % from
        // Centralina Pro (centralina_pro_config.dr7_club.tiers). Returns
        // null if the user has no active subscription or no matching tier.
        if (newBooking.user_id && newBooking.price_total > 0) {
          try {
            // Idempotency: accept either the new ('card_bonus') or legacy
            // ('cashback_3_percent') reference_type so an old in-flight
            // payment doesn't get cashback re-awarded post-migration.
            const { data: existingCashback } = await supabase
              .from('credit_transactions')
              .select('id')
              .eq('user_id', newBooking.user_id)
              .eq('reference_id', newBooking.id)
              .in('reference_type', ['card_bonus', 'cashback_3_percent'])
              .limit(1);

            if (!existingCashback || existingCashback.length === 0) {
              const cashbackPct = await getClubCashbackPct(supabase, newBooking.user_id);
              if (cashbackPct == null) {
                console.log(`[nexi-callback] No DR7 Club cashback for user ${newBooking.user_id} (no active club or no matching tier)`);
              } else {
                const paidEur = newBooking.price_total / 100;
                const cashbackAmount = Math.floor(paidEur * cashbackPct) / 100;

                if (cashbackAmount >= 0.01) {
                  const { data: balanceRow } = await supabase
                    .from('user_credit_balance')
                    .select('balance')
                    .eq('user_id', newBooking.user_id)
                    .single();

                  const currentBalance = balanceRow?.balance ? parseFloat(balanceRow.balance) : 0;
                  const newBalance = Math.round((currentBalance + cashbackAmount) * 100) / 100;

                  await supabase
                    .from('user_credit_balance')
                    .upsert({ user_id: newBooking.user_id, balance: newBalance, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

                  await supabase
                    .from('credit_transactions')
                    .insert({
                      user_id: newBooking.user_id,
                      amount: cashbackAmount,
                      type: 'credit',
                      description: `Cashback DR7 Club ${cashbackPct}% su prenotazione DR7-${newBooking.id.substring(0, 8).toUpperCase()}`,
                      reference_id: newBooking.id,
                      reference_type: 'card_bonus'
                    });

                  console.log(`[nexi-callback] DR7 Club cashback ${cashbackPct}% = €${cashbackAmount.toFixed(2)} credited to user ${newBooking.user_id}`);
                }
              }
            } else {
              console.log('[nexi-callback] Cashback already applied for booking:', newBooking.id);
            }
          } catch (cashbackErr) {
            console.error('[nexi-callback] Cashback failed (non-blocking):', cashbackErr);
          }
        }

        return { statusCode: 200, body: 'OK' };
      } else {
        // Payment failed — delete pending record, no booking created
        await supabase
          .from('pending_nexi_bookings')
          .delete()
          .eq('id', pending.id);

        console.log(`Payment failed for pending booking (orderId: ${orderId}), pending record deleted`);
        return { statusCode: 200, body: 'OK' };
      }
    }

    // 3. Try credit_wallet_purchases
    const { data: purchases, error: purchaseError } = await supabase
      .from('credit_wallet_purchases')
      .select('*')
      .eq('nexi_order_id', orderId)
      .limit(1);

    if (purchaseError) {
      console.error('Error fetching credit wallet purchase:', purchaseError);
    }

    if (purchases && purchases.length > 0) {
      const purchase = purchases[0];
      console.log('Found credit wallet purchase:', purchase.id);

      // Skip if already completed (avoid double-crediting)
      if (purchase.payment_status === 'completed' || purchase.payment_status === 'succeeded' || purchase.payment_status === 'paid') {
        console.log('Purchase already completed, skipping');
        return { statusCode: 200, body: 'OK' };
      }

      if (isSuccess) {
        // Atomically update purchase status - only succeeds if not already 'succeeded'
        const walletContractId = rawParams.contractId || rawParams.contract_id || null;

        // Critical update — keep minimal so a missing optional column can never
        // block the rest of the flow (credits, fattura, referral bonus).
        const { data: updatedPurchase, error: upErr } = await supabase
          .from('credit_wallet_purchases')
          .update({
            payment_status: 'succeeded',
            payment_completed_at: new Date().toISOString()
          })
          .eq('id', purchase.id)
          .neq('payment_status', 'succeeded')
          .select()
          .single();

        // Best-effort tokenization write (depends on migration 20260424020000).
        // Non-fatal: failure here must not stop credits/fattura/referral.
        if (walletContractId) {
          try {
            const { error: tokColErr } = await supabase
              .from('credit_wallet_purchases')
              .update({ nexi_contract_id: walletContractId })
              .eq('id', purchase.id);
            if (tokColErr) {
              console.warn('[nexi-callback] Could not save nexi_contract_id on purchase (run migration 20260424020000):', tokColErr.message);
            }
          } catch (tokColCatch) {
            console.warn('[nexi-callback] nexi_contract_id write threw (non-blocking):', tokColCatch.message);
          }
        }

        // If no row returned, another callback already processed it
        if (!updatedPurchase) {
          console.log('Purchase already processed by another callback, skipping');
          return { statusCode: 200, body: 'OK' };
        }

        if (upErr) {
          console.error('Error updating purchase:', upErr);
          return { statusCode: 500, body: 'Error updating purchase' };
        }

        // Add credits via atomic RPC (prevents race conditions and double-crediting)
        if (purchase.user_id && purchase.received_amount) {
          const creditDesc = `Ricarica ${purchase.package_name} - Bonus ${purchase.bonus_percentage}%`;
          const { data: rpcResult, error: rpcError } = await supabase.rpc('add_credits', {
            p_user_id: purchase.user_id,
            p_amount: parseFloat(purchase.received_amount),
            p_description: creditDesc,
            p_reference_id: purchase.id,
            p_reference_type: 'wallet_purchase'
          });

          if (rpcError) {
            console.error('Error adding credits via RPC:', rpcError);
            // Fallback: insert directly if RPC fails (e.g. overload ambiguity)
            console.log('Attempting direct insert fallback...');
            try {
              const { data: balanceRow } = await supabase
                .from('user_credit_balance')
                .select('balance')
                .eq('user_id', purchase.user_id)
                .single();

              const currentBalance = balanceRow?.balance ? parseFloat(balanceRow.balance) : 0;
              const newBalance = currentBalance + parseFloat(purchase.received_amount);

              await supabase
                .from('user_credit_balance')
                .upsert({
                  user_id: purchase.user_id,
                  balance: newBalance,
                  last_updated: new Date().toISOString()
                }, { onConflict: 'user_id' });

              await supabase
                .from('credit_transactions')
                .insert({
                  user_id: purchase.user_id,
                  transaction_type: 'credit',
                  amount: parseFloat(purchase.received_amount),
                  balance_after: newBalance,
                  description: creditDesc,
                  reference_id: purchase.id,
                  reference_type: 'wallet_purchase'
                });

              console.log(`Credits added via fallback: €${purchase.received_amount} (new balance: €${newBalance})`);
            } catch (fallbackErr) {
              console.error('Fallback credit insert also failed:', fallbackErr);
            }
          } else {
            const result = rpcResult?.[0] || rpcResult;
            console.log(`Credits added via RPC: €${purchase.received_amount} to user ${purchase.user_id} (new balance: €${result?.new_balance})`);
          }
        }

        // DR7 Club cashback on wallet recharge paid by card — same rule as
        // booking payments: gated by active club + tier-based % from
        // Centralina Pro. The package bonus (received_amount -
        // recharge_amount) is a separate reward; this adds club cashback
        // on top of it. Column is recharge_amount (euros paid on card),
        // NOT received_amount (which bakes in the package bonus).
        if (purchase.user_id && parseFloat(purchase.recharge_amount || 0) > 0) {
          try {
            // Idempotency: accept legacy 'cashback_3_percent' too so
            // mid-migration recharges aren't re-rewarded.
            const { data: existingCashback } = await supabase
              .from('credit_transactions')
              .select('id')
              .eq('user_id', purchase.user_id)
              .eq('reference_id', purchase.id)
              .in('reference_type', ['card_bonus', 'cashback_3_percent'])
              .limit(1);

            if (!existingCashback || existingCashback.length === 0) {
              const cashbackPct = await getClubCashbackPct(supabase, purchase.user_id);
              if (cashbackPct == null) {
                console.log(`[nexi-callback] No DR7 Club cashback on recharge for user ${purchase.user_id} (no active club or no matching tier)`);
              } else {
                const paidEur = parseFloat(purchase.recharge_amount);
                const cashbackAmount = Math.floor(paidEur * cashbackPct) / 100;

                if (cashbackAmount >= 0.01) {
                  const { data: balanceRow } = await supabase
                    .from('user_credit_balance')
                    .select('balance')
                    .eq('user_id', purchase.user_id)
                    .single();

                  const currentBalance = balanceRow?.balance ? parseFloat(balanceRow.balance) : 0;
                  const newBalance = Math.round((currentBalance + cashbackAmount) * 100) / 100;

                  await supabase
                    .from('user_credit_balance')
                    .upsert(
                      { user_id: purchase.user_id, balance: newBalance, last_updated: new Date().toISOString() },
                      { onConflict: 'user_id' }
                    );

                  await supabase
                    .from('credit_transactions')
                    .insert({
                      user_id: purchase.user_id,
                      transaction_type: 'credit',
                      amount: cashbackAmount,
                      balance_after: newBalance,
                      description: `Cashback DR7 Club ${cashbackPct}% su ricarica wallet (€${paidEur.toFixed(2)} pagati con carta)`,
                      reference_id: purchase.id,
                      reference_type: 'card_bonus'
                    });

                  console.log(`[nexi-callback] Wallet recharge DR7 Club cashback ${cashbackPct}% = €${cashbackAmount.toFixed(2)} credited to user ${purchase.user_id}`);
                }
              }
            } else {
              console.log('[nexi-callback] Wallet recharge cashback already applied for purchase:', purchase.id);
            }
          } catch (cashbackErr) {
            console.error('[nexi-callback] Wallet recharge cashback failed (non-blocking):', cashbackErr);
          }
        }

        // Save the Nexi card token (contractId) to customers_extended.metadata
        // so the admin can re-charge the same card later for penalties, late
        // fees, or extra wallet top-ups without the customer re-entering it.
        // Same storage location used by admin's nexi-preauth-callback flow.
        if (walletContractId && purchase.user_id) {
          try {
            const { data: cust } = await supabase
              .from('customers_extended')
              .select('id, metadata')
              .eq('user_id', purchase.user_id)
              .maybeSingle();

            if (cust) {
              const newMetadata = {
                ...(cust.metadata || {}),
                nexi_contract_id: walletContractId,
                nexi_contract_updated: new Date().toISOString(),
                nexi_contract_source: 'wallet_recharge'
              };
              const { error: metaErr } = await supabase
                .from('customers_extended')
                .update({ metadata: newMetadata })
                .eq('id', cust.id);

              if (metaErr) {
                console.error('[nexi-callback] Failed to save contractId on customer (non-blocking):', metaErr.message);
              } else {
                console.log(`[nexi-callback] Tokenized card saved: contractId=${walletContractId} on customer ${cust.id}`);
              }
            } else {
              console.warn('[nexi-callback] No customers_extended row for user_id:', purchase.user_id);
            }
          } catch (tokErr) {
            console.error('[nexi-callback] Token save failed (non-blocking):', tokErr);
          }
        }

        // Referral bonus — €50 to referrer if this is the referee's first €100+ top-up
        if (purchase.user_id && purchase.recharge_amount) {
          try {
            const { data: refResult, error: refError } = await supabase.rpc('grant_referral_bonus', {
              p_referee_user_id: purchase.user_id,
              p_purchase_id: purchase.id,
              p_recharge_amount: parseFloat(purchase.recharge_amount)
            });

            if (refError) {
              console.error('[nexi-callback] Referral bonus RPC error (non-blocking):', refError);
            } else {
              const r = refResult?.[0] || refResult;
              if (r?.granted) {
                console.log(`[nexi-callback] Referral bonus €${r.amount} credited to referrer ${r.referrer_user_id}`);
              } else {
                console.log('[nexi-callback] Referral bonus not granted:', r?.reason);
              }
            }
          } catch (refErr) {
            console.error('[nexi-callback] Referral bonus failed (non-blocking):', refErr);
          }
        }

        // Generate fattura for wallet purchase (card-paid recharge → IVA invoice required)
        try {
          const siteUrl = process.env.URL || 'https://dr7.app';
          const fatturaRes = await fetch(`${siteUrl}/.netlify/functions/generate-fattura`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              purchaseType: 'wallet_purchase',
              purchaseId: purchase.id,
              includeIVA: true,
              purchaseData: {
                userId: purchase.user_id,
                packageName: purchase.package_name,
                amount: purchase.recharge_amount,
                receivedAmount: purchase.received_amount,
                bonusPercentage: purchase.bonus_percentage,
              }
            }),
          });
          if (fatturaRes.ok) {
            console.log(`[nexi-callback] Fattura generated for wallet purchase ${purchase.id}`);
          } else {
            const errText = await fatturaRes.text().catch(() => '');
            console.error(`[nexi-callback] Fattura generation failed (${fatturaRes.status}): ${errText}`);
            setTimeout(async () => {
              try {
                const retryRes = await fetch(`${siteUrl}/.netlify/functions/generate-fattura`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    purchaseType: 'wallet_purchase',
                    purchaseId: purchase.id,
                    includeIVA: true,
                    purchaseData: {
                      userId: purchase.user_id,
                      packageName: purchase.package_name,
                      amount: purchase.recharge_amount,
                      receivedAmount: purchase.received_amount,
                      bonusPercentage: purchase.bonus_percentage,
                    }
                  }),
                });
                console.log('[nexi-callback] Fattura retry:', retryRes.ok ? 'SUCCESS' : `FAILED (${retryRes.status})`);
              } catch (retryErr) {
                console.error('[nexi-callback] Fattura retry failed:', retryErr);
              }
            }, 3000);
          }
        } catch (e) {
          console.error('[nexi-callback] Fattura generation error:', e);
        }
      } else {
        // Payment failed
        await supabase
          .from('credit_wallet_purchases')
          .update({
            payment_status: 'failed',
            payment_error_message: errorMessage || 'Payment failed'
          })
          .eq('id', purchase.id);

        console.log(`Credit wallet purchase ${purchase.id} payment failed`);
      }

      return { statusCode: 200, body: 'OK' };
    }

    // 4. Try membership_purchases
    const { data: memberships, error: membershipError } = await supabase
      .from('membership_purchases')
      .select('*')
      .eq('nexi_order_id', orderId)
      .limit(1);

    if (!membershipError && memberships && memberships.length > 0) {
      const membership = memberships[0];
      console.log('Found membership purchase:', membership.id);

      // Idempotency check: skip if already succeeded
      if (membership.payment_status === 'succeeded') {
        console.log('Membership already succeeded, skipping duplicate callback');
        return { statusCode: 200, body: 'OK' };
      }

      if (isSuccess) {
        // Extract contractId from callback params (Nexi returns it after CONTRACT_CREATION)
        const contractId = rawParams.contractId || rawParams.contract_id || orderId;

        // Atomically update — only if not already 'succeeded'
        const { data: updated, error: upErr } = await supabase
          .from('membership_purchases')
          .update({
            payment_status: 'succeeded',
            payment_completed_at: new Date().toISOString(),
            nexi_contract_id: contractId,
            subscription_status: 'active',
          })
          .eq('id', membership.id)
          .neq('payment_status', 'succeeded')
          .select()
          .single();

        if (!updated) {
          console.log('Membership already processed by another callback, skipping');
          return { statusCode: 200, body: 'OK' };
        }

        if (upErr) {
          console.error('Error updating membership:', upErr);
          return { statusCode: 500, body: 'Error updating membership' };
        }

        // Activate membership in user metadata (fixes finalizeEnrollment never running)
        if (membership.user_id) {
          const { error: metaErr } = await supabase.auth.admin.updateUserById(
            membership.user_id,
            {
              user_metadata: {
                membership: {
                  tierId: membership.tier_id,
                  billingCycle: membership.billing_cycle,
                  renewalDate: membership.renewal_date,
                  isRecurring: membership.is_recurring || false,
                  subscriptionStatus: 'active',
                },
              },
            }
          );

          if (metaErr) {
            console.error('Error updating user metadata:', metaErr);
            return { statusCode: 500, body: 'Metadata update failed' };
          } else {
            console.log(`User ${membership.user_id} metadata updated with membership`);
          }
        }

        // Send WhatsApp notification to admin
        const whatsappMsg = `Nuova Membership Attivata!\n\n` +
          `Tier: ${membership.tier_name}\n` +
          `Piano: ${membership.billing_cycle}\n` +
          `Prezzo: €${membership.price}\n` +
          `User ID: ${membership.user_id}`;

        try {
          await fetch(`${process.env.URL || 'https://dr7.app'}/.netlify/functions/send-whatsapp-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customMessage: whatsappMsg }),
          });
        } catch (whatsErr) {
          console.error('WhatsApp notification failed:', whatsErr);
        }

        // Send "Ingresso DR7 Club" template to the customer (Messaggi di
        // Sistema Pro, matched by label). Fire-and-forget.
        await sendIngressoDR7ClubToCustomer(
          supabase,
          membership.user_id,
          process.env.URL || 'https://dr7.app'
        );

        // Generate fattura for membership purchase
        try {
          const membershipSiteUrl = process.env.URL || 'https://dr7.app';
          await fetch(`${membershipSiteUrl}/.netlify/functions/generate-fattura`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              purchaseType: 'membership_purchase',
              purchaseId: membership.id,
              includeIVA: true,
              purchaseData: {
                userId: membership.user_id,
                tierName: membership.tier_name,
                billingCycle: membership.billing_cycle,
                price: membership.price,
              }
            }),
          });
          console.log(`Fattura generated for membership ${membership.id}`);
        } catch (e) {
          console.error('Fattura generation failed for membership:', e);
        }

        console.log(`Membership ${membership.id} activated with contractId: ${contractId}`);
      } else {
        // Payment failed
        await supabase
          .from('membership_purchases')
          .update({
            payment_status: 'failed',
          })
          .eq('id', membership.id);

        console.log(`Membership ${membership.id} payment failed: ${errorMessage}`);
      }

      return { statusCode: 200, body: 'OK' };
    }

    // 5. Try dr7_club_subscriptions
    // Match by payment_reference (always set by website) OR nexi_order_id (legacy).
    const { data: clubSubs, error: clubError } = await supabase
      .from('dr7_club_subscriptions')
      .select('*')
      .or(`payment_reference.eq.${orderId},nexi_order_id.eq.${orderId}`)
      .limit(1);

    if (clubError) {
      console.error('Error fetching DR7 Club subscription:', clubError);
    }

    if (clubSubs && clubSubs.length > 0) {
      const clubSub = clubSubs[0];
      console.log('Found DR7 Club subscription:', clubSub.id);

      // Idempotency: skip if already active
      if (clubSub.status === 'active') {
        console.log('DR7 Club subscription already active, skipping duplicate callback');
        return { statusCode: 200, body: 'OK' };
      }

      if (isSuccess) {
        // Extract contractId for recurring MIT charges
        const contractId = rawParams.contractId || rawParams.contract_id || orderId;

        const { error: upErr } = await supabase
          .from('dr7_club_subscriptions')
          .update({
            status: 'active',
            nexi_contract_id: contractId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', clubSub.id);

        if (upErr) {
          console.error('Error updating DR7 Club subscription:', upErr);
          return { statusCode: 500, body: 'Error updating club subscription' };
        }

        // Credit signup bonus
        if (clubSub.user_id) {
          try {
            const { data: balanceRow } = await supabase
              .from('user_credit_balance')
              .select('balance')
              .eq('user_id', clubSub.user_id)
              .single();

            const currentBalance = balanceRow?.balance ? parseFloat(balanceRow.balance) : 0;
            const signupBonus = 10; // €10 signup bonus (matches SIGNUP_BONUS constant)
            const newBalance = currentBalance + signupBonus;

            const { error: balanceErr } = await supabase
              .from('user_credit_balance')
              .upsert({ user_id: clubSub.user_id, balance: newBalance, last_updated: new Date().toISOString() }, { onConflict: 'user_id' });
            if (balanceErr) throw balanceErr;

            const { error: txErr } = await supabase
              .from('credit_transactions')
              .insert({
                user_id: clubSub.user_id,
                transaction_type: 'credit',
                amount: signupBonus,
                balance_after: newBalance,
                description: 'Bonus iscrizione DR7 Club',
                reference_id: clubSub.id,
                reference_type: 'dr7_club_signup_bonus',
              });
            if (txErr) throw txErr;

            console.log(`[nexi-callback] DR7 Club signup bonus €${signupBonus} credited to user ${clubSub.user_id}`);
          } catch (bonusErr) {
            console.error('[nexi-callback] DR7 Club signup bonus failed (non-blocking):', bonusErr);
          }
        }

        // WhatsApp admin notification
        try {
          await fetch(`${process.env.URL || 'https://dr7.app'}/.netlify/functions/send-whatsapp-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customMessage: `Nuova Iscrizione DR7 Club!\n\nPiano: ${clubSub.plan}\nPrezzo: €${clubSub.price}\nUser ID: ${clubSub.user_id}`,
            }),
          });
        } catch (whatsErr) {
          console.error('WhatsApp notification failed:', whatsErr);
        }

        // Send "Ingresso DR7 Club" template to the customer (Messaggi di
        // Sistema Pro, matched by label). Fire-and-forget.
        await sendIngressoDR7ClubToCustomer(
          supabase,
          clubSub.user_id,
          process.env.URL || 'https://dr7.app'
        );

        console.log(`DR7 Club subscription ${clubSub.id} activated with contractId: ${contractId}`);
      } else {
        // Payment failed — delete pending subscription
        await supabase
          .from('dr7_club_subscriptions')
          .delete()
          .eq('id', clubSub.id);

        console.log(`DR7 Club subscription ${clubSub.id} payment failed, record deleted`);
      }

      return { statusCode: 200, body: 'OK' };
    }

    console.error('No matching order found for orderId:', orderId);
    return { statusCode: 404, body: 'Order not found' };
  } catch (error) {
    console.error('Callback error:', error);
    return {
      statusCode: 500,
      body: 'Internal server error'
    };
  }
};

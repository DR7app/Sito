const crypto = require('crypto');
const { getCorsOrigin } = require('./utils/cors');

/**
 * Netlify Function to create Nexi XPay payment using API method
 * Uses /orders/hpp endpoint with X-API-KEY authentication
 */
exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': getCorsOrigin(event.headers['origin']),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { amount, currency, description, orderId, customerEmail, customerName, recurringType, billingCycle, contractId } = body;

    // Validate required fields (use explicit checks — !amount would reject amount=0)
    if (amount == null || isNaN(amount) || !currency || !orderId) {
      console.error('Validation failed:', { amount, currency, orderId, body: event.body });
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Missing required fields',
          details: {
            hasAmount: amount != null,
            amountValue: amount,
            isNaN: isNaN(amount),
            hasCurrency: !!currency,
            hasOrderId: !!orderId
          }
        }),
      };
    }

    // Reject zero or negative amounts — no point redirecting to Nexi for €0
    if (amount <= 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Amount must be greater than zero' }),
      };
    }

    // Get Nexi configuration from environment variables
    const nexiConfig = {
      apiKey: process.env.NEXI_API_KEY,
      environment: process.env.NEXI_ENVIRONMENT || 'production',
    };

    // Validate configuration
    if (!nexiConfig.apiKey) {
      console.error('Missing Nexi API key');
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Nexi configuration error' }),
      };
    }

    // Determine base URL
    const baseUrl =
      nexiConfig.environment === 'production'
        ? 'https://xpay.nexigroup.com/api/phoenix-0.0/psp/api/v1'
        : 'https://xpaysandbox.nexigroup.com/api/phoenix-0.0/psp/api/v1';

    // Get site URL for callbacks
    const siteUrl = process.env.URL || 'https://dr7.app';

    // Generate UUID v4 for Correlation-Id (compatible with older Node versions)
    const correlationId = crypto.randomBytes(16).toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');

    // Sanitize orderId for Nexi (alphanumeric only, 1-50 chars)
    // Nexi requires: only letters and numbers, no special characters
    const sanitizedOrderId = orderId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 50);

    if (!sanitizedOrderId || sanitizedOrderId.length === 0) {
      console.error('Invalid orderId after sanitization:', orderId);
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Invalid orderId format',
          details: 'OrderId must contain at least one alphanumeric character'
        }),
      };
    }

    console.log('OrderId sanitization:', { original: orderId, sanitized: sanitizedOrderId });

    // --- MIT server-to-server charge (renewal with stored contractId) ---
    if (contractId) {
      console.log('MIT renewal charge for contractId:', contractId);

      const mitBody = {
        order: {
          orderId: sanitizedOrderId,
          amount: amount.toString(),
          currency: currency,
          customerId: customerEmail || 'guest',
          description: description || 'Membership renewal',
        },
        card: {
          contractId: contractId,
        },
        recurrence: {
          action: 'SUBSEQUENT_MIT',
          contractId: contractId,
          contractType: 'MIT_SCHEDULED',
        },
      };

      console.log('MIT request body:', JSON.stringify(mitBody, null, 2));

      const mitResponse = await fetch(`${baseUrl}/orders/mit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': nexiConfig.apiKey,
          'Correlation-Id': correlationId,
        },
        body: JSON.stringify(mitBody),
      });

      let mitData;
      try {
        mitData = await mitResponse.json();
      } catch (parseErr) {
        mitData = { error: 'Non-JSON response from Nexi' };
      }
      console.log('MIT response status:', mitResponse.status);
      console.log('MIT response:', JSON.stringify(mitData, null, 2));

      if (!mitResponse.ok) {
        console.error('MIT charge failed:', mitData);
        return {
          statusCode: mitResponse.status,
          headers: corsHeaders,
          body: JSON.stringify({
            error: 'Renewal charge failed',
            details: mitData,
          }),
        };
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          operationId: mitData.operationId,
          orderId: orderId,
        }),
      };
    }

    // --- HPP payment (initial payment, optionally with contract creation for recurring) ---
    // Payment link expires in 1 hour (Europe/Rome)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const expirationDate = expiresAt.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '.0');

    const requestBody = {
      order: {
        orderId: sanitizedOrderId,
        amount: amount.toString(),
        currency: currency,
        customerId: customerEmail || 'guest',
        description: description || 'Payment',
      },
      paymentSession: {
        actionType: 'PAY',
        captureType: 'IMPLICIT',  // Immediate capture
        amount: amount.toString(),
        language: 'ITA',
        expirationDate: expirationDate,
        resultUrl: `${siteUrl}/payment-success?orderId=${sanitizedOrderId}`,
        cancelUrl: `${siteUrl}/payment-cancel`,
        notificationUrl: `${siteUrl}/.netlify/functions/nexi-callback`,
      },
    };

    // Recurrence: tokenize the card so future charges can be merchant-initiated.
    // - MIT_SCHEDULED → memberships / DR7 Club (auto-renewal on a fixed frequency)
    // - MIT_UNSCHEDULED → tutto il resto (nessuna scadenza fissa)
    //
    // 14/09/2026 — OGNI carta usata sul sito viene tokenizzata, non solo
    // wallet, tour e abbonamenti. Prima noleggio, lavaggio, meccanica,
    // prevendite e saldi da "Le mie prenotazioni" chiamavano questa funzione
    // senza `recurringType`: nessun contratto Nexi, quindi nessuna carta in
    // scheda cliente e nessun addebito possibile dopo (penali, danni,
    // cauzione senza contanti). La tokenizzazione e' il presupposto di tutto
    // quello che il gestionale fa sulla carta: il default e' tokenizzare, e
    // MIT_SCHEDULED resta la scelta esplicita degli abbonamenti.
    const tipoRicorrenza = recurringType || 'MIT_UNSCHEDULED';
    if (tipoRicorrenza === 'MIT_SCHEDULED') {
      requestBody.recurrence = {
        action: 'CONTRACT_CREATION',
        contractId: sanitizedOrderId,
        contractType: 'MIT_SCHEDULED',
        contractFrequency: billingCycle === 'monthly' ? '30' : '365',
        contractExpiryDate: new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0].replace(/-/g, ''),
      };
    } else {
      requestBody.recurrence = {
        action: 'CONTRACT_CREATION',
        contractId: sanitizedOrderId,
        contractType: 'MIT_UNSCHEDULED',
        contractExpiryDate: new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0].replace(/-/g, ''),
      };
    }

    console.log('Creating Nexi payment via API:', { orderId, amount, currency, correlationId, recurringType: tipoRicorrenza });
    console.log('Request headers:', {
      'Content-Type': 'application/json',
      'X-API-KEY': nexiConfig.apiKey.substring(0, 10) + '...',
      'Correlation-Id': correlationId,
    });
    console.log('Request body:', JSON.stringify(requestBody, null, 2));

    // Call Nexi API
    const response = await fetch(`${baseUrl}/orders/hpp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': nexiConfig.apiKey,
        'Correlation-Id': correlationId, // Required UUID format
      },
      body: JSON.stringify(requestBody),
    });

    const responseData = await response.json();

    console.log('Nexi API response status:', response.status);
    console.log('Nexi API response:', JSON.stringify(responseData, null, 2));

    if (!response.ok) {
      console.error('Nexi API error:', responseData);
      return {
        statusCode: response.status,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Failed to create payment',
          details: responseData,
        }),
      };
    }

    console.log('Payment created successfully:', responseData);

    // Validate that Nexi returned the hosted page URL
    if (!responseData.hostedPage) {
      console.error('Nexi API did not return hostedPage URL:', responseData);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Nexi non ha restituito l\'URL di pagamento. Riprova.',
          success: false,
        }),
      };
    }

    // Return payment URL to frontend
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        paymentUrl: responseData.hostedPage,
        orderId: orderId,
        sessionId: responseData.sessionId,
      }),
    };
  } catch (error) {
    console.error('Nexi payment creation error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Failed to create payment',
        message: error.message,
      }),
    };
  }
};

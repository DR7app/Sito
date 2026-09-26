// netlify/functions/create-payment-intent.js
const { getCorsOrigin } = require('./utils/cors');
const { funzioneFerma } = require('./utils/systemControl');

// Store current request origin for CORS (set per-request in handler)
let _currentOrigin = '';

/**
 * Creates a standard JSON response with CORS headers.
 * @param {number} statusCode - The HTTP status code.
 * @param {object} body - The response body.
 * @returns {object} The formatted response object.
 */
const createResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': getCorsOrigin(_currentOrigin),
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  _currentOrigin = event.headers['origin'] || '';

  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': getCorsOrigin(_currentOrigin),
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return createResponse(405, { error: 'Method Not Allowed' });
  }

  // Interruttore System Control: pagamenti online spenti = nessun checkout.
  const fermaPagamenti = await funzioneFerma('pagamenti_online');
  if (fermaPagamenti) {
    return createResponse(503, { success: false, error: fermaPagamenti, code: 'pagamenti_online_off' });
  }

  // IMPORTANT: Set this environment variable in your Netlify project settings.
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('Stripe secret key is not configured.');
    return createResponse(500, { error: 'Payment service is not configured.' });
  }

  try {
    // Initialize Stripe inside the handler to prevent crashes on load if the key is missing.
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    if (!event.body) {
      return createResponse(400, { error: 'Request body is missing.' });
    }
    const { amount, currency, email } = JSON.parse(event.body);

    if (amount === undefined || !currency) {
      return createResponse(400, { error: 'Amount and currency are required.' });
    }

    // Stripe API expects the amount in the smallest currency unit (e.g., cents).
    const amountInCents = Math.round(amount * 100);

    // Prevent creating a payment for zero or negative amounts.
    if (amountInCents <= 0) {
      return createResponse(400, { error: 'Amount must be greater than zero.'});
    }

    const metadata = {
        email: email,
    };

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: currency.toLowerCase(),
      metadata: metadata,
    });

    return createResponse(200, { clientSecret: paymentIntent.client_secret });

  } catch (error) {
    console.error('Error creating Payment Intent:', error);
    return createResponse(500, { error: error.message || 'An internal server error occurred.' });
  }
};
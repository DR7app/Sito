# Nexi X-Pay Netlify Deployment Guide

## Environment Variables Setup

To deploy Nexi X-Pay integration on Netlify, you need to configure the following environment variables in your Netlify dashboard.

### How to Add Environment Variables in Netlify

1. Go to your Netlify dashboard
2. Select your site (DR7 Empire)
3. Go to **Site settings** → **Environment variables**
4. Click **Add a variable** for each of the following

### Required Environment Variables

```bash
# Nexi XPay Configuration
NEXI_ALIAS=payment_3892082
NEXI_MAC_KEY=O1c57OA4aH7o434dH79KCK7IFoh7g0KZ869K1OMt
NEXI_MERCHANT_ID=03892082
NEXI_TERMINAL_ID=03892082
NEXI_CODICE_PUNTO_VENDITA=001859607

# API Keys
NEXI_API_KEY_SANDBOX=5d952446-9004-4023-9eae-a527a152846b
NEXI_API_KEY_PRODUCTION=5d952446-9004-4023-9eae-a527a152846b
NEXI_API_KEY_MANUAL_PRODUCTION=2d708950-50a1-434e-9a93-5d3ae2f1dd9f

# Token Requestor IDs (for Apple Pay / Google Pay)
NEXI_TOKEN_REQUESTOR_ID_VTSM=40060519423
NEXI_TOKEN_REQUESTOR_ID_MDES=50150403604

# Environment setting
NEXI_ENVIRONMENT=sandbox
VITE_NEXI_ENVIRONMENT=sandbox

# Site URL (should already be set)
URL=https://dr7.app
```

## Getting Your API Keys

### Step 1: Access Nexi Backoffice
1. Go to [https://ecommerce.nexi.it/](https://ecommerce.nexi.it/)
2. Log in with your credentials

### Step 2: Find API Keys
1. Navigate to **Configurazione** (Configuration)
2. Look for **API Key** section
3. You should see API keys for:
   - Sandbox/Test environment
   - Production environment
   - Possibly specific keys for terminals 97061508 and 99999986

### Step 3: Copy and Configure
1. Copy the **Sandbox API Key** first
2. Add it to Netlify as `NEXI_API_KEY_SANDBOX`
3. Copy the **Production API Key**
4. Add it to Netlify as `NEXI_API_KEY_PRODUCTION`

## Testing the Integration

### 1. Start with Sandbox Mode
Keep `NEXI_ENVIRONMENT=sandbox` until you've fully tested the integration.

### 2. Test Cards for Sandbox
Use these test cards in sandbox mode:

| Card Number | Expiry | CVV | Expected Result |
|-------------|--------|-----|-----------------|
| 4539970000000006 | 12/25 | 123 | ✅ Success |
| 4539970000000014 | 12/25 | 123 | ❌ Failure |
| 5255000000000001 | 12/25 | 123 | ✅ Success |
| 5255000000000019 | 12/25 | 123 | ❌ Failure |

### 3. Test Flow
1. Create a test booking on your site
2. Proceed to payment
3. You'll be redirected to Nexi's payment page
4. Use a test card from above
5. Complete the payment
6. Verify you're redirected back to your site
7. Check that the booking status is updated in your database

### 4. Check Netlify Function Logs
Monitor the logs for:
- `create-nexi-payment` function
- `nexi-callback` function

Look for any errors or issues.

## Database Migration

Run the database migration to add Nexi payment fields:

```bash
# The migration file is already created at:
# supabase/migrations/20251225000000_add_nexi_payment_fields.sql

# If using Supabase CLI:
supabase db push

# Or run the SQL directly in Supabase dashboard:
# Go to SQL Editor and paste the contents of the migration file
```

## Going to Production

### When You're Ready to Go Live

1. **Update Environment Variables in Netlify:**
   ```bash
   NEXI_ENVIRONMENT=production
   VITE_NEXI_ENVIRONMENT=production
   ```

2. **Verify Production API Key is Set:**
   - Ensure `NEXI_API_KEY_PRODUCTION` has your actual production key

3. **Test with Small Amount:**
   - Make a real test payment with a small amount (e.g., €1)
   - Verify the entire flow works

4. **Monitor Closely:**
   - Watch Netlify function logs
   - Check database updates
   - Verify callback webhooks are received

## Troubleshooting

### Payment Not Creating
- Check `create-nexi-payment` function logs
- Verify all environment variables are set
- Ensure MAC Key is correct

### Callback Not Received
- Check `nexi-callback` function logs
- Verify webhook URL is accessible: `https://dr7.app/.netlify/functions/nexi-callback`
- Check Nexi Backoffice webhook configuration

### Database Not Updating
- Verify Supabase credentials are set in Netlify
- Check Row Level Security (RLS) policies
- Review function logs for database errors

## Integration Endpoints

Your Nexi integration uses these endpoints:

- **Create Payment**: `/.netlify/functions/create-nexi-payment`
- **Payment Callback**: `/.netlify/functions/nexi-callback`
- **Success Redirect**: `/payment-success`
- **Cancel Redirect**: `/payment-cancel`

Make sure these pages exist in your application.

## Security Checklist

- [ ] MAC Key is kept secret (never committed to git)
- [ ] API Keys are in Netlify environment variables only
- [ ] `.env` file is in `.gitignore`
- [ ] HTTPS is enabled on your domain
- [ ] MAC verification is working in callback handler
- [ ] Amount validation is done server-side

## Next Steps After Configuration

1. ✅ Add all environment variables to Netlify
2. ✅ Deploy your site
3. ✅ Run database migration
4. ✅ Test in sandbox mode with test cards
5. ✅ Verify callback webhooks work
6. ✅ Check booking status updates
7. ✅ When confident, switch to production mode
8. ✅ Test with real small payment
9. ✅ Monitor for 24-48 hours
10. ✅ Go fully live!

## Support Resources

- **Nexi Developer Portal**: https://developer.nexigroup.com/xpayglobal/en-EU/api/
- **Netlify Functions Docs**: https://docs.netlify.com/functions/overview/
- **Your Setup Guide**: See `NEXI_XPAY_SETUP.md` in your project root

# Nexi Payment Integration - Deployment Guide

## 🎯 Overview

This guide will help you deploy the Nexi payment integration for DR7 Empire, **completely replacing Stripe** with Nexi X-Pay.

---

## ⚠️ CRITICAL: MAC Key Required

**Before you can deploy, you MUST obtain the MAC Key from Nexi.**

### How to Get Your MAC Key

**Option 1: Contact Nexi**
- Email or call your Nexi account manager
- Reference your Merchant ID: `025153685`
- Ask for the "Chiave MAC" or "MAC Key"

**Option 2: Check Your Documents**
- Look in your Nexi contract/welcome package
- Check any setup emails from Nexi
- The MAC Key is usually provided during account setup

**Option 3: Nexi Backoffice**
- Log into https://xpay.nexigroup.com (or your Nexi portal)
- Go to CONFIGURAZIONI tab
- Find "Chiave MAC" field
- Copy the value

The MAC Key looks like: `O1c57OA4aH7o434dH79KCK7IFoh7g0KZ869K1OMt` (40 characters)

---

## 📋 Your Nexi Credentials

From your screenshot, you have:

| Credential | Value |
|------------|-------|
| **API Key** | `9f46149d-a616-4cfa-b92a-4d3b85a4c2a7` |
| **Merchant ID** | `025153685` |
| **Terminal ID** | `75703919` |
| **Nexi Account ID** | `26569079` |
| **MAC Key** | ⚠️ **REQUIRED - Contact Nexi** |
| **Environment** | `production` |

---

## 🚀 Deployment Steps

### Step 1: Add Environment Variables to Netlify

1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Select your **DR7 Empire** site
3. Navigate to: **Site settings** → **Environment variables**
4. Click **Add a variable** for each of these:

```bash
NEXI_API_KEY=9f46149d-a616-4cfa-b92a-4d3b85a4c2a7
NEXI_MERCHANT_ID=025153685
NEXI_TERMINAL_ID=75703919
NEXI_ACCOUNT_ID=26569079
NEXI_MAC_KEY=<YOUR_MAC_KEY_HERE>
NEXI_ENVIRONMENT=production
VITE_NEXI_ENVIRONMENT=production
```

⚠️ **Replace `<YOUR_MAC_KEY_HERE>` with your actual MAC Key**

### Step 2: Remove Old Stripe Variables (Optional Cleanup)

While in Netlify environment variables, you can remove these old Stripe variables:
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`

### Step 3: Deploy

1. Go to **Deploys** tab in Netlify
2. Click **Trigger deploy** → **Deploy site**
3. Wait 2-3 minutes for deployment to complete

---

## ✅ Testing Your Integration

### Test with Small Amount First

1. Visit: `https://dr7.app/.netlify/functions/test-nexi`
2. Enter amount: **€1.00** (or €5.00)
3. Click "Create Payment"
4. You should be redirected to Nexi payment page
5. Complete payment with a real credit card
6. Verify you're redirected back to success page

### Verify in Nexi Backoffice

1. Log into your Nexi backoffice
2. Go to **TRANSAZIONI** tab
3. Look for your test transaction
4. Confirm:
   - Amount is correct
   - Status is "Authorized" or "Completed"
   - Merchant ID is `025153685`

### Check Database

1. Log into Supabase
2. Check the `bookings` table
3. Verify the test booking shows:
   - `payment_status`: `'paid'`
   - `nexi_payment_id`: Transaction ID
   - `nexi_authorization_code`: Authorization code
   - `paid_at`: Timestamp

---

## 🔧 Integration Details

### Backend Functions

**Payment Creation:**
- File: `netlify/functions/create-nexi-payment.js`
- Endpoint: `/.netlify/functions/create-nexi-payment`
- Purpose: Creates payment and returns Nexi redirect URL

**Payment Callback:**
- File: `netlify/functions/nexi-callback.js`
- Endpoint: `/.netlify/functions/nexi-callback`
- Purpose: Receives payment notifications from Nexi

### Payment Flow

```
1. Customer initiates payment
2. Frontend calls /.netlify/functions/create-nexi-payment
3. Function generates MAC signature
4. Function returns Nexi payment URL
5. Customer redirected to Nexi payment page
6. Customer enters card details on Nexi
7. Nexi processes payment
8. Nexi calls /.netlify/functions/nexi-callback
9. Callback verifies MAC signature
10. Callback updates booking status in database
11. Customer redirected to success/failure page
```

---

## 🎨 Frontend Integration (Next Phase)

After backend is working, you'll need to update these pages:

### Pages to Update

1. **CarWashBookingPage.tsx** - Car wash bookings
3. **MechanicalBookingPage.tsx** - Mechanical service bookings
4. **RentalPage.tsx** - Car rental bookings

### Changes Needed

Replace Stripe payment flow with Nexi:
- Remove Stripe.js imports
- Remove Stripe Elements
- Call `create-nexi-payment` function instead
- Redirect to Nexi payment URL
- Handle callback on return

---

## 📊 Monitoring

### First 24-48 Hours

Monitor these closely:

1. **Netlify Function Logs**
   - Check for any errors in payment creation
   - Verify callback is being received

2. **Nexi Backoffice**
   - Check TRANSAZIONI tab regularly
   - Verify all payments appear correctly

3. **Supabase Database**
   - Confirm bookings are being updated
   - Check payment_status field

4. **Customer Feedback**
   - Watch for any payment issues
   - Monitor support emails/messages

---

## 🆘 Troubleshooting

### "Nexi configuration error"

**Cause:** Missing environment variables  
**Solution:** Verify all variables are set in Netlify, especially MAC Key

### "Invalid MAC" error

**Cause:** Incorrect MAC Key or calculation  
**Solution:** Double-check MAC Key value from Nexi

### Payment not updating in database

**Cause:** Callback not being received  
**Solution:** Check Netlify function logs for callback errors

### Redirect URLs not working

**Cause:** Incorrect site URL  
**Solution:** Verify `URL` environment variable is `https://dr7.app`

---

## 📞 Support Contacts

**Nexi Technical Support:**
- Check your Nexi contract for support contact
- Usually available via phone/email during business hours

**Netlify Issues:**
- Check function logs in Netlify dashboard
- Netlify support: https://www.netlify.com/support/

---

## ✅ Deployment Checklist

- [ ] Obtained MAC Key from Nexi
- [ ] Added all environment variables to Netlify
- [ ] Deployed site
- [ ] Tested with €1-5 payment
- [ ] Verified transaction in Nexi backoffice
- [ ] Checked database update
- [ ] Monitored for 24 hours
- [ ] Ready for production use

---

## 🎉 You're Ready!

Once you have the MAC Key and complete the steps above, your Nexi integration will be live and ready to process real payments!

# ⚠️ URGENT: Add Nexi Environment Variables to Netlify

## Production Configuration for Merchant 025153685

Your new Nexi production credentials are ready to be configured.

## 🚀 Setup Instructions

### Step 1: Obtain MAC Key from Nexi

**CRITICAL**: You must obtain the MAC Key before proceeding.

**How to get it:**
1. Contact your Nexi account manager
2. Or check your Nexi contract/welcome documents
3. Or access Nexi Backoffice → CONFIGURAZIONI tab → Chiave MAC

The MAC Key is a long alphanumeric string (similar to: `O1c57OA4aH7o434dH79KCK7IFoh7g0KZ869K1OMt`)

### Step 2: Go to Netlify Dashboard
1. Open https://app.netlify.com
2. Select your **DR7 Empire** site
3. Go to **Site settings** → **Environment variables**

### Step 3: Add These Variables

Click **Add a variable** for each of these:

```
NEXI_API_KEY=9f46149d-a616-4cfa-b92a-4d3b85a4c2a7
```

```
NEXI_MERCHANT_ID=025153685
```

```
NEXI_TERMINAL_ID=75703919
```

```
NEXI_ACCOUNT_ID=26569079
```

```
NEXI_MAC_KEY=O1c57OA4aH7o434dH79KCK7IFoh7g0KZ869K1OMt
```
**Note:** This is the MAC Key from your previous Nexi configuration. We'll test if it works with the new merchant ID `025153685`. If Nexi rejects it, you'll need to get the new MAC Key for this merchant account.

```
NEXI_ENVIRONMENT=production
```

```
VITE_NEXI_ENVIRONMENT=production
```

### Step 4: Redeploy

After adding all variables:
1. Go to **Deploys** tab
2. Click **Trigger deploy** → **Deploy site**
3. Wait 2-3 minutes for deployment

### Step 5: Test in Production

⚠️ **Production Environment - Use Real Cards**

Once deployed, test at:
- **https://dr7.app/.netlify/functions/test-nexi**

**Start with a small amount (€1-5) to verify:**
1. Payment creation works
2. Redirect to Nexi payment page succeeds
3. Payment completes successfully
4. Callback updates database correctly
5. Transaction appears in Nexi Backoffice → TRANSAZIONI tab

---

## 💡 Why Manual Configuration?

The `.env` file is in `.gitignore` (for security), so environment variables don't get pushed to GitHub or Netlify. You must add them manually in the Netlify dashboard.

---

## ✅ After Adding Variables

Your payment system will:
1. ✅ Create payments with Nexi instead of Stripe
2. ✅ Redirect customers to Nexi payment page
3. ✅ Process real credit card payments
4. ✅ Update booking status via webhook
5. ✅ Show transactions in Nexi Backoffice

---

## 🆘 Need Help?

**Finding Environment Variables in Netlify:**
1. Site settings (gear icon)
2. Left sidebar: **Environment variables**
3. Click **Add a variable**
4. Paste each key-value pair above

**Getting MAC Key:**
- Contact: Your Nexi account manager
- Email: The contact from your Nexi contract
- Phone: Nexi customer support

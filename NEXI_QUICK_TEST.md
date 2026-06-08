# Quick Nexi Configuration Test

## What We're Testing

Using the MAC Key from your previous Nexi configuration to see if it works with the new merchant account.

**Previous Configuration:**
- Merchant ID: `03892082`
- MAC Key: `O1c57OA4aH7o434dH79KCK7IFoh7g0KZ869K1OMt`

**New Configuration:**
- Merchant ID: `025153685`
- MAC Key: `O1c57OA4aH7o434dH79KCK7IFoh7g0KZ869K1OMt` (testing if same)

---

## Quick Setup Steps

### 1. Add Environment Variables to Netlify

Go to Netlify Dashboard → Site Settings → Environment Variables and add:

```bash
NEXI_API_KEY=9f46149d-a616-4cfa-b92a-4d3b85a4c2a7
NEXI_MERCHANT_ID=025153685
NEXI_TERMINAL_ID=75703919
NEXI_ACCOUNT_ID=26569079
NEXI_MAC_KEY=O1c57OA4aH7o434dH79KCK7IFoh7g0KZ869K1OMt
NEXI_ENVIRONMENT=production
VITE_NEXI_ENVIRONMENT=production
```

### 2. Deploy

- Go to Deploys tab
- Click "Trigger deploy"
- Wait 2-3 minutes

### 3. Test

Visit: `https://dr7.app/.netlify/functions/test-nexi`

Create a test payment for **€1.00**

---

## Expected Results

### ✅ If MAC Key Works:
- Payment URL is created successfully
- You're redirected to Nexi payment page
- Merchant ID `025153685` appears on payment form
- Payment completes successfully
- **Result:** MAC Key is the same! ✅

### ❌ If MAC Key Doesn't Work:
- Nexi returns "Invalid MAC" error
- Or payment page shows authentication error
- **Result:** Need to get new MAC Key for merchant `025153685`

---

## No Risk in Testing

- ✅ Stripe remains active (not removed)
- ✅ If Nexi fails, customers can still use Stripe
- ✅ Testing with €1 has minimal cost
- ✅ No data loss or security risk

---

## Next Steps Based on Result

### If It Works ✅
1. Test with a few more small payments
2. Monitor for 24 hours
3. Gradually switch payment pages from Stripe to Nexi
4. Keep Stripe as backup for 1-2 weeks

### If It Doesn't Work ❌
1. Contact Nexi support
2. Request MAC Key for merchant `025153685`
3. Update environment variable
4. Re-test

---

## Support

If you need the MAC Key for merchant `025153685`:

**Nexi Support:**
> "Buongiorno, ho bisogno della Chiave MAC per il commerciante 025153685. La chiave del vecchio commerciante 03892082 non funziona con il nuovo account."

(Translation: "Hello, I need the MAC Key for merchant 025153685. The key from the old merchant 03892082 doesn't work with the new account.")

# Deployment Guide: Chrome HTTP/2 Fix

## ✅ Pre-Deployment Checklist

### 1. Environment Variables (CRITICAL)

You **MUST** add the following environment variable to Netlify before deploying:

```
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key-here>
```

**Where to find it:**
1. Go to [Supabase Dashboard](<YOUR_SUPABASE_URL>/settings/api)
2. Navigate to: Project Settings → API
3. Copy the **`service_role`** key (NOT the `anon` key)
4. Add to Netlify: Site Settings → Environment Variables → Add variable

**Existing variables (verify these exist):**
- `SUPABASE_URL` ✓ (should already exist)
- `SUPABASE_ANON_KEY` ✓ (should already exist)

---

## 📦 What Was Changed

### Server-Side (Netlify Functions)

**New Files:**
- `netlify/functions/getVehicles.ts` - Proxies vehicle queries
- `netlify/functions/getResidencyZone.ts` - Proxies residency zone lookups
- `netlify/functions/getCreditBalance.ts` - Proxies credit balance queries

**Key Features:**
- Server-to-server communication (bypasses Chrome HTTP/2 issues)
- Resilient error handling with fallback values
- CORS enabled for browser access
- Detailed logging for debugging

### Frontend Updates

**Modified Files:**
- `hooks/useVehicles.ts` - Now calls `/.netlify/functions/getVehicles`
- `contexts/AuthContext.tsx` - Now calls `/.netlify/functions/getResidencyZone`
- `components/ui/CarBookingWizard.tsx` - Now calls Netlify Functions
- `utils/creditWallet.ts` - Now calls `/.netlify/functions/getCreditBalance`

**UI Improvements (already in place):**
- ✅ Skeleton loading cards while fetching
- ✅ Non-blocking error banner with retry button
- ✅ Cache fallback (24-hour localStorage cache)
- ✅ Chrome debug hints (dev mode only)

---

## 🚀 Deployment Steps

### Option 1: Deploy via Netlify Dashboard

1. **Commit and push changes:**
   ```bash
   git add .
   git commit -m "Fix: Chrome HTTP/2 errors with Netlify Functions proxy layer"
   git push origin main
   ```

2. **Add environment variable:**
   - Go to Netlify Dashboard → Your Site → Site Settings → Environment Variables
   - Click "Add a variable"
   - Key: `SUPABASE_SERVICE_ROLE_KEY`
   - Value: `<paste-your-service-role-key>`
   - Click "Create variable"

3. **Trigger deployment:**
   - Netlify will auto-deploy on push
   - Or manually trigger: Deploys → Trigger deploy → Deploy site

### Option 2: Deploy via Netlify CLI

```bash
# 1. Set environment variable
netlify env:set SUPABASE_SERVICE_ROLE_KEY "<your-service-role-key>"

# 2. Deploy
netlify deploy --prod
```

---

## 🧪 Testing After Deployment

### 1. Chrome Vehicle Display Test

**URL:** `https://dr7.app/urban-cars`

**Expected Results:**
- ✅ Vehicles load within 2 seconds
- ✅ No `ERR_HTTP2_PROTOCOL_ERROR` in console
- ✅ Network tab shows requests to `/.netlify/functions/getVehicles`
- ✅ All requests return 200 status

**If vehicles don't load:**
1. Open Chrome DevTools → Console
2. Check for errors
3. Open Network tab → Filter by "getVehicles"
4. Check response status and body

### 2. Safari Compatibility Test

**URL:** `https://dr7.app/urban-cars`

**Expected Results:**
- ✅ Vehicles load (same as Chrome)
- ✅ No regression from previous working state

### 3. Cache Fallback Test

1. Load `/urban-cars` successfully
2. Open DevTools → Application → Local Storage
3. Verify `dr7_vehicles_cache_urban` exists
4. Open Network tab → Set throttling to "Offline"
5. Refresh page
6. **Expected:** Vehicles still display with yellow banner "Showing cached vehicles"
7. **Expected:** "Retry" button is visible

### 4. Retry Mechanism Test

1. With network offline, click "Retry" button
2. **Expected:** Loading skeletons appear
3. **Expected:** After 3 failed attempts, error banner reappears
4. Set network back to "Online"
5. Click "Retry" again
6. **Expected:** Fresh vehicles load successfully

### 5. Residency Zone Fallback Test

1. Login as a user WITHOUT a `customers_extended` record
2. Navigate to booking wizard
3. **Expected:** Wizard loads successfully
4. **Expected:** Pricing shows "NON_RESIDENTE" rates
5. **Expected:** No blocking errors

### 6. Credit Balance Fallback Test

1. Login as a user WITHOUT a `user_credit_balance` record
2. Navigate to booking wizard
3. **Expected:** Wizard loads successfully
4. **Expected:** Credit balance shows €0
5. **Expected:** No blocking errors

---

## 🐛 Troubleshooting

### Issue: "Function not found" errors

**Cause:** Netlify Functions not deployed or environment variable missing

**Fix:**
1. Verify files exist in `netlify/functions/` directory
2. Check Netlify build logs for function deployment
3. Verify `SUPABASE_SERVICE_ROLE_KEY` is set in Netlify environment variables

### Issue: Vehicles still don't load in Chrome

**Cause:** Possible caching or deployment issue

**Fix:**
1. Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
2. Clear browser cache
3. Try incognito mode
4. Check Netlify function logs for errors

### Issue: "Internal server error" from functions

**Cause:** Missing environment variable or Supabase connection issue

**Fix:**
1. Verify `SUPABASE_SERVICE_ROLE_KEY` is correctly set
2. Check Netlify function logs: Functions → Select function → View logs
3. Verify Supabase project is accessible

### Issue: TypeScript errors about @netlify/functions

**Cause:** Package installation failed due to Node.js version incompatibility

**Fix:** These are development-time type errors only. The functions will work correctly at runtime on Netlify. You can ignore these errors or:
```bash
# Try installing with legacy peer deps
npm install --save-dev @netlify/functions --legacy-peer-deps
```

---

## 📊 Monitoring

### Netlify Function Logs

**Access:** Netlify Dashboard → Functions → Select function → Logs

**What to look for:**
- `[getVehicles] Success: { count: X }` - Successful vehicle fetch
- `[getResidencyZone] Success: { residency_zone: ... }` - Successful residency fetch
- `[getCreditBalance] Success: { balance: X }` - Successful balance fetch
- Any `ERROR` logs indicate issues

### Browser Console

**Chrome DevTools → Console**

**What to look for:**
- `✅ Successfully fetched X vehicles` - Good
- `📦 Loaded X vehicles from cache` - Using cache (expected on subsequent loads)
- `❌ Error fetching vehicles` - Problem (check network tab)

---

## 🔄 Rollback Plan

If the deployment causes issues:

### Quick Rollback (Netlify Dashboard)

1. Go to Netlify Dashboard → Deploys
2. Find the previous working deployment
3. Click "..." → "Publish deploy"

### Code Rollback (Git)

```bash
git revert HEAD
git push origin main
```

**Note:** The Netlify Functions can coexist with the old code without harm. You can keep them deployed even if you rollback the frontend changes.

---

## ✅ Success Criteria

Deployment is successful when:

1. ✅ Chrome users can see vehicles on `/urban-cars`
2. ✅ No `ERR_HTTP2_PROTOCOL_ERROR` in Chrome console
3. ✅ Safari continues to work (no regression)
4. ✅ Cached vehicles display when network fails
5. ✅ Retry button successfully refreshes vehicles
6. ✅ Booking wizard loads even if residency/credit calls fail

---

## 📞 Support

If you encounter issues after deployment:

1. Check Netlify function logs
2. Check browser console for errors
3. Verify environment variables are set
4. Test in incognito mode to rule out cache issues
5. Contact support with:
   - Browser version
   - Error messages from console
   - Netlify function logs
   - Steps to reproduce

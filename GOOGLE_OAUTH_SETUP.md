# Google OAuth Setup Guide for DR7 Empire

## Issue
Google sign-in redirect URL is incorrect and not connecting customers.

## Solution

### 1. Configure Supabase Authentication URLs

Go to your Supabase Dashboard:
1. Navigate to **Authentication** → **URL Configuration**
2. Set the following URLs:

**Site URL:**
```
https://your-production-domain.com
```
(Replace with your actual Netlify domain, e.g., `https://dr7.app` or your custom domain)

**Redirect URLs (add ALL of these):**
```
https://your-production-domain.com/auth/callback
https://your-production-domain.com/**
http://localhost:5173/auth/callback
http://localhost:5173/**
```

### 2. Configure Google OAuth Provider

In Supabase Dashboard:
1. Go to **Authentication** → **Providers** → **Google**
2. Make sure **Enabled** is checked
3. Verify your Google OAuth credentials are correct:
   - **Client ID** (from Google Cloud Console)
   - **Client Secret** (from Google Cloud Console)

### 3. Configure Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **Credentials**
3. Select your OAuth 2.0 Client ID
4. Under **Authorized redirect URIs**, add EXACTLY this:

**Required redirect URI:**
```
<YOUR_SUPABASE_URL>/auth/v1/callback
```

⚠️ **IMPORTANT**: This must match exactly (no trailing slash, correct https)

### 4. Test the Flow

After configuration:
1. Clear browser cache
2. Try Google sign-in again
3. You should be redirected to: `https://your-domain.com/auth/callback`
4. Then automatically redirected to `/account` or `/partner/dashboard`

## Debugging

If it still doesn't work:
1. Open browser DevTools → Network tab
2. Click "Sign in with Google"
3. Check the redirect URLs in the OAuth flow
4. Look for any CORS or redirect errors
5. Verify the final redirect matches your configured Site URL

## Common Issues

### "Redirect URI mismatch" error
- Double-check the Google Cloud Console redirect URI matches Supabase exactly
- Format: `https://[PROJECT-REF].supabase.co/auth/v1/callback`

### Users aren't logged in after redirect
- Check that `/auth/callback` route exists in App.tsx (✓ already exists)
- Verify `exchangeCodeForSession()` is being called (✓ already implemented)
- Check browser console for errors

### Wrong final destination
- Check `AuthCallbackPage.tsx` destination logic (line 25-26)
- Verify user role is set correctly during signup

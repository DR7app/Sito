# 🔍 Source Field Issue: "Pannello Admin" Display Bug

## Problem

Customer `fitnesspowerhour@gmail.com` registered via **website** but shows **"Fonte: Pannello Admin"** in the UI.

## Root Cause

The `source` field in `customers_extended` is set to **`"backfill_registration"`** instead of **`"website_registration"`**.

### Why This Happened:

This user was created during an **old data migration/backfill** (September 2025) before the proper registration flow was implemented. The backfill script set `source = 'backfill_registration'` for all migrated users.

However, looking at their `raw_user_meta_data`:
```json
{
  "role": "business",
  "company_name": "Bona",
  "full_name": "Bona",
  "email_verified": true
}
```

This indicates they **actually registered via the website's business signup**, not through admin panel.

## Source Field Values

Here are the correct source values:

| Source Value | Meaning | How Created |
|--------------|---------|-------------|
| `website_registration` | User registered via dr7.app | SignUpPage.tsx → register-customer.js |
| `website` | Customer created via admin panel | NewClientModal.tsx |
| `booking_auto_created` | Auto-created from booking | Trigger: auto_create_customer_from_booking |
| `backfill_registration` | ❌ Old migration (incorrect) | Old backfill script |
| `backfill_from_metadata` | Data recovered from metadata | Recent backfill: 20260110000001 |

## UI Display Issue

The UI is likely mapping `backfill_registration` → **"Pannello Admin"** (Admin Panel), which is incorrect.

**Correct mapping should be:**
- `website_registration` → "Sito Web" or "Website Registration"
- `website` → "Pannello Admin" (Admin Panel)
- `booking_auto_created` → "Prenotazione" (Booking)
- `backfill_registration` → "Migrazione Dati" (Data Migration)

## Solution

### Step 1: Fix This Specific User
```sql
UPDATE customers_extended
SET source = 'website_registration'
WHERE id = '940b41f4-eeb9-4c60-80a7-ce079ebc63b6';
```

### Step 2: Fix All Affected Users
Run `fix_source_backfill_to_website.sql` to update all users with `backfill_registration` who have website metadata.

### Step 3: Update UI Display Logic (if needed)
If the UI has a source mapping/translation, update it to correctly display:
- `backfill_registration` → "Migrazione Dati" (not "Pannello Admin")
- `website_registration` → "Sito Web"

## Verification

After running the fix, check:
```sql
SELECT 
  source,
  COUNT(*) as count
FROM customers_extended
GROUP BY source
ORDER BY count DESC;
```

Expected results:
- `website_registration`: Most users
- `website`: Admin-created customers
- `booking_auto_created`: Auto-created from bookings
- `backfill_from_metadata`: Recent backfill (Jan 2026)
- `backfill_registration`: Should be 0 or very few (old migration artifacts)

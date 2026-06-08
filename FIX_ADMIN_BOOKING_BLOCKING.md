# Fix: Admin Bookings Not Blocking Website Slots

## Problem
When creating a booking in the admin panel (admin.dr7.com), the slot is not blocked on the main website (dr7.app), allowing double-bookings.

## Root Cause
The database triggers that prevent double-booking may not be applied or there's an issue with:
1. Missing database migrations
2. Realtime subscription not working
3. Trigger functions not properly validating bookings

## Solution

### Step 1: Run Diagnostic Script

Execute the diagnostic script in your Supabase SQL Editor:

```bash
# In Supabase Dashboard:
# 1. Go to https://supabase.com/dashboard/project/YOUR_PROJECT/sql
# 2. Open FIX_ADMIN_BOOKING_SYNC.sql
# 3. Click "Run"
```

Or run locally:
```bash
cd /home/alex-bona/DR7-empire
psql $SUPABASE_DB_URL < FIX_ADMIN_BOOKING_SYNC.sql
```

This will check:
- ✅ If trigger functions exist
- ✅ If triggers are active
- ✅ If realtime replication is enabled
- ✅ If there are any existing conflicts
- ✅ If migrations were applied

### Step 2: Apply Missing Migrations (if needed)

If the diagnostic shows missing functions, apply these migrations in order:

#### Migration 1: Booking Validation Triggers
```bash
cd /home/alex-bona/DR7-empire
# Apply via Supabase CLI
supabase db push supabase/migrations/20251112000000_add_booking_validation_triggers.sql
```

Or manually in Supabase SQL Editor:
```sql
-- Copy contents of supabase/migrations/20251112000000_add_booking_validation_triggers.sql
-- Paste and run in SQL Editor
```

#### Migration 2: Unified Bookings System
```bash
cd /home/alex-bona/DR7-empire
# Apply via Supabase CLI
supabase db push supabase/migrations/20251112000003_unified_bookings_only.sql
```

Or manually in Supabase SQL Editor:
```sql
-- Copy contents of supabase/migrations/20251112000003_unified_bookings_only.sql
-- Paste and run in SQL Editor
```

### Step 3: Enable Realtime (if needed)

If realtime is not enabled, run this in Supabase SQL Editor:

```sql
-- Enable realtime for bookings table
ALTER PUBLICATION supabase_realtime ADD TABLE bookings;

-- Verify
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
AND tablename = 'bookings';
-- Should return: bookings
```

### Step 4: Enable pg_cron (for auto-expiring holds)

In Supabase SQL Editor:
```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Verify the cron job exists
SELECT * FROM cron.job WHERE jobname = 'release-expired-holds';
```

### Step 5: Test the Fix

#### Test 1: Admin → Website Blocking (Car Wash)

1. **In admin panel (admin.dr7.com):**
   - Create a car wash booking for tomorrow at 16:00
   - Service: LAVAGGIO COMPLETO (€25)
   - Set status to "confirmed"
   - Save

2. **In main website (dr7.app):**
   - Go to Car Wash booking page
   - Select tomorrow's date
   - Check if 16:00 slot shows as "Occupato" (blocked) with red border

3. **Expected result:** ✅ Slot shows as blocked

#### Test 2: Admin → Website Blocking (Car Rental)

1. **In admin panel:**
   - Create a car rental booking
   - Vehicle: "Lamborghini Urus"
   - Dates: 2025-11-15 to 2025-11-18
   - Status: "confirmed"
   - Save

2. **In main website:**
   - Go to vehicle booking page
   - Try to book "Lamborghini Urus" for 2025-11-15 to 2025-11-20

3. **Expected result:** ✅ Website shows vehicle as unavailable

#### Test 3: Website → Admin Blocking

1. **On main website:**
   - Book a car wash for tomorrow at 10:00
   - Complete payment

2. **In admin panel:**
   - Try to create another car wash booking for same date/time
   - Click Save

3. **Expected result:** ✅ Should show error: "Car wash time slot conflict"

### Step 6: Verify Realtime Sync

Open both sites side-by-side:

1. **Browser 1:** admin.dr7.com (Reservations tab)
2. **Browser 2:** dr7.app (Car Wash page, select a date)

3. **Create booking in admin panel**

4. **Check website:** The calendar should update within 1-2 seconds showing the blocked slot

## Troubleshooting

### Issue: Triggers not firing

Check if triggers are enabled:
```sql
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'bookings'::regclass
AND tgname LIKE 'validate_%';
```

If disabled, enable them:
```sql
ALTER TABLE bookings ENABLE TRIGGER validate_car_wash_booking;
ALTER TABLE bookings ENABLE TRIGGER validate_vehicle_booking;
```

### Issue: Realtime not working

1. Check browser console for realtime connection errors
2. Verify Supabase Realtime is enabled in project settings
3. Check if `booking_source` column exists:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'bookings'
AND column_name = 'booking_source';
```

### Issue: Still seeing conflicts after fix

Find conflicting bookings:
```sql
SELECT
    b1.id,
    b1.customer_name,
    b1.appointment_time,
    b1.booking_source,
    b2.id as conflict_id,
    b2.customer_name as conflict_customer,
    b2.booking_source as conflict_source
FROM bookings b1
JOIN bookings b2 ON
    b1.id < b2.id
    AND b1.service_type = 'car_wash'
    AND b2.service_type = 'car_wash'
    AND DATE(b1.appointment_date) = DATE(b2.appointment_date)
    AND b1.status IN ('confirmed', 'pending')
    AND b2.status IN ('confirmed', 'pending')
WHERE
    (EXTRACT(HOUR FROM b1.appointment_time::TIME) * 60 + EXTRACT(MINUTE FROM b1.appointment_time::TIME)) <
    (EXTRACT(HOUR FROM b2.appointment_time::TIME) * 60 + EXTRACT(MINUTE FROM b2.appointment_time::TIME) + (CEIL((b2.price_total / 100.0) / 25.0) * 60))
    AND
    (EXTRACT(HOUR FROM b1.appointment_time::TIME) * 60 + EXTRACT(MINUTE FROM b1.appointment_time::TIME) + (CEIL((b1.price_total / 100.0) / 25.0) * 60)) >
    (EXTRACT(HOUR FROM b2.appointment_time::TIME) * 60 + EXTRACT(MINUTE FROM b2.appointment_time::TIME));
```

Cancel one of the conflicting bookings:
```sql
UPDATE bookings
SET status = 'cancelled'
WHERE id = 'CONFLICT_BOOKING_ID';
```

## How It Works (Technical Details)

### Database Triggers
- `validate_car_wash_booking`: Checks car wash slot availability before INSERT/UPDATE
- `validate_vehicle_booking`: Checks vehicle availability before INSERT/UPDATE

### Availability Functions
- `check_unified_carwash_availability()`: Checks if car wash slot is available
- `check_unified_vehicle_availability()`: Checks if vehicle is available

### Real-time Sync
- Uses Supabase Realtime PostgreSQL replication
- `useRealtimeBookings` hook subscribes to changes on `bookings` table
- Changes propagate instantly to all connected clients

### Booking Flow

**Admin Panel:**
```
Admin creates booking
    ↓
INSERT into bookings table
    ↓
Trigger fires → check_car_wash_availability()
    ↓
If conflict → RAISE EXCEPTION (booking blocked)
If available → Booking created
    ↓
Realtime notifies all clients
    ↓
Website updates slot status (blocked)
```

**Website:**
```
User selects slot
    ↓
useRealtimeBookings loads all bookings
    ↓
getAvailableSlots() filters occupied times
    ↓
Slot shows as "Occupato" if admin booking exists
    ↓
If user tries to book → INSERT fails (trigger blocks it)
```

## Summary

The fix ensures:
1. ✅ Admin bookings immediately block slots on website
2. ✅ Website bookings immediately block slots in admin
3. ✅ Database triggers prevent double-booking at database level
4. ✅ Real-time updates propagate instantly
5. ✅ Single source of truth (`bookings` table)

## Need Help?

If issues persist:
1. Run the diagnostic script again
2. Check Supabase logs for errors
3. Verify both projects use the same Supabase instance
4. Check if `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` match in both `.env` files

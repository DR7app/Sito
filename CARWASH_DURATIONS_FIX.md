# Car Wash Durations - Complete Fix

## Current System Status

The main website (`dr7.app`) **has updated durations**:
- ✅ LAVAGGIO COMPLETO (€25) = 45 minutes
- ✅ LAVAGGIO TOP (€49) = 1.5 hours
- ✅ LAVAGGIO VIP (€75) = 2 hours
- ✅ LAVAGGIO DR7 LUXURY (€99) = 2.5 hours (only bookable at 9:00-10:30 or 15:00-16:30)

**Location:** `pages/CarWashBookingPage.tsx:69-79`

## What Needs to be Fixed

### 1. Database Duration Fields
Run this SQL in Supabase to fix the `car_wash_services` table:

```sql
-- Fix car wash service durations
UPDATE car_wash_services
SET duration = '45 min'
WHERE price = 25;

UPDATE car_wash_services
SET duration = '1.5 ore'
WHERE price = 49;

UPDATE car_wash_services
SET duration = '2 ore'
WHERE price = 75;

UPDATE car_wash_services
SET duration = '2.5 ore'
WHERE price = 99;

-- Verify
SELECT name, name_en, price, duration
FROM car_wash_services
ORDER BY price;
```

### 2. How Duration Blocking Works

**Main Website (`dr7.app`):**
- File: `pages/CarWashBookingPage.tsx`
- Function: `getServiceDurationInHours(price)` - Line 69
- Slot blocking: Lines 296-310 (checks if time slots overlap with existing bookings)
- **Status:** ✅ Already correct!

**Admin Panel:**
- Admin creates bookings with price → system calculates duration automatically
- When displaying in calendar, it reads from database
- **Status:** Will be correct after running SQL above

### 3. Email Notifications

Car wash booking emails are sent from:
- Main site: Stripe webhook or booking confirmation
- Admin: Manual booking creation

The duration shown in emails comes from the `car_wash_services` table.

### 4. Google Calendar Integration

When admin creates a car wash booking:
- Start time: `appointment_time`
- End time: Calculated as `appointment_time + duration`
- **Fix needed:** Admin panel must calculate end time based on service price

## Testing Checklist

After running the SQL:

- [ ] Check database: `SELECT * FROM car_wash_services;`
- [ ] Book €25 service on website → verify 45-minute slot blocked
- [ ] Book €49 service on website → verify 1.5-hour slot blocked
- [ ] Book €75 service on website → verify 2-hour slot blocked
- [ ] Book €99 service on website → verify 2.5-hour slot blocked (only 9:00 or 15:00)
- [ ] Check email shows correct duration
- [ ] Check Google Calendar event has correct end time
- [ ] Verify admin panel displays correct duration

## Files that Use Duration

1. **Main Website:**
   - `pages/CarWashBookingPage.tsx` - Slot calculation ✅
   - `pages/CarWashServicesPage.tsx` - Service display
   - `hooks/useRealtimeBookings.ts` - Real-time availability

2. **Admin Panel:**
   - `src/pages/admin/components/CalendarTab.tsx` - Display only
   - `src/pages/admin/components/CarWashTab.tsx` - Service management

3. **Database:**
   - `car_wash_services` table - Duration field needs update

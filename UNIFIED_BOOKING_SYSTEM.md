# Unified Real-Time Booking System

## Overview
dr7.app and admin.dr7.com now use the **SAME `bookings` table** for all reservations (car rentals, car wash, jets, etc.). This ensures real-time synchronization between both platforms.

## Database Structure

### Single Source of Truth: `bookings` table

```sql
-- Key columns:
- id: UUID (primary key)
- service_type: 'car_rental' | 'car_wash' | 'jet' | null
- vehicle_name: Name of the vehicle
- pickup_date / dropoff_date: For car rentals
- appointment_date / appointment_time: For car wash
- status: 'pending' | 'confirmed' | 'held' | 'completed' | 'cancelled'
- payment_status: 'pending' | 'succeeded' | 'completed' | 'paid'
- hold_expires_at: Timestamp for pre-bookings/holds
- held_by: Who created the hold
- booking_source: 'website' | 'admin' | 'api'
```

## How It Works

### 1. Real-Time Synchronization
- Both platforms connect to the same `bookings` table
- Changes made in admin.dr7.com instantly appear on dr7.app
- Changes made on dr7.app instantly appear in admin.dr7.com
- Uses Supabase Realtime for instant updates

### 2. Slot Blocking
- **Website booking** → Slot blocked in admin panel
- **Admin booking** → Slot blocked on website
- **Pre-booking/Hold** → Slot temporarily reserved (auto-expires)

### 3. Hold/Pre-Booking System
```javascript
// Create a 15-minute hold on a slot
const holdId = await createBookingHold({
  service_type: 'car_wash',
  appointment_date: '2025-11-14',
  appointment_time: '16:00',
  price_total: 2500, // €25 in cents
  booking_source: 'admin',
  held_by: 'admin@dr7.com'
}, 15); // Hold for 15 minutes

// After 15 minutes, the hold automatically expires
// Slot becomes available again
```

### 4. Car Wash Options
Car wash options (Basic, Deep Clean, Signature) are stored in `booking_details` as add-ons:

```javascript
{
  service_type: 'car_wash',
  service_name: 'LAVAGGIO COMPLETO',
  price_total: 2500,
  booking_details: {
    additionalService: 'Deep Clean',
    additionalServiceHours: 2,
    notes: 'Extra attention to interior'
  }
}
```

These add-ons don't affect slot availability - only the main appointment time matters.

## Implementation

### For dr7.app (Already Working)

```typescript
import { useRealtimeBookings, useCarWashAvailability } from '../hooks/useRealtimeBookings';

function CarWashBookingPage() {
  const { bookings, getAvailableSlots, loading } = useCarWashAvailability('2025-11-14');

  const slots = getAvailableSlots(25, '2025-11-14'); // €25 service

  return (
    <div>
      {slots.map(slot => (
        <button
          key={slot.time}
          disabled={!slot.available}
          className={slot.available ? 'available' : 'blocked'}
        >
          {slot.time} {!slot.available && '(Booked)'}
        </button>
      ))}
    </div>
  );
}
```

### For admin.dr7.com (To Implement)

```typescript
import { useRealtimeBookings } from '../hooks/useRealtimeBookings';

function AdminReservationsPanel() {
  const { bookings, loading, refetch, isSlotAvailable } = useRealtimeBookings({
    serviceType: 'all',
    autoRefresh: true
  });

  const handleCreateBooking = async (bookingData) => {
    // Check availability first
    const { available, message } = await isSlotAvailable({
      serviceType: 'car_wash',
      date: '2025-11-14',
      time: '16:00',
      durationHours: 1
    });

    if (!available) {
      alert(`Slot not available: ${message}`);
      return;
    }

    // Create booking with booking_source = 'admin'
    const { data, error } = await supabase
      .from('bookings')
      .insert({
        ...bookingData,
        booking_source: 'admin',
        status: 'confirmed',
        payment_status: 'completed'
      });

    // Real-time sync automatically updates website!
  };

  return (
    <div>
      <h1>All Bookings (Website + Admin)</h1>
      {bookings.map(booking => (
        <div key={booking.id}>
          {booking.vehicle_name || booking.service_name}
          <span>{booking.booking_source}</span> {/* Shows 'website' or 'admin' */}
        </div>
      ))}
    </div>
  );
}
```

## SQL Migrations to Apply

Run these in order:

### 1. Unified Bookings System
```bash
supabase/migrations/20251112000003_unified_bookings_only.sql
```

This creates:
- Hold/pre-booking columns
- Auto-expiry function (runs every minute)
- Unified availability checking
- Real-time replication

### 2. Enable pg_cron (if not enabled)
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

## Testing the System

### Test 1: Admin → Website Blocking
1. In admin.dr7.com, create a car wash booking for 14/11/2025 at 16:00
2. Go to dr7.app
3. Select car wash and date 14/11/2025
4. **Result:** 16:00 slot should show with RED BORDER and "Occupato"

### Test 2: Website → Admin Blocking
1. On dr7.app, book a car wash for 14/11/2025 at 09:30
2. Go to admin.dr7.com
3. Try to create another booking for same date/time
4. **Result:** Should show error "Time slot already occupied"

### Test 3: Pre-Booking Expiry
1. Create a hold/pre-booking in admin
2. Wait 15 minutes
3. Check availability
4. **Result:** Slot automatically becomes available again

### Test 4: Real-Time Updates
1. Open dr7.app in one browser
2. Open admin.dr7.com in another browser
3. Create a booking in admin
4. **Result:** Website should update instantly (within 1 second)

## Admin Panel Migration Steps

### Step 1: Update Admin Panel to Use Bookings Table

Instead of the `reservations` table, admin.dr7.com should:

1. Read from `bookings` table
2. Write to `bookings` table with `booking_source: 'admin'`
3. Use the same real-time hook

### Step 2: Migrate Existing Reservations (If Any)

```sql
-- Copy existing reservations to bookings table
INSERT INTO public.bookings (
  vehicle_name,
  pickup_date,
  dropoff_date,
  price_total,
  currency,
  status,
  payment_status,
  booking_source,
  customer_name,
  customer_email,
  customer_phone,
  booking_details
)
SELECT
  v.display_name as vehicle_name,
  r.start_at as pickup_date,
  r.end_at as dropoff_date,
  r.total_amount * 100 as price_total, -- Convert to cents
  r.currency,
  r.status,
  'completed' as payment_status,
  'admin' as booking_source,
  c.full_name as customer_name,
  c.email as customer_email,
  c.phone as customer_phone,
  jsonb_build_object('addons', r.addons) as booking_details
FROM public.reservations r
JOIN public.vehicles v ON r.vehicle_id = v.id
LEFT JOIN public.customers c ON r.customer_id = c.id
WHERE r.status NOT IN ('cancelled');
```

## Benefits

✅ **Single Source of Truth** - No more data duplication
✅ **Real-Time Sync** - Changes appear instantly on both platforms
✅ **Automatic Conflict Prevention** - Database triggers prevent double-booking
✅ **Hold System** - Pre-book slots that auto-release
✅ **Source Tracking** - Know if booking came from website or admin
✅ **Simplified Maintenance** - One table to manage instead of two

## API Reference

### Check Availability
```sql
-- For car rentals
SELECT * FROM check_unified_vehicle_availability(
  'Lamborghini Urus',
  '2025-11-14 10:00:00+00',
  '2025-11-20 10:00:00+00'
);

-- For car wash
SELECT * FROM check_unified_carwash_availability(
  '2025-11-14',
  '16:00',
  1 -- duration in hours
);
```

### Create Hold
```sql
SELECT create_booking_hold(
  jsonb_build_object(
    'service_type', 'car_wash',
    'appointment_date', '2025-11-14T16:00:00+00',
    'appointment_time', '16:00',
    'price_total', 2500,
    'booking_source', 'admin'
  ),
  15, -- hold for 15 minutes
  'admin@dr7.com' -- held by
);
```

### Release Expired Holds
```sql
-- Runs automatically every minute, but can be called manually
SELECT release_expired_holds();
```

## Support

If you encounter issues:
1. Check Supabase logs for errors
2. Verify migrations were applied: `SELECT * FROM migrations;`
3. Check real-time is enabled: `SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';`
4. Monitor real-time events in browser console

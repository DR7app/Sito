-- Unified Real-Time Slot Availability System
-- This ensures dr7.app and admin.dr7.com share availability in real-time

-- 1. Add status fields for hold/pre-booking functionality to bookings table
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS hold_expires_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS held_by text,
ADD COLUMN IF NOT EXISTS booking_source text DEFAULT 'website' CHECK (booking_source IN ('website', 'admin', 'api'));

-- 2. Add status fields to reservations table
ALTER TABLE public.reservations
ADD COLUMN IF NOT EXISTS hold_expires_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS held_by text;

-- 3. Update status check constraints to include 'held' status
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'held'));

ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
ALTER TABLE public.reservations ADD CONSTRAINT reservations_status_check
CHECK (status IN ('pending', 'confirmed', 'active', 'completed', 'cancelled', 'held'));

-- 4. Create unified availability view that combines both bookings and reservations
CREATE OR REPLACE VIEW public.unified_vehicle_availability AS
SELECT
  'booking' as source_type,
  id as source_id,
  vehicle_name,
  pickup_date as start_time,
  dropoff_date as end_time,
  status,
  payment_status,
  hold_expires_at,
  service_type,
  CASE
    WHEN status = 'held' AND hold_expires_at > NOW() THEN 'held'
    WHEN status IN ('confirmed', 'pending') AND (payment_status IN ('succeeded', 'completed', 'paid') OR service_type = 'car_wash') THEN 'booked'
    WHEN status = 'held' AND hold_expires_at <= NOW() THEN 'expired'
    ELSE 'available'
  END as availability_status
FROM public.bookings
WHERE service_type IS DISTINCT FROM 'car_wash' -- Exclude car wash from vehicle availability
  AND vehicle_name IS NOT NULL
  AND pickup_date IS NOT NULL
  AND dropoff_date IS NOT NULL

UNION ALL

SELECT
  'reservation' as source_type,
  id as source_id,
  v.display_name as vehicle_name,
  start_at as start_time,
  end_at as end_time,
  r.status,
  NULL as payment_status,
  hold_expires_at,
  NULL as service_type,
  CASE
    WHEN r.status = 'held' AND hold_expires_at > NOW() THEN 'held'
    WHEN r.status IN ('confirmed', 'active', 'pending') THEN 'booked'
    WHEN r.status = 'held' AND hold_expires_at <= NOW() THEN 'expired'
    ELSE 'available'
  END as availability_status
FROM public.reservations r
JOIN public.vehicles v ON r.vehicle_id = v.id
WHERE r.status NOT IN ('cancelled', 'completed');

-- 5. Create unified car wash availability view
CREATE OR REPLACE VIEW public.unified_carwash_availability AS
SELECT
  id,
  appointment_date,
  appointment_time,
  service_name,
  price_total,
  status,
  payment_status,
  hold_expires_at,
  booking_source,
  CASE
    WHEN status = 'held' AND hold_expires_at > NOW() THEN 'held'
    WHEN status IN ('confirmed', 'pending') AND payment_status IN ('succeeded', 'completed', 'paid') THEN 'booked'
    WHEN status = 'held' AND hold_expires_at <= NOW() THEN 'expired'
    ELSE 'available'
  END as availability_status,
  -- Calculate service duration in hours
  CEIL((price_total / 100.0) / 25.0) as duration_hours
FROM public.bookings
WHERE service_type = 'car_wash'
  AND appointment_date IS NOT NULL
  AND appointment_time IS NOT NULL;

-- 6. Function to automatically release expired holds
CREATE OR REPLACE FUNCTION release_expired_holds()
RETURNS void AS $$
BEGIN
  -- Release expired holds in bookings
  UPDATE public.bookings
  SET
    status = 'cancelled',
    hold_expires_at = NULL,
    held_by = NULL
  WHERE status = 'held'
    AND hold_expires_at IS NOT NULL
    AND hold_expires_at <= NOW();

  -- Release expired holds in reservations
  UPDATE public.reservations
  SET
    status = 'cancelled',
    hold_expires_at = NULL,
    held_by = NULL
  WHERE status = 'held'
    AND hold_expires_at IS NOT NULL
    AND hold_expires_at <= NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Function to check vehicle availability across both systems
CREATE OR REPLACE FUNCTION check_unified_vehicle_availability(
  p_vehicle_name text,
  p_start_time timestamp with time zone,
  p_end_time timestamp with time zone,
  p_exclude_id uuid DEFAULT NULL,
  p_exclude_source text DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  conflict_count integer;
BEGIN
  -- First, clean up expired holds
  PERFORM release_expired_holds();

  -- Check for conflicts in unified view
  SELECT COUNT(*) INTO conflict_count
  FROM public.unified_vehicle_availability
  WHERE vehicle_name = p_vehicle_name
    AND availability_status IN ('booked', 'held')
    AND NOT (source_type = p_exclude_source AND source_id = p_exclude_id)
    AND (
      -- Check for time overlap
      (p_start_time >= start_time AND p_start_time < end_time) OR
      (p_end_time > start_time AND p_end_time <= end_time) OR
      (p_start_time <= start_time AND p_end_time >= end_time)
    );

  RETURN conflict_count = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Function to check car wash slot availability
CREATE OR REPLACE FUNCTION check_unified_carwash_availability(
  p_date date,
  p_time text,
  p_duration_hours numeric,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  conflict_count integer;
  requested_start_minutes integer;
  requested_end_minutes integer;
BEGIN
  -- First, clean up expired holds
  PERFORM release_expired_holds();

  -- Convert time to minutes
  requested_start_minutes := EXTRACT(HOUR FROM p_time::TIME) * 60 + EXTRACT(MINUTE FROM p_time::TIME);
  requested_end_minutes := requested_start_minutes + (p_duration_hours * 60);

  -- Check for conflicts
  SELECT COUNT(*) INTO conflict_count
  FROM public.unified_carwash_availability
  WHERE DATE(appointment_date) = p_date
    AND id != COALESCE(p_exclude_booking_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND availability_status IN ('booked', 'held')
    AND (
      -- Check for time overlap
      (EXTRACT(HOUR FROM appointment_time::TIME) * 60 + EXTRACT(MINUTE FROM appointment_time::TIME)) < requested_end_minutes
      AND
      (EXTRACT(HOUR FROM appointment_time::TIME) * 60 + EXTRACT(MINUTE FROM appointment_time::TIME) + (duration_hours * 60)) > requested_start_minutes
    );

  RETURN conflict_count = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Update the vehicle availability trigger to use unified check
CREATE OR REPLACE FUNCTION check_vehicle_availability()
RETURNS TRIGGER AS $$
BEGIN
  -- Only validate car rental bookings
  IF (NEW.service_type IS NULL OR NEW.service_type != 'car_wash') AND
     NEW.vehicle_name IS NOT NULL AND
     NEW.pickup_date IS NOT NULL AND
     NEW.dropoff_date IS NOT NULL THEN

    -- Use unified availability check
    IF NOT check_unified_vehicle_availability(
      NEW.vehicle_name,
      NEW.pickup_date,
      NEW.dropoff_date,
      NEW.id,
      'booking'
    ) THEN
      RAISE EXCEPTION 'Vehicle % is not available for the selected dates. Already booked or held in another system.', NEW.vehicle_name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10. Update car wash availability trigger to use unified check
CREATE OR REPLACE FUNCTION check_car_wash_availability()
RETURNS TRIGGER AS $$
DECLARE
  requested_duration_hours NUMERIC;
BEGIN
  -- Only validate car wash bookings with succeeded/completed/paid payment or held status
  IF NEW.service_type = 'car_wash' AND
     (NEW.payment_status IN ('succeeded', 'completed', 'paid') OR NEW.status = 'held') THEN

    -- Calculate service duration based on price (25€ = 1 hour)
    requested_duration_hours := CEIL((NEW.price_total / 100.0) / 25.0);

    -- Use unified availability check
    IF NOT check_unified_carwash_availability(
      DATE(NEW.appointment_date),
      NEW.appointment_time,
      requested_duration_hours,
      NEW.id
    ) THEN
      RAISE EXCEPTION 'Car wash time slot conflict: This time slot is already booked or held. Please choose a different time.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 11. Create trigger for reservations table
CREATE OR REPLACE FUNCTION check_reservation_availability()
RETURNS TRIGGER AS $$
DECLARE
  vehicle_display_name text;
BEGIN
  -- Get vehicle name
  SELECT display_name INTO vehicle_display_name
  FROM public.vehicles
  WHERE id = NEW.vehicle_id;

  -- Use unified availability check
  IF NOT check_unified_vehicle_availability(
    vehicle_display_name,
    NEW.start_at,
    NEW.end_at,
    NEW.id,
    'reservation'
  ) THEN
    RAISE EXCEPTION 'Vehicle % is not available for the selected dates. Already booked or held in another system.', vehicle_display_name;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_reservation_availability ON reservations;
CREATE TRIGGER validate_reservation_availability
  BEFORE INSERT OR UPDATE ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION check_reservation_availability();

-- 12. Enable real-time for tables
ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE reservations;

-- 13. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bookings_vehicle_dates ON bookings(vehicle_name, pickup_date, dropoff_date) WHERE service_type IS DISTINCT FROM 'car_wash';
CREATE INDEX IF NOT EXISTS idx_bookings_carwash_datetime ON bookings(appointment_date, appointment_time) WHERE service_type = 'car_wash';
CREATE INDEX IF NOT EXISTS idx_bookings_hold_expires ON bookings(hold_expires_at) WHERE status = 'held';
CREATE INDEX IF NOT EXISTS idx_reservations_dates ON reservations(vehicle_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_reservations_hold_expires ON reservations(hold_expires_at) WHERE status = 'held';

-- 14. Add comments
COMMENT ON VIEW unified_vehicle_availability IS 'Real-time unified view of vehicle availability from both bookings and reservations';
COMMENT ON VIEW unified_carwash_availability IS 'Real-time unified view of car wash slot availability';
COMMENT ON FUNCTION release_expired_holds() IS 'Automatically releases expired hold/pre-booking slots';
COMMENT ON FUNCTION check_unified_vehicle_availability IS 'Checks vehicle availability across both website and admin CRM';
COMMENT ON FUNCTION check_unified_carwash_availability IS 'Checks car wash slot availability with hold support';

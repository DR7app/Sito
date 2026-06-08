-- Unified Real-Time Slot System Using ONLY Bookings Table
-- Both dr7.app and admin.dr7.com will use the same bookings table

-- 1. Add fields for hold/pre-booking and source tracking
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS hold_expires_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS held_by text,
ADD COLUMN IF NOT EXISTS booking_source text DEFAULT 'website' CHECK (booking_source IN ('website', 'admin', 'api'));

-- 2. Update status constraint to include 'held' for pre-bookings
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'held'));

-- 3. Function to automatically release expired holds
CREATE OR REPLACE FUNCTION release_expired_holds()
RETURNS void AS $$
BEGIN
  UPDATE public.bookings
  SET
    status = 'cancelled',
    hold_expires_at = NULL,
    held_by = NULL
  WHERE status = 'held'
    AND hold_expires_at IS NOT NULL
    AND hold_expires_at <= NOW();

  RAISE NOTICE 'Released % expired holds', FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create a scheduled job to release expired holds every minute
-- Note: You'll need to enable pg_cron extension in Supabase if not already enabled
SELECT cron.schedule(
  'release-expired-holds',
  '* * * * *', -- Every minute
  $$ SELECT release_expired_holds(); $$
);

-- 5. Enhanced function to check vehicle availability (car rentals)
CREATE OR REPLACE FUNCTION check_unified_vehicle_availability(
  p_vehicle_name text,
  p_start_time timestamp with time zone,
  p_end_time timestamp with time zone,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS TABLE(
  is_available boolean,
  conflicting_booking_id uuid,
  conflict_message text
) AS $$
DECLARE
  v_conflict_count integer;
  v_conflict_id uuid;
  v_conflict_source text;
  v_conflict_status text;
BEGIN
  -- First, clean up expired holds
  PERFORM release_expired_holds();

  -- Check for conflicts
  SELECT
    COUNT(*),
    MAX(id),
    MAX(booking_source),
    MAX(status)
  INTO
    v_conflict_count,
    v_conflict_id,
    v_conflict_source,
    v_conflict_status
  FROM public.bookings
  WHERE vehicle_name = p_vehicle_name
    AND service_type IS DISTINCT FROM 'car_wash'
    AND id != COALESCE(p_exclude_booking_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (
      -- Only count bookings that are actually blocking
      (status IN ('confirmed', 'pending') AND payment_status IN ('succeeded', 'completed', 'paid'))
      OR status = 'held'
    )
    AND (
      -- Check for time overlap
      (p_start_time >= pickup_date AND p_start_time < dropoff_date) OR
      (p_end_time > pickup_date AND p_end_time <= dropoff_date) OR
      (p_start_time <= pickup_date AND p_end_time >= dropoff_date)
    );

  IF v_conflict_count > 0 THEN
    RETURN QUERY SELECT
      false,
      v_conflict_id,
      format('Vehicle already %s via %s (Booking ID: %s)',
        CASE WHEN v_conflict_status = 'held' THEN 'held' ELSE 'booked' END,
        v_conflict_source,
        v_conflict_id
      );
  ELSE
    RETURN QUERY SELECT true, NULL::uuid, NULL::text;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Enhanced function to check car wash slot availability
CREATE OR REPLACE FUNCTION check_unified_carwash_availability(
  p_date date,
  p_time text,
  p_duration_hours numeric,
  p_exclude_booking_id uuid DEFAULT NULL
)
RETURNS TABLE(
  is_available boolean,
  conflicting_booking_id uuid,
  conflict_message text
) AS $$
DECLARE
  v_conflict_count integer;
  v_conflict_id uuid;
  v_conflict_source text;
  v_conflict_time text;
  requested_start_minutes integer;
  requested_end_minutes integer;
BEGIN
  -- First, clean up expired holds
  PERFORM release_expired_holds();

  -- Convert time to minutes
  requested_start_minutes := EXTRACT(HOUR FROM p_time::TIME) * 60 + EXTRACT(MINUTE FROM p_time::TIME);
  requested_end_minutes := requested_start_minutes + (p_duration_hours * 60);

  -- Check for conflicts
  SELECT
    COUNT(*),
    MAX(id),
    MAX(booking_source),
    MAX(appointment_time)
  INTO
    v_conflict_count,
    v_conflict_id,
    v_conflict_source,
    v_conflict_time
  FROM public.bookings
  WHERE service_type = 'car_wash'
    AND DATE(appointment_date) = p_date
    AND id != COALESCE(p_exclude_booking_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND (
      -- Only count bookings that are actually blocking
      (status IN ('confirmed', 'pending') AND payment_status IN ('succeeded', 'completed', 'paid'))
      OR status = 'held'
    )
    AND (
      -- Check for time overlap
      (EXTRACT(HOUR FROM appointment_time::TIME) * 60 + EXTRACT(MINUTE FROM appointment_time::TIME)) < requested_end_minutes
      AND
      (EXTRACT(HOUR FROM appointment_time::TIME) * 60 + EXTRACT(MINUTE FROM appointment_time::TIME) +
       (CEIL((price_total / 100.0) / 25.0) * 60)) > requested_start_minutes
    );

  IF v_conflict_count > 0 THEN
    RETURN QUERY SELECT
      false,
      v_conflict_id,
      format('Time slot already occupied at %s via %s', v_conflict_time, v_conflict_source);
  ELSE
    RETURN QUERY SELECT true, NULL::uuid, NULL::text;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Update vehicle availability trigger
CREATE OR REPLACE FUNCTION check_vehicle_availability()
RETURNS TRIGGER AS $$
DECLARE
  v_check RECORD;
BEGIN
  -- Only validate car rental bookings
  IF (NEW.service_type IS NULL OR NEW.service_type != 'car_wash') AND
     NEW.vehicle_name IS NOT NULL AND
     NEW.pickup_date IS NOT NULL AND
     NEW.dropoff_date IS NOT NULL AND
     NEW.status IN ('confirmed', 'pending', 'held') THEN

    -- Use unified availability check
    SELECT * INTO v_check
    FROM check_unified_vehicle_availability(
      NEW.vehicle_name,
      NEW.pickup_date,
      NEW.dropoff_date,
      NEW.id
    );

    IF NOT v_check.is_available THEN
      RAISE EXCEPTION '%', v_check.conflict_message;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Update car wash availability trigger
CREATE OR REPLACE FUNCTION check_car_wash_availability()
RETURNS TRIGGER AS $$
DECLARE
  v_check RECORD;
  requested_duration_hours NUMERIC;
BEGIN
  -- Only validate car wash bookings
  IF NEW.service_type = 'car_wash' AND
     NEW.appointment_date IS NOT NULL AND
     NEW.appointment_time IS NOT NULL AND
     NEW.status IN ('confirmed', 'pending', 'held') AND
     (NEW.payment_status IN ('succeeded', 'completed', 'paid') OR NEW.status = 'held' OR TG_OP = 'INSERT') THEN

    -- Calculate service duration
    requested_duration_hours := CEIL((NEW.price_total / 100.0) / 25.0);

    -- Use unified availability check
    SELECT * INTO v_check
    FROM check_unified_carwash_availability(
      DATE(NEW.appointment_date),
      NEW.appointment_time,
      requested_duration_hours,
      NEW.id
    );

    IF NOT v_check.is_available THEN
      RAISE EXCEPTION '%', v_check.conflict_message;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Enable realtime replication for bookings table
ALTER PUBLICATION supabase_realtime ADD TABLE bookings;

-- 10. Create useful views for quick availability checks
CREATE OR REPLACE VIEW public.available_vehicle_slots AS
SELECT DISTINCT
  vehicle_name,
  DATE(pickup_date) as date,
  COUNT(*) as bookings_count
FROM public.bookings
WHERE service_type IS DISTINCT FROM 'car_wash'
  AND status IN ('confirmed', 'pending', 'held')
  AND (payment_status IN ('succeeded', 'completed', 'paid') OR status = 'held')
  AND pickup_date >= NOW()
GROUP BY vehicle_name, DATE(pickup_date);

CREATE OR REPLACE VIEW public.available_carwash_slots AS
SELECT
  DATE(appointment_date) as date,
  appointment_time,
  COUNT(*) as bookings_count,
  STRING_AGG(service_name, ', ') as services
FROM public.bookings
WHERE service_type = 'car_wash'
  AND status IN ('confirmed', 'pending', 'held')
  AND (payment_status IN ('succeeded', 'completed', 'paid') OR status = 'held')
  AND appointment_date >= NOW()
GROUP BY DATE(appointment_date), appointment_time;

-- 11. Create helper function to create a hold/pre-booking
CREATE OR REPLACE FUNCTION create_booking_hold(
  p_booking_data jsonb,
  p_hold_duration_minutes integer DEFAULT 15,
  p_held_by text DEFAULT 'system'
)
RETURNS uuid AS $$
DECLARE
  v_booking_id uuid;
BEGIN
  INSERT INTO public.bookings (
    user_id,
    service_type,
    vehicle_name,
    pickup_date,
    dropoff_date,
    appointment_date,
    appointment_time,
    price_total,
    currency,
    status,
    hold_expires_at,
    held_by,
    booking_source
  )
  VALUES (
    (p_booking_data->>'user_id')::uuid,
    p_booking_data->>'service_type',
    p_booking_data->>'vehicle_name',
    (p_booking_data->>'pickup_date')::timestamp with time zone,
    (p_booking_data->>'dropoff_date')::timestamp with time zone,
    (p_booking_data->>'appointment_date')::timestamp with time zone,
    p_booking_data->>'appointment_time',
    (p_booking_data->>'price_total')::numeric,
    COALESCE(p_booking_data->>'currency', 'EUR'),
    'held',
    NOW() + (p_hold_duration_minutes || ' minutes')::interval,
    p_held_by,
    COALESCE(p_booking_data->>'booking_source', 'website')
  )
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bookings_held_status ON bookings(status, hold_expires_at) WHERE status = 'held';
CREATE INDEX IF NOT EXISTS idx_bookings_source ON bookings(booking_source);
CREATE INDEX IF NOT EXISTS idx_bookings_vehicle_rental ON bookings(vehicle_name, pickup_date, dropoff_date, status) WHERE service_type IS DISTINCT FROM 'car_wash';
CREATE INDEX IF NOT EXISTS idx_bookings_carwash ON bookings(appointment_date, appointment_time, status) WHERE service_type = 'car_wash';

-- 13. Add comments
COMMENT ON COLUMN bookings.hold_expires_at IS 'Timestamp when the hold/pre-booking expires. Automatically released by cron job.';
COMMENT ON COLUMN bookings.held_by IS 'Identifier of who created the hold (user ID, admin name, or system)';
COMMENT ON COLUMN bookings.booking_source IS 'Source of the booking: website (dr7.app), admin (admin.dr7.com), or api';
COMMENT ON FUNCTION release_expired_holds() IS 'Automatically releases expired holds. Runs every minute via cron.';
COMMENT ON FUNCTION check_unified_vehicle_availability IS 'Checks if a vehicle is available across website and admin bookings';
COMMENT ON FUNCTION check_unified_carwash_availability IS 'Checks if a car wash slot is available across website and admin bookings';
COMMENT ON FUNCTION create_booking_hold IS 'Creates a temporary hold on a slot. Auto-expires after specified minutes.';

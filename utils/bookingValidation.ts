import { supabase } from '../supabaseClient';

// Hydrated dal Centralina Pro al module load. L'operatore li modifica
// in admin > Centralina Pro > Automazioni; effettivo dopo refresh pagina.
//   - RENTAL_BUFFER (90): pausa post-noleggio sullo stesso veicolo
//   - LATE_RETURN_GRACE (90): cushion prima del pickup time, oltre cui
//     scatta +1 giorno di addebito (CarBookingWizard billing logic)
let RENTAL_BUFFER_MINUTES = 90;
let RENTAL_BUFFER_MS = RENTAL_BUFFER_MINUTES * 60 * 1000;
let LATE_RETURN_GRACE_MINUTES = 90;

const CARICAMENTO_AUTOMAZIONI: Promise<void> = (async () => {
  try {
    const { data } = await supabase
      .from('centralina_pro_config')
      .select('config')
      .eq('id', 'main')
      .maybeSingle();
    const cfg = (data?.config ?? null) as Record<string, unknown> | null;
    const automations = cfg?.automations as Record<string, unknown> | undefined;
    if (automations) {
      const a = automations.rental_buffer_minutes;
      if (typeof a === 'number' && a >= 0 && a <= 720) {
        RENTAL_BUFFER_MINUTES = a;
        RENTAL_BUFFER_MS = a * 60 * 1000;
      }
      const b = automations.late_return_grace_minutes;
      if (typeof b === 'number' && b >= 0 && b <= 720) {
        LATE_RETURN_GRACE_MINUTES = b;
      }
    }
  } catch {
    // Keep defaults
  }
})();

/** Read-only getter so other modules (e.g. CarBookingWizard) can read the
 * latest hydrated grace minutes without importing supabase themselves. */
export function getLateReturnGraceMinutes(): number { return LATE_RETURN_GRACE_MINUTES; }

/**
 * Si risolve quando le automazioni sono state lette (o la lettura e'
 * fallita e restano i valori di fabbrica). Non rifiuta mai.
 *
 * Serve a chi mostra un CONTEGGIO GIORNI o un PREZZO prima che l'utente
 * interagisca: in produzione la grace e' 30 minuti, non i 90 di fabbrica,
 * e la differenza vale un giorno di noleggio. Chi ricalcola a ogni click
 * (il wizard) non ne ha bisogno.
 */
export function automazioniPronte(): Promise<void> {
  return CARICAMENTO_AUTOMAZIONI;
}

export interface BookingConflict {
  pickup_date: string;
  dropoff_date: string;
  vehicle_name: string;
}

export interface VehicleUnavailabilityInfo {
  isPartiallyUnavailable: boolean;
  unavailableFrom?: string;
  unavailableUntil?: string;
  unavailableFromTime?: string;
  unavailableUntilTime?: string;
  reason?: string;
  availableAfter?: string;
}

/**
 * Helper to safely parse dates for all browsers (especially Safari)
 * Replaces space with T in ISO-like strings: "2023-01-01 10:00:00" -> "2023-01-01T10:00:00"
 */
export function safeDate(dateStr: string | Date): Date {
  if (dateStr instanceof Date) return dateStr;
  if (!dateStr) return new Date();

  // If it's a string like "YYYY-MM-DD HH:mm:ss", replace space with T
  if (typeof dateStr === 'string' && dateStr.includes(' ')) {
    return new Date(dateStr.replace(' ', 'T'));
  }

  return new Date(dateStr);
}

/**
 * Check if any vehicle in a group is available for the requested dates
 * @param vehicles - Array of vehicle objects { name: string, id: string } to check
 * @param pickupDate - Requested pickup date (ISO string)
 * @param dropoffDate - Requested dropoff date (ISO string)
 * @returns Object with availability info and first available vehicle name/id
 */
export async function checkGroupedVehicleAvailability(
  vehicles: Array<{ name: string; id: string; plate?: string }>,
  pickupDate: string,
  dropoffDate: string
): Promise<{ isAvailable: boolean; availableVehicleName?: string; availableVehicleId?: string; conflicts?: BookingConflict[]; closestAvailableDate?: Date }> {
  try {
    const requestedPickup = safeDate(pickupDate);
    const requestedDropoff = safeDate(dropoffDate);
    const BUFFER_TIME_MS = RENTAL_BUFFER_MS;

    // Helper to check conflict
    const hasConflict = (existingStart: Date, existingEnd: Date) => {
      const existingEndWithBuffer = new Date(existingEnd.getTime() + BUFFER_TIME_MS);
      return (
        (requestedPickup >= existingStart && requestedPickup < existingEndWithBuffer) ||
        (requestedDropoff > existingStart && requestedDropoff <= existingEndWithBuffer) ||
        (requestedPickup <= existingStart && requestedDropoff >= existingEndWithBuffer)
      );
    };

    // 1. Fetch ALL bookings for this vehicle name (group name)
    // We assume all vehicles in the group share the same "vehicle_name" in bookings if booked generally
    // Or they might have specific names. But 'vehicles' input usually share a display name or we check individually?
    // Actually, usually they share the main name. Let's assume we check for the *name of the first vehicle* essentially?
    // Or we should query for ANY of the names in the group.

    const ids = vehicles.map(v => v.id);
    const plates = vehicles.map(v => v.plate).filter(Boolean) as string[];

    // Fetch bookings by vehicle_id (primary match)
    const { data: bookingsByIds } = await supabase
      .from('bookings')
      .select('pickup_date, dropoff_date, vehicle_id, vehicle_plate, vehicle_name, booking_details')
      .in('vehicle_id', ids)
      .not('status', 'in', '(cancelled,annullata,completed,completata,expired)');

    // Also fetch bookings by plate (targa) to catch bookings where vehicle_id might be wrong/missing
    let bookingsByPlate: any[] = [];
    if (plates.length > 0) {
      const { data: plateBookings } = await supabase
        .from('bookings')
        .select('pickup_date, dropoff_date, vehicle_id, vehicle_plate, vehicle_name, booking_details')
        .in('vehicle_plate', plates)
        .not('status', 'in', '(cancelled,annullata,completed,completata,expired)');
      bookingsByPlate = plateBookings || [];
    }

    // Merge and deduplicate bookings (some may match both by id AND plate)
    const seenBookingKeys = new Set<string>();
    const bookings: any[] = [];
    for (const b of [...(bookingsByIds || []), ...bookingsByPlate]) {
      const key = `${b.pickup_date}_${b.dropoff_date}_${b.vehicle_id || b.vehicle_plate}`;
      if (!seenBookingKeys.has(key)) {
        seenBookingKeys.add(key);
        bookings.push(b);
      }
    }

    // Fetch reservations for these IDs
    const { data: reservations } = await supabase
      .from('reservations')
      .select('start_at, end_at, vehicle_id, vehicle_name')
      .in('vehicle_id', ids)
      .not('status', 'in', '(cancelled,annullata,completed,completata,expired)');

    // 2. Identify Unavailable Vehicles (Specific ID conflicts)
    const blockedVehicleIds = new Set<string>();
    let genericConflictCount = 0;
    const relevantConflicts: BookingConflict[] = [];

    // Build plate-to-id lookup for resolving bookings matched by plate
    const plateToId = new Map<string, string>();
    for (const v of vehicles) {
      if (v.plate) plateToId.set(v.plate.toLowerCase().trim(), v.id);
    }

    // Process booking conflicts — match by vehicle_id first, then by plate (targa)
    if (bookings) {
      for (const b of bookings) {
        const p = safeDate(b.pickup_date);
        const d = safeDate(b.dropoff_date);
        if (hasConflict(p, d)) {
          // Resolve which vehicle this booking belongs to: vehicle_id > plate > booking_details
          let bookedId = b.vehicle_id;
          if (!bookedId || !ids.includes(bookedId)) {
            // Try matching by plate (targa)
            const bookingPlate = (b.vehicle_plate || (b.booking_details as any)?.vehicle?.plate || '').toLowerCase().trim();
            if (bookingPlate && plateToId.has(bookingPlate)) {
              bookedId = plateToId.get(bookingPlate)!;
            }
          }
          if (!bookedId || !ids.includes(bookedId)) {
            // Last resort: booking_details.vehicle_id
            bookedId = (b.booking_details as any)?.vehicle_id;
          }

          if (bookedId && ids.includes(bookedId)) {
            blockedVehicleIds.add(bookedId);
          } else {
            genericConflictCount++;
          }
          relevantConflicts.push({ pickup_date: b.pickup_date, dropoff_date: b.dropoff_date, vehicle_name: b.vehicle_name });
        }
      }
    }

    if (reservations) {
      for (const r of reservations) {
        const s = safeDate(r.start_at);
        const e = safeDate(r.end_at);
        if (hasConflict(s, e)) {
          if (r.vehicle_id && ids.includes(r.vehicle_id)) {
            blockedVehicleIds.add(r.vehicle_id);
          } else {
            // Should generally not happen for admin reservations, but treat as generic if ID missing
            genericConflictCount++;
          }
          relevantConflicts.push({ pickup_date: r.start_at, dropoff_date: r.end_at, vehicle_name: r.vehicle_name || 'Reservation' });
        }
      }
    }

    // 3. Filter Candidates
    const candidates = vehicles.filter(v => !blockedVehicleIds.has(v.id));

    // 4. Apply Generic Conflicts (pool reduction)
    // We have 'genericConflictCount' bookings that take up *some* slot but we don't know which.
    // So we subtract them from the remaining candidates.
    const availableCount = candidates.length - genericConflictCount;

    if (availableCount > 0) {
      // We have at least one car left!
      // Return the first candidate that effectively "survives" the subtraction
      // (Any of the candidates is valid, as the generic bookings don't care which one they take)
      const winner = candidates[0];
      return {
        isAvailable: true,
        availableVehicleName: winner.name,
        availableVehicleId: winner.id
      };
    }

    // Not available
    // For close-date suggestion, we can just use the end of the last conflict found
    // (Simplified logic)
    let closestAvailableDate: Date | undefined;
    if (relevantConflicts.length > 0) {
      // Sort by end date descending to find the latest blocker? 
      // No, we want the earliest hole. That's complex. 
      // Just return end of the first conflict + buffer for now as a naive suggestion
      const lastConflict = relevantConflicts.sort((a, b) => new Date(a.dropoff_date).getTime() - new Date(b.dropoff_date).getTime())[0];
      closestAvailableDate = new Date(safeDate(lastConflict.dropoff_date).getTime() + RENTAL_BUFFER_MS);
    }

    return {
      isAvailable: false,
      conflicts: relevantConflicts,
      closestAvailableDate
    };

  } catch (error) {
    console.error('Error checking grouped vehicle availability:', error);
    throw error;
  }
}

/**
 * Check if a vehicle is available for the requested dates
 * Also enforces 1h30 buffer between bookings
 * @param vehicleName - Name of the vehicle to check
 * @param pickupDate - Requested pickup date (ISO string)
 * @param dropoffDate - Requested dropoff date (ISO string)
 * @param targetVehicleId - Optional specific vehicle ID to check against (if stored in booking_details)
 * @returns Array of conflicting bookings, empty if no conflicts
 */
export async function checkVehicleAvailability(
  vehicleName: string,
  pickupDate: string,
  dropoffDate: string,
  targetVehicleId?: string
): Promise<BookingConflict[]> {
  try {
    // Call Netlify Function instead of direct Supabase
    const response = await fetch('/.netlify/functions/checkVehicleAvailability', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vehicleName,
        pickupDate,
        dropoffDate,
        targetVehicleId,
      }),
    });

    if (!response.ok) {
      console.error('Availability check failed:', {
        status: response.status,
        statusText: response.statusText,
      });
      // 2026-05-17 BUG FIX: failed-open era pericoloso — la function
      // poteva tornare 500/timeout e il cliente prenotava una macchina
      // gia' occupata. Failed-closed: ritorniamo un "conflict sentinel"
      // cosi' il wizard mostra errore di disponibilita' e il booking
      // viene bloccato finche' la verifica non riesce davvero.
      const sentinel = [{
        id: 'SENTINEL_CHECK_FAILED',
        vehicle_id: null,
        vehicle_name: vehicleName,
        plate: null,
        pickup_date: pickupDate,
        dropoff_date: dropoffDate,
        status: 'unknown',
        _availableFrom: null,
        _checkFailed: true,
        _checkError: `availability check returned ${response.status}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any];
      return sentinel;
    }

    const data = await response.json();
    const conflicts: any[] = data.conflicts || [];
    // Attach metadata to the array for the wizard to read
    if (data.availableFrom && conflicts.length > 0) {
      conflicts[0]._availableFrom = data.availableFrom;
    }
    // nextBookingStart = when the car must be returned (next booking - buffer)
    (conflicts as any)._nextBookingStart = data.nextBookingStart || null;
    return conflicts;
  } catch (error) {
    console.error('Error in checkVehicleAvailability:', error);
    // 2026-05-17 BUG FIX: stesso failed-closed del ramo response.ok (vedi
    // commento sopra). Errori di rete / parsing JSON / function down
    // bloccavano la verifica ma non il booking — risultato: prenotazioni
    // doppie sulle stesse date.
    const sentinel = [{
      id: 'SENTINEL_CHECK_FAILED',
      vehicle_id: null,
      vehicle_name: vehicleName,
      plate: null,
      pickup_date: pickupDate,
      dropoff_date: dropoffDate,
      status: 'unknown',
      _availableFrom: null,
      _checkFailed: true,
      _checkError: error instanceof Error ? error.message : 'unknown error',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any];
    return sentinel;
  }
}

/**
 * Get all unavailable date ranges for a vehicle
 * @param vehicleName - Name of the vehicle
 * @returns Array of date ranges that are blocked
 */
export async function getUnavailableDateRanges(vehicleName: string): Promise<Array<{ start: Date; end: Date }>> {
  try {
    // Get bookings from main website + admin panel
    // Admin bookings should ALWAYS block slots regardless of payment/status
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('pickup_date, dropoff_date')
      .eq('vehicle_name', vehicleName)
      .not('status', 'in', '(cancelled,annullata,completed,completata,expired)')
      .order('pickup_date', { ascending: true });

    if (error) {
      console.error('Error fetching unavailable dates:', error);
      throw error;
    }

    // Get reservations from admin panel
    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('id')
      .eq('display_name', vehicleName)
      .single();

    let reservations = [];
    if (vehicle) {
      const { data: reservationData, error: reservationError } = await supabase
        .from('reservations')
        .select('start_at, end_at')
        .eq('vehicle_id', vehicle.id)
        .in('status', ['confirmed', 'pending', 'active'])
        .order('start_at', { ascending: true });

      if (!reservationError && reservationData) {
        reservations = reservationData;
      }
    }

    // Combine both bookings and reservations
    const unavailableDates: Array<{ start: Date; end: Date }> = [];

    // Add bookings
    if (bookings && bookings.length > 0) {
      bookings.forEach((booking) => {
        unavailableDates.push({
          start: safeDate(booking.pickup_date),
          end: safeDate(booking.dropoff_date),
        });
      });
    }

    // Add reservations
    if (reservations.length > 0) {
      reservations.forEach((reservation) => {
        unavailableDates.push({
          start: safeDate(reservation.start_at),
          end: safeDate(reservation.end_at),
        });
      });
    }

    return unavailableDates;
  } catch (error) {
    console.error('Error in getUnavailableDateRanges:', error);
    throw error;
  }
}

/**
 * Check if a vehicle has partial-day unavailability (e.g., at mechanic for a few hours)
 * @param vehicleName - Name of the vehicle
 * @param requestedDate - Date to check (YYYY-MM-DD format)
 * @param requestedPickupTime - Optional pickup time to check (HH:MM format)
 * @returns Unavailability info if vehicle is partially unavailable
 */
export async function checkVehiclePartialUnavailability(
  vehicleName: string,
  requestedDate: string,
  requestedPickupTime?: string
): Promise<VehicleUnavailabilityInfo> {
  try {
    // Get vehicle data with metadata
    const { data: vehicle, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('display_name', vehicleName)
      .single();

    if (error || !vehicle) {
      return { isPartiallyUnavailable: false };
    }

    // Check if vehicle is marked as unavailable
    if (vehicle.status !== 'unavailable') {
      return { isPartiallyUnavailable: false };
    }

    const metadata = vehicle.metadata as any;
    const unavailableFrom = metadata?.unavailable_from;
    const unavailableUntil = metadata?.unavailable_until;
    const unavailableFromTime = metadata?.unavailable_from_time;
    const unavailableUntilTime = metadata?.unavailable_until_time;
    const reason = metadata?.unavailable_reason;

    // If no date range specified, vehicle is fully unavailable
    if (!unavailableFrom || !unavailableUntil) {
      return { isPartiallyUnavailable: false };
    }

    // Check if requested date falls within unavailability range
    const requested = safeDate(requestedDate);
    const fromDate = safeDate(unavailableFrom);
    const untilDate = safeDate(unavailableUntil);

    // Normalize dates to midnight for comparison
    requested.setHours(0, 0, 0, 0);
    fromDate.setHours(0, 0, 0, 0);
    untilDate.setHours(0, 0, 0, 0);

    const isInRange = requested >= fromDate && requested <= untilDate;

    if (!isInRange) {
      return { isPartiallyUnavailable: false };
    }

    // If times are specified, it's partial-day unavailability
    // Check that times are valid strings with content
    const hasValidTimes = unavailableFromTime &&
      unavailableUntilTime &&
      typeof unavailableFromTime === 'string' &&
      typeof unavailableUntilTime === 'string' &&
      unavailableFromTime.trim() !== '' &&
      unavailableUntilTime.trim() !== '';

    if (hasValidTimes) {
      // Aggiunge il buffer post-noleggio (Centralina Pro > Automazioni).
      const unavailableEndMinutes = timeToMinutes(unavailableUntilTime);
      const availableAfterMinutes = unavailableEndMinutes + RENTAL_BUFFER_MINUTES;

      // Convert back to HH:MM format
      const hours = Math.floor(availableAfterMinutes / 60);
      const minutes = availableAfterMinutes % 60;
      const availableAfterTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

      // If pickup time is provided, check if it conflicts with unavailability + buffer
      if (requestedPickupTime && typeof requestedPickupTime === 'string') {
        const pickupMinutes = timeToMinutes(requestedPickupTime);

        // If pickup time is before the vehicle becomes available (including buffer), show warning
        // Use strict < to allow booking at exactly the available time
        if (pickupMinutes < availableAfterMinutes) {
          return {
            isPartiallyUnavailable: true,
            unavailableFrom,
            unavailableUntil,
            unavailableFromTime,
            unavailableUntilTime,
            reason,
            availableAfter: availableAfterTime
          };
        }
        // Pickup time is at or after vehicle becomes available (with buffer) - no warning needed
        return { isPartiallyUnavailable: false };
      }

      // No pickup time provided - just indicate partial unavailability with buffer
      return {
        isPartiallyUnavailable: true,
        unavailableFrom,
        unavailableUntil,
        unavailableFromTime,
        unavailableUntilTime,
        reason,
        availableAfter: availableAfterTime
      };
    }

    // Full-day unavailability (no times specified)
    return { isPartiallyUnavailable: false };
  } catch (error) {
    console.error('Error checking vehicle partial unavailability:', error);
    return { isPartiallyUnavailable: false };
  }
}

/**
 * Calculate the number of days between two dates (inclusive)
 * @param startDate - Start date
 * @param endDate - End date
 * @returns Number of days
 */
export function calculateDays(startDate: Date, endDate: Date): number {
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Helper to get service duration in hours based on price
 * Each 25€ = 1 hour (€25=1h, €49=2h, €75=3h, €99=4h)
 * @param priceInEuros - Service price in euros
 * @returns Duration in hours
 */
function getServiceDurationInHours(priceInEuros: number): number {
  return Math.ceil(priceInEuros / 25);
}

/**
 * Convert time string (HH:MM) to minutes since midnight
 * @param time - Time string in HH:MM format
 * @returns Minutes since midnight
 */
function timeToMinutes(time: string): number {
  if (!time || typeof time !== 'string') {
    console.error('Invalid time format:', time);
    return 0;
  }

  const parts = time.split(':');
  if (parts.length !== 2) {
    console.error('Invalid time format (expected HH:MM):', time);
    return 0;
  }

  const [h, m] = parts.map(Number);
  if (isNaN(h) || isNaN(m)) {
    console.error('Invalid time values:', time);
    return 0;
  }

  return h * 60 + m;
}

/**
 * Check if a car wash time slot is available
 * @param appointmentDate - Date of appointment (YYYY-MM-DD format)
 * @param appointmentTime - Time of appointment (HH:MM format)
 * @param servicePriceInEuros - Price of the service in euros
 * @param excludeBookingId - Optional booking ID to exclude from check (for edits)
 * @returns Object with isAvailable flag and conflict info
 */
export async function checkCarWashAvailability(
  appointmentDate: string,
  appointmentTime: string,
  servicePriceInEuros: number,
  excludeBookingId?: string
): Promise<{ isAvailable: boolean; conflictingBooking?: any; message?: string }> {
  try {
    // Get the duration for the requested service
    const requestedDuration = getServiceDurationInHours(servicePriceInEuros);
    const requestedStartMinutes = timeToMinutes(appointmentTime);
    const requestedEndMinutes = requestedStartMinutes + (requestedDuration * 60);

    // Query all car wash bookings for the same date
    // Admin bookings should ALWAYS block slots regardless of payment/status
    let query = supabase
      .from('bookings')
      .select('*')
      .eq('service_type', 'car_wash')
      .neq('status', 'cancelled'); // Only exclude cancelled bookings

    // Filter by date (appointment_date contains full timestamp, so we need to filter by date part)
    const { data: allBookings, error } = await query;

    if (error) {
      console.error('Error checking car wash availability:', error);
      throw error;
    }

    // Filter by date in code since appointment_date comparison needs special handling
    const bookingsOnDate = (allBookings || []).filter(booking => {
      // Exclude the booking being edited
      if (excludeBookingId && booking.id === excludeBookingId) {
        return false;
      }

      if (!booking.appointment_date) return false;
      const bookingDate = safeDate(booking.appointment_date).toISOString().split('T')[0];
      return bookingDate === appointmentDate;
    });

    // Check for time conflicts
    for (const booking of bookingsOnDate) {
      if (!booking.appointment_time || !booking.price_total) continue;

      const bookingStartMinutes = timeToMinutes(booking.appointment_time);
      const bookingDuration = getServiceDurationInHours(booking.price_total / 100);
      const bookingEndMinutes = bookingStartMinutes + (bookingDuration * 60);

      // Check if there's any overlap
      const hasOverlap = (
        requestedStartMinutes < bookingEndMinutes &&
        requestedEndMinutes > bookingStartMinutes
      );

      if (hasOverlap) {
        const bookingDate = safeDate(booking.appointment_date);
        return {
          isAvailable: false,
          conflictingBooking: booking,
          message: `Questo orario non è disponibile. È già prenotato dalle ${booking.appointment_time} per ${bookingDuration} ora/e.`
        };
      }
    }

    return { isAvailable: true };
  } catch (error) {
    console.error('Error in checkCarWashAvailability:', error);
    throw error;
  }
}

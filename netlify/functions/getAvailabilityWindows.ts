import { Handler } from '@netlify/functions';
import { getCorsOrigin } from './utils/cors';
import { getRentalBufferMs } from './utils/loadAutomations';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Buffer post-noleggio: dinamico, letto da Centralina Pro > Automazioni.

interface TimeWindow {
    start: string; // ISO timestamp
    end: string;   // ISO timestamp
}

interface Interval {
    start: Date;
    end: Date;
}

// Helper: Merge overlapping intervals
function mergeIntervals(intervals: Interval[]): Interval[] {
    if (intervals.length === 0) return [];

    const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
    const merged: Interval[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
        const last = merged[merged.length - 1];
        const current = sorted[i];

        if (current.start <= last.end) {
            last.end = new Date(Math.max(last.end.getTime(), current.end.getTime()));
        } else {
            merged.push(current);
        }
    }

    return merged;
}

// Helper: Intersect two interval lists (when BOTH lists have a busy period)
function intersectIntervalLists(list1: Interval[], list2: Interval[]): Interval[] {
    const result: Interval[] = [];
    let i = 0, j = 0;

    while (i < list1.length && j < list2.length) {
        const start = new Date(Math.max(list1[i].start.getTime(), list2[j].start.getTime()));
        const end = new Date(Math.min(list1[i].end.getTime(), list2[j].end.getTime()));

        if (start < end) {
            result.push({ start, end });
        }

        // Move the pointer that ends first
        if (list1[i].end.getTime() < list2[j].end.getTime()) {
            i++;
        } else {
            j++;
        }
    }

    return result;
}

/**
 * Compute free availability windows (gaps) between bookings
 * For multiple vehicles (e.g., 3 Panda White), only shows unavailable when ALL are busy
 * Returns array of time windows where at least one vehicle can be booked
 */
export const handler: Handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': getCorsOrigin(event.headers['origin']),
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }

    try {
        const { vehicleIds, vehiclePlates, vehicleNames, startDate, endDate } = JSON.parse(event.body || '{}');

        if (!vehicleIds || vehicleIds.length === 0) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'vehicleIds is required' }),
            };
        }

        const BUFFER_TIME_MS = await getRentalBufferMs();

        const now = new Date();
        const horizonStart = startDate ? new Date(startDate) : now;
        const horizonEnd = endDate ? new Date(endDate) : new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

        // Fetch vehicle metadata for unavailability blocks
        const vehiclesMetaUrl = `${SUPABASE_URL}/rest/v1/vehicles?select=id,metadata,display_name&id=in.(${vehicleIds.join(',')})`;
        const vehiclesMetaResponse = await fetch(vehiclesMetaUrl, {
            headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY!,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
            },
        });
        const vehiclesMeta = await vehiclesMetaResponse.json();

        // Fetch bookings by vehicle_id
        const bookingsUrl = `${SUPABASE_URL}/rest/v1/bookings?select=pickup_date,dropoff_date,vehicle_id,vehicle_plate,service_type&vehicle_id=in.(${vehicleIds.join(',')})&vehicle_plate=not.in.(TEST000,TEST002)&status=not.in.(cancelled,annullata,completed,completata,expired)&dropoff_date=gte.${horizonStart.toISOString()}&pickup_date=lte.${horizonEnd.toISOString()}`;

        const bookingsResponse = await fetch(bookingsUrl, {
            headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY!,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        let bookings = await bookingsResponse.json();

        // 21/09/2026 (direzione): prenotazioni SENZA vehicle_id ne' targa.
        // Il calendario cercava solo per id e per targa, quindi una riga con
        // entrambi vuoti non compariva: il giorno restava bianco mentre il
        // wizard — che confronta anche il nome — lo rifiutava. Due schermate
        // che si contraddicono davanti al cliente.
        // Qui si recuperano SOLO le righe orfane (vehicle_id nullo) col nome
        // del mezzo: non si rischia di bloccare i gemelli di un gruppo, che
        // hanno il loro id.
        // I nomi arrivano dal chiamante (la scheda del mezzo) e, in piu', dalla
        // riga `vehicles`: cosi' si coprono sia le prenotazioni orfane sia il
        // caso in cui l'id mandato non sia quello della flotta.
        const nomiMezzi = Array.from(new Set([
            ...(Array.isArray(vehicleNames) ? vehicleNames : []),
            ...(Array.isArray(vehiclesMeta) ? vehiclesMeta : []).map((v: any) => v?.display_name),
        ].filter((n: any) => typeof n === 'string' && n.trim() !== '')));
        if (nomiMezzi.length > 0) {
            try {
                const perNome = nomiMezzi.map((n: string) => `"${n.replace(/"/g, '')}"`).join(',');
                // Tutte le prenotazioni di quel NOME, non solo le orfane: se
                // l'id mandato non e' quello della flotta, per id non torna
                // niente e il calendario resterebbe bianco.
                const orfaneUrl = `${SUPABASE_URL}/rest/v1/bookings?select=pickup_date,dropoff_date,vehicle_id,vehicle_plate,vehicle_name,service_type&vehicle_name=in.(${encodeURIComponent(perNome)})&status=not.in.(cancelled,annullata,completed,completata,expired)&dropoff_date=gte.${horizonStart.toISOString()}&pickup_date=lte.${horizonEnd.toISOString()}`;
                const orfaneRes = await fetch(orfaneUrl, {
                    headers: {
                        'apikey': SUPABASE_SERVICE_ROLE_KEY!,
                        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                        'Content-Type': 'application/json',
                    },
                });
                if (orfaneRes.ok) {
                    const orfane = await orfaneRes.json();
                    if (Array.isArray(orfane) && orfane.length > 0) {
                        const perId = new Map<string, string>();
                        for (const v of (Array.isArray(vehiclesMeta) ? vehiclesMeta : [])) {
                            if (v?.display_name && v?.id) perId.set(String(v.display_name), String(v.id));
                        }
                        // Si attribuiscono al mezzo che porta quel nome, cosi'
                        // entrano nel calcolo delle finestre come le altre.
                        const idPrincipale = (Array.isArray(vehicleIds) && vehicleIds[0]) ? String(vehicleIds[0]) : '';
                        const gia = new Set((bookings || []).map((b: any) => `${b.pickup_date}_${b.dropoff_date}`));
                        const adottate = orfane
                            .filter((b: any) => !gia.has(`${b.pickup_date}_${b.dropoff_date}`))
                            .map((b: any) => ({ ...b, vehicle_id: perId.get(String(b.vehicle_name)) || idPrincipale }))
                            .filter((b: any) => !!b.vehicle_id);
                        if (adottate.length > 0) {
                            console.log(`[getAvailabilityWindows] ${adottate.length} prenotazioni recuperate dal nome del mezzo`);
                            bookings = [...(bookings || []), ...adottate];
                        }
                    }
                }
            } catch (err) {
                console.warn('[getAvailabilityWindows] recupero prenotazioni orfane non riuscito:', err);
            }
        }

        // Also fetch bookings by plate (targa) to catch mismatched vehicle_id
        const plates = vehiclePlates || [];
        if (plates.length > 0) {
            const realPlates = plates.filter((p: string) => p !== 'TEST000' && p !== 'TEST002');
            const plateBookingsUrl = `${SUPABASE_URL}/rest/v1/bookings?select=pickup_date,dropoff_date,vehicle_id,vehicle_plate,service_type&vehicle_plate=in.(${realPlates.join(',')})&status=not.in.(cancelled,annullata,completed,completata,expired)&dropoff_date=gte.${horizonStart.toISOString()}&pickup_date=lte.${horizonEnd.toISOString()}`;
            const plateResponse = await fetch(plateBookingsUrl, {
                headers: {
                    'apikey': SUPABASE_SERVICE_ROLE_KEY!,
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'Content-Type': 'application/json',
                },
            });
            const plateBookings = await plateResponse.json();
            if (Array.isArray(plateBookings)) {
                const seenKeys = new Set((bookings || []).map((b: any) => `${b.pickup_date}_${b.dropoff_date}_${b.vehicle_id}`));
                for (const pb of plateBookings) {
                    const key = `${pb.pickup_date}_${pb.dropoff_date}_${pb.vehicle_id}`;
                    if (!seenKeys.has(key)) {
                        bookings.push(pb);
                        seenKeys.add(key);
                    }
                }
            }
        }

        // Fetch reservations
        const reservationsUrl = `${SUPABASE_URL}/rest/v1/reservations?select=start_at,end_at,vehicle_id,status&vehicle_id=in.(${vehicleIds.join(',')})&status=not.in.(cancelled,annullata,completed,completata,expired)&end_at=gte.${horizonStart.toISOString()}&start_at=lte.${horizonEnd.toISOString()}`;

        const reservationsResponse = await fetch(reservationsUrl, {
            headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY!,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        const reservations = await reservationsResponse.json();

        // Debug logging
        console.log('Availability Windows Debug:', {
            vehicleIds,
            bookingsCount: bookings?.length || 0,
            reservationsCount: reservations?.length || 0,
        });

        // Step 1: Build busy intervals PER VEHICLE
        const busyByVehicle: Map<string, Interval[]> = new Map();

        // Initialize all vehicles with empty intervals
        for (const vehicleId of vehicleIds) {
            busyByVehicle.set(vehicleId, []);
        }

        // Add maintenance/unavailability blocks from vehicle metadata
        if (vehiclesMeta && Array.isArray(vehiclesMeta)) {
            for (const vehicle of vehiclesMeta) {
                if (!vehicle.metadata) continue;
                const { unavailable_from, unavailable_until, unavailable_from_time, unavailable_until_time } = vehicle.metadata;
                if (!unavailable_from) continue;
                const fromTime = unavailable_from_time || '00:00';
                const untilTime = unavailable_until_time || '23:59';
                const blockStart = new Date(`${unavailable_from}T${fromTime}:00`);
                const blockEnd = unavailable_until
                    ? new Date(`${unavailable_until}T${untilTime}:00`)
                    : new Date('2099-12-31T23:59:00');
                const vehicleBusy = busyByVehicle.get(vehicle.id) || [];
                vehicleBusy.push({ start: blockStart, end: blockEnd });
                busyByVehicle.set(vehicle.id, vehicleBusy);
            }
        }

        // Add bookings to respective vehicles
        if (bookings && Array.isArray(bookings)) {
            bookings.forEach((b: any) => {
                // Skip car wash bookings
                if (b.service_type === 'car_wash') return;
                if (!b.vehicle_id) return;

                const vehicleBusy = busyByVehicle.get(b.vehicle_id) || [];
                vehicleBusy.push({
                    start: new Date(b.pickup_date),
                    end: new Date(new Date(b.dropoff_date).getTime() + BUFFER_TIME_MS)
                });
                busyByVehicle.set(b.vehicle_id, vehicleBusy);
            });
        }

        // Add reservations to respective vehicles
        if (reservations && Array.isArray(reservations)) {
            reservations.forEach((r: any) => {
                if (!r.vehicle_id) return;

                const vehicleBusy = busyByVehicle.get(r.vehicle_id) || [];
                vehicleBusy.push({
                    start: new Date(r.start_at),
                    end: new Date(new Date(r.end_at).getTime() + BUFFER_TIME_MS)
                });
                busyByVehicle.set(r.vehicle_id, vehicleBusy);
            });
        }

        // Step 2: Merge intervals for each vehicle
        for (const [vehicleId, intervals] of busyByVehicle.entries()) {
            busyByVehicle.set(vehicleId, mergeIntervals(intervals));
        }

        // Step 3: Find when ALL vehicles are busy (intersection)
        // The group is only unavailable when ALL vehicles are simultaneously busy
        let allBusyIntervals: Interval[] = [];

        const vehicleIntervalsList = Array.from(busyByVehicle.values());

        if (vehicleIntervalsList.length === 0) {
            // No vehicles - nothing busy
            allBusyIntervals = [];
        } else if (vehicleIntervalsList.length === 1) {
            // Single vehicle - its busy times are the group's busy times
            allBusyIntervals = vehicleIntervalsList[0];
        } else {
            // Multiple vehicles - find intersection (when ALL are busy)
            // Start with the first vehicle's busy times
            allBusyIntervals = vehicleIntervalsList[0];

            // Intersect with each subsequent vehicle's busy times
            for (let i = 1; i < vehicleIntervalsList.length; i++) {
                allBusyIntervals = intersectIntervalLists(allBusyIntervals, vehicleIntervalsList[i]);
            }
        }

        // Step 4: Compute free windows (complement of allBusyIntervals)
        const freeWindows: TimeWindow[] = [];
        const searchStart = new Date(Math.max(now.getTime(), horizonStart.getTime()));

        if (allBusyIntervals.length === 0) {
            // No time when ALL vehicles are busy - entire horizon is free
            freeWindows.push({
                start: searchStart.toISOString(),
                end: horizonEnd.toISOString()
            });
        } else {
            // Check availability before first all-busy period
            if (searchStart < allBusyIntervals[0].start) {
                freeWindows.push({
                    start: searchStart.toISOString(),
                    end: allBusyIntervals[0].start.toISOString()
                });
            }

            // Windows between all-busy periods
            for (let i = 0; i < allBusyIntervals.length - 1; i++) {
                const gapStart = allBusyIntervals[i].end;
                const gapEnd = allBusyIntervals[i + 1].start;

                if (gapEnd.getTime() - gapStart.getTime() > 60 * 60 * 1000) {
                    freeWindows.push({
                        start: gapStart.toISOString(),
                        end: gapEnd.toISOString()
                    });
                }
            }

            // Window after last all-busy period
            const lastEnd = allBusyIntervals[allBusyIntervals.length - 1].end;
            if (lastEnd < horizonEnd) {
                freeWindows.push({
                    start: lastEnd.toISOString(),
                    end: horizonEnd.toISOString()
                });
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                freeWindows,
                busyIntervals: allBusyIntervals.map(b => ({
                    start: b.start.toISOString(),
                    end: b.end.toISOString()
                })),
                totalVehicles: vehicleIds.length,
                totalFreeWindows: freeWindows.length
            }),
        };

    } catch (error) {
        console.error('Error computing availability windows:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Failed to compute availability windows',
                details: error instanceof Error ? error.message : String(error)
            }),
        };
    }
};

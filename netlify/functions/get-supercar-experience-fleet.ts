/**
 * GET /api/get-supercar-experience-fleet
 *   ?category=<id categoria di Centralina Pro>
 *   &start=ISO timestamp
 *   &end=ISO timestamp
 *
 * Returns the vehicles of ONE fleet category with per-vehicle
 * availability for the [start, end] window. Drives the website's
 * "Vivi l'attesa in grande stile" vehicle picker on CarWashBookingPage.
 *
 * Category: the website resolves which Centralina Pro category matches
 * the chosen card (utils/esperienzaFlotta.ts, by LABEL) and passes its
 * id here. Only that id (plus historic aliases, supercars<->exotic) is
 * read: until 04/11/2026 this used `category ILIKE %supercar%`, which also
 * pulled `supercar_elit` (= "Ducato Maxi": Ducato, Vito).
 *
 * Availability:
 *   A vehicle is BUSY if any non-cancelled bookings row references it
 *   (vehicle_id OR vehicle_plate match) and overlaps the requested
 *   window. We exclude cancelled/annullata/completed/expired statuses.
 *   Like every rental check, the buffer is added only AFTER an existing
 *   booking (the car must be prepared before the next customer).
 *   Vehicles whose status is not usable (same rule as the rental site,
 *   utils/esperienzaFlotta.ts veicoloUtilizzabile) are left out.
 *
 * 23/11/2026 (stessa regola del gestionale, utils/autoCortesia.ts):
 *   per ogni auto anche DA CHE ORA e' libera (`libera_da`) e PER QUANTE ORE
 *   (`ore_max`), a partire dall'ora del lavaggio (`start`). Occupazioni lette
 *   come il Calendario Noleggio (aggancio per id anche dentro
 *   booking_details, poi targa; completate comprese; Pay by Link scaduti
 *   esclusi). Uscita solo negli orari di ritiro e rientro entro l'ultimo
 *   orario di riconsegna del giorno (Centralina Pro > Orari Noleggio).
 *   `available` = l'auto copre le ore richieste (end - start) partendo da
 *   `libera_da`, che puo' essere piu' tardi dell'ora del lavaggio.
 */
import { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getCorsOrigin } from './utils/cors'
import { getRentalBufferMs } from './utils/loadAutomations'
import { categoryAliases } from '../../utils/flottaRules'
import { veicoloUtilizzabile } from '../../utils/esperienzaFlotta'
import { disponibilitaCortesia, intervalliOccupati, type Intervallo, type PrenotazioneFlotta } from '../../utils/autoCortesia'
import { dataRoma } from '../../utils/oraRoma'
import { ALL_ITALIAN_HOLIDAYS } from '../../utils/italianHolidays'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

interface VehicleRow {
    id: string
    display_name: string
    plate: string | null
    daily_rate: number | null
    category: string | null
    status: string | null
    metadata: Record<string, unknown> | null
}

interface BookingRow {
    id: string
    vehicle_id: string | null
    vehicle_plate: string | null
    service_type: string | null
    pickup_date: string | null
    dropoff_date: string | null
    status: string | null
    payment_status: string | null
    payment_method: string | null
    booking_details: Record<string, any> | null
}

type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'
interface DayHours { is_open?: boolean; windows?: { start: string; end: string }[] }

// Valori di fabbrica identici a utils/noleggioHours.ts (usati solo se la
// Centralina non ha gli orari).
const PICKUP_DEF: Record<DayKey, DayHours> = {
    mon: { is_open: true, windows: [{ start: '10:30', end: '12:30' }, { start: '16:30', end: '18:30' }] },
    tue: { is_open: true, windows: [{ start: '10:30', end: '12:30' }, { start: '16:30', end: '18:30' }] },
    wed: { is_open: true, windows: [{ start: '10:30', end: '12:30' }, { start: '16:30', end: '18:30' }] },
    thu: { is_open: true, windows: [{ start: '10:30', end: '12:30' }, { start: '16:30', end: '18:30' }] },
    fri: { is_open: true, windows: [{ start: '10:30', end: '12:30' }, { start: '16:30', end: '18:30' }] },
    sat: { is_open: true, windows: [{ start: '10:30', end: '16:30' }] },
    sun: { is_open: false, windows: [] },
}
const RETURN_DEF: Record<DayKey, DayHours> = {
    mon: { is_open: true, windows: [{ start: '09:00', end: '11:00' }, { start: '15:00', end: '17:00' }] },
    tue: { is_open: true, windows: [{ start: '09:00', end: '11:00' }, { start: '15:00', end: '17:00' }] },
    wed: { is_open: true, windows: [{ start: '09:00', end: '11:00' }, { start: '15:00', end: '17:00' }] },
    thu: { is_open: true, windows: [{ start: '09:00', end: '11:00' }, { start: '15:00', end: '17:00' }] },
    fri: { is_open: true, windows: [{ start: '09:00', end: '11:00' }, { start: '15:00', end: '17:00' }] },
    sat: { is_open: true, windows: [{ start: '09:00', end: '15:00' }] },
    sun: { is_open: false, windows: [] },
}

/** "AAAA-MM-GG" del giorno a Roma. */
function giornoRoma(d: Date): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

function finestreDelGiorno(ymd: string, giorno: DayHours | undefined): Intervallo[] {
    if (!giorno || giorno.is_open === false) return []
    return (giorno.windows || [])
        .map((w) => ({ inizio: dataRoma(ymd, w.start).getTime(), fine: dataRoma(ymd, w.end).getTime() }))
        .filter((w) => !isNaN(w.inizio) && !isNaN(w.fine) && w.fine > w.inizio)
}

export const handler: Handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': getCorsOrigin(event.headers['origin']),
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json',
    }
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
    if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Supabase config missing' }) }
    }

    const params = event.queryStringParameters || {}
    const category = (params.category || '').trim()
    const startIso = params.start
    const endIso = params.end

    if (!category) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'category is required' }) }
    }
    if (!startIso || !endIso) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'start and end (ISO) are required' }) }
    }

    const start = new Date(startIso)
    const end = new Date(endIso)
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'start/end must be valid ISO timestamps with end > start' }) }
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
    })

    // 1) Fetch fleet for the requested category (exact id + aliases).
    const { data: fleetData, error: fleetErr } = await supabase
        .from('vehicles')
        .select('id, display_name, plate, daily_rate, category, status, metadata')
        .in('category', categoryAliases(category))
        .neq('status', 'retired')
        .order('display_name', { ascending: true })

    if (fleetErr) {
        console.error('[get-supercar-experience-fleet] fleet query failed:', fleetErr)
        return { statusCode: 500, headers, body: JSON.stringify({ error: fleetErr.message }) }
    }

    // Fermi (manutenzione, non disponibili): non si offrono, come sul noleggio.
    const fleet: VehicleRow[] = ((fleetData || []) as VehicleRow[]).filter((v) => veicoloUtilizzabile(v))

    if (fleet.length === 0) {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ category, fleet: [], total: 0, available: 0 }),
        }
    }

    // 2) Pull bookings overlapping the window (1-day pad on either side
    //    to catch adjacent same-day bookings safely).
    const windowStart = new Date(start.getTime() - 24 * 60 * 60 * 1000)
    const windowEnd = new Date(end.getTime() + 24 * 60 * 60 * 1000)

    const { data: bookingsData, error: bookingsErr } = await supabase
        .from('bookings')
        .select('id, vehicle_id, vehicle_plate, service_type, pickup_date, dropoff_date, status, payment_status, payment_method, booking_details')
        .lt('pickup_date', windowEnd.toISOString())
        .gt('dropoff_date', windowStart.toISOString())

    if (bookingsErr) {
        console.error('[get-supercar-experience-fleet] bookings query failed:', bookingsErr)
        return { statusCode: 500, headers, body: JSON.stringify({ error: bookingsErr.message }) }
    }

    const bookings: BookingRow[] = (bookingsData || []) as BookingRow[]

    // 3) Orari del noleggio di quel giorno (Centralina Pro > Orari Noleggio).
    const ymd = giornoRoma(start)
    const dayKey = (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as DayKey[])[dataRoma(ymd, '12:00').getUTCDay()]
    let pickupCfg: Record<string, DayHours> = PICKUP_DEF
    let returnCfg: Record<string, DayHours> = RETURN_DEF
    try {
        const { data: cfgRow } = await supabase.from('centralina_pro_config').select('config').eq('id', 'main').maybeSingle()
        const nh = (cfgRow?.config as any)?.noleggio_hours
        if (nh?.hours_pickup) pickupCfg = { ...PICKUP_DEF, ...nh.hours_pickup }
        if (nh?.hours_return) returnCfg = { ...RETURN_DEF, ...nh.hours_return }
    } catch (e) {
        console.warn('[get-supercar-experience-fleet] orari noleggio non letti, uso i valori di fabbrica', e)
    }
    const festivo = ALL_ITALIAN_HOLIDAYS.some((h) => h.date === ymd)
    const finestreRitiro = festivo ? [] : finestreDelGiorno(ymd, pickupCfg[dayKey])
    const finestreRientro = festivo ? [] : finestreDelGiorno(ymd, returnCfg[dayKey])
    const chiusura = finestreRientro.reduce((m, w) => Math.max(m, w.fine), 0)
    const oreRichieste = Math.max(1, Math.round((end.getTime() - start.getTime()) / 3_600_000))

    // 4) Per ogni auto: da che ora e per quante ore e' libera (stessa regola
    //    del gestionale e del Calendario Noleggio).
    const bufferMin = Math.round((await getRentalBufferMs()) / 60_000)
    const prenotazioni: PrenotazioneFlotta[] = bookings.map((b) => ({
        id: b.id,
        vehicle_id: b.vehicle_id,
        vehicle_plate: b.vehicle_plate,
        service_type: b.service_type,
        status: b.status,
        payment_status: b.payment_status,
        payment_method: b.payment_method,
        pickup_date: b.pickup_date,
        dropoff_date: b.dropoff_date,
        bd_vehicle_id: b.booking_details?.vehicle_id ?? null,
        bd_plate: b.booking_details?.vehicle?.plate ?? null,
        bd_link_scade: b.booking_details?.payment_link_expires_at ?? null,
    }))

    const result = fleet.map((v) => {
        const disp = chiusura > 0 && finestreRitiro.length > 0
            ? disponibilitaCortesia({
                inizioLavaggio: start.getTime(),
                chiusura,
                occupati: intervalliOccupati(v, prenotazioni),
                bufferMin,
                finestreRitiro,
            })
            : { liberaDa: null, oreMax: 0 }
        const available = disp.liberaDa !== null && disp.oreMax >= oreRichieste
        return {
            id: v.id,
            display_name: v.display_name,
            plate: v.plate,
            category: v.category,
            daily_rate: v.daily_rate,
            available,
            libera_da: disp.liberaDa !== null ? new Date(disp.liberaDa).toISOString() : null,
            ore_max: disp.oreMax,
            reason: available
                ? null
                : disp.liberaDa === null
                    ? 'Non disponibile in questa giornata'
                    : `Libera solo ${disp.oreMax}h`,
        }
    })

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            category,
            fleet: result,
            total: result.length,
            available: result.filter((r) => r.available).length,
        }),
    }
}

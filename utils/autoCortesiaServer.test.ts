import { describe, it, expect, vi } from 'vitest'

// Martedi' 24/11/2026, ora solare (UTC+1). Ritiro 10:00-18:30, rientro 08:30-17:30.
const prenotazioni = [
  // Yaris fuori fino alle 10:00 ora di Roma (09:00 UTC) -> libera dalle 11:30 col buffer di 90'
  { id: 'p1', vehicle_id: null, vehicle_plate: null, service_type: null, status: 'completata', payment_status: 'paid', payment_method: 'cash', pickup_date: '2026-11-23T08:00:00Z', dropoff_date: '2026-11-24T09:00:00Z', booking_details: { vehicle_id: 'y' } },
  // Panda: prossima prenotazione alle 13:00 Roma -> libera solo 3h dalle 10:00
  { id: 'p2', vehicle_id: 'p', vehicle_plate: null, service_type: 'car_rental', status: 'confirmed', payment_status: 'paid', payment_method: 'card', pickup_date: '2026-11-24T12:00:00Z', dropoff_date: '2026-11-25T12:00:00Z', booking_details: {} },
]
const veicoli = [
  { id: 'y', display_name: 'Yaris', plate: 'AA111AA', daily_rate: 50, category: 'urban', status: 'available', metadata: null },
  { id: 'p', display_name: 'Panda', plate: 'BB222BB', daily_rate: 40, category: 'urban', status: 'available', metadata: null },
]
const config = { noleggio_hours: {
  hours_pickup: { tue: { is_open: true, windows: [{ start: '10:00', end: '18:30' }] } },
  hours_return: { tue: { is_open: true, windows: [{ start: '08:30', end: '17:30' }] } },
} }

function chain(result: unknown) {
  const c: any = {}
  for (const m of ['select', 'in', 'neq', 'order', 'lt', 'gt', 'eq']) c[m] = () => c
  c.maybeSingle = async () => ({ data: result, error: null })
  c.then = (r: any) => Promise.resolve({ data: result, error: null }).then(r)
  return c
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (t: string) => chain(t === 'vehicles' ? veicoli : t === 'bookings' ? prenotazioni : { config }),
  }),
}))
vi.mock('../netlify/functions/utils/loadAutomations', () => ({ getRentalBufferMs: async () => 90 * 60_000 }))

process.env.SUPABASE_URL = 'x'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'x'

describe('get-supercar-experience-fleet', () => {
  it('libera da e ore, con orari Centralina e calendario vero', async () => {
    const { handler } = await import('../netlify/functions/get-supercar-experience-fleet')
    // Lavaggio alle 09:30 Roma, 3 ore richieste
    const res: any = await handler({
      httpMethod: 'GET', headers: {},
      queryStringParameters: { category: 'urban', start: '2026-11-24T08:30:00Z', end: '2026-11-24T11:30:00Z' },
    } as any, {} as any)
    const out = JSON.parse(res.body).fleet
    const y = out.find((v: any) => v.id === 'y')
    const p = out.find((v: any) => v.id === 'p')
    expect(y.libera_da).toBe('2026-11-24T10:30:00.000Z') // 11:30 Roma
    expect(y.ore_max).toBe(6) // 11:30 -> 17:30 Roma
    expect(y.available).toBe(true)
    expect(p.libera_da).toBe('2026-11-24T09:00:00.000Z') // 10:00 Roma (apertura ritiro)
    expect(p.ore_max).toBe(3)
    expect(p.available).toBe(true)
  })
})

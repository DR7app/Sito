/**
 * calculate-delivery-distance
 * ============================
 * Calculates driving distance from DR7 office (Viale Marconi 229, Cagliari)
 * to customer delivery address using Nominatim (geocoding) + OSRM (routing).
 * Free, no API key required.
 *
 * Reads price_per_km from Centralina (rental_extras_config in Supabase).
 * 2026-05-29: il prezzo €/km e' per CATEGORIA del veicolo (delivery.by_category).
 * Il body deve includere `category` (id categoria veicolo). Se manca la categoria
 * o il prezzo per quella categoria non e' configurato, cade sul flat
 * `delivery.price_per_km`; se anche quello manca, restituisce 400 con messaggio
 * italiano "Prezzo consegna non configurato per la categoria".
 *
 * Accepts either { address } (string) or { lat, lon } (coordinates), plus
 * optional { category } (vehicle category id from the catalog).
 */

import { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getCorsOrigin } from './utils/cors'
import { convertProToLegacy } from './utils/convertProConfig'

const DR7_OFFICE_LAT = 39.2238
const DR7_OFFICE_LON = 9.1217
// 2026-05-29: niente piu' DEFAULT_PRICE_PER_KM hardcoded. La sorgente di
// verita' e' centralina_pro_config.servizi.delivery (by_category + flat
// fallback). Se nessun valore e' configurato per la categoria del
// veicolo, la consegna costa €0 — confermato dall'utente: la consegna
// e' gratis finche' l'admin non imposta un prezzo. Nessun errore lato
// client. DB irraggiungibile = 503 (non inventiamo un default).

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': getCorsOrigin(event.headers['origin']),
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const { address, lat, lon, category } = JSON.parse(event.body || '{}')

    // Sorgente di verita': centralina_pro_config (Pro snapshot, dove
    // l'admin salva tutto). convertProToLegacy produce delivery con
    // by_category + price_per_km. Alias supercars<->exotic preservato.
    let pricePerKm = 0
    let usedFallback: 'category' | 'zero' = 'zero'
    const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    if (!supabaseUrl || !supabaseKey) {
      return {
        statusCode: 503, headers,
        body: JSON.stringify({ error: 'Configurazione server mancante. Riprova piu\' tardi.' }),
      }
    }
    try {
      const supabase = createClient(supabaseUrl, supabaseKey)
      const { data, error } = await supabase
        .from('centralina_pro_config')
        .select('config')
        .eq('id', 'main')
        .maybeSingle()
      if (error) throw error
      const legacy = data?.config ? convertProToLegacy(data.config) : null
      const byCat = legacy?.delivery?.by_category
      if (byCat) {
        const cat = typeof category === 'string' ? category.toLowerCase().trim() : ''
        const aliases = cat === 'supercars' ? ['supercars', 'exotic']
          : cat === 'exotic' ? ['exotic', 'supercars']
          : cat ? [cat] : []
        for (const c of aliases) {
          const v = byCat[c]
          if (typeof v === 'number' && v > 0) {
            pricePerKm = v
            usedFallback = 'category'
            break
          }
        }
      }
    } catch (e) {
      console.error('[calculate-delivery-distance] DB read failed:', e)
      return {
        statusCode: 503, headers,
        body: JSON.stringify({ error: 'Impossibile leggere la configurazione consegna. Riprova piu\' tardi.' }),
      }
    }
    // Nessuna tariffa configurata per la categoria = consegna GRATIS
    // (€0). Decisione esplicita dell'utente 2026-05-29: nessun fallback
    // su flat o default. L'admin se ne accorge subito vedendo deliveryFee=€0.

    let destLat: number
    let destLon: number

    if (typeof lat === 'number' && typeof lon === 'number') {
      destLat = lat
      destLon = lon
    } else if (address && typeof address === 'string' && address.trim().length >= 3) {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address.trim())}&format=json&limit=1&countrycodes=it`,
        { headers: { 'User-Agent': 'DR7/1.0', 'Accept-Language': 'it' } }
      )
      const geoData = await geoRes.json()
      if (!geoData || geoData.length === 0) {
        return {
          statusCode: 400, headers,
          body: JSON.stringify({ error: 'Indirizzo non trovato. Verifica l\'indirizzo inserito.' }),
        }
      }
      destLat = parseFloat(geoData[0].lat)
      destLon = parseFloat(geoData[0].lon)
    } else {
      return {
        statusCode: 400, headers,
        body: JSON.stringify({ error: 'Indirizzo o coordinate non validi' }),
      }
    }

    // Calculate driving distance via OSRM
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${DR7_OFFICE_LON},${DR7_OFFICE_LAT};${destLon},${destLat}?overview=false`
    const routeRes = await fetch(osrmUrl)
    const routeData = await routeRes.json()

    if (routeData.code !== 'Ok' || !routeData.routes || routeData.routes.length === 0) {
      return {
        statusCode: 400, headers,
        body: JSON.stringify({ error: 'Impossibile calcolare il percorso. Verifica l\'indirizzo.' }),
      }
    }

    const route = routeData.routes[0]
    const distanceMeters = route.distance
    const durationSeconds = route.duration

    const distanceKm = Math.ceil(distanceMeters / 1000)
    const roundTripKm = distanceKm // one-way per direction (no ×2)
    const deliveryFee = distanceKm * pricePerKm

    const hours = Math.floor(durationSeconds / 3600)
    const minutes = Math.round((durationSeconds % 3600) / 60)
    const durationText = hours > 0 ? `${hours} ora${hours > 1 ? 'e' : ''} ${minutes} min` : `${minutes} min`

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        distanceKm,
        roundTripKm,
        deliveryFee,
        durationText,
        pricePerKm,
        rateSource: usedFallback, // 'category' | 'flat' | 'default' — utile per UI/log
      }),
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: message }),
    }
  }
}

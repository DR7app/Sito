/**
 * Centralina Pro lookups — read human display names from the Pro config
 * (centralina_pro_config table). Used by any Netlify function that sends
 * customer-facing strings (WhatsApp, email, contract, fattura).
 *
 * No hardcoded fallbacks: if an ID is not found in the Pro config, the raw
 * ID is returned unchanged — so the miss is visible and diagnostic, not
 * silently papered over with the wrong label.
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

interface ProInsuranceOption {
  id?: string
  name?: string
  [k: string]: unknown
}

interface ProInsuranceCategory {
  id?: string
  byFascia?: Record<string, ProInsuranceOption[]>
  all?: ProInsuranceOption[]
  [k: string]: unknown
}

interface ProConfig {
  insurance?: ProInsuranceCategory[]
  [k: string]: unknown
}

let cached: { config: ProConfig | null; fetchedAt: number } | null = null
const CACHE_TTL_MS = 30_000 // short TTL — admin edits take effect within 30s

async function loadProConfig(): Promise<ProConfig | null> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.config
  try {
    if (!supabaseUrl || !supabaseKey) return null
    const sb = createClient(supabaseUrl, supabaseKey)
    const { data } = await sb.from('centralina_pro_config').select('config').eq('id', 'main').maybeSingle()
    const cfg = (data as { config?: ProConfig } | null)?.config || null
    cached = { config: cfg, fetchedAt: Date.now() }
    return cfg
  } catch {
    return null
  }
}

/**
 * Nome dell'assicurazione a partire dall'id salvato sulla prenotazione.
 * Unica fonte: Centralina Pro (scorre byFascia + `all` di ogni categoria).
 * Se la Centralina non conosce quell'id il nome resta vuoto — mai l'id
 * grezzo e mai un nome scritto nel codice.
 */
export async function getInsuranceNameById(id: string | null | undefined): Promise<string> {
  if (!id) return ''
  const key = String(id).trim()
  if (!key) return ''
  const cfg = await loadProConfig()
  const insurance = cfg?.insurance
  if (!Array.isArray(insurance)) return ''
  for (const cat of insurance) {
    const byFascia = cat.byFascia || {}
    for (const tier of Object.keys(byFascia)) {
      const opt = (byFascia[tier] || []).find(o => o && o.id === key)
      if (opt && typeof opt.name === 'string' && opt.name.trim()) return opt.name.trim()
    }
    const all = cat.all || []
    const opt = all.find(o => o && o.id === key)
    if (opt && typeof opt.name === 'string' && opt.name.trim()) return opt.name.trim()
  }
  return ''
}

export function invalidateProConfigCache() {
  cached = null
}

interface ProExperienceService {
  id?: string
  name?: string
  price?: number | string
  unit?: string
}

/**
 * 18/11/2026: servizi extra (experience_services) in chiaro per i messaggi.
 * Prima {extras} leggeva `additionalService`, campo che il sito non scrive
 * piu': un cliente ha prenotato 6 rose e il messaggio non lo diceva.
 * Formato: "Bouquet di rose x 6 (€47.40)". Nomi e prezzi da Centralina Pro;
 * se il servizio non e' piu' in Centralina resta l'id, mai sparisce.
 * Vuoto = nessun servizio extra.
 */
export async function serviziExtraTesto(booking: {
  pickup_date?: string | null
  dropoff_date?: string | null
  booking_details?: Record<string, unknown> | null
}): Promise<string> {
  const bd = (booking.booking_details || {}) as Record<string, unknown>
  const scelti = Object.entries((bd.experience_services || {}) as Record<string, unknown>)
    .map(([id, q]) => [id, Number(q) || 0] as const)
    .filter(([, q]) => q > 0)
  const righe: string[] = []
  if (scelti.length) {
    const cfg = await loadProConfig()
    const servizi = (((cfg?.servizi as Record<string, unknown> | undefined)?.experience) || []) as ProExperienceService[]
    const ms = booking.pickup_date && booking.dropoff_date
      ? new Date(booking.dropoff_date).getTime() - new Date(booking.pickup_date).getTime()
      : 0
    const giorni = Math.max(1, Math.ceil(ms / 86_400_000))
    for (const [id, qty] of scelti) {
      const svc = servizi.find(s => s?.id === id)
      const prezzo = Number(svc?.price) || 0
      const totale = svc?.unit === 'per_day' ? prezzo * giorni * qty : prezzo * qty
      const nome = String(svc?.name || id).trim()
      righe.push(`${nome} x ${qty}${totale > 0 ? ` (€${totale.toFixed(2)})` : ''}`)
    }
  }
  const legacy = Array.isArray(bd.extras) ? (bd.extras as unknown[]) : []
  for (const e of legacy) {
    const nome = typeof e === 'string' ? e : String((e as { name?: string; label?: string })?.name || (e as { label?: string })?.label || '')
    if (nome.trim()) righe.push(nome.trim())
  }
  return righe.join(', ')
}

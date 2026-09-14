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

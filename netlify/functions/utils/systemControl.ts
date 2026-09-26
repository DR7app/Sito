// Interruttori del System Control (gestiti dal gestionale DR7, tabella
// sc_flags nello stesso database). Il sito li legge per fermare invii,
// pagamenti e prenotazioni quando la direzione spegne una funzione.
//
// Regola: in caso di dubbio (tabella assente, lettura fallita) la funzione
// resta ACCESA. Stessa logica di DR7-AI netlify/functions/utils/systemControl.ts.
// Versione CommonJS per le funzioni .js: systemControl.js (tenerle allineate).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface StatoFunzione { attiva: boolean; manutenzione: boolean; messaggio?: string | null }

let client: SupabaseClient | null = null
function db(): SupabaseClient | null {
  if (client) return client
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  client = createClient(url, key, { auth: { persistSession: false } })
  return client
}

// 30 secondi: il tempo massimo perche' uno spegnimento abbia effetto.
const CACHE_MS = 30_000
const cache = new Map<string, { at: number; stato: StatoFunzione }>()

async function leggi(chiave: string, business: string): Promise<StatoFunzione> {
  const sb = db()
  if (!sb) return { attiva: true, manutenzione: false }
  try {
    const { data, error } = await sb.from('sc_flags')
      .select('chiave, business, attiva, manutenzione, messaggio')
      .eq('chiave', chiave).in('business', [business, '*'])
    if (error) return { attiva: true, manutenzione: false }
    const righe = (data || []) as { business: string; attiva: boolean; manutenzione: boolean; messaggio: string | null }[]
    const spenta = righe.find(r => r.attiva === false)
    const inManutenzione = righe.find(r => r.manutenzione === true)
    return { attiva: !spenta, manutenzione: !!inManutenzione, messaggio: (spenta || inManutenzione)?.messaggio || null }
  } catch { return { attiva: true, manutenzione: false } }
}

export async function statoFunzione(chiave: string, business = '*'): Promise<StatoFunzione> {
  const k = `${chiave}|${business}`
  const c = cache.get(k)
  if (c && Date.now() - c.at < CACHE_MS) return c.stato
  const stato = await leggi(chiave, business)
  cache.set(k, { at: Date.now(), stato })
  return stato
}

/** Business del System Control dal `service_type` di una prenotazione. */
export function businessDaServiceType(serviceType?: string | null): string {
  const st = String(serviceType || '').toLowerCase()
  if (!st) return '*'
  if (st === 'boat_rental') return 'mare'
  if (st === 'heli_rental') return 'aria'
  if (st === 'stay_rental') return 'soggiorni'
  if (st === 'car_wash' || st.startsWith('mechanical')) return 'lavaggio'
  return 'terra'
}

/**
 * null = si puo' procedere; altrimenti il messaggio da mostrare.
 * "Intero gestionale" spento o in manutenzione ferma anche questa funzione.
 */
export async function funzioneFerma(chiave: string, business = '*'): Promise<string | null> {
  const [f, g] = await Promise.all([statoFunzione(chiave, business), statoFunzione('gestionale', business)])
  const ferma = !f.attiva || f.manutenzione ? f : !g.attiva || g.manutenzione ? g : null
  if (!ferma) return null
  return ferma.messaggio
    || (ferma.manutenzione
      ? 'Servizio momentaneamente in manutenzione. Riprova piu tardi o contattaci.'
      : 'Servizio momentaneamente sospeso. Riprova piu tardi o contattaci.')
}

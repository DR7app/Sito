/**
 * Status del cliente collegato, per il badge sul sito (06/09/2026).
 *
 * PERCHE' SERVE UNA FUNZIONE
 * La pagina profilo leggeva lo status direttamente da `customers_extended`
 * con la chiave anon, e le RLS lasciano vedere SOLO le righe con
 * `user_id = auth.uid()`. Ma la scheda che l'ufficio modifica dall'admin non
 * e' sempre quella agganciata all'account: moltissime schede nascono da una
 * prenotazione o da una lead e hanno solo l'email, con `user_id` vuoto.
 * Risultato: l'admin metteva "Member", il sito continuava a mostrare
 * "New entry" e sembrava che il cambio non arrivasse.
 *
 * Qui si guarda con la chiave di servizio, con la stessa regola dell'admin:
 * prima la scheda dell'account, poi quella con la stessa email (confronto
 * senza distinzione di maiuscole — un `.eq` su email ha gia' fatto fallire
 * altri lookup). MAI per nome: due clienti omonimi non sono la stessa persona.
 *
 * Identita': sempre dal token della sessione, mai un id nel body.
 *
 * La blacklist non esce da qui: viene tradotta in 'standard' PRIMA della
 * risposta, cosi' non finisce nemmeno nel traffico di rete del browser.
 */
import { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getCorsOrigin } from './utils/cors'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

interface SchedaStatus {
  id: string
  user_id: string | null
  status: string | null
  status_cliente: string | null
}

/**
 * Due colonne parallele per ragioni storiche: la tab Clienti scrive `status`,
 * i flussi vecchi `status_cliente`. Stessa precedenza dell'admin
 * (src/contexts/ClientStatusContext.tsx): cambiarla qui vorrebbe dire mostrare
 * al cliente uno status diverso da quello che vede l'ufficio.
 */
function chiaveStatus(r: SchedaStatus | null | undefined): string {
  if (!r) return 'standard'
  const manuale = (r.status_cliente && r.status_cliente !== 'standard')
    ? r.status_cliente
    : (r.status && r.status !== 'standard' ? r.status : null)
  return manuale || 'standard'
}

const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': getCorsOrigin(event.headers.origin || event.headers.Origin),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    // Lo status cambia dall'admin: una risposta in cache mostrerebbe il vecchio.
    'Cache-Control': 'no-store',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Non autenticato' }) }
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Sessione non valida' }) }
    }

    const email = (user.email || '').trim()

    // Niente maybeSingle: di schede con la stessa email ce n'e' spesso piu'
    // d'una (lead + account) e maybeSingle su piu' righe risponde errore,
    // cioe' proprio il caso in cui lo status andrebbe trovato.
    const perAccount = await supabase
      .from('customers_extended')
      .select('id, user_id, status, status_cliente')
      .eq('user_id', user.id)

    const perEmail = email
      ? await supabase
          .from('customers_extended')
          .select('id, user_id, status, status_cliente')
          .ilike('email', email)
      : { data: [] as SchedaStatus[] }

    const schede: SchedaStatus[] = [
      ...((perAccount.data || []) as SchedaStatus[]),
      ...((perEmail.data || []) as SchedaStatus[]),
    ]

    // Vince la prima scheda con uno status assegnato: quella dell'account se
    // ce l'ha, altrimenti quella trovata per email (la scheda dell'ufficio,
    // quella che l'admin ha appena modificato).
    let chiave = 'standard'
    const visti = new Set<string>()
    for (const s of schede) {
      if (visti.has(s.id)) continue
      visti.add(s.id)
      const k = chiaveStatus(s)
      if (k !== 'standard') { chiave = k; break }
    }

    // La blacklist non si mostra mai al cliente.
    if (chiave === 'blacklist') chiave = 'standard'

    return { statusCode: 200, headers, body: JSON.stringify({ statusKey: chiave }) }
  } catch (err: any) {
    // Il badge non e' un motivo per rompere la pagina profilo.
    console.error('[client-status] errore:', err?.message || err)
    return { statusCode: 200, headers, body: JSON.stringify({ statusKey: 'standard', errore: true }) }
  }
}

export { handler }

import { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getCorsOrigin } from './utils/cors'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const handler: Handler = async (event) => {
  const origin = getCorsOrigin(event.headers.origin || event.headers.Origin)
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }

  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Non autenticato' }) }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Sessione non valida' }) }
  }

  try {
    // Match preventivi by customer phone (last 9 digits) — admin creates them, not the customer
    const userPhone = user.phone?.replace(/[\s\-\+()]/g, '') || ''
    const userEmail = user.email?.toLowerCase().trim() || ''
    const phoneSuffix = userPhone.slice(-9)

    // La scheda cliente: il suo id lega i preventivi fatti dal sito.
    let dbPhone = ''
    let customerId: string | null = null
    if (user.id) {
      const { data: custData } = await supabase
        .from('customers_extended')
        .select('id, telefono')
        .eq('user_id', user.id)
        .maybeSingle()
      if (custData?.telefono) {
        dbPhone = custData.telefono.replace(/[\s\-\+()]/g, '')
      }
      customerId = custData?.id || null
    }

    const searchPhone = dbPhone || phoneSuffix

    // 09/09/2026 — un preventivo chiesto dal sito (anche "No Cauzione") non
    // compariva nell'account: la ricerca partiva dal TELEFONO, e chi non ha
    // il numero sulla scheda cliente non trovava niente. Le sue righe le
    // riconosce prima di tutto `created_by` (l'utente che ha premuto il
    // bottone) e `customer_id` (la sua scheda): sono esatti, il telefono e
    // l'email restano come rete per i preventivi scritti in ufficio.
    const righe: any[] = []
    const visti = new Set<string>()
    const aggiungi = (lista: any[] | null) => {
      for (const r of lista || []) {
        if (r?.id && !visti.has(r.id)) { visti.add(r.id); righe.push(r) }
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cerca = async (colonna: string, operatore: 'eq' | 'ilike', valore: string) => {
      const q = supabase.from('preventivi').select('*')
      const conFiltro = operatore === 'eq' ? q.eq(colonna, valore) : q.ilike(colonna, valore)
      const { data: res } = await conFiltro.order('created_at', { ascending: false }).limit(20)
      aggiungi(res)
    }

    await cerca('created_by', 'eq', user.id)
    if (customerId) await cerca('customer_id', 'eq', customerId)
    if (searchPhone) await cerca('customer_phone', 'ilike', `%${searchPhone.slice(-9)}%`)
    if (userEmail) await cerca('customer_name', 'ilike', `%${userEmail}%`)

    righe.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    let data: any[] = righe

    // Le richieste di volo hanno un preventivo gemello (`website_aviation`,
    // lo crea send-aviation-quote-notification per il gestionale): al cliente
    // si mostra la scheda del volo, non una scheda di noleggio con tariffa,
    // km e assicurazione a zero.
    data = data.filter(p => p.source !== 'website_aviation')

    // Auto-expire old preventivi
    const now = new Date()
    const updated = data.map(p => {
      if ((p.status === 'bozza' || p.status === 'inviato') && p.expires_at && new Date(p.expires_at) < now) {
        return { ...p, status: 'scaduto' }
      }
      return p
    })

    // 09/09/2026 — le richieste di preventivo Aria e Jet mancavano.
    // Vivono in `aviation_quotes` (le scrive il modulo del sito, le lavora
    // il gestionale) e "I Miei Preventivi" leggeva solo il noleggio: chi
    // chiedeva un volo non ritrovava piu' la propria richiesta da nessuna
    // parte. Si cercano per email e per telefono, le due cose che il
    // modulo scrive sempre.
    const aviation: any[] = []
    const vistiAviation = new Set<string>()
    const aggiungiAviation = (righe: any[] | null) => {
      for (const r of righe || []) {
        if (r?.id && !vistiAviation.has(r.id)) { vistiAviation.add(r.id); aviation.push(r) }
      }
    }

    if (userEmail) {
      const { data: perEmail } = await supabase
        .from('aviation_quotes')
        .select('*')
        .ilike('customer_email', userEmail)
        .order('created_at', { ascending: false })
        .limit(20)
      aggiungiAviation(perEmail)
    }
    if (searchPhone) {
      const { data: perTelefono } = await supabase
        .from('aviation_quotes')
        .select('*')
        .ilike('customer_phone', `%${searchPhone.slice(-9)}%`)
        .order('created_at', { ascending: false })
        .limit(20)
      aggiungiAviation(perTelefono)
    }
    aviation.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ preventivi: updated, aviation }),
    }
  } catch (err: any) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Errore' }) }
  }
}

export { handler }

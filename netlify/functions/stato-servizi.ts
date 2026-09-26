// Stato pubblico dei servizi del sito, letto dagli interruttori del System
// Control. Nessun login: dice solo se prenotazioni e pagamenti sono aperti,
// cosi' le pagine mostrano un avviso invece di un errore a meta' percorso.
// Il database rifiuta comunque le prenotazioni quando sono sospese: questo
// endpoint serve all'esperienza, non alla sicurezza.
import type { Handler } from '@netlify/functions'
import { getCorsOrigin } from './utils/cors'
import { funzioneFerma } from './utils/systemControl'

const BUSINESS_VALIDI = ['terra', 'mare', 'aria', 'soggiorni', 'lavaggio']

const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': getCorsOrigin(event.headers.origin || event.headers.Origin),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=30',
  }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  const richiesto = String(event.queryStringParameters?.business || '').toLowerCase()
  const business = BUSINESS_VALIDI.includes(richiesto) ? richiesto : '*'

  const [prenotazioni, pagamenti] = await Promise.all([
    funzioneFerma('prenotazioni_online', business),
    funzioneFerma('pagamenti_online', business),
  ])

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      business,
      prenotazioni: { attiva: !prenotazioni, messaggio: prenotazioni },
      pagamenti: { attiva: !pagamenti, messaggio: pagamenti },
    }),
  }
}

export { handler }

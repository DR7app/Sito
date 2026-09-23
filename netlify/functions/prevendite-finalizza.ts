import { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Attiva una prevendita dopo il pagamento con carta — 14/09/2026.
 *
 * La chiamano in due: il callback Nexi e la pagina di pagamento riuscito. Il
 * webhook a volte esce prima (e' gia' successo con le ricariche wallet), quindi
 * l'attivazione non puo' dipendere solo da lui. `prevendita_attiva_pagamento`
 * e' idempotente: chi arriva secondo trova gia' fatto e non raddoppia niente.
 *
 * Qui dentro si fa anche la fattura, con lo stesso servizio degli altri
 * pagamenti con carta. Se quella parte fallisce la prevendita resta attiva: il
 * cliente ha pagato, il pacchetto deve funzionare comunque.
 *
 * 23/09/2026 — PRIMA SI CONTROLLA L'INCASSO. Questo endpoint e' pubblico: chi
 * conosceva l'indirizzo poteva far partire un acquisto, abbandonare il
 * pagamento e poi chiamarlo con l'id della propria riga, attivando il
 * pacchetto senza pagare. Ora l'unica fonte di verita' e' Nexi
 * (`nexi-verify-order`), come per le prenotazioni. Il callback Nexi, che parla
 * gia' con Nexi, passa la chiave di servizio e non ripete la verifica.
 */

/** Chiamata interna (callback Nexi), non dal browser. */
function chiamataInterna(headers: Record<string, string | undefined>): boolean {
  const atteso = process.env.SUPABASE_SERVICE_ROLE_KEY
  const dato = headers['x-dr7-interno'] || headers['X-DR7-Interno']
  return !!atteso && !!dato && dato === atteso
}

/** Nexi dice che l'ordine e' stato incassato? Nel dubbio: no. */
async function incassoVerificato(orderId: string | null | undefined): Promise<boolean> {
  if (!orderId) return false
  try {
    const base = process.env.URL || 'https://dr7.app'
    const risposta = await fetch(`${base}/.netlify/functions/nexi-verify-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    })
    const esito = await risposta.json()
    return esito?.paid === true
  } catch (e) {
    console.error('[prevendite-finalizza] verifica Nexi non riuscita:', e)
    return false
  }
}
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const { orderId, prevenditaClienteId, paymentMethod } = JSON.parse(event.body || '{}')
    if (!orderId && !prevenditaClienteId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Serve orderId oppure prevenditaClienteId' }) }
    }

    const query = supabase.from('prevendite_clienti').select('*').limit(1)
    const { data: righe, error } = prevenditaClienteId
      ? await query.eq('id', prevenditaClienteId)
      : await query.eq('nexi_order_id', orderId)

    if (error) throw new Error(error.message)
    if (!righe || righe.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Prevendita non trovata', orderId }) }
    }

    const riga = righe[0]
    const eraGiaPagata = ['paid', 'completed', 'succeeded'].includes(riga.payment_status)

    // Nessuna attivazione senza incasso: o la chiamata arriva dal callback
    // Nexi (chiave di servizio), o l'ordine risulta pagato su Nexi.
    if (!eraGiaPagata && !chiamataInterna(event.headers as Record<string, string | undefined>)) {
      const pagato = await incassoVerificato(riga.nexi_order_id || orderId)
      if (!pagato) {
        console.warn('[prevendite-finalizza] attivazione rifiutata, incasso non confermato:', riga.id)
        return { statusCode: 402, body: JSON.stringify({ error: 'Pagamento non confermato da Nexi' }) }
      }
    }

    const { data: esito, error: erroreRpc } = await supabase.rpc('prevendita_attiva_pagamento', {
      p_prevendita_cliente_id: riga.id,
      p_payment_method: paymentMethod || riga.payment_method || 'nexi',
    })
    if (erroreRpc) throw new Error(erroreRpc.message)
    if (esito && esito.ok === false) {
      return { statusCode: 400, body: JSON.stringify({ error: esito.errore }) }
    }

    // Fattura: solo la prima volta. Non blocca mai l'attivazione.
    if (!eraGiaPagata) {
      try {
        const base = process.env.URL || 'https://dr7.app'
        const risposta = await fetch(`${base}/.netlify/functions/generate-fattura`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            purchaseType: 'prevendita_purchase',
            purchaseId: riga.id,
            includeIVA: true,
            purchaseData: {
              userId: riga.user_id,
              packageName: riga.nome,
              amount: riga.prezzo_pagato,
            },
          }),
        })
        console.log('[prevendite-finalizza] fattura:', risposta.status)
      } catch (e) {
        console.error('[prevendite-finalizza] fattura non emessa (non blocca):', e)
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        prevenditaClienteId: riga.id,
        nome: riga.nome,
        utilizzi: riga.utilizzi_iniziali,
        giaAttiva: eraGiaPagata,
      }),
    }
  } catch (e) {
    console.error('[prevendite-finalizza] errore:', e)
    return { statusCode: 500, body: JSON.stringify({ error: (e as Error).message }) }
  }
}

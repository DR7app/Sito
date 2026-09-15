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
 */
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

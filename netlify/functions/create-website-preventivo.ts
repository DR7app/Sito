import { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getCorsOrigin } from './utils/cors'
import { getInsuranceNameById } from './utils/centralinaProLookups'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const handler: Handler = async (event) => {
  const origin = getCorsOrigin(event.headers.origin || event.headers.Origin)
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  // Auth: extract user from JWT
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
    const body = JSON.parse(event.body || '{}')

    // ── Required-field validation ────────────────────────────────────────
    // Preventivo deve sempre arrivare con id assicurazione: il wizard
    // costringe il cliente a selezionarne una. Se manca = bug front-end
    // (es. campo non incluso nel payload). Rifiuto esplicitamente con
    // 400 cosi' il bug non sopravvive silenziosamente in DB come "N/A".
    // Maggio 2026: regressione copy-paste fra payload booking e
    // payload preventivo. Da quel momento questa validazione e' la
    // rete di sicurezza.
    // Validazione: tutti i campi indispensabili devono arrivare. Nessun
    // soft fallback su insurance_option — salvare un default sbagliato
    // sarebbe peggio che bloccare il save (rischio: cliente ha scelto
    // Kasko Black ma in preventivo appare Kasko Base). Se la validazione
    // morde, e' perche' il browser ha JS cache stale: hard refresh basta.
    const required: Array<{ key: string; label: string }> = [
      { key: 'vehicle_id',       label: 'vehicle_id' },
      { key: 'vehicle_name',     label: 'vehicle_name' },
      { key: 'pickup_date',      label: 'pickup_date' },
      { key: 'dropoff_date',     label: 'dropoff_date' },
      { key: 'insurance_option', label: 'insurance_option' },
    ]
    const missing = required.filter(f => {
      const v = (body as Record<string, unknown>)[f.key]
      return v === undefined || v === null || v === ''
    })
    if (missing.length > 0) {
      console.error('[create-website-preventivo] payload missing fields:', missing.map(f => f.label).join(', '), 'body=', JSON.stringify(body).slice(0, 800))
      const msg = missing.some(f => f.label === 'insurance_option')
        ? 'Aggiornamento richiesto: ricarica la pagina (Cmd+Shift+R) e riprova. Se persiste, verifica di aver selezionato un\'assicurazione.'
        : `Preventivo incompleto: campi mancanti [${missing.map(f => f.label).join(', ')}]`
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: msg,
          missing: missing.map(f => f.label),
        }),
      }
    }

    // Look up customer in customers_extended by auth user_id
    const { data: customer } = await supabase
      .from('customers_extended')
      .select('id, nome, cognome, email, telefono, tipo_cliente, denominazione')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    const customerName = customer
      ? (customer.tipo_cliente === 'azienda' ? customer.denominazione : `${customer.nome || ''} ${customer.cognome || ''}`.trim())
      : (body.customer_name || user.email || '')
    const customerPhone = customer?.telefono || body.customer_phone || ''
    const customerId = customer?.id || null

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const isNoCauzione = !!body.no_cauzione_request

    const preventivo = {
      vehicle_id: body.vehicle_id,
      vehicle_name: body.vehicle_name || '',
      vehicle_plate: body.vehicle_plate || '',
      vehicle_category: body.vehicle_category || 'exotic',
      pickup_date: body.pickup_date,
      dropoff_date: body.dropoff_date,
      rental_days: body.rental_days || 1,
      pickup_location: body.pickup_location || 'dr7_office',
      dropoff_location: body.dropoff_location || 'dr7_office',
      base_daily_rate: body.base_daily_rate || 0,
      insurance_option: body.insurance_option || '',
      insurance_daily_price: body.insurance_daily_price || 0,
      insurance_total: body.insurance_total || 0,
      km_limit: body.km_limit || 0,
      unlimited_km: body.unlimited_km || false,
      km_overage_fee: body.km_overage_fee || 1.80,
      unlimited_km_daily: body.unlimited_km_daily || 0,
      unlimited_km_total: body.unlimited_km_total || 0,
      second_driver_daily: body.second_driver_daily || 0,
      second_driver_total: body.second_driver_total || 0,
      no_cauzione_daily: body.no_cauzione_daily || 0,
      no_cauzione_total: body.no_cauzione_total || 0,
      lavaggio_fee: body.lavaggio_fee || 0,
      delivery_fee: body.delivery_fee || 0,
      pickup_fee: body.pickup_fee || 0,
      subtotal: body.subtotal || 0,
      sconto: body.sconto || 0,
      sconto_note: body.sconto_note || '',
      total_final: body.total_final || 0,
      deposit_amount: body.deposit_amount || 0,
      driver_tier: body.driver_tier || 'TIER_2',
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_id: customerId,
      extras_detail: body.extras_detail || {},
      pricing_trace: body.pricing_trace || null,
      notes: body.notes || '',
      status: 'bozza',
      source: isNoCauzione ? 'website_no_cauzione' : 'website',
      created_by: user.id,
      expires_at: expiresAt.toISOString(),
      created_at: new Date().toISOString(),
    }

    // 2026-05-21: support edit mode. If body.replacePreventivoId is provided
    // AND the row is owned by the current user (created_by) AND still in a
    // mutable status (bozza/inviato), UPDATE it instead of inserting a new
    // row. This is how MyPreventivi's "Modifica" button works: customer
    // updates dates/extras and the same preventivo gets refreshed.
    const replaceId: string | undefined = typeof body.replacePreventivoId === 'string'
      ? body.replacePreventivoId
      : undefined
    let data: Record<string, unknown> | null = null
    let error: { message: string } | null = null

    if (replaceId) {
      // Verify ownership + mutable status before update
      const { data: existing } = await supabase
        .from('preventivi')
        .select('id, created_by, status, booking_id')
        .eq('id', replaceId)
        .maybeSingle()

      if (!existing) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Preventivo non trovato' }) }
      }
      if (existing.created_by && existing.created_by !== user.id) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Non sei autorizzato a modificare questo preventivo' }) }
      }
      if (existing.booking_id) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Preventivo gia\' convertito in prenotazione, non modificabile' }) }
      }

      // Reset to "bozza" on edit (customer may have changed dates/extras —
      // admin needs to re-review). Drop created_at from update payload.
      // Refresh expires_at: 7 days from now.
      const updatePayload = { ...preventivo }
      delete (updatePayload as Record<string, unknown>).created_at
      const updateResult = await supabase
        .from('preventivi')
        .update({ ...updatePayload, status: 'bozza', updated_at: new Date().toISOString() })
        .eq('id', replaceId)
        .select()
        .single()
      data = updateResult.data as Record<string, unknown> | null
      error = updateResult.error
      console.log('[create-website-preventivo] Updated existing preventivo', replaceId, 'user', user.id)
    } else {
      const insertResult = await supabase
        .from('preventivi')
        .insert(preventivo)
        .select()
        .single()
      data = insertResult.data as Record<string, unknown> | null
      error = insertResult.error
    }

    if (error) {
      console.error('[create-website-preventivo] DB error:', error)
      return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) }
    }

    // Send WhatsApp notification to admin
    try {
      const pickupDate = new Date(body.pickup_date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' })
      const dropoffDate = new Date(body.dropoff_date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' })
      const baseUrl = process.env.URL || 'https://dr7.app'

      const title = isNoCauzione ? '*RICHIESTA NO CAUZIONE*' : '*NUOVO PREVENTIVO DAL SITO*'
      const cauzioneLine = isNoCauzione
        ? `*Cauzione:* Senza cauzione (+€${Number(preventivo.no_cauzione_daily).toFixed(2)}/gg = €${Number(preventivo.no_cauzione_total).toFixed(2)})`
        : `*Cauzione:* €${Number(preventivo.deposit_amount).toFixed(2)}`

      // Resolve insurance display name from Centralina Pro (no raw IDs in the message).
      const insuranceLabel = await getInsuranceNameById(preventivo.insurance_option)

      const msg = `${title}\n\n`
        + `*Cliente:* ${preventivo.customer_name}\n`
        + `*Tel:* ${preventivo.customer_phone || 'N/A'}\n`
        + `*Veicolo:* ${preventivo.vehicle_name}\n`
        + `*Date:* ${pickupDate} - ${dropoffDate} (${preventivo.rental_days}gg)\n`
        + `*Totale:* €${Number(preventivo.total_final).toFixed(2)}\n`
        + `*Assicurazione:* ${insuranceLabel}\n`
        + `*KM:* ${preventivo.unlimited_km ? 'Illimitati' : (preventivo.km_limit + ' km')}\n`
        + `${cauzioneLine}\n\n`
        + `Gestisci dal pannello admin > Preventivi`

      // Notify default admin
      await fetch(`${baseUrl}/.netlify/functions/send-whatsapp-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customMessage: msg }),
      }).catch(() => {})

      // Lo stesso riepilogo va al CLIENTE, sul numero della sua scheda
      // (customers_extended.telefono, quello con cui e' registrato): chiedere
      // un preventivo e non ricevere niente sembrava una richiesta persa.
      // Via l'ultima riga, che parla del pannello admin.
      // Sulle richieste "no cauzione" il cliente riceve gia' il messaggio
      // dedicato qui sotto: non gliene mandiamo due.
      if (preventivo.customer_phone && !isNoCauzione) {
        const msgCliente = msg.replace(/\n+Gestisci dal pannello admin > Preventivi$/, '')
        await fetch(`${baseUrl}/.netlify/functions/send-whatsapp-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customPhone: preventivo.customer_phone, customMessage: msgCliente }),
        }).catch(() => {})
      }

      // For no-cauzioni requests, also notify boss directly
      if (isNoCauzione) {
        const bossMsg = `${title}\n\n`
          + `*Cliente:* ${preventivo.customer_name}\n`
          + `*Telefono:* ${preventivo.customer_phone || 'N/A'}\n`
          + `*Veicolo:* ${preventivo.vehicle_name}\n`
          + `*Periodo:* ${pickupDate} → ${dropoffDate}\n`
          + `*Totale:* €${Number(preventivo.total_final).toFixed(2)}\n\n`
          + `Approvare o rifiutare dall'admin > Preventivi.`
        await fetch(`${baseUrl}/.netlify/functions/send-whatsapp-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customPhone: '393472817258', customMessage: bossMsg }),
        }).catch(() => {})
      }

      // Send confirmation WhatsApp to CUSTOMER for no-cauzione requests
      if (isNoCauzione && preventivo.customer_phone) {
        const firstName = (preventivo.customer_name || 'Cliente').split(' ')[0]
        const customerConfirmMsg = `Gentile ${firstName},\n\n`
          + `abbiamo ricevuto la sua richiesta per la formula senza cauzione relativa alla prenotazione appena effettuata.\n\n`
          + `Il nostro team sta effettuando una verifica rapida per confermarne l'idoneità.\n\n`
          + `Riceverà a breve un aggiornamento con l'esito e, in caso di approvazione, il link di pagamento per completare la prenotazione.\n\n`
          + `Restiamo a disposizione.\n\n`
          + `Cordiali Saluti,\nDR7`
        await fetch(`${baseUrl}/.netlify/functions/send-whatsapp-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customPhone: preventivo.customer_phone, customMessage: customerConfirmMsg }),
        }).catch(() => {})
      }
    } catch (whatsappErr) {
      console.warn('[create-website-preventivo] WhatsApp notification failed:', whatsappErr)
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, preventivo: data }),
    }
  } catch (err: any) {
    console.error('[create-website-preventivo] Error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Errore interno' }) }
  }
}

export { handler }

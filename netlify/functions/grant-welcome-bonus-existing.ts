import { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

/**
 * One-time function to grant €10 welcome bonus to all existing registered users
 * who haven't received it yet.
 *
 * Safe to run multiple times — grant_welcome_bonus RPC is idempotent.
 *
 * Call via: POST /.netlify/functions/grant-welcome-bonus-existing
 * Requires admin_key query param matching SUPABASE_SERVICE_ROLE_KEY (first 16 chars)
 */
const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  // Simple auth: require first 16 chars of service role key as admin_key param
  const adminKey = event.queryStringParameters?.admin_key
  const expectedKey = supabaseServiceKey.substring(0, 16)
  if (!adminKey || adminKey !== expectedKey) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  try {
    // 26/08/2026 — si parte dagli UTENTI, non dalle schede cliente.
    //
    // Prima la lista arrivava da `customers_extended`: proprio chi non aveva
    // ricevuto il bonus era, nella maggior parte dei casi, chi la scheda non
    // ce l'aveva (la registrazione usciva con un errore prima di scriverla).
    // Il recupero saltava esattamente le persone da recuperare. Ora si scorre
    // l'elenco degli account: se esiste l'utente, il bonus gli spetta.
    const customers: { user_id: string }[] = []
    for (let page = 1; page <= 50; page++) {
      const { data: pagina, error: usersError } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
      if (usersError) throw usersError
      const utenti = pagina?.users || []
      for (const u of utenti) if (u.id) customers.push({ user_id: u.id })
      if (utenti.length < 1000) break
    }

    if (customers.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Nessun utente trovato', granted: 0, skipped: 0, errors: 0 })
      }
    }

    let granted = 0
    let skipped = 0
    let errors = 0
    const errorDetails: string[] = []

    for (const customer of customers) {
      if (!customer.user_id) {
        skipped++
        continue
      }

      try {
        const { data: result, error: rpcError } = await supabase
          .rpc('grant_welcome_bonus', { p_user_id: customer.user_id })

        if (rpcError) {
          errors++
          errorDetails.push(`${customer.user_id}: ${rpcError.message}`)
          continue
        }

        const r = result?.[0]
        if (r?.already_granted) {
          skipped++
        } else if (r?.success) {
          granted++
        } else {
          errors++
          errorDetails.push(`${customer.user_id}: ${r?.error_message || 'unknown error'}`)
        }
      } catch (err: any) {
        errors++
        errorDetails.push(`${customer.user_id}: ${err.message}`)
      }
    }

    console.log(`[grant-welcome-bonus-existing] Done: ${granted} granted, ${skipped} skipped, ${errors} errors out of ${customers.length} total`)

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Welcome bonus migration complete',
        total_customers: customers.length,
        granted,
        skipped,
        errors,
        error_details: errorDetails.length > 0 ? errorDetails : undefined
      })
    }
  } catch (error: any) {
    console.error('[grant-welcome-bonus-existing] Error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    }
  }
}

export { handler }

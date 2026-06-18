import type { Handler } from "@netlify/functions"
import { createClient } from "@supabase/supabase-js"

/**
 * BACKGROUND ONE-OFF — accredita i punti fedeltà mancanti a tutti i clienti.
 *
 * Netlify "background function" (suffisso -background) → fino a 15 min, risponde
 * 202 subito e gira in background (la versione sincrona andava in timeout sui
 * 1133 candidati). Processa SOLO i lavaggi PAGATI con un cliente collegato
 * (user_id o email) e senza award — gli altri (~walk-in senza account) non
 * possono ricevere punti. Per ciascuno richiama /award-fidelity-points
 * (idempotente: blocca i doppioni via fidelity_point_awards.booking_id UNIQUE),
 * in ordine cronologico, così il cumulo 1€=1punto + voucher €25 a 250 è corretto.
 *
 * Trigger: GET https://<sito>/.netlify/functions/backfill-fidelity-points-background?confirm=BACKFILL-FIDELITY-2026
 * Verifica dopo ~1 min ri-eseguendo la query di stima (i candidati devono andare a ~0).
 */
const CONFIRM_TOKEN = "BACKFILL-FIDELITY-2026"

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ""
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

export const handler: Handler = async (event) => {
  if ((event.queryStringParameters?.confirm || "") !== CONFIRM_TOKEN) {
    return { statusCode: 403, body: JSON.stringify({ error: "Confirm token mancante o errato" }) }
  }
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[backfill-fidelity] Supabase env mancante")
    return { statusCode: 500, body: "env mancante" }
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })
  const siteUrl = process.env.URL || process.env.DEPLOY_URL || ""

  // 1. Lavaggi PAGATI, dal più vecchio al più recente.
  const paid: Array<{ id: string; user_id: string | null; customer_email: string | null }> = []
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from("bookings")
      .select("id, user_id, customer_email")
      .in("service_type", ["car_wash", "carwash"])
      .in("payment_status", ["paid", "succeeded", "completed"])
      .order("created_at", { ascending: true })
      .range(start, start + 999)
    if (error) { console.error("[backfill-fidelity] query error", error.message); break }
    if (!data || data.length === 0) break
    paid.push(...data)
    if (data.length < 1000) break
  }

  // 2. Escludi quelli già premiati.
  const awarded = new Set<string>()
  for (let start = 0; ; start += 1000) {
    const { data } = await supabase.from("fidelity_point_awards").select("booking_id").range(start, start + 999)
    if (!data || data.length === 0) break
    data.forEach((r: { booking_id: string }) => awarded.add(r.booking_id))
    if (data.length < 1000) break
  }

  // 3. Solo quelli con un cliente collegato (user_id o email).
  const todo = paid.filter((b) => !awarded.has(b.id) && (b.user_id || b.customer_email))
  console.log(`[backfill-fidelity] candidati con cliente: ${todo.length} (su ${paid.length} pagati)`)

  let awardedOk = 0, vouchers = 0, skipped = 0, errors = 0
  for (const b of todo) {
    try {
      const res = await fetch(`${siteUrl}/.netlify/functions/award-fidelity-points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: b.id }),
      })
      const j = await res.json().catch(() => ({} as Record<string, unknown>))
      if (j?.skipped) skipped++
      else { awardedOk++; if (j?.voucher) vouchers++ }
    } catch (e) {
      errors++
      console.error(`[backfill-fidelity] errore booking ${b.id}`, String(e))
    }
    await new Promise((r) => setTimeout(r, 150)) // throttle WhatsApp
  }

  console.log(`[backfill-fidelity] FATTO — accreditati:${awardedOk} voucher:${vouchers} skip:${skipped} err:${errors}`)
  return { statusCode: 200, body: JSON.stringify({ candidates: todo.length, awarded: awardedOk, vouchers, skipped, errors }) }
}

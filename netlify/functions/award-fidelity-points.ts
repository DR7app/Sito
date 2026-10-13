import type { Handler } from "@netlify/functions"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

/**
 * Punti Fidelity del lavaggio — 1 EUR = 1 punto, a 250 punti buono da 25 EUR
 * e la linea riparte dal surplus (240 + 100 = 340 -> buono + 90 punti).
 *
 * 12/10/2026: la regola non vive piu' qui. La applica il database
 * (dr7_punti_lavaggio_accredita, trigger trg_dr7_punti_lavaggio su bookings,
 * migrazione DR7-AI 20261012_punti_lavaggio_dal_database.sql) per OGNI
 * lavaggio pagato, anche quelli del gestionale che prima restavano senza
 * punti. Il cliente si prende solo dagli id della prenotazione, mai per
 * email/telefono. Il WhatsApp del buono (pro_fidelity_voucher) e l'allarme
 * per lo staff partono dal giro allarmi del gestionale.
 *
 * Questa funzione resta per i chiamanti del sito (CarWashBookingPage,
 * PaymentSuccessPage, nexi-callback, backfill): richiama la stessa funzione,
 * che e' idempotente (fidelity_point_awards.booking_id UNIQUE).
 *
 * Body: { bookingId: string }
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) }
  }

  try {
    const { bookingId } = JSON.parse(event.body || "{}")
    if (!bookingId) {
      return { statusCode: 400, body: JSON.stringify({ error: "bookingId required" }) }
    }

    const { data: buoni, error } = await supabase.rpc("dr7_punti_lavaggio_accredita", { p_booking_id: bookingId })
    if (error) {
      console.error("[award-fidelity-points] rpc failed:", error)
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
    }

    const { data: award } = await supabase
      .from("fidelity_point_awards")
      .select("points_awarded, voucher_code")
      .eq("booking_id", bookingId)
      .maybeSingle()

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        vouchersIssued: Number(buoni || 0),
        pointsAwarded: award?.points_awarded ?? 0,
        voucher: award?.voucher_code ?? null,
        skipped: !award,
      }),
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[award-fidelity-points] error:", err)
    return { statusCode: 500, body: JSON.stringify({ error: msg }) }
  }
}

import type { Handler } from "@netlify/functions"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const FIDELITY_THRESHOLD = 250
const FIDELITY_VOUCHER_AMOUNT = 25
const FIDELITY_VOUCHER_VALID_DAYS = 15
const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function generateCode(): string {
  let code = "DR7-"
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += "-"
    code += CHARSET[Math.floor(Math.random() * CHARSET.length)]
  }
  return code
}

async function generateUniqueVoucher(maxRetries = 5): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const code = generateCode()
    const { data } = await supabase
      .from("discount_codes")
      .select("id")
      .eq("code", code)
      .maybeSingle()
    if (!data) return code
  }
  return generateCode() + "-" + Date.now().toString(36).toUpperCase()
}

/**
 * Awards fidelity points for a paid car wash booking.
 *
 * Behaviour:
 *  - Only fires once per booking (idempotent via fidelity_point_awards.booking_id UNIQUE).
 *  - 1 € of price_total = 1 point (integer).
 *  - When points cross the 250 threshold, auto-issue a €25 voucher and reset
 *    fidelity_points to (new_total - 250) so any overflow rolls forward.
 *  - WhatsApp the voucher to the customer's saved phone (best-effort, never blocks).
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

    // Skip if already awarded for this booking (idempotency).
    const { data: existing } = await supabase
      .from("fidelity_point_awards")
      .select("id, voucher_code")
      .eq("booking_id", bookingId)
      .maybeSingle()
    if (existing) {
      return { statusCode: 200, body: JSON.stringify({ success: true, skipped: true, reason: "already_awarded", existing }) }
    }

    // Load booking — must be car_wash and paid.
    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("id, user_id, customer_email, customer_phone, customer_name, service_type, price_total, payment_status, payment_method, booking_source, booking_details")
      .eq("id", bookingId)
      .single()

    if (bookingErr || !booking) {
      return { statusCode: 404, body: JSON.stringify({ error: "Booking not found" }) }
    }

    const isCarWash = booking.service_type === "car_wash" || booking.service_type === "carwash"
    if (!isCarWash) {
      return { statusCode: 200, body: JSON.stringify({ success: true, skipped: true, reason: "not_car_wash" }) }
    }

    // I lavaggi creati DALL'ADMIN non generano punti (booking_source='admin').
    // Tutti gli altri = prenotati dal sito. Il cliente viene abbinato per
    // user_id O per email (sotto), così i clienti registrati ricevono i punti
    // anche se la prenotazione/pay-by-link non ha catturato user_id.
    if ((booking.booking_source || "").toLowerCase() === "admin") {
      return { statusCode: 200, body: JSON.stringify({ success: true, skipped: true, reason: "admin_booking" }) }
    }

    const isPaid = ["paid", "succeeded", "completed"].includes((booking.payment_status || "").toLowerCase())
    if (!isPaid) {
      return { statusCode: 200, body: JSON.stringify({ success: true, skipped: true, reason: "not_paid" }) }
    }

    // Note: ALL paid car wash bookings earn points, including credit wallet
    // and gift card. Per product decision the fidelity line tracks every euro
    // spent on a wash regardless of method.

    // Resolve the customer record. Priority: user_id → email lookup → phone lookup.
    const customerEmail = (booking.customer_email || booking.booking_details?.customer?.email || "").toLowerCase().trim()
    const customerPhone = (booking.customer_phone || booking.booking_details?.customer?.phone || "").trim()
    const customerName = booking.customer_name || booking.booking_details?.customer?.fullName || ""

    let customer: { id: string; email: string | null; telefono: string | null; fidelity_points: number; fidelity_lifetime_points: number } | null = null

    if (booking.user_id) {
      const { data } = await supabase
        .from("customers_extended")
        .select("id, email, telefono, fidelity_points, fidelity_lifetime_points")
        .eq("user_id", booking.user_id)
        .maybeSingle()
      if (data) customer = data as typeof customer
    }

    if (!customer && customerEmail) {
      const { data } = await supabase
        .from("customers_extended")
        .select("id, email, telefono, fidelity_points, fidelity_lifetime_points")
        .ilike("email", customerEmail)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data) customer = data as typeof customer
    }

    if (!customer && customerPhone) {
      const { data } = await supabase
        .from("customers_extended")
        .select("id, email, telefono, fidelity_points, fidelity_lifetime_points")
        .eq("telefono", customerPhone)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data) customer = data as typeof customer
    }

    if (!customer) {
      return { statusCode: 200, body: JSON.stringify({ success: true, skipped: true, reason: "customer_not_found" }) }
    }

    // Compute points from price_total (cents → euros, floor).
    const pointsToAward = Math.floor((booking.price_total || 0) / 100)
    if (pointsToAward <= 0) {
      return { statusCode: 200, body: JSON.stringify({ success: true, skipped: true, reason: "zero_points" }) }
    }

    const previousPoints = Number(customer.fidelity_points || 0)
    const previousLifetime = Number(customer.fidelity_lifetime_points || 0)
    const sumPoints = previousPoints + pointsToAward
    let newLinePoints = sumPoints
    let voucherCode: string | null = null
    let voucherUrl: string | null = null

    // Threshold crossed → issue voucher, reset line.
    if (sumPoints >= FIDELITY_THRESHOLD) {
      voucherCode = await generateUniqueVoucher()

      const validFrom = new Date()
      const validUntil = new Date(validFrom)
      validUntil.setDate(validUntil.getDate() + FIDELITY_VOUCHER_VALID_DAYS)
      validUntil.setHours(23, 59, 59, 999)

      const { error: voucherErr } = await supabase.from("discount_codes").insert({
        code: voucherCode,
        code_type: "codice_sconto",
        value_type: "fixed",
        value_amount: FIDELITY_VOUCHER_AMOUNT,
        // Voucher è spendibile SOLO sui servizi di lavaggio (Prime Wash).
        scope: ["lavaggi"],
        minimum_spend: null,
        single_use: true,
        status: "active",
        customer_email: customer.email || customerEmail || null,
        customer_phone: customer.telefono || customerPhone || null,
        valid_from: validFrom.toISOString(),
        valid_until: validUntil.toISOString(),
        message: "Buono Fidelity Card — solo Prime Wash",
        usage_conditions: `Buono di €${FIDELITY_VOUCHER_AMOUNT} guadagnato con la Fidelity Card. Utilizzabile solo per servizi di lavaggio. Valido ${FIDELITY_VOUCHER_VALID_DAYS} giorni.`,
        qr_url: `https://dr7.app/promo/${voucherCode}`,
      })

      if (voucherErr) {
        console.error("[award-fidelity-points] voucher insert failed:", voucherErr)
        return { statusCode: 500, body: JSON.stringify({ error: "voucher insert failed", details: voucherErr.message }) }
      }

      voucherUrl = `https://dr7.app/promo/${voucherCode}`
      // Reset to zero when threshold is reached — overflow does NOT roll
      // forward (e.g. 29 punti → voucher + 0/250, NOT 4/250).
      newLinePoints = 0
    }

    // Persist the new balance + lifetime total.
    const { error: updErr } = await supabase
      .from("customers_extended")
      .update({
        fidelity_points: Math.max(0, newLinePoints),
        fidelity_lifetime_points: previousLifetime + pointsToAward,
        updated_at: new Date().toISOString(),
      })
      .eq("id", customer.id)

    if (updErr) {
      console.error("[award-fidelity-points] customer update failed:", updErr)
      return { statusCode: 500, body: JSON.stringify({ error: "customer update failed", details: updErr.message }) }
    }

    // Mark the booking as awarded so retries can't double-count.
    await supabase.from("fidelity_point_awards").insert({
      booking_id: booking.id,
      customer_extended_id: customer.id,
      points_awarded: pointsToAward,
      voucher_code: voucherCode,
      voucher_issued_at: voucherCode ? new Date().toISOString() : null,
    })

    // Send WhatsApp if a voucher fired (best-effort).
    // Body comes from Messaggi di Sistema Pro (key `pro_fidelity_voucher`,
    // routed via legacy alias `fidelity_voucher_whatsapp`). Admin can edit
    // the wording from the Pro tab without redeploying the function.
    if (voucherCode) {
      const phone = customer.telefono || customerPhone
      if (phone) {
        const firstName = (customerName || "").split(" ")[0] || "Cliente"
        // Resolve the public site URL from env. Netlify auto-injects URL
        // (production) or DEPLOY_PRIME_URL (preview). PUBLIC_SITE_URL is a
        // user-defined override. Fall through to the canonical domain only
        // if nothing else is set, so the WhatsApp link is always tappable.
        const siteUrl =
          process.env.PUBLIC_SITE_URL ||
          process.env.URL ||
          process.env.DEPLOY_PRIME_URL ||
          "https://www.dr7.app"
        try {
          await fetch(`${siteUrl}/.netlify/functions/send-whatsapp-notification`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customPhone: phone,
              templateKey: "fidelity_voucher_whatsapp",
              templateVars: {
                nome: firstName,
                customer_name: customerName || firstName,
                cliente: customerName || firstName,
                // Voucher code — every alias the admin's template might use.
                code: voucherCode,
                codice: voucherCode,
                code_lavaggio: voucherCode,
                codice_lavaggio: voucherCode,
                code_sconto: voucherCode,
                codice_sconto: voucherCode,
                voucher: voucherCode,
                buono: voucherCode,
                amount: String(FIDELITY_VOUCHER_AMOUNT),
                importo: String(FIDELITY_VOUCHER_AMOUNT),
                valid_days: String(FIDELITY_VOUCHER_VALID_DAYS),
                giorni: String(FIDELITY_VOUCHER_VALID_DAYS),
                points: String(FIDELITY_THRESHOLD),
                punti: String(FIDELITY_THRESHOLD),
                // Website link — pulled from the Netlify-injected URL env var
                // (deploy URL) with https:// guaranteed so WhatsApp auto-
                // links it. NOT hardcoded; falls back to the canonical
                // production URL only if no env var is present.
                link: siteUrl,
                url: siteUrl,
                website: siteUrl,
                sito: siteUrl,
                site: siteUrl,
              },
            }),
          })
        } catch (waErr) {
          console.error("[award-fidelity-points] WhatsApp send failed (non-fatal):", waErr)
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        pointsAwarded: pointsToAward,
        previousPoints,
        newPoints: Math.max(0, newLinePoints),
        threshold: FIDELITY_THRESHOLD,
        voucher: voucherCode
          ? { code: voucherCode, amount: FIDELITY_VOUCHER_AMOUNT, valid_days: FIDELITY_VOUCHER_VALID_DAYS, qr_url: voucherUrl }
          : null,
      }),
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[award-fidelity-points] error:", err)
    return { statusCode: 500, body: JSON.stringify({ error: msg }) }
  }
}

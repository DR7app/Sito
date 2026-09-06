import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { getCorsOrigin } from "./utils/cors";

/**
 * Richiesta di preventivo per elicottero o jet.
 *
 * 06/09/2026 — prima questa funzione non veniva chiamata da nessuno: il
 * modulo del sito apriva WhatsApp sul telefono del CLIENTE con il messaggio
 * gia' scritto, e se lui non premeva "invia" DR7 non sapeva nemmeno che
 * qualcuno avesse chiesto un preventivo. La richiesta non restava da nessuna
 * parte. (La vecchia versione, per giunta, mandava con CallMeBot, spento da
 * tempo: ora si passa sempre da Green API.)
 *
 * Adesso la richiesta:
 *   1. si SCRIVE in `aviation_quotes`, la tabella che il gestionale mostra
 *      nella scheda "Preventivi Aviation" — quindi resta anche se il
 *      messaggio non parte;
 *   2. si MANDA su WhatsApp a DR7 con il template `pro_aviation_quote_request`
 *      dei Messaggi di Sistema Pro (lo stesso che scriveva il messaggio
 *      prima: si modifica dal gestionale, non da qui).
 *
 * Il salvataggio viene prima dell'invio, di proposito: un messaggio non
 * partito si rimanda, una richiesta persa non si recupera.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

interface QuoteBody {
  service?: string;              // "Elicottero" | "Jet Privato"
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  departure_location?: string;
  arrival_location?: string;
  departure_date?: string;
  return_date?: string;
  passenger_count?: number;
  preferred_aircraft?: string;   // il mezzo scelto a catalogo, se arriva da li'
  notes?: string;
  lang?: "it" | "en";
}

/** Il testo di riserva, se il template non c'e' o e' stato spento. */
function messaggioDiRiserva(q: QuoteBody): string {
  const righe = [
    "*NUOVA RICHIESTA PREVENTIVO*",
    "",
    `*Servizio:* ${q.service || "Aviation"}`,
    q.preferred_aircraft ? `*Mezzo:* ${q.preferred_aircraft}` : "",
    "",
    `*Cliente:* ${q.customer_name || "-"}`,
    `*Email:* ${q.customer_email || "-"}`,
    `*Telefono:* ${q.customer_phone || "-"}`,
    "",
    `*Da:* ${q.departure_location || "-"}`,
    `*A:* ${q.arrival_location || "-"}`,
    q.departure_date ? `*Partenza:* ${q.departure_date}` : "",
    q.return_date ? `*Ritorno:* ${q.return_date}` : "",
    `*Passeggeri:* ${q.passenger_count ?? 1}`,
    q.notes ? `\n*Note:* ${q.notes}` : "",
  ];
  return righe.filter((r) => r !== "").join("\n");
}

/** Sostituisce i segnaposto del template dei Messaggi di Sistema Pro. */
function applicaSegnaposto(tpl: string, q: QuoteBody): string {
  const it = (q.lang || "it") === "it";
  const rigaRitorno = q.return_date
    ? (it ? `Data ritorno: ${q.return_date}\n` : `Return date: ${q.return_date}\n`)
    : "";
  const rigaNote = q.notes
    ? (it ? `\nNote: ${q.notes}\n` : `\nNotes: ${q.notes}\n`)
    : "";
  const valori: Record<string, string> = {
    "{service}": q.service || "Aviation",
    "{nome}": q.customer_name || "",
    "{email}": q.customer_email || "",
    "{telefono}": q.customer_phone || "",
    "{partenza}": q.departure_location || "",
    "{arrivo}": q.arrival_location || "",
    "{data_partenza}": q.departure_date || "",
    "{data_ritorno}": q.return_date || "",
    "{passeggeri}": String(q.passenger_count ?? 1),
    "{note}": q.notes || "",
    "{return_line}": rigaRitorno,
    "{notes_line}": rigaNote,
  };
  let out = tpl;
  for (const [k, v] of Object.entries(valori)) out = out.split(k).join(v);
  return out;
}

export const handler: Handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": getCorsOrigin(event.headers.origin || event.headers.Origin),
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let q: QuoteBody = {};
  try { q = JSON.parse(event.body || "{}"); } catch { /* resta vuoto */ }

  // Il minimo per poter richiamare la persona.
  if (!q.customer_name || !(q.customer_email || q.customer_phone)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Nome e almeno un contatto sono obbligatori" }) };
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── 1. La richiesta si scrive ──────────────────────────────────────────
  // La tabella non ha una colonna per la data di partenza ne' per l'origine
  // della richiesta: finiscono nelle note, dove l'operatore le legge.
  const noteEstese = [
    q.departure_date ? `Data partenza richiesta: ${q.departure_date}` : "",
    q.return_date ? `Data ritorno richiesta: ${q.return_date}` : "",
    q.notes ? `\n${q.notes}` : "",
    "\n— Richiesta inviata dal sito dr7.app",
  ].filter(Boolean).join("\n");

  const riga = {
    customer_name: q.customer_name,
    customer_email: q.customer_email || "",
    customer_phone: q.customer_phone || "",
    customer_type: "individual",
    company_vat: "",
    departure_location: q.departure_location || "",
    arrival_location: q.arrival_location || "",
    flight_type: q.return_date ? "round_trip" : "one_way",
    return_date: q.return_date || null,
    return_time: "",
    direct_flight: true,
    intermediate_stops: "",
    flight_flexibility: "fixed",
    flight_time: "day",
    passenger_count: Number(q.passenger_count) || 1,
    has_children: false,
    children_count: 0,
    has_pets: false,
    pet_details: "",
    needs_hostess: false,
    is_vip: false,
    vip_details: "",
    luggage_count: 0,
    luggage_weight: "",
    special_equipment: "",
    bulky_luggage: false,
    purpose: "tourist",
    priority: "luxury",
    preferred_aircraft: q.preferred_aircraft || "",
    needs_branding: false,
    needs_wifi: false,
    needs_catering: false,
    catering_details: "",
    needs_ground_transfer: false,
    known_airport: true,
    airport_details: "",
    landing_restrictions: "",
    helicopter_landing_type: "",
    international_flight: false,
    needs_luggage_assistance: false,
    payment_method: "bank_transfer",
    vat_included: true,
    needs_contract: false,
    needs_insurance: false,
    needs_security: false,
    needs_crew_accommodation: false,
    needs_nda: false,
    notes: noteEstese,
    status: "pending",
    quote_amount: 0,
  };

  let quoteId: string | null = null;
  let erroreSalvataggio: string | null = null;
  try {
    const { data, error } = await supabase.from("aviation_quotes").insert([riga]).select("id").single();
    if (error) throw error;
    quoteId = data?.id ?? null;
    console.log("[aviation-quote] richiesta salvata:", quoteId);
  } catch (e: any) {
    erroreSalvataggio = e?.message || String(e);
    console.error("[aviation-quote] salvataggio fallito:", erroreSalvataggio);
  }

  // ── 2. E si manda a DR7 su WhatsApp ────────────────────────────────────
  let messaggioInviato = false;
  try {
    let testo = messaggioDiRiserva(q);
    const { data: tpl } = await supabase
      .from("system_messages")
      .select("message_body, is_enabled")
      .eq("message_key", "pro_aviation_quote_request")
      .maybeSingle();
    const corpo = (tpl?.message_body as string | null) || "";
    if (tpl?.is_enabled !== false && corpo.trim()) {
      testo = applicaSegnaposto(corpo, q);
      if (q.preferred_aircraft && !testo.includes(q.preferred_aircraft)) {
        testo += `\nMezzo scelto: ${q.preferred_aircraft}`;
      }
    }

    const base = process.env.URL || "https://dr7.app";
    const res = await fetch(`${base}/.netlify/functions/send-whatsapp-notification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customMessage: testo }),
    });
    messaggioInviato = res.ok;
    if (!res.ok) console.error("[aviation-quote] WhatsApp non inviato:", res.status, await res.text().catch(() => ""));
  } catch (e) {
    console.error("[aviation-quote] invio WhatsApp fallito:", e);
  }

  // La richiesta e' andata a buon fine se e' rimasta scritta da qualche
  // parte: il messaggio e' l'avviso, non la richiesta.
  if (!quoteId && !messaggioInviato) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Richiesta non registrata", details: erroreSalvataggio }),
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, id: quoteId, notified: messaggioInviato }),
  };
};

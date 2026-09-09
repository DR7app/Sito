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
  departure_time?: string;
  wants_return?: boolean;
  return_date?: string;
  return_time?: string;
  is_flexible?: boolean;         // date e orari flessibili
  passenger_count?: number;
  has_stops?: boolean;
  intermediate_stops?: string;
  luggage_details?: string;      // riga leggibile: "3 bagagli · 20-23 kg"
  luggage_count?: number;        // quante valigie (tendina del modulo)
  luggage_weight?: string;       // fascia di peso scelta, non un numero
  budget_indicative?: string;    // testo: quasi sempre una forbice
  aircraft_category?: "jet" | "helicopter" | "any";
  preferred_aircraft?: string;   // il mezzo scelto a catalogo, se arriva da li'
  notes?: string;
  lang?: "it" | "en";
}

/** Orario vuoto: la colonna e' `time`, e "" non e' un orario. */
const ora = (v?: string) => (v && /^\d{2}:\d{2}/.test(v) ? v : null);

/**
 * Le date nei messaggi si scrivono all'europea: 16/09/2026, mai 2026-09-16.
 * Nel database restano ISO, dove devono stare; qui si legge, e chi legge e'
 * una persona.
 */
const dataIt = (v?: string | null): string => {
  const s = String(v || "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
};

/** Giorno e ora insieme: "16/09/2026 alle 07:30". */
const dataOraIt = (d?: string | null, h?: string | null, it = true): string => {
  const giorno = dataIt(d);
  if (!giorno) return "";
  const orario = (h || "").slice(0, 5);
  return orario ? `${giorno} ${it ? "alle" : "at"} ${orario}` : giorno;
};

/**
 * Giorno + orario del volo come istante scritto in `preventivi`.
 *
 * Le colonne sono `timestamptz`: senza fuso Postgres leggerebbe l'ora come
 * UTC e il gestionale mostrerebbe il volo due ore prima. L'offset di Roma
 * si chiede al calendario, cosi' vale anche d'inverno.
 */
function istanteRoma(ymd?: string | null, hm?: string | null): string | null {
  const giorno = String(ymd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno)) return null;
  const orario = hm && /^\d{2}:\d{2}/.test(hm) ? hm.slice(0, 5) : "09:00";
  let offset = "+02:00";
  try {
    const parti = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Rome",
      timeZoneName: "longOffset",
    }).formatToParts(new Date(`${giorno}T${orario}:00Z`));
    const nome = parti.find((p) => p.type === "timeZoneName")?.value || "";
    const trovato = nome.replace("GMT", "").trim();
    if (/^[+-]\d{2}:\d{2}$/.test(trovato)) offset = trovato;
  } catch { /* resta +02:00 */ }
  return `${giorno}T${orario}:00${offset}`;
}

/**
 * La tipologia di aeromobile scelta dal cliente, in parole.
 *
 * Sta in UNA funzione perche' la usano sia il messaggio di riserva sia il
 * segnaposto {aeromobile} del template: due elenchi separati avrebbero finito
 * per dire cose diverse.
 */
function tipoAeromobile(q: QuoteBody, it = true): string {
  if (q.aircraft_category === "helicopter") return it ? "Elicottero" : "Helicopter";
  if (q.aircraft_category === "jet") return it ? "Jet privato" : "Private jet";
  if (q.aircraft_category === "any") return it ? "Da valutare insieme al cliente" : "To be advised";
  return "";
}

/** Il testo di riserva, se il template non c'e' o e' stato spento. */
function messaggioDiRiserva(q: QuoteBody): string {
  const righe = [
    "*NUOVA RICHIESTA PREVENTIVO*",
    "",
    `*Servizio:* ${q.service || "Aviation"}`,
    // Quello che ha chiesto il cliente nel modulo: puo' non coincidere con la
    // pagina da cui e' arrivato.
    tipoAeromobile(q) ? `*Tipologia aeromobile:* ${tipoAeromobile(q)}` : "",
    q.preferred_aircraft ? `*Mezzo:* ${q.preferred_aircraft}` : "",
    "",
    `*Cliente:* ${q.customer_name || "-"}`,
    `*Email:* ${q.customer_email || "-"}`,
    `*Telefono:* ${q.customer_phone || "-"}`,
    "",
    `*Da:* ${q.departure_location || "-"}`,
    `*A:* ${q.arrival_location || "-"}`,
    q.departure_date ? `*Partenza:* ${dataOraIt(q.departure_date, q.departure_time)}` : "",
    q.return_date ? `*Ritorno:* ${dataOraIt(q.return_date, q.return_time)}` : "",
    `*Date flessibili:* ${q.is_flexible ? "Sì" : "No"}`,
    `*Passeggeri:* ${q.passenger_count ?? 1}`,
    q.has_stops ? `*Tappe:* ${q.intermediate_stops || "sì, da definire"}` : "",
    q.luggage_details ? `*Bagagli:* ${q.luggage_details}` : "",
    q.budget_indicative ? `*Budget indicativo:* ${q.budget_indicative}` : "",
    q.notes ? `\n*Note:* ${q.notes}` : "",
  ];
  return righe.filter((r) => r !== "").join("\n");
}

/** Sostituisce i segnaposto del template dei Messaggi di Sistema Pro. */
function applicaSegnaposto(tpl: string, q: QuoteBody): string {
  const it = (q.lang || "it") === "it";
  const rigaRitorno = q.return_date
    ? (it ? `Data ritorno: ${dataIt(q.return_date)}\n` : `Return date: ${dataIt(q.return_date)}\n`)
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
    "{data_partenza}": dataIt(q.departure_date),
    "{data_ritorno}": dataIt(q.return_date),
    "{passeggeri}": String(q.passenger_count ?? 1),
    "{note}": q.notes || "",
    "{orario_partenza}": q.departure_time || "",
    "{orario_ritorno}": q.return_time || "",
    "{flessibile}": q.is_flexible ? (it ? "Sì" : "Yes") : "No",
    "{tappe}": q.has_stops ? (q.intermediate_stops || (it ? "Sì" : "Yes")) : "No",
    "{bagagli}": q.luggage_details || "",
    "{budget}": q.budget_indicative || "",
    "{aeromobile}": tipoAeromobile(q, it),
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
  // Le note tengono l'origine della richiesta e quello che il cliente ha
  // scritto di suo. Data e orario di partenza hanno una colonna loro
  // (migration 20260907_aviation_quote_campi_richiesta.sql): finche' quella
  // non e' stata eseguita restano qui, vedi `righeDiRipiego`.
  const noteEstese = [
    q.departure_date ? `Data partenza richiesta: ${dataOraIt(q.departure_date, q.departure_time)}` : "",
    q.return_date ? `Data ritorno richiesta: ${dataOraIt(q.return_date, q.return_time)}` : "",
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
    // Andata e ritorno lo dice il cliente, non piu' la presenza di una data.
    flight_type: (q.wants_return && q.return_date) || q.return_date ? "round_trip" : "one_way",
    return_date: q.return_date || null,
    return_time: ora(q.return_time),
    // "Volo diretto" e' l'opposto di "ci sono tappe".
    direct_flight: !q.has_stops,
    intermediate_stops: q.has_stops ? (q.intermediate_stops || "") : "",
    flight_flexibility: q.is_flexible ? "flexible" : "fixed",
    flight_time: "day",
    passenger_count: Number(q.passenger_count) || 1,
    has_children: false,
    children_count: 0,
    has_pets: false,
    pet_details: "",
    needs_hostess: false,
    is_vip: false,
    vip_details: "",
    // Numero e peso arrivano dalle tendine del modulo: prima erano finti
    // (0 e stringa vuota) e la scheda del gestionale restava muta.
    luggage_count: Number(q.luggage_count) || 0,
    luggage_weight: q.luggage_weight || "",
    special_equipment: "",
    bulky_luggage: false,
    // Colonne aggiunte il 07/09/2026 insieme alle nuove domande del modulo.
    departure_date: q.departure_date || null,
    departure_time: ora(q.departure_time),
    luggage_details: q.luggage_details || "",
    budget_indicative: q.budget_indicative || "",
    aircraft_category: q.aircraft_category || null,
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

  // Le colonne nuove arrivano con una migration che si esegue a mano: finche'
  // non e' stata eseguita l'insert le rifiuterebbe (42703) e la richiesta
  // andrebbe PERSA. Quindi al secondo tentativo si tolgono e il loro
  // contenuto finisce nelle note, dove l'operatore lo legge lo stesso.
  const CAMPI_NUOVI = ["departure_date", "departure_time", "luggage_details", "budget_indicative", "aircraft_category"] as const;

  function righeDiRipiego(): string {
    const r = [
      q.departure_date ? `Data partenza: ${dataOraIt(q.departure_date, q.departure_time)}` : "",
      q.luggage_details ? `Bagagli: ${q.luggage_details}` : "",
      q.budget_indicative ? `Budget indicativo: ${q.budget_indicative}` : "",
      tipoAeromobile(q) ? `Tipologia aeromobile: ${tipoAeromobile(q)}` : "",
    ].filter(Boolean);
    return r.length ? `\n${r.join("\n")}` : "";
  }

  let quoteId: string | null = null;
  let erroreSalvataggio: string | null = null;
  try {
    const { data, error } = await supabase.from("aviation_quotes").insert([riga]).select("id").single();
    if (error) throw error;
    quoteId = data?.id ?? null;
    console.log("[aviation-quote] richiesta salvata:", quoteId);
  } catch (e: any) {
    const messaggio = e?.message || String(e);
    const colonnaMancante = /column|schema cache|42703|PGRST204/i.test(messaggio);
    if (!colonnaMancante) {
      erroreSalvataggio = messaggio;
      console.error("[aviation-quote] salvataggio fallito:", erroreSalvataggio);
    } else {
      console.warn("[aviation-quote] colonne nuove assenti, riprovo senza (esegui la migration 20260907_aviation_quote_campi_richiesta.sql):", messaggio);
      const ridotta: Record<string, unknown> = { ...riga, notes: `${riga.notes}${righeDiRipiego()}` };
      for (const c of CAMPI_NUOVI) delete ridotta[c];
      try {
        const { data, error } = await supabase.from("aviation_quotes").insert([ridotta]).select("id").single();
        if (error) throw error;
        quoteId = data?.id ?? null;
        console.log("[aviation-quote] richiesta salvata senza le colonne nuove:", quoteId);
      } catch (e2: any) {
        erroreSalvataggio = e2?.message || String(e2);
        console.error("[aviation-quote] salvataggio fallito:", erroreSalvataggio);
      }
    }
  }

  // ── 1-bis. La richiesta entra anche fra i Preventivi del Noleggio Aria ──
  // La scheda "Preventivi Aviation" del gestionale non e' collegata a nessuna
  // sezione: chi lavora apre Noleggio Aria > Preventivi, filtro "Dal sito", e
  // li' la richiesta non compariva. `aviation_quotes` resta il dettaglio del
  // volo; qui nasce il preventivo vero, quello che l'ufficio prezza e manda.
  //
  // Regola dei business (src/utils/businessScope.ts del gestionale):
  // `service_type = 'heli_rental'` e `vehicle_id` NULL — quella colonna
  // punta alla flotta auto e su Aria va lasciata vuota.
  try {
    const partenza = istanteRoma(q.departure_date, q.departure_time);
    const ritorno = istanteRoma(q.return_date, q.return_time);
    if (partenza) {
      // Il cliente: se e' registrato la sua scheda lega il preventivo al
      // conto, e "I Miei Preventivi" del sito lo ritrova.
      let customerId: string | null = null;
      if (q.customer_email) {
        const { data: scheda } = await supabase
          .from("customers_extended")
          .select("id")
          .ilike("email", q.customer_email.trim())
          .limit(1)
          .maybeSingle();
        customerId = scheda?.id ?? null;
      }

      const riepilogo = [
        `Richiesta di volo dal sito — ${q.service || "Aviation"}`,
        `Da: ${q.departure_location || "-"}`,
        `A: ${q.arrival_location || "-"}`,
        `Partenza: ${dataOraIt(q.departure_date, q.departure_time)}`,
        q.return_date ? `Ritorno: ${dataOraIt(q.return_date, q.return_time)}` : "",
        `Date flessibili: ${q.is_flexible ? "Si" : "No"}`,
        `Passeggeri: ${q.passenger_count ?? 1}`,
        q.has_stops ? `Tappe: ${q.intermediate_stops || "da definire"}` : "",
        q.luggage_details ? `Bagagli: ${q.luggage_details}` : "",
        q.budget_indicative ? `Budget indicativo: ${q.budget_indicative}` : "",
        tipoAeromobile(q) ? `Tipologia aeromobile: ${tipoAeromobile(q)}` : "",
        q.preferred_aircraft ? `Mezzo scelto: ${q.preferred_aircraft}` : "",
        q.notes ? `\nNote del cliente: ${q.notes}` : "",
      ].filter(Boolean).join("\n");

      const preventivo = {
        service_type: "heli_rental",
        vehicle_id: null,
        vehicle_name: q.preferred_aircraft || tipoAeromobile(q) || (q.service || "Volo"),
        vehicle_plate: "",
        vehicle_category: "",
        pickup_date: partenza,
        dropoff_date: ritorno || partenza,
        rental_days: 1,
        pickup_location: q.departure_location || "",
        dropoff_location: q.arrival_location || "",
        base_daily_rate: 0,
        insurance_option: "",
        insurance_total: 0,
        km_limit: 0,
        unlimited_km: false,
        subtotal: 0,
        // Il prezzo lo fa l'ufficio: nasce a zero, non a un numero inventato.
        total_final: 0,
        deposit_amount: 0,
        customer_name: q.customer_name,
        customer_phone: q.customer_phone || "",
        customer_id: customerId,
        notes: riepilogo,
        extras_detail: {
          aviation_quote_id: quoteId,
          passeggeri: Number(q.passenger_count) || 1,
          bagagli: q.luggage_details || "",
          budget_indicativo: q.budget_indicative || "",
          aeromobile: tipoAeromobile(q),
          date_flessibili: !!q.is_flexible,
          tappe: q.has_stops ? (q.intermediate_stops || "da definire") : "",
        },
        status: "bozza",
        // Resta sotto il filtro "Dal sito" (`source LIKE 'website%'`) e si
        // distingue dai preventivi del configuratore noleggio.
        source: "website_aviation",
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("preventivi").insert([preventivo]);
      if (error) throw error;
      console.log("[aviation-quote] preventivo Aria creato per la richiesta", quoteId);
    }
  } catch (e: any) {
    // Il preventivo e' comodita' d'ufficio: se non nasce, la richiesta resta
    // comunque in `aviation_quotes` e su WhatsApp.
    console.error("[aviation-quote] preventivo Aria non creato:", e?.message || e);
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

    // Lo stesso riepilogo va anche al CLIENTE: chi chiede un preventivo deve
    // vedere sul suo WhatsApp cosa ha chiesto. Il numero e' quello della sua
    // scheda (il numero con cui e' registrato); solo se non e' registrato si
    // usa quello scritto nel modulo. L'email si cerca con ilike: con .eq una
    // maiuscola di differenza faceva fallire il collegamento.
    let telefonoCliente = (q.customer_phone || "").trim();
    if (q.customer_email) {
      const { data: scheda } = await supabase
        .from("customers_extended")
        .select("telefono")
        .ilike("email", q.customer_email.trim())
        .limit(1)
        .maybeSingle();
      if (scheda?.telefono) telefonoCliente = String(scheda.telefono);
    }
    if (telefonoCliente) {
      const resCliente = await fetch(`${base}/.netlify/functions/send-whatsapp-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customPhone: telefonoCliente, customMessage: testo }),
      });
      if (!resCliente.ok) console.error("[aviation-quote] copia al cliente non inviata:", resCliente.status);
    } else {
      console.warn("[aviation-quote] nessun numero per il cliente: copia non inviata");
    }
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

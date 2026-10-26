/**
 * Richiesta "No Cauzione" dal sito (25/10/2026).
 *
 * Il cliente chiede la formula senza cauzione: nasce un codice personale
 * (utils/codiceNoCauzione.js) che va SOLO a Valerio su WhatsApp, insieme al
 * riepilogo della richiesta. Se approva, Valerio copia il codice al cliente,
 * che lo inserisce nel wizard e prenota pagando normalmente senza cauzione.
 *
 * Prima la richiesta era una prenotazione 'pending' che l'annullamento
 * automatico chiudeva dopo un'ora, e il riepilogo andava al numero admin di
 * default invece che a Valerio.
 *
 * Il codice NON torna al browser: lo riceve solo Valerio.
 *
 * POST { veicolo, ritiro, riconsegna, totale, supplementoGiorno, nome, telefono }
 * Authorization: Bearer <jwt del cliente>
 */
const { createClient } = require('@supabase/supabase-js');
const { generaCodice, VALIDITA_GIORNI, SCOPE } = require('./utils/codiceNoCauzione.js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EMAIL_APPROVA = 'valerio@dr7.app';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const testo = v => String(v == null ? '' : v).replace(/[*_~`]/g, '').slice(0, 200);

async function numeroValerio() {
  // La scheda admin; se vuota (oggi lo e'), il destinatario "Valerio" dei
  // ticket, che si gestisce dall'admin.
  const { data: admin } = await supabase
    .from('admins')
    .select('contatto_interno')
    .eq('email', EMAIL_APPROVA)
    .maybeSingle();
  let telefono = String((admin && admin.contatto_interno) || '').replace(/\D/g, '');
  if (telefono.length < 8) {
    const { data: destinatari } = await supabase
      .from('ticket_recipients')
      .select('whatsapp')
      .ilike('nome', 'valerio%')
      .eq('attivo', true)
      .limit(1);
    telefono = String((destinatari && destinatari[0] && destinatari[0].whatsapp) || '').replace(/\D/g, '');
  }
  return telefono;
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const jwt = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
    if (!jwt) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Accedi per inviare la richiesta' }) };
    const { data: userData } = await supabase.auth.getUser(jwt);
    const utente = userData && userData.user;
    if (!utente || !utente.email) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Sessione non valida' }) };
    const email = utente.email.toLowerCase().trim();

    const body = JSON.parse(event.body || '{}');

    // 26/10/2026 (direzione): nessun limite di richieste al giorno. Il tetto di
    // 5 in 24 ore (aggiunto il 25/10 senza richiesta) bloccava l'invio in silenzio.

    const telefonoValerio = await numeroValerio();
    if (telefonoValerio.length < 8) {
      console.error('[richiesta-no-cauzione] numero di Valerio mancante');
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Richiesta non inviata, riprova piu\' tardi.' }) };
    }

    // Dal popup la richiesta parte prima dei dati del conducente: nome e
    // telefono si prendono dalla scheda cliente se il form e' ancora vuoto.
    let nome = testo(body.nome);
    let telefonoCliente = testo(body.telefono);
    if (!nome || !telefonoCliente) {
      const { data: scheda } = await supabase
        .from('customers_extended')
        .select('nome, cognome, telefono')
        .eq('user_id', utente.id)
        .limit(1);
      const s = (scheda && scheda[0]) || {};
      if (!nome) nome = testo([s.nome, s.cognome].filter(Boolean).join(' '));
      if (!telefonoCliente) telefonoCliente = testo(s.telefono);
    }
    if (!nome) nome = email;
    const riepilogo = `${testo(body.veicolo) || 'Veicolo'} · ${testo(body.ritiro)} → ${testo(body.riconsegna)}`;

    let codice = '';
    for (let tentativo = 0; tentativo < 3 && !codice; tentativo++) {
      const candidato = generaCodice();
      const { error } = await supabase.from('discount_codes').insert({
        code: candidato,
        code_type: 'codice_sconto',
        value_type: 'fixed',
        value_amount: 0,
        scope: [SCOPE],
        minimum_spend: 0,
        single_use: true,
        status: 'active',
        valid_from: new Date().toISOString(),
        valid_until: new Date(Date.now() + VALIDITA_GIORNI * 24 * 60 * 60 * 1000).toISOString(),
        customer_email: email,
        message: `No Cauzione — richiesta di ${nome}: ${riepilogo}`,
        usage_conditions: `Sblocca la formula senza cauzione sul sito per ${email}. Una sola prenotazione, valido ${VALIDITA_GIORNI} giorni.`,
      });
      if (!error) codice = candidato;
      else if (error.code !== '23505') throw error;
    }
    if (!codice) throw new Error('codice non generato');

    const messaggio = `*RICHIESTA NO CAUZIONE DAL SITO*\n\n`
      + `*Cliente:* ${nome}\n`
      + `*Email:* ${email}\n`
      + `*Tel:* ${telefonoCliente || 'N/A'}\n`
      + `*Veicolo:* ${testo(body.veicolo) || 'N/A'}\n`
      + `*Periodo:* ${testo(body.ritiro)} → ${testo(body.riconsegna)}\n`
      // 26/10/2026: scelte del cliente (assicurazione, pacchetti km, servizi).
      + (Array.isArray(body.dettagli) ? body.dettagli.slice(0, 20).map(r => `• ${testo(r)}\n`).join('') : '')
      + `*Totale:* €${Number(body.totale || 0).toFixed(2)}\n`
      + `*Supplemento No Cauzione:* €${Number(body.supplementoGiorno || 0).toFixed(2)}/giorno\n\n`
      + `Se approvi, inoltra al cliente il CODICE del messaggio seguente: lo inserisce sul sito nella scelta "No Cauzione" e prenota pagando normalmente. Vale solo per il suo account, una prenotazione, ${VALIDITA_GIORNI} giorni.`;

    const baseUrl = process.env.URL || 'https://dr7.app';
    // 26/10/2026: il codice parte in un messaggio a parte, da solo, cosi'
    // Valerio lo copia e lo inoltra al cliente senza ritagliarlo dal riepilogo.
    for (const [cosa, testoWa] of [['riepilogo', messaggio], ['codice', codice]]) {
      const res = await fetch(`${baseUrl}/.netlify/functions/send-whatsapp-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customPhone: telefonoValerio, customMessage: testoWa, skipHeader: true }),
      });
      const esito = await res.json().catch(() => ({}));
      if (!res.ok || esito.success === false) {
        console.error(`[richiesta-no-cauzione] WhatsApp a Valerio (${cosa}) non partito:`, esito);
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Richiesta non inviata, riprova piu\' tardi.' }) };
      }
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('[richiesta-no-cauzione]', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Richiesta non inviata, riprova piu\' tardi.' }) };
  }
};

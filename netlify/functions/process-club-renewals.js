const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

/**
 * Scheduled function (cron ogni 30 minuti).
 *
 * 07/09/2026 — questa riga prima conteneva la pianificazione scritta per
 * esteso, con dentro la sequenza che CHIUDE un commento: il file non veniva
 * nemmeno letto dal compilatore, quindi il rinnovo degli abbonamenti non
 * girava. Scritta a parole, il file torna valido.
 *
 * Processes DR7 Club subscription renewals every 30 minutes.
 * Finds expired subscriptions with a stored Nexi contract and charges via MIT.
 *
 * 07/09/2026 — IL PREZZO DEL RINNOVO
 * Qui si addebitava `sub.price`, cioe' il prezzo CONGELATO al momento
 * dell'iscrizione. Alzare il prezzo in Centralina Pro valeva solo per i nuovi
 * iscritti: chi si era abbonato a 4,90 restava a 4,90 per sempre, rinnovo
 * dopo rinnovo. Ora si addebita il listino di oggi
 * (`site_copy.dr7ClubPlan`), e il prezzo sulla riga si aggiorna.
 *
 * E siccome nessuno puo' ritrovarsi addebitato di piu' senza saperlo, prima
 * del rinnovo parte un avviso al cliente con il vecchio prezzo, il nuovo e la
 * data del prossimo addebito. L'avviso si manda UNA volta per ogni nuovo
 * prezzo (vedi `price_change_notified_eur`).
 */

/** Prezzi di listino di oggi, da Centralina Pro > Sito > DR7 Club — Piano. */
async function caricaPrezziPiano(supabase) {
  try {
    const { data, error } = await supabase
      .from('centralina_pro_config')
      .select('config')
      .eq('id', 'main')
      .maybeSingle();
    if (error) throw error;
    const piano = (data && data.config && data.config.site_copy && data.config.site_copy.dr7ClubPlan) || {};
    const mensile = Number(piano.monthly_eur);
    const annuale = Number(piano.annually_eur);
    return {
      monthly: mensile > 0 ? mensile : null,
      annual: annuale > 0 ? annuale : null,
    };
  } catch (err) {
    // Config illeggibile: si resta al prezzo scritto sull'abbonamento. Meglio
    // incassare l'importo vecchio che non incassare niente o sbagliare cifra.
    console.error('[club-renewals] prezzi di listino non letti, uso quelli sull\'abbonamento:', err.message || err);
    return { monthly: null, annual: null };
  }
}

/** Quanto si addebita davvero: listino di oggi, o il prezzo sulla riga. */
function prezzoDiRinnovo(sub, prezzi) {
  const listino = sub.plan === 'monthly' ? prezzi.monthly : prezzi.annual;
  return listino && listino > 0 ? Number(listino) : Number(sub.price);
}

const eur = (n) => `€${Number(n).toFixed(2).replace('.', ',')}`;
/** "/mese" o "/anno": lo usa il template dell'avviso variazione prezzo. */
const periodoPiano = (plan) => (plan === 'monthly' ? '/mese' : '/anno');
const dataIt = (d) => new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Telefono, email e nome dell'abbonato, per potergli scrivere. */
async function contattiCliente(supabase, userId) {
  const out = { phone: '', email: '', nome: '' };
  try {
    const { data } = await supabase
      .from('customers_extended')
      .select('nome, cognome, telefono, email')
      .eq('user_id', userId)
      .limit(1);
    const c = (data || [])[0];
    if (c) {
      out.phone = c.telefono || '';
      out.email = c.email || '';
      out.nome = [c.nome, c.cognome].filter(Boolean).join(' ');
    }
  } catch (err) {
    console.warn('[club-renewals] scheda cliente non letta:', err.message || err);
  }
  if (!out.email) {
    try {
      const { data } = await supabase.auth.admin.getUserById(userId);
      out.email = (data && data.user && data.user.email) || '';
    } catch { /* resta vuota */ }
  }
  return out;
}

/** Un messaggio al cliente: template dei Messaggi di Sistema Pro, se c'e'. */
async function avvisaCliente(siteUrl, contatti, templateKey, templateVars, testoDiRiserva) {
  if (!contatti.phone) return false;
  try {
    const res = await fetch(`${siteUrl}/.netlify/functions/send-whatsapp-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateKey, templateVars, customPhone: contatti.phone }),
    });
    if (res.ok) return true;
    console.warn(`[club-renewals] template ${templateKey} non inviato (${res.status}), mando il testo di riserva`);
  } catch (err) {
    console.warn(`[club-renewals] invio ${templateKey} fallito:`, err.message || err);
  }
  try {
    const res = await fetch(`${siteUrl}/.netlify/functions/send-whatsapp-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customMessage: testoDiRiserva, customPhone: contatti.phone }),
    });
    return res.ok;
  } catch (err) {
    console.error('[club-renewals] avviso al cliente non partito:', err.message || err);
    return false;
  }
}

/**
 * Avviso di cambio prezzo, PRIMA dell'addebito.
 *
 * Si guarda avanti di `GIORNI_PREAVVISO` giorni. L'ordine e' voluto: prima si
 * SEGNA che l'avviso e' partito, poi lo si manda. Al contrario, un errore
 * nella scrittura rimanderebbe lo stesso messaggio ogni mezz'ora.
 */
const GIORNI_PREAVVISO = 15;

async function avvisaCambioPrezzo(supabase, siteUrl, prezzi) {
  const limite = new Date(Date.now() + GIORNI_PREAVVISO * 24 * 60 * 60 * 1000).toISOString();
  const { data: inScadenza, error } = await supabase
    .from('dr7_club_subscriptions')
    .select('*')
    .eq('status', 'active')
    .lte('expires_at', limite)
    .not('nexi_contract_id', 'is', null);
  if (error) {
    console.error('[club-renewals] abbonamenti in scadenza non letti:', error.message);
    return 0;
  }

  let avvisati = 0;
  for (const sub of (inScadenza || [])) {
    const nuovo = prezzoDiRinnovo(sub, prezzi);
    const vecchio = Number(sub.price);
    if (!(nuovo > 0) || nuovo === vecchio) continue;
    // Gia' avvisato per QUESTO prezzo: non si ripete.
    if (Number(sub.price_change_notified_eur) === nuovo) continue;

    try {
      const { error: segnaErr } = await supabase
        .from('dr7_club_subscriptions')
        .update({
          price_change_notified_eur: nuovo,
          price_change_notified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', sub.id);
      if (segnaErr) throw segnaErr;
    } catch (err) {
      // Colonne non ancora create: si tace, invece di riscrivere ogni 30
      // minuti alla stessa persona. Vedi la migration
      // 20260907_dr7_club_avviso_prezzo.sql.
      console.warn('[club-renewals] avviso prezzo saltato, colonne mancanti?', err.message || err);
      continue;
    }

    const contatti = await contattiCliente(supabase, sub.user_id);
    const quando = dataIt(sub.expires_at);
    // Riserva: si usa solo se il template non c'e' o e' spento. Stessa
    // sostanza del testo approvato, cosi' il cliente non riceve due
    // versioni diverse della stessa comunicazione.
    const testo =
      `Gentile Cliente, la informiamo che dal prossimo rinnovo il costo del suo abbonamento DR7 Club ` +
      `passerà da ${eur(vecchio)} a ${eur(nuovo)}${periodoPiano(sub.plan)}.\n\n` +
      `Potrà continuare normalmente con il nuovo prezzo oppure annullare l'abbonamento senza alcuna ` +
      `penale prima del rinnovo del ${quando}.\n\n` +
      `In caso di cancellazione, l'accesso al DR7 Club terminerà alla scadenza del periodo già pagato ` +
      `e verranno meno i relativi privilegi e benefici maturati secondo le Condizioni del Club. ` +
      `La cancellazione è definitiva e non sarà possibile riattivare successivamente l'adesione.`;
    const inviato = await avvisaCliente(siteUrl, contatti, 'pro_club_price_change', {
      nome: contatti.nome,
      prezzo_vecchio: eur(vecchio),
      prezzo_nuovo: eur(nuovo),
      periodo: periodoPiano(sub.plan),
      data_rinnovo: quando,
      piano: sub.plan === 'monthly' ? 'Mensile' : 'Annuale',
    }, testo);
    if (inviato) avvisati++;
    else console.warn(`[club-renewals] abbonamento ${sub.id}: avviso prezzo segnato ma non consegnato (telefono mancante?)`);
  }
  return avvisati;
}

exports.handler = async (event) => {
  console.log('Starting DR7 Club renewal processing...');

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const nexiApiKey = process.env.NEXI_API_KEY;
  const nexiEnvironment = process.env.NEXI_ENVIRONMENT || 'production';
  const baseUrl = nexiEnvironment === 'production'
    ? 'https://xpay.nexigroup.com/api/phoenix-0.0/psp/api/v1'
    : 'https://xpaysandbox.nexigroup.com/api/phoenix-0.0/psp/api/v1';
  const siteUrl = process.env.URL || 'https://dr7.app';

  if (!nexiApiKey) {
    console.error('NEXI_API_KEY not configured');
    return { statusCode: 500, body: 'Missing Nexi API key' };
  }

  // Il listino di oggi: da qui esce il prezzo di ogni rinnovo.
  const prezzi = await caricaPrezziPiano(supabase);

  // Prima di addebitare: chi paghera' di piu' deve saperlo in anticipo.
  const avvisati = await avvisaCambioPrezzo(supabase, siteUrl, prezzi);
  if (avvisati) console.log(`Avviso cambio prezzo inviato a ${avvisati} abbonati`);

  // Find active subscriptions that have expired and have a contract for renewal
  const { data: dueSubscriptions, error: queryErr } = await supabase
    .from('dr7_club_subscriptions')
    .select('*')
    .eq('status', 'active')
    .lte('expires_at', new Date().toISOString())
    .not('nexi_contract_id', 'is', null);

  if (queryErr) {
    console.error('Error querying due subscriptions:', queryErr);
    return { statusCode: 500, body: 'Query error' };
  }

  console.log(`Found ${dueSubscriptions?.length || 0} DR7 Club subscriptions due for renewal`);

  const results = { renewed: 0, failed: 0, errors: [] };

  for (const sub of (dueSubscriptions || [])) {
    try {
      console.log(`Processing renewal for subscription ${sub.id} (user: ${sub.user_id}, plan: ${sub.plan})`);

      const timestamp = Date.now().toString().substring(5);
      const random = Math.floor(100 + Math.random() * 900).toString();
      const renewalOrderId = `CLUBREN${timestamp}${random}`;

      const correlationId = crypto.randomBytes(16).toString('hex')
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');

      // L'importo e' il listino di oggi, non quello dell'iscrizione.
      const importo = prezzoDiRinnovo(sub, prezzi);
      const prezzoCambiato = Number(importo) !== Number(sub.price);
      if (prezzoCambiato) {
        console.log(`Abbonamento ${sub.id}: prezzo aggiornato da ${sub.price} a ${importo}`);
      }

      // Nexi MIT charge
      //
      // NIENTE blocco `recurrence`: su /orders/mit Nexi lo legge come
      // interruttore e trasforma l'addebito in una PREAUTORIZZAZIONE — il
      // cliente risulta pagante e i soldi non arrivano mai. E' gia' successo
      // due volte su altri flussi. Il pagamento ricorrente funziona con il
      // solo contractId.
      const mitBody = {
        order: {
          orderId: renewalOrderId,
          amount: Math.round(importo * 100).toString(),
          currency: 'EUR',
          customerId: sub.user_id,
          description: `Rinnovo DR7 Club - ${sub.plan === 'monthly' ? 'Mensile' : 'Annuale'}`,
        },
        card: {
          contractId: sub.nexi_contract_id,
        },
        contractId: sub.nexi_contract_id,
        captureType: 'IMPLICIT',
      };

      const mitResponse = await fetch(`${baseUrl}/orders/mit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': nexiApiKey,
          'Correlation-Id': correlationId,
        },
        body: JSON.stringify(mitBody),
      });

      let mitData;
      try {
        mitData = await mitResponse.json();
      } catch (parseErr) {
        mitData = { error: 'Non-JSON response from Nexi' };
      }

      if (mitResponse.ok) {
        // Success: extend expires_at
        const prev = new Date(sub.expires_at);
        const newExpiry = new Date(prev);
        if (sub.plan === 'monthly') {
          newExpiry.setMonth(prev.getMonth() + 1);
          if (newExpiry.getMonth() !== ((prev.getMonth() + 1) % 12)) {
            newExpiry.setDate(0);
          }
        } else {
          newExpiry.setFullYear(prev.getFullYear() + 1);
        }

        // Il prezzo sulla riga segue quello appena incassato: senza questo,
        // il rinnovo dopo ripartirebbe di nuovo dal vecchio importo e
        // l'avviso di cambio prezzo si ripeterebbe ogni mese.
        await supabase
          .from('dr7_club_subscriptions')
          .update({
            expires_at: newExpiry.toISOString(),
            nexi_order_id: renewalOrderId,
            price: importo,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sub.id);

        console.log(`Renewed DR7 Club ${sub.id}, next expiry: ${newExpiry.toISOString()}`);
        results.renewed++;

        // Ricevuta al cliente: un addebito ricorrente senza un messaggio e'
        // il modo piu' rapido per farsi contestare la carta.
        try {
          const contatti = await contattiCliente(supabase, sub.user_id);
          const testo =
            `Ciao${contatti.nome ? ` ${contatti.nome.split(' ')[0]}` : ''}, il tuo abbonamento DR7 Club ` +
            `${sub.plan === 'monthly' ? 'mensile' : 'annuale'} e' stato rinnovato.\n\n` +
            `Importo addebitato: ${eur(importo)}\n` +
            `Prossimo rinnovo: ${dataIt(newExpiry)}\n\n` +
            `Grazie di essere con noi.`;
          await avvisaCliente(siteUrl, contatti, 'pro_club_renewal_charged', {
            nome: contatti.nome,
            importo: eur(importo),
            data_rinnovo: dataIt(newExpiry),
            piano: sub.plan === 'monthly' ? 'Mensile' : 'Annuale',
          }, testo);
        } catch (avvisoErr) {
          console.warn('[club-renewals] ricevuta al cliente non inviata:', avvisoErr.message || avvisoErr);
        }
      } else {
        // Failed
        console.error(`MIT charge failed for DR7 Club ${sub.id}:`, mitData);

        await supabase
          .from('dr7_club_subscriptions')
          .update({
            status: 'expired',
            updated_at: new Date().toISOString(),
          })
          .eq('id', sub.id);

        // Alert admin
        const alertMsg = `Rinnovo DR7 Club FALLITO!\n\nUser: ${sub.user_id}\nPiano: ${sub.plan}\nPrezzo: ${eur(importo)}\nErrore: ${JSON.stringify(mitData.errors || mitData)}`;
        try {
          await fetch(`${siteUrl}/.netlify/functions/send-whatsapp-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customMessage: alertMsg }),
          });
        } catch (whatsErr) {
          console.error('WhatsApp alert failed:', whatsErr);
        }

        results.failed++;
        results.errors.push({ subscriptionId: sub.id, error: mitData });
      }
    } catch (err) {
      console.error(`Error processing DR7 Club renewal ${sub.id}:`, err);
      results.failed++;
      results.errors.push({ subscriptionId: sub.id, error: err.message });
    }
  }

  console.log('DR7 Club renewal processing complete:', results);
  return {
    statusCode: 200,
    body: JSON.stringify(results),
  };
};

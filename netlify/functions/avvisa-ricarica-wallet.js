/**
 * Avviso al cliente quando ricarica il Credit Wallet (26/08/2026).
 *
 * PERCHE' ESISTE
 * Il messaggio stava DENTRO il callback Nexi, nel ramo che accredita il
 * credito. Ma quel ramo esce subito se la ricarica risulta gia' completata:
 *
 *     if (purchase.payment_status === 'succeeded') return 'OK'   // <- esce qui
 *
 * e a completarla e' quasi sempre il BROWSER, non il webhook: la pagina di
 * pagamento riuscito (PaymentSuccessPage) finalizza l'acquisto appena il
 * cliente torna dal 3D Secure. Quando poi arriva il webhook trova tutto gia'
 * fatto, esce, e il messaggio non parte mai. E' lo stesso motivo per cui la
 * fattura viene generata dalla pagina e non dal webhook.
 *
 * Qui l'avviso e' una function a se', chiamata da ENTRAMBI i percorsi
 * (webhook e pagina di successo). Chi arriva primo manda, l'altro non fa
 * nulla: la prenotazione dell'invio e' un UPDATE condizionale su
 * `avviso_inviato_at`, quindi anche se partono insieme il cliente riceve un
 * solo WhatsApp.
 *
 * Se la colonna `avviso_inviato_at` non esiste ancora (migrazione non
 * eseguita) si manda lo stesso: meglio un raro doppione che nessun avviso.
 * Migrazione: supabase/migrations/20260826_avviso_ricarica_wallet.sql
 *
 * Il testo e' SEMPRE il template di "Messaggi di Sistema Pro" che dichiara
 * l'evento in "Eventi gestiti da questo template". Nessun testo di riserva:
 * se nessun template abilitato gestisce l'evento non parte niente.
 *
 * Body: { purchaseId: string }
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EVENTI = ['on_wallet_recharge', 'wallet_bonus_credit'];

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

/** Numero del cliente, cercato in tutte le fonti: la scheda puo' essere vuota. */
async function trovaTelefono(purchase) {
  const pulisci = v => String(v || '').replace(/\D/g, '');

  if (purchase.customer_phone && pulisci(purchase.customer_phone)) return purchase.customer_phone;

  if (purchase.user_id) {
    const { data: scheda } = await supabase
      .from('customers_extended')
      .select('telefono')
      .eq('user_id', purchase.user_id)
      .maybeSingle();
    if (scheda && scheda.telefono) return scheda.telefono;

    try {
      const { data: acc } = await supabase.auth.admin.getUserById(purchase.user_id);
      const m = (acc && acc.user && acc.user.user_metadata) || {};
      const daMeta = m.telefono || m.phone || (acc && acc.user && acc.user.phone) || '';
      if (daMeta) return daMeta;
    } catch (e) {
      console.warn('[avvisa-ricarica-wallet] metadati non letti:', e && e.message);
    }

    const { data: pren } = await supabase
      .from('bookings')
      .select('customer_phone')
      .eq('user_id', purchase.user_id)
      .not('customer_phone', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);
    if (pren && pren[0] && pren[0].customer_phone) return pren[0].customer_phone;
  }

  if (purchase.customer_email) {
    const { data: perMail } = await supabase
      .from('customers_extended')
      .select('telefono')
      .eq('email', purchase.customer_email)
      .not('telefono', 'is', null)
      .limit(1);
    if (perMail && perMail[0] && perMail[0].telefono) return perMail[0].telefono;
  }

  return '';
}

/** Template Pro abilitato che dichiara l'evento, il piu' recente se piu' di uno. */
async function templatePerEvento(eventKey) {
  const { data: rows } = await supabase
    .from('system_messages')
    .select('message_key, message_body, is_enabled, include_header, updated_at')
    .contains('handled_events', [eventKey])
    .like('message_key', 'pro_%')
    .order('updated_at', { ascending: false });
  return (rows || []).find(r => r.is_enabled !== false && r.message_body && String(r.message_body).trim()) || null;
}

async function wrapper(chiave) {
  const { data } = await supabase
    .from('system_messages')
    .select('message_key, message_body, is_enabled')
    .eq('message_key', chiave)
    .maybeSingle();
  return data && data.is_enabled !== false && data.message_body ? String(data.message_body) : '';
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { purchaseId } = JSON.parse(event.body || '{}');
    if (!purchaseId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'purchaseId mancante' }) };

    const { data: purchase, error } = await supabase
      .from('credit_wallet_purchases')
      .select('*')
      .eq('id', purchaseId)
      .maybeSingle();
    if (error) throw error;
    if (!purchase) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Ricarica non trovata' }) };

    // Solo ricariche davvero pagate.
    const stato = String(purchase.payment_status || '').toLowerCase();
    if (!['succeeded', 'completed', 'paid'].includes(stato)) {
      return { statusCode: 200, headers, body: JSON.stringify({ inviato: false, motivo: 'ricarica non pagata' }) };
    }

    // Prenotazione dell'invio: vince chi aggiorna la riga per primo.
    let colonnaAvviso = true;
    if (purchase.avviso_inviato_at) {
      return { statusCode: 200, headers, body: JSON.stringify({ inviato: false, motivo: 'avviso gia inviato' }) };
    }
    const { data: prenotato, error: prenErr } = await supabase
      .from('credit_wallet_purchases')
      .update({ avviso_inviato_at: new Date().toISOString() })
      .eq('id', purchase.id)
      .is('avviso_inviato_at', null)
      .select('id');
    if (prenErr) {
      // Colonna non ancora creata: si manda comunque, senza protezione.
      console.warn('[avvisa-ricarica-wallet] avviso_inviato_at non disponibile:', prenErr.message);
      colonnaAvviso = false;
    } else if (!prenotato || prenotato.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ inviato: false, motivo: 'avviso gia inviato' }) };
    }

    const telefono = await trovaTelefono(purchase);
    let digits = String(telefono || '').replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.substring(2);
    if (digits.length === 10) digits = '39' + digits;
    if (!digits) {
      // Nessun numero: si libera la prenotazione, cosi' un secondo tentativo
      // (dopo aver completato la scheda) puo' ancora mandare l'avviso.
      if (colonnaAvviso) {
        await supabase.from('credit_wallet_purchases').update({ avviso_inviato_at: null }).eq('id', purchase.id);
      }
      console.warn('[avvisa-ricarica-wallet] nessun telefono per la ricarica', purchase.id);
      return { statusCode: 200, headers, body: JSON.stringify({ inviato: false, motivo: 'telefono mancante' }) };
    }

    // Un template per evento; se due eventi stanno sulla stessa scheda parte
    // un messaggio solo.
    const daInviare = [];
    for (const eventKey of EVENTI) {
      const tpl = await templatePerEvento(eventKey);
      if (!tpl) {
        console.log(`[avvisa-ricarica-wallet] nessun template gestisce "${eventKey}"`);
        continue;
      }
      const gia = daInviare.find(x => x.tpl.message_key === tpl.message_key);
      if (gia) { gia.eventi.push(eventKey); continue; }
      daInviare.push({ tpl, eventi: [eventKey] });
    }
    if (daInviare.length === 0) {
      if (colonnaAvviso) {
        await supabase.from('credit_wallet_purchases').update({ avviso_inviato_at: null }).eq('id', purchase.id);
      }
      return { statusCode: 200, headers, body: JSON.stringify({ inviato: false, motivo: 'nessun template gestisce l evento' }) };
    }

    // Dati del cliente e importi per le variabili del template.
    let cliente = null;
    if (purchase.user_id) {
      const { data } = await supabase
        .from('customers_extended')
        .select('nome, cognome, full_name')
        .eq('user_id', purchase.user_id)
        .maybeSingle();
      cliente = data;
    }
    let saldo = 0;
    if (purchase.user_id) {
      const { data: saldoRow } = await supabase
        .from('user_credit_balance')
        .select('balance')
        .eq('user_id', purchase.user_id)
        .maybeSingle();
      saldo = saldoRow && saldoRow.balance ? parseFloat(saldoRow.balance) : 0;
    }

    const ricaricaEur = parseFloat(purchase.recharge_amount || purchase.received_amount || 0);
    const ricevutoEur = parseFloat(purchase.received_amount || 0);
    const bonusPacchetto = Math.round((ricevutoEur - ricaricaEur) * 100) / 100;

    // Cashback DR7 Club accreditato su QUESTA ricarica (riga separata).
    let cashback = 0;
    if (purchase.user_id) {
      const { data: righe } = await supabase
        .from('credit_transactions')
        .select('amount')
        .eq('user_id', purchase.user_id)
        .eq('reference_id', purchase.id)
        .in('reference_type', ['card_bonus', 'cashback_3_percent', 'wallet_cashback']);
      cashback = (righe || []).reduce((t, r) => t + parseFloat(r.amount || 0), 0);
    }

    const nomeCompleto = [cliente && cliente.nome, cliente && cliente.cognome].filter(Boolean).join(' ').trim()
      || (cliente && cliente.full_name)
      || purchase.customer_name
      || 'Cliente';
    const nome = String(nomeCompleto).split(' ')[0] || 'Cliente';

    const vars = {
      nome,
      custName: nomeCompleto,
      customer_name: nomeCompleto,
      pacchetto: purchase.package_name || '',
      package_name: purchase.package_name || '',
      importo: ricaricaEur.toFixed(2),
      amount: ricaricaEur.toFixed(2),
      ricarica: ricaricaEur.toFixed(2),
      bonus: bonusPacchetto.toFixed(2),
      bonusEur: bonusPacchetto.toFixed(2),
      percentLabel: `${purchase.bonus_percentage || 0}%`,
      cashback: cashback.toFixed(2),
      totale: ricevutoEur.toFixed(2),
      saldo: saldo.toFixed(2),
      newBalance: saldo.toFixed(2),
      balance: saldo.toFixed(2),
    };

    const siteUrl = process.env.URL || 'https://dr7.app';
    const inviati = [];
    for (const { tpl, eventi } of daInviare) {
      let testo = String(tpl.message_body);
      if (tpl.include_header) {
        const header = await wrapper('pro_wrapper_header');
        const footer = await wrapper('pro_wrapper_footer');
        testo = [header, testo, footer].filter(t => t.trim()).join('\n\n');
      }
      for (const chiave of Object.keys(vars)) {
        testo = testo.split(`{${chiave}}`).join(vars[chiave] == null ? '' : String(vars[chiave]));
      }
      if (!testo.trim()) continue;

      await fetch(`${siteUrl}/.netlify/functions/send-whatsapp-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customPhone: digits, customMessage: testo }),
      });
      inviati.push(tpl.message_key);
      console.log(`[avvisa-ricarica-wallet] ${eventi.join(' + ')} -> ${tpl.message_key} inviato a ${digits}`);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ inviato: inviati.length > 0, templates: inviati }) };
  } catch (e) {
    console.error('[avvisa-ricarica-wallet]', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e instanceof Error ? e.message : 'Errore' }) };
  }
};

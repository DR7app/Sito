const { leggiOrdineNexi } = require('./nexiOrdine.js');

/**
 * Finalizza una ricarica Credit Wallet: UNA sola strada, usata sia dalla
 * pagina di esito (tramite wallet-ricarica-finalizza) sia dal webhook
 * nexi-callback. Vedi memoria "ricarica finalizzata dal browser": ogni effetto
 * della ricarica va chiamato da entrambi i percorsi.
 *
 * 29/09/2026 — prima si accreditava quello che c'era scritto sulla riga
 * `credit_wallet_purchases`, che la scrive il browser (importo e bonus
 * compresi), e l'importo mandato a Nexi lo decideva sempre il browser.
 * Adesso:
 *   - il PRINCIPALE e' quanto Nexi ha davvero incassato (mai di piu' della
 *     ricarica scelta);
 *   - il BONUS esiste solo se il pacchetto e' nel CMS (Centralina >
 *     site_copy.creditWallet.packages) e l'incasso e' esattamente il suo
 *     prezzo. Altrimenti niente bonus e una nota sulla riga per l'ufficio.
 *   - la riga viene riscritta con gli importi veri, cosi' fattura e cashback
 *     (che leggono la riga) lavorano sui numeri giusti.
 */

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

async function pacchettiDalCms(supabase) {
  const { data } = await supabase
    .from('centralina_pro_config')
    .select('config')
    .eq('id', 'main')
    .maybeSingle();
  const raw = data && data.config && data.config.site_copy && data.config.site_copy.creditWallet
    ? data.config.site_copy.creditWallet.packages
    : null;
  if (!Array.isArray(raw)) return [];
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);
  return raw
    .filter(p => p && typeof p === 'object')
    .map(p => {
      const rechargeAmount = num(p.rechargeAmount);
      const bonusPercentage = num(p.bonusPercentage);
      const bonus = p.bonus != null ? num(p.bonus) : Math.round(rechargeAmount * bonusPercentage) / 100;
      const receivedAmount = p.receivedAmount != null ? num(p.receivedAmount) : rechargeAmount + bonus;
      return { id: String(p.id || ''), rechargeAmount, receivedAmount, bonusPercentage };
    })
    .filter(p => p.id && p.rechargeAmount > 0);
}

/** Dove altro compare questo numero d'ordine? null = da nessuna parte. */
async function ordineGiaUsato(supabase, ordineId, purchaseId) {
  const controlli = [
    ['credit_wallet_purchases', (q) => q.eq('nexi_order_id', ordineId).neq('id', purchaseId)],
    ['bookings', (q) => q.eq('nexi_order_id', ordineId)],
    ['bookings', (q) => q.eq('booking_details->>nexi_order_id', ordineId)],
    ['membership_purchases', (q) => q.eq('nexi_order_id', ordineId)],
    ['dr7_club_subscriptions', (q) => q.eq('nexi_order_id', ordineId)],
    ['prevendite_clienti', (q) => q.eq('nexi_order_id', ordineId)],
    ['ordini_carrello', (q) => q.eq('nexi_order_id', ordineId)],
  ];
  for (const [tabella, filtro] of controlli) {
    const { data, error } = await filtro(supabase.from(tabella).select('id')).limit(1);
    if (error) throw new Error(`controllo ordine su ${tabella} fallito: ${error.message}`);
    if (data && data.length > 0) return tabella;
  }
  return null;
}

/** Calcola principale e bonus spettanti. Pura, testabile. */
function calcolaAccredito(purchase, pacchetti, pagatoEur) {
  const ricaricaScelta = r2(purchase.recharge_amount || purchase.received_amount);
  const principale = r2(Math.min(pagatoEur, ricaricaScelta));
  const note = [];

  if (pagatoEur + 0.01 < ricaricaScelta) {
    note.push(`incassati ${pagatoEur.toFixed(2)} EUR su ${ricaricaScelta.toFixed(2)} EUR della ricarica`);
  }
  if (pagatoEur > ricaricaScelta + 0.01) {
    note.push(`incassati ${pagatoEur.toFixed(2)} EUR per una ricarica da ${ricaricaScelta.toFixed(2)} EUR: eccedenza da restituire`);
  }

  let bonus = 0;
  let bonusPercentuale = 0;
  const pacchetto = pacchetti.find(p => p.id === purchase.package_id)
    || pacchetti.find(p => Math.abs(p.rechargeAmount - ricaricaScelta) < 0.01);
  if (!pacchetto) {
    if (r2(purchase.received_amount) > ricaricaScelta) note.push('pacchetto non trovato nel CMS: bonus non accreditato');
  } else if (Math.abs(pacchetto.rechargeAmount - pagatoEur) >= 0.01) {
    if (r2(purchase.received_amount) > ricaricaScelta) note.push(`incasso diverso dal prezzo del pacchetto ${pacchetto.id}: bonus non accreditato`);
  } else {
    bonus = r2(pacchetto.receivedAmount - pacchetto.rechargeAmount);
    bonusPercentuale = pacchetto.bonusPercentage;
  }

  return { principale, bonus, bonusPercentuale, nota: note.join('; ') || null };
}

/**
 * @param importoCents quanto Nexi ha incassato; se assente lo si chiede a Nexi.
 * @returns { vinta, gia, principale, bonus, nota }
 */
async function finalizzaRicarica(supabase, purchase, { importoCents } = {}) {
  const giaChiusa = ['succeeded', 'completed', 'paid'].includes(String(purchase.payment_status || '').toLowerCase());
  if (giaChiusa) return { vinta: false, gia: true };

  // 29/09/2026 (revisione indipendente) — un ordine Nexi pagato vale per UNA
  // sola ricarica, e solo per chi l'ha pagato. Prima il cliente poteva
  // scrivere nella propria riga 'pending' il numero di un ordine gia' pagato
  // (suo, gia' accreditato, o di un altro cliente) e farsi accreditare di nuovo.
  const ordineId = String(purchase.nexi_order_id || '');
  if (!/^[A-Za-z0-9]{6,50}$/.test(ordineId)) {
    return { vinta: false, gia: false, nonPagata: true, reason: 'ordine_non_valido' };
  }
  const usato = await ordineGiaUsato(supabase, ordineId, purchase.id);
  if (usato) {
    console.warn(`[ricaricaWallet] ordine ${ordineId} gia' usato da ${usato}: ricarica ${purchase.id} rifiutata`);
    return { vinta: false, gia: false, nonPagata: true, reason: 'ordine_gia_usato' };
  }

  let cents = Number(importoCents || 0);
  if (!(cents > 0)) {
    const ordine = await leggiOrdineNexi(ordineId);
    if (!ordine.paid) return { vinta: false, gia: false, nonPagata: true, reason: ordine.reason };
    // L'email dell'ordine (quella scritta nel modulo di ricarica) deve essere
    // quella dell'account o quella della sua scheda cliente.
    const { data: account } = await supabase.auth.admin.getUserById(purchase.user_id);
    const { data: scheda } = await supabase.from('customers_extended').select('email').eq('user_id', purchase.user_id);
    const emailValide = new Set(
      [account && account.user && account.user.email, ...((scheda || []).map((r) => r.email))]
        .filter(Boolean).map((e) => String(e).toLowerCase().trim())
    );
    if (!ordine.clienteOrdine || !emailValide.has(ordine.clienteOrdine)) {
      console.warn(`[ricaricaWallet] ordine ${ordineId} di "${ordine.clienteOrdine}", ricarica di un altro account: rifiutata`);
      return { vinta: false, gia: false, nonPagata: true, reason: 'ordine_di_un_altro_cliente' };
    }
    cents = ordine.importoCents;
  }
  const pagatoEur = r2(cents / 100);
  if (!(pagatoEur > 0)) return { vinta: false, gia: false, nonPagata: true, reason: 'importo_zero' };

  const pacchetti = await pacchettiDalCms(supabase);
  const { principale, bonus, bonusPercentuale, nota } = calcolaAccredito(purchase, pacchetti, pagatoEur);

  const accredita = async (importo, descrizione, tipo) => {
    if (!(importo > 0)) return;
    const { data, error } = await supabase.rpc('add_credits', {
      p_user_id: purchase.user_id,
      p_amount: importo,
      p_description: descrizione,
      p_reference_id: purchase.id,
      p_reference_type: tipo,
    });
    const esito = Array.isArray(data) ? data[0] : data;
    if (error || !esito || esito.success === false) {
      throw new Error(`accredito ${tipo} fallito: ${(error && error.message) || (esito && esito.error_message) || 'sconosciuto'}`);
    }
  };

  // Prima l'accredito, poi la riga: add_credits non accredita due volte la
  // stessa (ricarica, tipo), quindi se qualcosa si ferma a meta' un nuovo
  // tentativo completa senza raddoppiare. Al contrario, una riga gia'
  // "succeeded" senza accredito non verrebbe mai piu' ripresa.
  // PRINCIPALE = pagato con carta; BONUS pacchetto a parte (niente interessi).
  await accredita(principale, `Ricarica ${purchase.package_name} (€${principale.toFixed(2)})`, 'wallet_purchase');
  if (bonus > 0) {
    await accredita(bonus, `Bonus ricarica ${bonusPercentuale}% (€${bonus.toFixed(2)})`, 'wallet_package_bonus');
  }

  // Chi vince l'update condizionale fa gli effetti successivi (avvisi,
  // cashback); l'altro percorso li trova gia' fatti.
  const { data: vinta, error: upErr } = await supabase
    .from('credit_wallet_purchases')
    .update({
      payment_status: 'succeeded',
      payment_completed_at: new Date().toISOString(),
      recharge_amount: principale,
      received_amount: r2(principale + bonus),
      bonus_amount: bonus,
      bonus_percentage: bonusPercentuale,
      ...(nota ? { payment_error_message: `Controllo importi: ${nota}` } : {}),
    })
    .eq('id', purchase.id)
    .not('payment_status', 'in', '("succeeded","completed","paid")')
    .select()
    .maybeSingle();
  if (upErr) throw new Error(`aggiornamento ricarica fallito: ${upErr.message}`);
  if (!vinta) return { vinta: false, gia: true, principale, bonus, nota };

  if (nota) console.warn(`[ricaricaWallet] ricarica ${purchase.id}: ${nota}`);
  return { vinta: true, gia: false, principale, bonus, nota, purchase: vinta };
}

module.exports = { finalizzaRicarica, calcolaAccredito, pacchettiDalCms };

/**
 * Codici "No Cauzione" (25/10/2026).
 *
 * Il cliente chiede la formula senza cauzione dal sito: nasce un codice
 * personale che arriva SOLO a Valerio. Se approva, lo gira al cliente, che lo
 * inserisce nel wizard e prenota pagando normalmente senza cauzione.
 *
 * I codici stanno in discount_codes con scope ['no_cauzione'] e valore 0:
 * nessun servizio ha quello scope, quindi come codice sconto non valgono
 * niente (validate-discount-code e prevendite li rifiutano). Sono legati
 * all'email dell'account che ha fatto la richiesta, valgono 7 giorni e una
 * sola prenotazione. Valerio li vede e li disattiva dalla tab Codici Sconto.
 */
const crypto = require('crypto');

const SCOPE = 'no_cauzione';
const VALIDITA_GIORNI = 7;
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generaCodice() {
  const pezzo = () => Array.from(crypto.randomBytes(4), b => ALFABETO[b % ALFABETO.length]).join('');
  return `NC-${pezzo()}-${pezzo()}`;
}

function normalizza(codice) {
  return String(codice || '').toUpperCase().replace(/\s/g, '');
}

function eNoCauzione(riga) {
  const scope = Array.isArray(riga && riga.scope) ? riga.scope : [];
  return scope.map(s => String(s).toLowerCase()).includes(SCOPE);
}

/** Il codice vale per questo account adesso? Non lo consuma. */
async function leggiCodiceValido(supabase, codice, email) {
  const { data: riga, error } = await supabase
    .from('discount_codes')
    .select('id, code, scope, status, valid_until, customer_email, single_use')
    .eq('code', normalizza(codice))
    .maybeSingle();
  if (error) throw error;
  if (!riga || !eNoCauzione(riga)) return { ok: false, errore: 'Codice non valido.' };
  if (riga.status !== 'active') return { ok: false, errore: 'Questo codice non e\' piu\' valido.' };
  if (riga.valid_until && new Date(riga.valid_until) < new Date()) return { ok: false, errore: 'Questo codice e\' scaduto.' };
  const emailAccount = String(email || '').toLowerCase().trim();
  if (!emailAccount || String(riga.customer_email || '').toLowerCase().trim() !== emailAccount) {
    return { ok: false, errore: 'Questo codice e\' riservato a un altro cliente.' };
  }
  const { count } = await supabase
    .from('discount_code_usages')
    .select('id', { count: 'exact', head: true })
    .eq('discount_code_id', riga.id);
  if ((count || 0) > 0) return { ok: false, errore: 'Questo codice e\' gia\' stato utilizzato.' };
  return { ok: true, riga };
}

/** Consuma il codice per una prenotazione. Idempotente sulla stessa prenotazione. */
async function segnaUsato(supabase, codice, bookingId, nomeCliente) {
  const { data: riga } = await supabase
    .from('discount_codes')
    .select('id, scope')
    .eq('code', normalizza(codice))
    .maybeSingle();
  if (!riga || !eNoCauzione(riga)) return false;
  const { count } = await supabase
    .from('discount_code_usages')
    .select('id', { count: 'exact', head: true })
    .eq('discount_code_id', riga.id);
  if ((count || 0) === 0) {
    const { error } = await supabase.from('discount_code_usages').insert({
      discount_code_id: riga.id,
      customer_name: nomeCliente || null,
      service_type: SCOPE,
      booking_id: bookingId || null,
      discount_applied: 0,
    });
    if (error) console.error('[codiceNoCauzione] registrazione uso fallita:', error.message);
  }
  await supabase.from('discount_codes').update({ status: 'deactivated' }).eq('id', riga.id);
  return true;
}

module.exports = { SCOPE, VALIDITA_GIORNI, generaCodice, normalizza, leggiCodiceValido, segnaUsato };

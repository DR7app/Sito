/**
 * Contratto dell'auto di cortesia (25/11/2026, direzione).
 *
 * Chi prenota un lavaggio con "Vivi l'attesa in grande stile" guida un'auto
 * della flotta: serve un contratto firmato come per un noleggio. La riga
 * ombra (service_type 'rental', booking_details.is_supercar_experience_block)
 * nasce quando il lavaggio e' pagato; qui si genera il suo contratto e si
 * manda la firma al cliente, come nexi-callback fa per un noleggio.
 *
 * Una volta sola: se la riga ombra ha gia' un contratto non si rifa nulla.
 * Non solleva mai: un errore si scrive nel log, il lavaggio resta valido.
 */
const ADMIN_URL = process.env.ADMIN_URL || 'https://platform.dr7ai.com';

async function inviaContrattoCortesia(supabase, shadowBookingId) {
  if (!shadowBookingId) return { ok: false, motivo: 'nessuna riga ombra' };
  try {
    const { data: ombra } = await supabase
      .from('bookings')
      .select('id, status, booking_details')
      .eq('id', shadowBookingId)
      .maybeSingle();
    if (!ombra || !(ombra.booking_details && ombra.booking_details.is_supercar_experience_block)) {
      return { ok: false, motivo: 'riga ombra non trovata' };
    }
    if (['cancelled', 'annullata'].includes(String(ombra.status || ''))) return { ok: false, motivo: 'annullata' };

    const { data: esistente } = await supabase
      .from('contracts').select('id').eq('booking_id', shadowBookingId).limit(1).maybeSingle();
    if (esistente && esistente.id) return { ok: true, motivo: 'contratto gia presente', contractId: esistente.id };

    const genRes = await fetch(`${ADMIN_URL}/.netlify/functions/generate-contract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: shadowBookingId }),
    });
    const gen = await genRes.json().catch(() => ({}));
    if (!genRes.ok || !gen.success) {
      console.error('[contrattoCortesia] generate-contract non riuscito:', genRes.status, gen.error || gen);
      return { ok: false, motivo: gen.error || 'generazione non riuscita' };
    }
    const { data: contratto } = await supabase
      .from('contracts').select('id').eq('booking_id', shadowBookingId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!contratto || !contratto.id) return { ok: true, motivo: 'contratto senza riga', firma: false };

    const sigRes = await fetch(`${ADMIN_URL}/.netlify/functions/signature-init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contractId: contratto.id, bookingId: shadowBookingId }),
    });
    if (!sigRes.ok) console.error('[contrattoCortesia] signature-init non riuscito:', sigRes.status);
    return { ok: true, contractId: contratto.id, firma: sigRes.ok };
  } catch (e) {
    console.error('[contrattoCortesia] errore:', e);
    return { ok: false, motivo: String(e && e.message || e) };
  }
}

module.exports = { inviaContrattoCortesia };

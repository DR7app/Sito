/**
 * 19/11/2026: controllo server del preavviso minimo (Centralina Pro) prima di
 * creare il pagamento Nexi di un noleggio dal sito. Il wizard gia' impedisce
 * la scelta; questo evita che una pagina vecchia o una richiesta a mano
 * faccia pagare un bouquet di rose per fra un'ora.
 *
 * Regole come utils/preavvisoServizi.ts (sito) e src/utils/preavvisoServizi.ts (admin):
 * servizi.experience[].preavviso_ore e servizi.delivery.preavviso_ore, ore prima del ritiro
 * (consegna) o della riconsegna (ritiro a domicilio). 0/assente = nessun limite.
 *
 * Fail-open: se la lettura fallisce si lascia passare (il pagamento non deve
 * fermarsi per un problema di rete), ma si scrive nel log.
 */
const { createClient } = require('@supabase/supabase-js');

function etichetta(ore) {
  const h = Number(ore) || 0;
  if (h === 720) return '1 mese';
  if (h % 168 === 0) { const w = h / 168; return `${w} settiman${w > 1 ? 'e' : 'a'}`; }
  if (h > 24 && h % 24 === 0) return `${h / 24} giorni`;
  return `${h} or${h > 1 ? 'e' : 'a'}`;
}

function troppoVicino(ore, quando, adesso) {
  const h = Number(ore) || 0;
  if (h <= 0 || !quando) return false;
  const t = new Date(quando).getTime();
  if (!Number.isFinite(t)) return false;
  return t - adesso < h * 3600000;
}

/** Ritorna il testo dell'errore da mostrare al cliente, oppure null se va bene. */
async function errorePreavvisoOrdine(orderId) {
  try {
    const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key || !orderId) return null;
    const sb = createClient(url, key);
    const { data: pend } = await sb.from('pending_nexi_bookings').select('booking_data').eq('nexi_order_id', orderId).maybeSingle();
    const b = pend && pend.booking_data;
    if (!b || !b.pickup_date) return null;
    const scelti = Object.entries((b.booking_details && b.booking_details.experience_services) || {}).filter(([, q]) => Number(q) > 0);
    const domicilio = b.pickup_location === 'home_delivery' || b.dropoff_location === 'home_delivery';
    if (!scelti.length && !domicilio) return null;

    const { data: cfgRow } = await sb.from('centralina_pro_config').select('config').eq('id', 'main').maybeSingle();
    const servizi = (cfgRow && cfgRow.config && cfgRow.config.servizi) || {};
    const adesso = Date.now();

    for (const [id] of scelti) {
      const svc = (servizi.experience || []).find((s) => s && s.id === id);
      if (svc && troppoVicino(svc.preavviso_ore, b.pickup_date, adesso)) {
        return `${svc.name || 'Questo servizio'} va prenotato con almeno ${etichetta(svc.preavviso_ore)} di preavviso sul ritiro. Toglilo o scegli un ritiro piu' avanti.`;
      }
    }
    const oreDom = servizi.delivery && servizi.delivery.preavviso_ore;
    if (b.pickup_location === 'home_delivery' && troppoVicino(oreDom, b.pickup_date, adesso)) {
      return `La consegna a domicilio va prenotata con almeno ${etichetta(oreDom)} di preavviso.`;
    }
    if (b.dropoff_location === 'home_delivery' && troppoVicino(oreDom, b.dropoff_date, adesso)) {
      return `Il ritiro a domicilio va prenotato con almeno ${etichetta(oreDom)} di preavviso.`;
    }
    return null;
  } catch (e) {
    console.error('[preavviso] controllo non eseguito:', e && e.message);
    return null;
  }
}

module.exports = { errorePreavvisoOrdine };

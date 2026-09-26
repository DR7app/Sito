// Interruttori del System Control, versione CommonJS per le funzioni .js.
// Stessa logica di systemControl.ts (tenerle allineate): in caso di dubbio
// la funzione resta ACCESA.
const { createClient } = require('@supabase/supabase-js');

let client = null;
function db() {
  if (client) return client;
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

const CACHE_MS = 30000;
const cache = new Map();

async function leggi(chiave, business) {
  const sb = db();
  if (!sb) return { attiva: true, manutenzione: false };
  try {
    const { data, error } = await sb.from('sc_flags')
      .select('chiave, business, attiva, manutenzione, messaggio')
      .eq('chiave', chiave).in('business', [business, '*']);
    if (error) return { attiva: true, manutenzione: false };
    const righe = data || [];
    const spenta = righe.find(r => r.attiva === false);
    const inManutenzione = righe.find(r => r.manutenzione === true);
    return { attiva: !spenta, manutenzione: !!inManutenzione, messaggio: (spenta || inManutenzione)?.messaggio || null };
  } catch { return { attiva: true, manutenzione: false }; }
}

async function statoFunzione(chiave, business = '*') {
  const k = `${chiave}|${business}`;
  const c = cache.get(k);
  if (c && Date.now() - c.at < CACHE_MS) return c.stato;
  const stato = await leggi(chiave, business);
  cache.set(k, { at: Date.now(), stato });
  return stato;
}

function businessDaServiceType(serviceType) {
  const st = String(serviceType || '').toLowerCase();
  if (!st) return '*';
  if (st === 'boat_rental') return 'mare';
  if (st === 'heli_rental') return 'aria';
  if (st === 'stay_rental') return 'soggiorni';
  if (st === 'car_wash' || st.startsWith('mechanical')) return 'lavaggio';
  return 'terra';
}

async function funzioneFerma(chiave, business = '*') {
  const [f, g] = await Promise.all([statoFunzione(chiave, business), statoFunzione('gestionale', business)]);
  const ferma = !f.attiva || f.manutenzione ? f : !g.attiva || g.manutenzione ? g : null;
  if (!ferma) return null;
  return ferma.messaggio
    || (ferma.manutenzione
      ? 'Servizio momentaneamente in manutenzione. Riprova piu tardi o contattaci.'
      : 'Servizio momentaneamente sospeso. Riprova piu tardi o contattaci.');
}

module.exports = { statoFunzione, funzioneFerma, businessDaServiceType };

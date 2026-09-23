import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

/**
 * I numeri pubblici di DR7 (Home, Business, Investitori) presi dal
 * gestionale invece che scritti a mano: salgono da soli man mano che
 * arrivano contratti, clienti e incassi.
 *
 * Restituisce SOLO totali: nessun nome, email, targa o importo singolo.
 * Cache CDN di 5 minuti: la pagina non interroga il database a ogni visita.
 *
 * Esclusi i test interni (targhe TEST*, veicolo "test", admin@dr7.app).
 */

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { persistSession: false } },
);

const PAGATO = ['paid', 'completed', 'succeeded'];
const ANNULLATO = ['cancelled', 'canceled', 'annullata'];

function diProva(b: { vehicle_plate?: string | null; vehicle_name?: string | null; customer_email?: string | null }): boolean {
  const targa = String(b.vehicle_plate || '').toUpperCase();
  if (targa.startsWith('TEST')) return true;
  if (String(b.vehicle_name || '').trim().toLowerCase() === 'test') return true;
  return String(b.customer_email || '').trim().toLowerCase() === 'admin@dr7.app';
}

async function contaEsatto(tabella: string, filtro?: (q: any) => any): Promise<number> {
  let q = supabase.from(tabella).select('id', { count: 'exact', head: true });
  if (filtro) q = filtro(q);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

/** Incassato totale delle prenotazioni: pagate per intero + acconti dei parziali. */
async function incassatoPrenotazioni(): Promise<number> {
  let totale = 0;
  for (let da = 0; ; da += 1000) {
    const { data, error } = await supabase
      .from('bookings')
      .select('price_total, payment_status, status, vehicle_plate, vehicle_name, customer_email, amount_paid:booking_details->>amountPaid')
      .order('created_at', { ascending: true })
      .range(da, da + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const b of data as any[]) {
      if (ANNULLATO.includes(String(b.status || '').toLowerCase())) continue;
      if (diProva(b)) continue;
      const ps = String(b.payment_status || '').toLowerCase();
      const prezzo = (typeof b.price_total === 'string' ? parseFloat(b.price_total) : Number(b.price_total || 0)) / 100;
      if (PAGATO.includes(ps)) totale += prezzo;
      else if (ps === 'partial') totale += (Number(b.amount_paid) || 0) / 100;
    }
    if (data.length < 1000) break;
  }
  return Math.round(totale);
}

export const handler: Handler = async () => {
  try {
    const [contratti, contrattiFirmati, clienti, fatturato] = await Promise.all([
      contaEsatto('contracts'),
      contaEsatto('contracts', q => q.not('signed_pdf_url', 'is', null)),
      contaEsatto('customers_extended'),
      incassatoPrenotazioni(),
    ]);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=60',
        'Netlify-CDN-Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
      },
      body: JSON.stringify({ contratti, contrattiFirmati, clienti, fatturato, aggiornato: new Date().toISOString() }),
    };
  } catch (e) {
    console.error('[numeri-dr7]', e);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'numeri non disponibili' }) };
  }
};

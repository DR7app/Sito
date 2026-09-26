import { supabase } from '../supabaseClient';

/**
 * PROMOZIONI PRENOTABILI — 26/09/2026
 *
 * Una promozione e' un PREZZO AL GIORNO speciale su uno o piu' veicoli, in una
 * finestra di date e con posti limitati. A differenza della prevendita (che si
 * compra oggi e si usa dopo) la promozione si PRENOTA subito dal wizard.
 *
 * Cambia solo il prezzo dei giorni di noleggio: cauzione, assicurazione, km ed
 * extra seguono le regole di una prenotazione normale (dipendono dalla Fascia
 * e dalla residenza del cliente, non dall'offerta).
 *
 * L'autorita' e' il database: il trigger trg_01_promozione_valida su bookings
 * rifiuta ogni prenotazione promo fuori regola (date, veicolo, giorni, posti,
 * prezzo). Qui si fanno gli stessi calcoli solo per mostrare subito il prezzo
 * giusto e dire al cliente cosa non va.
 */

export * from './promozioniCalcolo';
import { promozioneVisibile, type Promozione } from './promozioniCalcolo';

// ── Lettura dal database ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizza(r: any, postiUsati: number | null): Promozione {
  const posti = r.posti_totali == null ? null : Number(r.posti_totali);
  return {
    ...r,
    foto_urls: Array.isArray(r.foto_urls) ? r.foto_urls.filter(Boolean) : [],
    veicoli: Array.isArray(r.veicoli) ? r.veicoli : [],
    prezzo_giorno: Number(r.prezzo_giorno) || 0,
    prezzo_listino_giorno: r.prezzo_listino_giorno == null ? null : Number(r.prezzo_listino_giorno),
    posti_totali: posti,
    posti_residui: posti === null ? null : Math.max(0, posti - (postiUsati || 0)),
  };
}

async function postiUsati(id: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('promozione_posti_usati', { p_promo_id: id });
  if (error) return null;
  return Number(data) || 0;
}

/** Promozioni in vetrina: attive, visibili adesso, con posti, non finite. */
export async function getCatalogoPromozioni(): Promise<Promozione[]> {
  const { data, error } = await supabase
    .from('promozioni')
    .select('*')
    .eq('attiva', true)
    .eq('visibile_sito', true)
    .order('ordine', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) {
    // Tabella non ancora creata o lettura fallita: la pagina mostra solo le prevendite.
    console.error('[promozioni] catalogo non caricato:', error.message);
    return [];
  }
  const righe = data || [];
  const usati = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    righe.map((r: any) => (r.posti_totali == null ? Promise.resolve(0) : postiUsati(r.id))),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return righe.map((r: any, i: number) => normalizza(r, usati[i])).filter(p => promozioneVisibile(p));
}

export async function getPromozione(id: string): Promise<Promozione | null> {
  const { data, error } = await supabase.from('promozioni').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  const usati = data.posti_totali == null ? 0 : await postiUsati(id);
  return normalizza(data, usati);
}

export interface EsitoVerificaPromo {
  ok: boolean;
  errore?: string;
  noleggioCents?: number;
  postiResidui?: number | null;
}

/**
 * Il verdetto del database per queste date e questo veicolo: stessi controlli
 * del trigger, senza bloccare niente. Il sito lo mostra PRIMA del pagamento.
 */
export async function verificaPromozione(
  promoId: string,
  vehicleId: string | null,
  ritiroIso: string,
  riconsegnaIso: string,
  giorni: number,
): Promise<EsitoVerificaPromo> {
  const { data, error } = await supabase.rpc('promozione_verifica', {
    p_promo_id: promoId,
    p_vehicle_id: vehicleId,
    p_ritiro: ritiroIso,
    p_riconsegna: riconsegnaIso,
    p_giorni: giorni,
  });
  if (error) {
    // Verifica non raggiungibile: si lascia decidere al database all'invio.
    console.warn('[promozioni] verifica non riuscita:', error.message);
    return { ok: true };
  }
  const esito = (data || {}) as { ok?: boolean; errore?: string; noleggio_cents?: number; posti_residui?: number | null };
  return {
    ok: !!esito.ok,
    errore: esito.errore,
    noleggioCents: esito.noleggio_cents == null ? undefined : Number(esito.noleggio_cents),
    postiResidui: esito.posti_residui ?? null,
  };
}

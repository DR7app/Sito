/**
 * Promozioni prenotabili — calcoli puri, senza dipendenze (26/09/2026).
 * Separati da utils/promozioni.ts cosi' i test (node --test) li caricano senza
 * il client Supabase. Vedi utils/promozioni.ts per il quadro completo.
 */

export interface VeicoloPromozione {
  id: string;
  nome: string;
  targa?: string | null;
}

export interface Promozione {
  id: string;
  titolo: string;
  titolo_en: string | null;
  descrizione: string | null;
  descrizione_en: string | null;
  foto_urls: string[];
  business: string;
  veicoli: VeicoloPromozione[];
  prezzo_giorno: number;
  prezzo_listino_giorno: number | null;
  /** YYYY-MM-DD */
  noleggio_dal: string;
  /** YYYY-MM-DD */
  noleggio_al: string;
  min_giorni: number | null;
  max_giorni: number | null;
  visibile_dal: string | null;
  visibile_al: string | null;
  posti_totali: number | null;
  attiva: boolean;
  visibile_sito: boolean;
  ordine: number;
  /** Calcolato: posti ancora liberi (null = illimitati). */
  posti_residui: number | null;
}

/** Quello che la prenotazione porta con se' in booking_details. */
export interface DettagliPromo {
  promo_id: string;
  promo_titolo: string;
  promo_prezzo_giorno: number;
  promo_giorni: number;
  promo_noleggio_cents: number;
}


/**
 * Prezzo dei giorni di noleggio, in centesimi. Stessa formula del database
 * (round(prezzo_giorno * 100) * giorni): se cambia qui cambia anche la
 * funzione promozione_verifica, altrimenti il trigger rifiuta la prenotazione.
 */
export function noleggioPromoCents(prezzoGiorno: number, giorni: number): number {
  const g = Math.max(1, Math.floor(Number(giorni) || 0));
  return Math.round((Number(prezzoGiorno) || 0) * 100) * g;
}

/** Il noleggio (date YYYY-MM-DD) sta dentro la finestra della promozione? */
export function dateDentroFinestra(
  promo: Pick<Promozione, 'noleggio_dal' | 'noleggio_al'>,
  ritiro: string,
  riconsegna: string,
): boolean {
  if (!ritiro || !riconsegna) return false;
  return ritiro >= promo.noleggio_dal && riconsegna <= promo.noleggio_al && riconsegna >= ritiro;
}

/** Oggi (Europe/Rome) in formato YYYY-MM-DD. */
export function oggiRoma(ora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(ora);
}

/** Primo giorno prenotabile: il piu' tardi fra oggi e l'inizio della promo. */
export function primoGiornoPrenotabile(promo: Pick<Promozione, 'noleggio_dal'>, oggi: string = oggiRoma()): string {
  return promo.noleggio_dal > oggi ? promo.noleggio_dal : oggi;
}

/** Aggiunge giorni a una data YYYY-MM-DD (senza problemi di fuso). */
export function aggiungiGiorni(data: string, giorni: number): string {
  const [a, m, g] = data.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, g + giorni));
  return d.toISOString().slice(0, 10);
}

/** La promozione e' da mostrare adesso? (attiva, nel periodo di visibilita', con posti, non finita) */
export function promozioneVisibile(p: Promozione, ora: Date = new Date()): boolean {
  if (!p.attiva || !p.visibile_sito) return false;
  if (p.visibile_dal && new Date(p.visibile_dal) > ora) return false;
  if (p.visibile_al && new Date(p.visibile_al) < ora) return false;
  if (p.noleggio_al < oggiRoma(ora)) return false;
  if (p.posti_residui !== null && p.posti_residui <= 0) return false;
  if (!p.veicoli.length) return false;
  return true;
}

/** dd/mm/yyyy da YYYY-MM-DD. */
export function dataIt(iso: string): string {
  const [a, m, g] = (iso || '').split('-');
  return a && m && g ? `${g}/${m}/${a}` : iso;
}

export function dettagliPromo(p: Pick<Promozione, 'id' | 'titolo' | 'prezzo_giorno'>, giorni: number): DettagliPromo {
  const g = Math.max(1, Math.floor(Number(giorni) || 0));
  return {
    promo_id: p.id,
    promo_titolo: p.titolo,
    promo_prezzo_giorno: Number(p.prezzo_giorno) || 0,
    promo_giorni: g,
    promo_noleggio_cents: noleggioPromoCents(p.prezzo_giorno, g),
  };
}


/** Il minimo che serve di un gruppo di veicoli del sito (useVehicles). */
export interface GruppoVeicoli {
  id: string;
  vehicleIds?: string[];
  displayNames?: string[];
  plates?: string[];
}

/**
 * Restringe un gruppo di auto uguali ai soli veicoli della promozione.
 *
 * Il wizard sceglie da solo la targa libera dentro al gruppo: dandogli solo
 * le targhe in promo, la prenotazione cade sempre su un veicolo valido per il
 * trigger del database. null se il gruppo non contiene veicoli della promo.
 */
export function restringiGruppoAPromo<T extends GruppoVeicoli>(item: T, idsPromo: string[]): T | null {
  const ids = item.vehicleIds && item.vehicleIds.length
    ? item.vehicleIds
    : [String(item.id).replace('car-', '')];
  const tieni = ids.map((id, i) => ({ id, i })).filter(x => idsPromo.includes(x.id));
  if (!tieni.length) return null;
  return {
    ...item,
    id: `car-${tieni[0].id}`,
    vehicleIds: tieni.map(x => x.id),
    displayNames: item.displayNames ? tieni.map(x => item.displayNames![x.i]) : undefined,
    plates: item.plates ? tieni.map(x => item.plates![x.i] ?? '') : undefined,
  };
}

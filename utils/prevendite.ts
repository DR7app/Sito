import { supabase } from '../supabaseClient';
import { testoFisso } from './testiSito';

/**
 * PREVENDITE DR7 — 14/09/2026
 *
 * Una prevendita e' un pacchetto di utilizzi gia' pagati: il cliente compra
 * oggi (es. "Ferrari 296 GTB - 10 Experience", 10 utilizzi, 100 km ciascuno,
 * 12 mesi) e guida quando vuole. Quando prenota sceglie "Usa prevendita":
 * l'auto, i km del pacchetto e l'assicurazione prevista valgono €0 e paga solo
 * gli extra che aggiunge.
 *
 * I vincoli (utilizzi al mese, giorni consecutivi, scadenza, veicoli ammessi)
 * li scrive la direzione nel gestionale e li controlla il database: le funzioni
 * `prevendita_verifica` e `prevendita_usa` sono l'unica autorita'. Qui si fanno
 * anche i controlli lato browser, ma solo per dare subito la risposta giusta —
 * non sono loro a decidere.
 */

export interface VeicoloPrevendita {
  id: string;
  nome: string;
  targa?: string | null;
}

/** Riga del catalogo, quello che il sito mette in vendita. */
export interface Prevendita {
  id: string;
  nome: string;
  descrizione: string | null;
  foto_url: string | null;
  prezzo: number;
  prezzo_listino: number | null;
  utilizzi_inclusi: number;
  veicoli: VeicoloPrevendita[];
  km_inclusi: number;
  assicurazione_inclusa: string | null;
  validita_mesi: number;
  max_utilizzi_mese: number | null;
  max_giorni_consecutivi: number | null;
  regole_extra: string | null;
  posti_totali: number | null;
  posti_venduti: number;
  attiva: boolean;
  visibile_sito: boolean;
  ordine: number;
}

/** Pacchetto acquistato: porta con se' le condizioni pagate quel giorno. */
export interface PrevenditaCliente {
  id: string;
  prevendita_id: string | null;
  user_id: string | null;
  customer_email: string | null;
  nome: string;
  foto_url: string | null;
  prezzo_pagato: number;
  utilizzi_iniziali: number;
  utilizzi_usati: number;
  veicoli: VeicoloPrevendita[];
  km_inclusi: number;
  assicurazione_inclusa: string | null;
  max_utilizzi_mese: number | null;
  max_giorni_consecutivi: number | null;
  regole_extra: string | null;
  data_acquisto: string;
  data_scadenza: string | null;
  stato: 'attiva' | 'terminata' | 'scaduta' | 'bloccata';
  payment_status: string;
}

export interface MovimentoPrevendita {
  id: string;
  prevendita_cliente_id: string;
  booking_id: string | null;
  tipo: 'scalo' | 'ripristino' | 'rettifica';
  quantita: number;
  data_inizio: string | null;
  data_fine: string | null;
  giorni: number | null;
  veicolo_nome: string | null;
  annullato: boolean;
  created_at: string;
}

export interface ImpostazioniPrevendite {
  popup_attivo: boolean;
  popup_titolo: string;
  popup_sottotitolo: string;
  popup_testo: string;
  popup_nota: string;
  popup_cta: string;
  popup_giorni_ricomparsa: number;
  pagina_titolo: string;
  pagina_sottotitolo: string;
}

export const IMPOSTAZIONI_DEFAULT: ImpostazioniPrevendite = {
  popup_attivo: false,
  popup_titolo: 'PREVENDITE DR7',
  popup_sottotitolo: 'Acquista oggi. Guida quando vuoi nei prossimi 12 mesi.',
  popup_testo: 'Offerte esclusive con vantaggi fino al 90% rispetto alle tariffe ordinarie.',
  popup_nota: 'Disponibilita’ limitata.',
  popup_cta: 'SCOPRI E ACQUISTA',
  popup_giorni_ricomparsa: 7,
  pagina_titolo: 'PREVENDITE DR7',
  pagina_sottotitolo: 'Acquista oggi. Guida quando vuoi nei prossimi 12 mesi.',
};

const PAGATO = ['paid', 'completed', 'succeeded'];

/** Catalogo in vendita sul sito. */
export async function getCatalogoPrevendite(): Promise<Prevendita[]> {
  const { data, error } = await supabase
    .from('prevendite')
    .select('*')
    .eq('attiva', true)
    .eq('visibile_sito', true)
    .order('ordine', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[prevendite] catalogo non caricato:', error.message);
    return [];
  }
  return (data || []).map(normalizzaCatalogo);
}

export async function getPrevendita(id: string): Promise<Prevendita | null> {
  const { data } = await supabase.from('prevendite').select('*').eq('id', id).maybeSingle();
  return data ? normalizzaCatalogo(data) : null;
}

export async function getImpostazioniPrevendite(): Promise<ImpostazioniPrevendite> {
  const { data } = await supabase.from('prevendite_settings').select('config').eq('id', 'main').maybeSingle();
  return { ...IMPOSTAZIONI_DEFAULT, ...((data?.config || {}) as Partial<ImpostazioniPrevendite>) };
}

/**
 * Le prevendite del cliente. Si cerca per user_id E per email: una prevendita
 * venduta allo sportello prima che il cliente si registrasse resta agganciata
 * solo all'email, e deve comparire lo stesso appena entra nel suo account.
 */
export async function getMiePrevendite(userId?: string | null, email?: string | null): Promise<PrevenditaCliente[]> {
  if (!userId && !email) return [];
  const filtri: string[] = [];
  if (userId) filtri.push(`user_id.eq.${userId}`);
  if (email) filtri.push(`customer_email.eq.${email}`);
  const { data, error } = await supabase
    .from('prevendite_clienti')
    .select('*')
    .or(filtri.join(','))
    .order('data_acquisto', { ascending: false });
  if (error) {
    console.error('[prevendite] pacchetti del cliente non caricati:', error.message);
    return [];
  }
  return (data || []).map(normalizzaPacchetto).filter(p => PAGATO.includes(p.payment_status));
}

export async function getMovimentiPrevendita(prevenditaClienteId: string): Promise<MovimentoPrevendita[]> {
  const { data } = await supabase
    .from('prevendite_movimenti')
    .select('*')
    .eq('prevendita_cliente_id', prevenditaClienteId)
    .order('created_at', { ascending: false });
  return (data || []) as MovimentoPrevendita[];
}

/** Stato reale: la scadenza passa da sola, senza aspettare nessun cron. */
export function statoPrevendita(pc: PrevenditaCliente): PrevenditaCliente['stato'] {
  if (pc.stato === 'bloccata') return 'bloccata';
  if (!PAGATO.includes(pc.payment_status)) return 'bloccata';
  if (pc.data_scadenza && new Date(pc.data_scadenza) < new Date()) return 'scaduta';
  if (pc.utilizzi_usati >= pc.utilizzi_iniziali) return 'terminata';
  return 'attiva';
}

export function utilizziResidui(pc: PrevenditaCliente): number {
  return Math.max(0, pc.utilizzi_iniziali - pc.utilizzi_usati);
}

/** Confronto nomi veicolo tollerante: "Ferrari 296 GTB" = "ferrari  296 gtb". */
function normalizzaNome(v: string | null | undefined): string {
  return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * La prevendita vale per questo veicolo?
 *
 * Si confronta prima per id (vehicles.id, quello che il gestionale salva), poi
 * per nome: le auto raggruppate sul sito espongono piu' id e chi crea il
 * pacchetto puo' averne scelto solo uno.
 */
export function valePerVeicolo(
  pc: PrevenditaCliente | Prevendita,
  vehicleIds: string[],
  vehicleName?: string | null,
): boolean {
  const veicoli = Array.isArray(pc.veicoli) ? pc.veicoli : [];
  if (veicoli.length === 0) return false;
  const ids = new Set(vehicleIds.filter(Boolean));
  if (veicoli.some(v => v.id && ids.has(v.id))) return true;
  const nome = normalizzaNome(vehicleName);
  if (!nome) return false;
  return veicoli.some(v => normalizzaNome(v.nome) === nome);
}

/**
 * Le prevendite spendibili SUBITO su questo veicolo: pagate, attive, con
 * utilizzi residui e non scadute. E' questa lista che decide se il pulsante
 * "Usa una prevendita" compare o no.
 */
export function prevenditeSpendibili(
  pacchetti: PrevenditaCliente[],
  vehicleIds: string[],
  vehicleName?: string | null,
): PrevenditaCliente[] {
  return pacchetti.filter(pc =>
    statoPrevendita(pc) === 'attiva' &&
    utilizziResidui(pc) > 0 &&
    valePerVeicolo(pc, vehicleIds, vehicleName),
  );
}

export interface EsitoVerifica {
  ok: boolean;
  errore?: string;
  stato?: string;
  utilizzi_residui?: number;
  giorni?: number;
  km_inclusi?: number;
  utilizzi_mese?: number;
}

/**
 * Controllo dei vincoli sul database, prima di lasciar proseguire. Le date
 * sono giorni (YYYY-MM-DD): i vincoli del pacchetto ragionano per giornate,
 * non per ore.
 */
export async function verificaPrevendita(
  prevenditaClienteId: string,
  dataInizio: string,
  dataFine: string,
  vehicleId?: string | null,
  veicoloNome?: string | null,
): Promise<EsitoVerifica> {
  const { data, error } = await supabase.rpc('prevendita_verifica', {
    p_prevendita_cliente_id: prevenditaClienteId,
    p_data_inizio: dataInizio,
    p_data_fine: dataFine,
    p_vehicle_id: vehicleId || null,
    p_veicolo_nome: veicoloNome || null,
  });
  if (error) {
    console.error('[prevendite] verifica non riuscita:', error.message);
    return { ok: false, errore: testoFisso({ it: 'Controllo della prevendita non riuscito, riprova', en: 'Pre-sale check failed, please try again' }) };
  }
  return (data || { ok: false, errore: 'Risposta vuota' }) as EsitoVerifica;
}

/**
 * Scala un utilizzo per una prenotazione. Idempotente sulla prenotazione: la
 * possono chiamare sia il browser sia il callback Nexi, l'utilizzo se ne va
 * una volta sola.
 */
export async function usaPrevendita(params: {
  prevenditaClienteId: string;
  bookingId: string;
  dataInizio: string;
  dataFine: string;
  vehicleId?: string | null;
  veicoloNome?: string | null;
}): Promise<EsitoVerifica> {
  const { data, error } = await supabase.rpc('prevendita_usa', {
    p_prevendita_cliente_id: params.prevenditaClienteId,
    p_booking_id: params.bookingId,
    p_data_inizio: params.dataInizio,
    p_data_fine: params.dataFine,
    p_vehicle_id: params.vehicleId || null,
    p_veicolo_nome: params.veicoloNome || null,
  });
  if (error) {
    console.error('[prevendite] scalo non riuscito:', error.message);
    return { ok: false, errore: error.message };
  }
  return (data || { ok: false }) as EsitoVerifica;
}

/** Giornate di noleggio fra due date (stesso giorno = 1). */
export function giorniTraDate(dataInizio: string, dataFine: string): number {
  const a = new Date(`${dataInizio}T00:00:00`);
  const b = new Date(`${dataFine}T00:00:00`);
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
  return Math.max(1, diff);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizzaCatalogo(r: any): Prevendita {
  return {
    ...r,
    prezzo: Number(r.prezzo) || 0,
    prezzo_listino: r.prezzo_listino == null ? null : Number(r.prezzo_listino),
    veicoli: Array.isArray(r.veicoli) ? r.veicoli : [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizzaPacchetto(r: any): PrevenditaCliente {
  return {
    ...r,
    prezzo_pagato: Number(r.prezzo_pagato) || 0,
    veicoli: Array.isArray(r.veicoli) ? r.veicoli : [],
  };
}

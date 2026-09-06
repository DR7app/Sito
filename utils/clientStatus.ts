/**
 * Status cliente lato sito — stessa configurazione dell'admin.
 *
 * Gli status vivono in Centralina Pro > Status Clienti e sono salvati in
 * `centralina_pro_config.config.client_status` (riga 'main'): nome, colore e
 * ordine sono personalizzabili e l'admin puo' crearne di propri oltre ai 4 di
 * sistema (standard / member / elite / blacklist).
 *
 * Fino a oggi il sito ignorava tutto questo: riconosceva SOLO 'elite' e
 * 'member', con etichette scritte a mano ("DR7 Elite", "DR7 Member"), e
 * qualsiasi altro valore — compreso uno status creato dall'admin — finiva in
 * "New Entry". Cambiare status dall'admin quindi non si vedeva sul sito.
 *
 * Qui si legge la stessa configurazione dell'admin: qualunque status assegnato
 * si vede sul sito con il nome e il colore impostati in Centralina.
 *
 * UNICA eccezione: la blacklist non si mostra mai al cliente — chi e' in
 * blacklist vede il badge dello status base. Anche `avviso` e `descrizione`
 * restano fuori: sono note per lo staff, non testi per il cliente.
 */
import { loadCentralinaConfigOnce } from './siteCopy';
import { supabase } from '../supabaseClient';

export const CLIENT_STATUS_CONFIG_KEY = 'client_status';

/** Status di sistema: esistono sempre, anche se non salvati in configurazione. */
export const BUILTIN_STATUS_KEYS = ['standard', 'member', 'elite', 'blacklist'] as const;

/** Lo status che il cliente non deve mai vedere. */
export const HIDDEN_STATUS_KEY = 'blacklist';

export interface ClientStatusDef {
  key: string;
  label: string;
  colore: string;
  ordine: number;
}

// Stessi default dell'admin (src/utils/clientStatusConfig.ts): finche' nessuno
// tocca la Centralina, sito e gestionale mostrano gli stessi nomi.
export const DEFAULT_CLIENT_STATUS: ClientStatusDef[] = [
  { key: 'standard', label: 'New entry', colore: 'emerald', ordine: 1 },
  { key: 'member', label: 'Member', colore: 'blue', ordine: 2 },
  { key: 'elite', label: 'Elite', colore: 'amber', ordine: 3 },
  { key: 'blacklist', label: 'Blacklist', colore: 'red', ordine: 4 },
];

/**
 * Classi del badge, per id colore della Centralina. Scritte per esteso: una
 * stringa composta a runtime il purge di Tailwind non la vedrebbe.
 * Bordo + testo, come il resto delle etichette del sito.
 */
const STATUS_STYLES: Record<string, string> = {
  gray: 'border-white/15 text-white/70',
  blue: 'border-blue-500/50 text-blue-300',
  emerald: 'border-emerald-500/50 text-emerald-300',
  amber: 'border-amber-500/50 text-amber-300',
  red: 'border-red-500/50 text-red-300',
  purple: 'border-purple-500/50 text-purple-300',
  gold: 'border-[#C9A96E]/50 text-[#D4B896]',
};

export function clientStatusClasses(colore: string | undefined): string {
  return STATUS_STYLES[colore || ''] || STATUS_STYLES.gray;
}

function withDefaults(raw: Partial<ClientStatusDef>, key: string): ClientStatusDef {
  const base = DEFAULT_CLIENT_STATUS.find(d => d.key === key)
    || { key, label: key, colore: 'gray', ordine: 99 };
  return {
    key,
    label: (raw.label ?? '').trim() || base.label,
    colore: STATUS_STYLES[raw.colore ?? ''] ? (raw.colore as string) : base.colore,
    ordine: typeof raw.ordine === 'number' ? raw.ordine : base.ordine,
  };
}

/** I 4 di sistema ci sono sempre, poi gli status creati dall'admin. */
export function normalizeClientStatus(raw: unknown): ClientStatusDef[] {
  const list = Array.isArray(raw) ? (raw as Partial<ClientStatusDef>[]) : [];
  const builtin = (BUILTIN_STATUS_KEYS as readonly string[])
    .map(key => withDefaults(list.find(r => r?.key === key) || {}, key));
  const custom = list
    .filter(r => typeof r?.key === 'string' && r.key.trim()
      && !(BUILTIN_STATUS_KEYS as readonly string[]).includes(r.key as string))
    .map(r => withDefaults(r, r.key as string));
  const seen = new Set<string>();
  return [...builtin, ...custom]
    .filter(d => (seen.has(d.key) ? false : (seen.add(d.key), true)))
    .sort((a, b) => a.ordine - b.ordine);
}

/** Configurazione status dalla Centralina (cache condivisa di siteCopy). */
export async function loadClientStatusDefs(): Promise<ClientStatusDef[]> {
  const { config } = await loadCentralinaConfigOnce();
  return normalizeClientStatus((config as Record<string, unknown>)[CLIENT_STATUS_CONFIG_KEY]);
}

/**
 * Come `loadClientStatusDefs`, ma senza passare dalla cache: la
 * configurazione viene riletta dal database.
 *
 * Serve ai refresh (rientro sulla pagina, notifica realtime): la cache di
 * `siteCopy` dura quanto la pagina, quindi una rinomina fatta in Centralina
 * mentre il cliente e' gia' sul sito non si vedrebbe fino a un ricaricamento.
 * In caso di errore si ricade sulla cache invece di svuotare il badge.
 */
export async function fetchClientStatusDefsFresh(): Promise<ClientStatusDef[]> {
  try {
    const { data, error } = await supabase
      .from('centralina_pro_config')
      .select('config')
      .eq('id', 'main')
      .maybeSingle();
    if (error) throw error;
    const cfg = (data?.config || {}) as Record<string, unknown>;
    return normalizeClientStatus(cfg[CLIENT_STATUS_CONFIG_KEY]);
  } catch (err) {
    console.warn('[clientStatus] rilettura configurazione fallita:', err);
    return loadClientStatusDefs();
  }
}

/**
 * Chiave status del cliente collegato, chiesta al server.
 *
 * NON si legge la tabella dal browser: le RLS di `customers_extended`
 * mostrano solo le righe con `user_id = auth.uid()`, mentre la scheda che
 * l'ufficio modifica dall'admin ha spesso soltanto l'email (nata da una
 * prenotazione o da una lead). Letta dal browser, quella scheda non esiste e
 * lo status assegnato dall'admin non arriva mai al sito.
 *
 * La funzione `client-status` cerca con la chiave di servizio per account e
 * poi per email, e non restituisce mai la blacklist.
 *
 * Se la chiamata non riesce si torna `null`: chi chiama ricade sulla riga che
 * ha gia' letto, invece di svuotare il badge.
 */
export async function fetchClientStatusKey(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const res = await fetch('/.netlify/functions/client-status', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.statusKey === 'string' ? body.statusKey : null;
  } catch (err) {
    console.warn('[clientStatus] lettura status dal server fallita:', err);
    return null;
  }
}

/**
 * Chiave status di una riga customers_extended.
 *
 * Lo schema ha due colonne parallele per ragioni storiche: la tab Clienti
 * scrive `status`, i vecchi flussi scrivevano `status_cliente`. Vale quella
 * valorizzata, con la stessa precedenza dell'admin
 * (src/contexts/ClientStatusContext.tsx) — altrimenti sito e gestionale
 * mostrerebbero due status diversi per lo stesso cliente.
 */
export function resolveClientStatusKey(row: { status?: string | null; status_cliente?: string | null } | null | undefined): string {
  if (!row) return 'standard';
  const manual = (row.status_cliente && row.status_cliente !== 'standard')
    ? row.status_cliente
    : (row.status && row.status !== 'standard' ? row.status : null);
  return manual || 'standard';
}

/**
 * Definizione da mostrare al cliente. Blacklist e chiavi non piu' configurate
 * ricadono sullo status base: il cliente non deve dedurre di essere segnalato.
 */
export function publicClientStatus(defs: ClientStatusDef[], key: string): ClientStatusDef {
  const fallback = defs.find(d => d.key === 'standard') || DEFAULT_CLIENT_STATUS[0];
  if (!key || key === HIDDEN_STATUS_KEY) return fallback;
  return defs.find(d => d.key === key) || fallback;
}

/** True se al cliente va mostrato un badge diverso dallo status base. */
export function isDistinctClientStatus(def: ClientStatusDef): boolean {
  return def.key !== 'standard';
}

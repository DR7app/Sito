/**
 * Regole di cancellazione: logica PURA, senza supabase ne' React.
 *
 * 29/09/2026 — la usa il browser (Le mie prenotazioni, per mostrare cosa
 * succede) e la usa il server (annulla-prenotazione-cliente, che decide
 * davvero e accredita). Prima il rimborso lo calcolava e lo accreditava il
 * browser: la stessa regola in un posto solo evita che le due strade
 * divergano.
 *
 * Fonte: `centralina_pro_config.config.automations.cancellation_rules`.
 */

export type RefundMethod = 'wallet' | 'card';
export type CancellationAppliesTo = 'all' | 'rental' | 'carwash';
export type CancellationRequiresService = 'none' | 'dr7_flex' | 'prime_flex' | 'elite';

export interface CancellationRule {
  id: string;
  label: string;
  /** Booking type the rule applies to. */
  appliesTo: CancellationAppliesTo;
  /** Add-on / membership the booking must have for the rule to apply. */
  requiresService: CancellationRequiresService;
  minDaysNotice: number;
  refundPercent: number;
  /** Where the refund goes:
   *  - 'wallet': auto-credited to the customer's DR7 Wallet on cancel.
   *  - 'card':   manual refund via Nexi terminal — the cancellation
   *              flow does NOT auto-credit; admin processes externally.
   */
  refundMethod: RefundMethod;
  isActive: boolean;
}

export const DEFAULT_RULES: CancellationRule[] = [
  { id: 'standard',   label: 'Cancellazione standard',  appliesTo: 'all',     requiresService: 'none',       minDaysNotice: 5, refundPercent: 90, refundMethod: 'wallet', isActive: true },
  { id: 'dr7_flex',   label: 'DR7 Flex (noleggio)',     appliesTo: 'rental',  requiresService: 'dr7_flex',   minDaysNotice: 0, refundPercent: 90, refundMethod: 'wallet', isActive: true },
  { id: 'prime_flex', label: 'Prime Flex (lavaggio)',   appliesTo: 'carwash', requiresService: 'prime_flex', minDaysNotice: 0, refundPercent: 90, refundMethod: 'wallet', isActive: true },
  { id: 'elite',      label: 'Elite Member',            appliesTo: 'all',     requiresService: 'elite',      minDaysNotice: 0, refundPercent: 90, refundMethod: 'wallet', isActive: true },
];

export interface RawRule {
  id?: unknown;
  label?: unknown;
  applies_to?: unknown;
  requires_service?: unknown;
  min_days_notice?: unknown;
  refund_pct?: unknown;
  refund_method?: unknown;
  is_active?: unknown;
}

/** Lista grezza dalla Centralina -> regole. Vuota o assente -> regole di fabbrica. */
export function normalizzaRegole(raw: unknown): CancellationRule[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_RULES;
  return raw
    .map((r) => {
      const appliesTo: CancellationAppliesTo =
        r.applies_to === 'rental' || r.applies_to === 'carwash' ? r.applies_to : 'all';
      const requiresService: CancellationRequiresService =
        r.requires_service === 'dr7_flex' || r.requires_service === 'prime_flex' || r.requires_service === 'elite'
          ? r.requires_service
          : 'none';
      return {
        id: typeof r.id === 'string' ? r.id : String(r.id ?? ''),
        label: typeof r.label === 'string' ? r.label : 'Regola',
        appliesTo,
        requiresService,
        minDaysNotice: typeof r.min_days_notice === 'number' ? r.min_days_notice : Number(r.min_days_notice ?? 0),
        refundPercent: typeof r.refund_pct === 'number' ? r.refund_pct : Number(r.refund_pct ?? 0),
        refundMethod: r.refund_method === 'card' ? 'card' as const : 'wallet' as const,
        isActive: r.is_active !== false,
      };
    })
    .filter((r) => r.id && Number.isFinite(r.minDaysNotice) && Number.isFinite(r.refundPercent));
}

export interface BookingContext {
  daysUntilPickup: number;
  /** 'rental' for car rental, 'carwash' for car wash. Other types treated as 'rental' fallback. */
  serviceType: 'rental' | 'carwash';
  hasDr7Flex: boolean;
  hasPrimeFlex: boolean;
  isElite: boolean;
}

/**
 * Pick the BEST applicable rule for the booking context.
 *
 * Filtering:
 *   - rule must be active
 *   - rule.appliesTo matches the booking serviceType ('all' matches everything)
 *   - rule.requiresService is satisfied by context (none / dr7_flex / prime_flex / elite)
 *   - context.daysUntilPickup ≥ rule.minDaysNotice
 *
 * Among eligible rules, the one with the HIGHEST refundPercent wins
 * (best deal for the customer). Returns null if no rule matches.
 */
export function pickRule(rules: CancellationRule[], ctx: BookingContext): CancellationRule | null {
  const eligible = rules
    .filter((r) => r.isActive)
    .filter((r) => {
      if (r.appliesTo === 'rental' && ctx.serviceType !== 'rental') return false;
      if (r.appliesTo === 'carwash' && ctx.serviceType !== 'carwash') return false;
      if (r.requiresService === 'dr7_flex' && !ctx.hasDr7Flex) return false;
      if (r.requiresService === 'prime_flex' && !ctx.hasPrimeFlex) return false;
      if (r.requiresService === 'elite' && !ctx.isElite) return false;
      return ctx.daysUntilPickup >= r.minDaysNotice;
    })
    .sort((a, b) => b.refundPercent - a.refundPercent);
  return eligible[0] ?? null;
}

/**
 * Detect DR7 Flex on a booking — supports BOTH the legacy boolean shape
 * (booking_details.dr7_flex / dr7Flex / extras.dr7_flex) AND the new
 * Experience Services shape (booking_details.experience_services as a
 * map of {serviceId: quantity}). When DR7 Flex was migrated into the
 * extras catalog (May 2026), the legacy boolean stopped being set;
 * customers who added DR7 Flex via "Aggiungi" weren't recognized as
 * Flex by canCancel(), so they couldn't cancel within the standard
 * 5-day window even though they had paid for the premium policy.
 *
 * Matches any service id containing both "dr7" and "flex", or any id
 * matching exactly common variants. Case-insensitive.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function detectDr7Flex(bd: any, expNameById?: Record<string, string>): boolean {
  if (!bd) return false;
  // Legacy boolean shapes
  if (bd.dr7Flex === true || bd.dr7Flex === 'true') return true;
  if (bd.dr7_flex === true || bd.dr7_flex === 'true') return true;
  if (bd.extras?.dr7_flex === true || bd.extras?.dr7_flex === 'true') return true;
  // Riconosce il Flex per ID o per NOME (dal catalogo Experience di Centralina).
  // Le prenotazioni vecchie salvano solo {experienceId: qty} con un id Centralina
  // che NON contiene "dr7flex": senza il nome non venivano riconosciute (es.
  // Massimo, RS3) e il pulsante Cancella non compariva.
  const matchesFlex = (s: string): boolean => {
    const k = String(s || '').toLowerCase().trim();
    if (!k) return false;
    return k.includes('dr7 flex') || k.includes('dr7flex') || k.includes('dr7-flex') || (k.includes('dr7') && k.includes('flex')) || k.includes('flex');
  };
  // Costo flex registrato (campo dedicato) -> DR7 Flex attivo.
  if (typeof bd.flex_cost === 'number' && bd.flex_cost > 0) return true;
  if (bd.flex === true || bd.flex === 'true') return true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const checkMap = (m: any): boolean => {
    if (!m || typeof m !== 'object') return false;
    for (const [id, qty] of Object.entries(m)) {
      const active = (typeof qty === 'number' && qty > 0) || qty === true || (typeof qty === 'string' && qty !== '0' && qty !== '' && qty !== 'false');
      if (!active) continue;
      if (matchesFlex(id) || matchesFlex(expNameById?.[id] || '')) return true;
    }
    return false;
  };
  if (checkMap(bd.experience_services)) return true;
  if (checkMap(bd.selectedExperiences)) return true;
  if (checkMap(bd.experiences)) return true;
  // Ultima rete: QUALSIASI campo top-level con "flex" nel nome e valore vero
  // (boolean true / numero > 0 / oggetto-mappa che contiene un flex).
  for (const [k, v] of Object.entries(bd)) {
    const key = String(k).toLowerCase();
    if (!key.includes('flex')) continue;
    if (v === true || v === 'true') return true;
    if (typeof v === 'number' && v > 0) return true;
    if (v && typeof v === 'object' && checkMap(v)) return true;
  }
  return false;
}

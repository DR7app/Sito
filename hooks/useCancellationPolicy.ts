import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { DEFAULT_RULES, normalizzaRegole, type CancellationRule } from '../utils/regoleAnnullamento';

export { pickRule, DEFAULT_RULES } from '../utils/regoleAnnullamento';
export type { RefundMethod, CancellationAppliesTo, CancellationRequiresService, CancellationRule, BookingContext } from '../utils/regoleAnnullamento';

/**
 * Cancellation policy rules from Centralina Pro Automazioni.
 *
 * Source of truth: `centralina_pro_config.config.automations.cancellation_rules`.
 * The operator manages the list (add/edit/delete/toggle) in admin →
 * Centralina Pro → Automazioni → "Regole di cancellazione".
 *
 * Selection logic: rules are sorted by `min_days_notice` descending; the
 * first ACTIVE rule whose `min_days_notice ≤ daysUntilPickup` wins.
 *
 * DR7 Flex / Prime Flex / Elite override these rules via their own
 * configured refund_percent (handled separately in the wizard).
 */

let cache: CancellationRule[] | null = null;
let pending: Promise<CancellationRule[]> | null = null;

async function fetchOnce(): Promise<CancellationRule[]> {
  if (cache) return cache;
  if (pending) return pending;
  pending = (async () => {
    try {
      const { data } = await supabase
        .from('centralina_pro_config')
        .select('config')
        .eq('id', 'main')
        .maybeSingle();
      const cfg = (data?.config ?? null) as Record<string, unknown> | null;
      const automations = cfg?.automations as Record<string, unknown> | undefined;
      const raw = automations?.cancellation_rules;
      const rules = normalizzaRegole(raw);
      cache = rules;
      return rules;
    } catch {
      cache = DEFAULT_RULES;
      return DEFAULT_RULES;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/** React hook returning the current cancellation rules array. */
export function useCancellationRules(): CancellationRule[] {
  const [rules, setRules] = useState<CancellationRule[]>(cache || DEFAULT_RULES);
  useEffect(() => {
    let cancelled = false;
    fetchOnce().then((p) => {
      if (!cancelled) setRules(p);
    });
    return () => { cancelled = true; };
  }, []);
  return rules;
}

/**
 * Backwards-compat: returns the rule with the highest min_days_notice
 * (or the default standard rule). Used for displaying "main" policy text.
 */
export interface CancellationPolicy {
  thresholdDays: number;
  refundPercent: number;
  penaltyPercent: number;
}

export function useCancellationPolicy(): CancellationPolicy {
  const rules = useCancellationRules();
  // For the displayed policy page, use the STANDARD rule (no service
  // requirement) with the highest threshold — that's the public-facing
  // baseline. Flex / Elite are documented separately on the page.
  const main = [...rules]
    .filter((r) => r.isActive && r.requiresService === 'none')
    .sort((a, b) => b.minDaysNotice - a.minDaysNotice)[0];
  if (!main) return { thresholdDays: 0, refundPercent: 0, penaltyPercent: 100 };
  return {
    thresholdDays: main.minDaysNotice,
    refundPercent: main.refundPercent,
    penaltyPercent: Math.max(0, 100 - main.refundPercent),
  };
}

/** Force re-fetch on next read (call after admin edits if needed). */
export function invalidateCancellationPolicyCache(): void {
  cache = null;
  pending = null;
}

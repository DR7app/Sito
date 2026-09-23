import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

/**
 * I numeri del sito letti dalla piattaforma, non scritti a mano.
 *
 * 23/09/2026 — "Contratti firmati", "Clienti serviti" e "Fatturato generato"
 * erano cifre fisse (4.000+, 3.000+, 2,5M+). Ora li calcola il database con
 * `sito_numeri_pubblici()`: contratti firmati (uno per prenotazione, niente
 * annullati ne' prove), clienti = il Totale Clienti della tab Clienti del gestionale, fatture
 * emesse meno note di credito (scartate dallo SDI escluse). Escono solo i tre
 * totali, nessun dato personale.
 *
 * Ogni testo li chiede con un segnaposto: `{contrattiFirmati}`,
 * `{clientiServiti}`, `{fatturatoGenerato}`. Finche' il numero non arriva la
 * metrica non si mostra: meglio un dato in meno che un dato inventato.
 */

export interface NumeriPiattaforma {
  contrattiFirmati: number;
  clientiServiti: number;
  fatturato: number;
}

let richiesta: Promise<NumeriPiattaforma | null> | null = null;

function leggiNumeri(): Promise<NumeriPiattaforma | null> {
  if (!richiesta) {
    richiesta = (async () => {
      const { data, error } = await supabase.rpc('sito_numeri_pubblici');
      if (error) throw error;
      const d = (data || {}) as Record<string, unknown>;
      const n = (v: unknown) => (typeof v === 'number' ? v : Number(v));
      const numeri = { contrattiFirmati: n(d.contratti_firmati), clientiServiti: n(d.clienti_serviti), fatturato: n(d.fatturato) };
      return Object.values(numeri).every(Number.isFinite) ? numeri : null;
    })().catch((err) => {
      console.error('[useNumeriPiattaforma] numeri non disponibili:', err);
      richiesta = null;
      return null;
    });
  }
  return richiesta;
}

export function useNumeriPiattaforma(): NumeriPiattaforma | null {
  const [numeri, setNumeri] = useState<NumeriPiattaforma | null>(null);
  useEffect(() => {
    let annullato = false;
    leggiNumeri().then((n) => { if (!annullato && n) setNumeri(n); });
    return () => { annullato = true; };
  }, []);
  return numeri;
}

const cifra = (v: number) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 }).format(Math.round(v));

/**
 * Sostituisce i segnaposto coi numeri veri. Senza numeri torna `null` se il
 * testo ne conteneva uno: chi chiama salta la metrica.
 */
export function risolviNumeriPiattaforma(testo: string | null, numeri: NumeriPiattaforma | null): string | null {
  if (testo === null) return null;
  if (!/\{(contrattiFirmati|clientiServiti|fatturatoGenerato)\}/.test(testo)) return testo;
  if (!numeri) return null;
  return testo
    .split('{contrattiFirmati}').join(cifra(numeri.contrattiFirmati))
    .split('{clientiServiti}').join(cifra(numeri.clientiServiti))
    .split('{fatturatoGenerato}').join(`€${cifra(numeri.fatturato)}`);
}

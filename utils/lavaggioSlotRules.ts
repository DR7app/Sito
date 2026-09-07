/**
 * Regole degli slot del lavaggio, senza rete e senza React.
 *
 * Stanno qui perche' le usano in due: la pagina di prenotazione (un giorno
 * alla volta) e il calendario a comparsa (un orario, tutti i giorni). Due
 * copie della stessa regola avrebbero finito per dire cose diverse, e il
 * cliente avrebbe visto un orario libero in un posto e occupato nell'altro.
 *
 * Cosa rende un orario prenotabile:
 *  1. il servizio ci sta dentro una finestra di apertura del giorno;
 *  2. non si accavalla a una prenotazione gia' presa (una alla volta);
 *  3. se e' oggi, manca almeno il preavviso minimo;
 *  4. il giorno non e' nel passato ne' dentro un blocco.
 */

/** Una prenotazione gia' presa, ridotta a quello che serve al calcolo. */
export interface PrenotazioneLavaggio {
  /** 'YYYY-MM-DD' */
  data: string;
  /** 'HH:MM' */
  ora: string;
  durataMinuti: number;
}

export type MotivoNonDisponibile = 'chiuso' | 'occupato' | 'troppo_presto' | 'passato' | 'bloccato';

export interface EsitoSlot {
  ora: string;
  disponibile: boolean;
  motivo?: MotivoNonDisponibile;
}

export function minutiDaOra(ora: string): number {
  const [h, m] = ora.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function oraDaMinuti(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Il servizio, partendo da `ora` e durando `durataMinuti`, sta dentro una
 * delle finestre di apertura? Deve entrarci INTERO in una sola finestra: a
 * cavallo della pausa il lavaggio non si puo' fare.
 */
export function entraNelleFinestre(
  finestre: { start: string; end: string }[],
  ora: string,
  durataMinuti: number,
): boolean {
  const inizio = minutiDaOra(ora);
  const fine = inizio + durataMinuti;
  return finestre.some((f) => inizio >= minutiDaOra(f.start) && fine <= minutiDaOra(f.end));
}

/**
 * Si accavalla a qualcosa di gia' preso? Se ne lava una alla volta, quindi
 * basta una sovrapposizione.
 */
export function siAccavalla(
  prenotazioni: PrenotazioneLavaggio[],
  ora: string,
  durataMinuti: number,
): boolean {
  const inizio = minutiDaOra(ora);
  const fine = inizio + durataMinuti;
  return prenotazioni.some((p) => {
    const pInizio = minutiDaOra(p.ora);
    const pFine = pInizio + p.durataMinuti;
    return inizio < pFine && fine > pInizio;
  });
}

export interface ContestoSlot {
  /** Finestre di apertura del giorno. Vuote = chiuso. */
  finestre: { start: string; end: string }[];
  /** Prenotazioni gia' prese in QUEL giorno. */
  prenotazioni: PrenotazioneLavaggio[];
  /** Durata totale del carrello. */
  durataMinuti: number;
  /** true se il giorno esaminato e' oggi. */
  oggi: boolean;
  /** Minuti dall'inizio della giornata, adesso (solo se `oggi`). */
  minutiAdesso?: number;
  /** Preavviso minimo per prenotare oggi. */
  preavvisoMinuti?: number;
  /** Giorno passato o dentro un blocco: niente slot, senza altri controlli. */
  nonPrenotabile?: MotivoNonDisponibile;
}

/** Un orario, in un giorno: si puo' o no, e perche' no. */
export function valutaSlot(ora: string, ctx: ContestoSlot): EsitoSlot {
  if (ctx.nonPrenotabile) return { ora, disponibile: false, motivo: ctx.nonPrenotabile };
  if (ctx.finestre.length === 0) return { ora, disponibile: false, motivo: 'chiuso' };
  if (!entraNelleFinestre(ctx.finestre, ora, ctx.durataMinuti)) {
    return { ora, disponibile: false, motivo: 'chiuso' };
  }
  if (ctx.oggi) {
    const preavviso = ctx.preavvisoMinuti ?? 120;
    if (minutiDaOra(ora) < (ctx.minutiAdesso ?? 0) + preavviso) {
      return { ora, disponibile: false, motivo: 'troppo_presto' };
    }
  }
  if (siAccavalla(ctx.prenotazioni, ora, ctx.durataMinuti)) {
    return { ora, disponibile: false, motivo: 'occupato' };
  }
  return { ora, disponibile: true };
}

/**
 * Gli orari da mostrare nella griglia, raggruppati per ora piena.
 *
 * La Centralina puo' impostare slot da 5 minuti: un elenco piatto sarebbero
 * centoventi bottoni in fila. Per ora piena diventano dodici righe corte.
 */
export function raggruppaPerOra(slot: string[]): { ora: number; minuti: string[] }[] {
  const gruppi = new Map<number, string[]>();
  for (const s of slot) {
    const h = Math.floor(minutiDaOra(s) / 60);
    if (!gruppi.has(h)) gruppi.set(h, []);
    gruppi.get(h)!.push(s);
  }
  return [...gruppi.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ora, minuti]) => ({ ora, minuti }));
}

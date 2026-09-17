/**
 * Patente della scheda cliente, ovunque sia stata salvata.
 *
 * Il gestionale la scrive nelle colonne (`numero_patente`,
 * `data_rilascio_patente`, ...) e in `metadata.patente.*`; il sito la
 * scriveva solo nelle chiavi piatte del metadata (`metadata.numero_patente`).
 * Leggendo una sola forma, i dati inseriti dall'ufficio non arrivavano alla
 * prenotazione e il cliente se li vedeva richiedere.
 *
 * Ordine: colonne, poi metadata.patente, poi chiavi piatte.
 */
export interface DatiPatenteScheda {
  numero: string
  tipo: string
  ente: string
  rilascio: string
  scadenza: string
}

const primo = (...valori: unknown[]): string => {
  for (const v of valori) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

export function datiPatenteScheda(scheda: Record<string, any> | null | undefined): DatiPatenteScheda {
  const c = scheda || {}
  const m = (c.metadata && typeof c.metadata === 'object') ? c.metadata : {}
  const p = (m.patente && typeof m.patente === 'object') ? m.patente : {}
  return {
    // `patente` e' la colonna storica: a volte contiene solo la categoria ("B").
    numero: primo(c.numero_patente, String(c.patente || '').trim().length > 4 ? c.patente : '', p.numero, m.numero_patente),
    tipo: primo(c.tipo_patente, p.tipo, m.tipo_patente),
    ente: primo(c.emessa_da, p.ente, m.patente_emessa_da),
    rilascio: primo(c.data_rilascio_patente, p.rilascio, m.patente_data_rilascio).slice(0, 10),
    scadenza: primo(c.scadenza_patente, p.scadenza, m.patente_scadenza).slice(0, 10),
  }
}

/** Luogo di nascita: il gestionale usa `luogo_nascita`, il sito `citta_nascita`. */
export function luogoNascitaScheda(scheda: Record<string, any> | null | undefined): string {
  const c = scheda || {}
  return primo(c.luogo_nascita, c.citta_nascita)
}

/**
 * Filtro delle note del lettore documenti.
 *
 * 21/09/2026 (direzione): caricando la TESSERA SANITARIA alla casella "Codice
 * fiscale" — cioe' il documento giusto — comparivano avvisi gialli del tipo
 * "Nessun documento di identita' presente nell'immagine", "Indirizzo di
 * residenza non riportato sul documento", "CAP inferito dalla citta' di
 * nascita". Sono OSSERVAZIONI, non problemi: una tessera sanitaria non e' un
 * documento d'identita' e non porta l'indirizzo. Segnalarle fa credere che il
 * caricamento sia andato storto.
 *
 * Qui si tolgono solo le frasi che constatano l'assenza di qualcosa che quel
 * documento non contiene per natura. Tutto cio' che segnala un problema vero
 * — scadenze, illeggibilita', bassa affidabilita', dati discordanti — passa
 * sempre, anche se sta nella stessa frase.
 */

/** Se compare una di queste, la frase e' un problema e si mostra comunque. */
const PAROLE_ALLARME = /scadut|illeggibil|non leggibil|bassa affidabilit|non corrispond|difform|errore|sfocat|manca la foto|non valid/i

/** Constatazioni normali per il tipo di documento caricato. */
const RUMORE = /nessun documento di identit|non riportat|non presente sul documento|non presente nell'immagine|cap inferit|cap dedott|tessera europea|solo team|non e' un documento di identit/i

/** Frasi che si limitano a dire CHE COS'E' il documento. */
const SOLO_DESCRIZIONE = /^(tessera sanitaria|codice fiscale|carta d'identit|carta di identit|patente|passaporto|team)\b[^.]*$/i

function frasiUtili(testo: string): string[] {
  return testo
    .split(/(?<=\.)\s+|\s*\.\s*$/)
    .map(f => f.trim())
    .filter(f => f.length > 0)
    .filter(f => {
      if (PAROLE_ALLARME.test(f)) return true
      if (RUMORE.test(f)) return false
      if (SOLO_DESCRIZIONE.test(f.replace(/\.$/, ''))) return false
      return true
    })
}

/**
 * Restituisce solo le note che vale la pena mostrare. Una nota e' nella forma
 * "Etichetta: frase. frase. frase." — l'etichetta si conserva, e se non resta
 * nessuna frase utile la nota sparisce del tutto.
 */
export function noteDaMostrare(note: string[]): string[] {
  const fuori: string[] = []
  for (const nota of note || []) {
    const testo = String(nota || '').trim()
    if (!testo) continue
    const sep = testo.indexOf(': ')
    const etichetta = sep > 0 ? testo.slice(0, sep + 2) : ''
    const corpo = sep > 0 ? testo.slice(sep + 2) : testo
    const utili = frasiUtili(corpo)
    if (utili.length === 0) continue
    fuori.push(etichetta + utili.join(' '))
  }
  return fuori
}

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

/**
 * Constatazioni normali. Due famiglie:
 *  - il documento non contiene quel dato per natura (la tessera sanitaria non
 *    e' una carta d'identita', non porta l'indirizzo);
 *  - l'immagine e' UNA sola faccia. Ogni file viene letto per conto suo,
 *    quindi il lettore dice sempre "il retro non c'e'" guardando il fronte.
 *    Dopo l'unione delle letture il dato c'e', e l'avviso non ha piu' senso.
 */
const RUMORE = new RegExp([
  "nessun documento di identit",
  "non e' un documento di identit",
  "non riportat",
  "non present",            // "non presente sul documento", "non presente nell'immagine"
  "non incluso",
  "non (e' |è )?visibile",
  "non disponibil",
  "solo (il |la )?(fronte|retro)",
  "solo fronte",
  "solo tessera",
  "solo team",
  "tessera europea",
  "inferit",                 // "CAP inferito dalla citta' di nascita"
  "dedott",                  // "data di nascita dedotta dal codice fiscale"
  "estratt",                 // "numero documento estratto dalla MRZ"
  "prese dai campi",
  "prese dalla riga",
].join('|'), 'i')

/** Frasi che si limitano a dire CHE COS'E' il documento o a elencare un dato. */
const SOLO_DESCRIZIONE = new RegExp([
  "^(tessera sanitaria|codice fiscale|carta d'identit|carta di identit|patente|passaporto|team)\\b[^.]*$",
  "^immagine (contiene|del)\\b",
  // Niente \\b in coda: "present" seguito da "e" non e' un confine di parola,
  // e "Codice 12 presente:" sfuggiva al filtro.
  "^(categorie con date|numero tessera|numero documento|ente|istituzione|scadenza tessera|scadenza|cap di|codice \\d+ present)",
].join('|'), 'i')

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

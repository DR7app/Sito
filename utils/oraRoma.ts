/**
 * Data + ora di un form, lette come ora di ROMA.
 *
 * PERCHE' ESISTE (31/08/2026). In piu' punti l'offset veniva deciso cosi':
 *
 *   const timeZoneName = new Intl.DateTimeFormat(..., { timeZone: 'Europe/Rome' })
 *     .formatToParts(new Date())        // <-- OGGI
 *   const offset = isDST ? '+02:00' : '+01:00'
 *   new Date(`${dataScelta}T${oraScelta}:00${offset}`)
 *
 * L'offset veniva calcolato su OGGI e poi applicato alla data PRENOTATA. Una
 * prenotazione fatta a ottobre (ora legale) per una data di novembre (ora
 * solare) nasceva spostata di un'ora: orario sbagliato al cliente, allo staff
 * e sul contratto. Lo stesso al contrario a marzo.
 *
 * Qui l'offset si ricava dalla data DI QUEL GIORNO, quindi il cambio d'ora e'
 * gia' dentro. Si guarda mezzogiorno UTC: il cambio avviene all'01:00 UTC,
 * quindi a mezzogiorno il giorno e' sempre in un fuso solo.
 */

/** '+01:00' o '+02:00' per Europe/Rome nel giorno indicato ("AAAA-MM-GG"). */
export function offsetRoma(ymd: string): string {
  const mezzogiorno = new Date(`${ymd}T12:00:00Z`)
  if (Number.isNaN(mezzogiorno.getTime())) return '+01:00' // controllo-date: ok
  const nome = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome',
    timeZoneName: 'short',
  }).formatToParts(mezzogiorno).find(p => p.type === 'timeZoneName')?.value || ''
  return (nome.includes('CEST') || nome.includes('+2')) ? '+02:00' : '+01:00' // controllo-date: ok
}

/**
 * "2026-11-03" + "17:30" (ora di Roma) -> Date.
 * Ogni data porta il SUO offset: un noleggio a cavallo del cambio d'ora ha
 * ritiro e riconsegna calcolati ciascuno sul proprio giorno.
 */
export function dataRoma(ymd: string, hm: string = '00:00'): Date {
  return new Date(`${ymd}T${hm}:00${offsetRoma(ymd)}`)
}

/** Come `dataRoma`, ma restituisce la stringa ISO UTC da salvare. */
export function isoRoma(ymd: string, hm: string = '00:00'): string {
  return dataRoma(ymd, hm).toISOString()
}

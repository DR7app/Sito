import { test } from 'node:test'
import assert from 'node:assert/strict'
import { noteDaMostrare } from './noteDocumenti.ts'

// Le note viste in produzione il 21/09/2026 caricando la tessera sanitaria
// nella casella "Codice fiscale": il documento era quello giusto.
const TESSERA_FRONTE = "Codice Fiscale (fronte): Tessera Sanitaria / Codice Fiscale. Nessun documento di identità presente nell'immagine. Indirizzo di residenza non riportato sul documento. CAP inferito dalla città di nascita (Cagliari)."
const TESSERA_RETRO = "Codice Fiscale (retro): Tessera Europea di Assicurazione Malattia (TEAM). Numero tessera: 80380002000311788910. Istituzione: SSN-MIN SALUTE - 500001. Scadenza tessera: 2028-09-16. Nessun documento di identità presente nell'immagine, solo TEAM italiana."

test('la tessera sanitaria caricata al posto giusto non genera avvisi', () => {
  assert.deepEqual(noteDaMostrare([TESSERA_FRONTE]), [])
})

test('del retro resta solo cio' + "'" + 'che e un dato, non una mancanza', () => {
  const fuori = noteDaMostrare([TESSERA_RETRO])
  const testo = fuori.join(' ')
  assert.ok(!testo.includes('Nessun documento di identità'), 'non deve lamentare l\'assenza della carta d\'identita')
  assert.ok(!testo.includes('solo TEAM'), 'non deve lamentare che e\' una TEAM')
})

test('i problemi veri passano sempre', () => {
  const problemi = [
    'Patente: Patente SCADUTA il 2024-01-01.',
    'Carta identità: foto illeggibile, riprovare.',
    'Codice Fiscale (fronte): Lettura a bassa affidabilità.',
    'Patente: il cognome non corrisponde a quello inserito.',
  ]
  assert.equal(noteDaMostrare(problemi).length, 4)
})

test('un problema nella stessa frase di una constatazione non si perde', () => {
  const misto = ["Carta identità: indirizzo non riportato sul documento ma il documento è SCADUTO."]
  assert.equal(noteDaMostrare(misto).length, 1)
})

test('note vuote o solo spazi spariscono', () => {
  assert.deepEqual(noteDaMostrare(['', '   ', undefined as unknown as string]), [])
})

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

// Le note viste in produzione il 21/09/2026 caricando FRONTE E RETRO di tutto
// (carta d'identita', patente, tessera sanitaria). Ogni immagine e' letta per
// conto suo, quindi ciascuna constata che l'altra faccia non c'e'.
const NOTE_REALI_FRONTE_RETRO = [
  "Patente (fronte): Solo fronte patente presente. Date prese dai campi 4a (rilascio: 30/08/2024) e 4b (scadenza: 22/10/2034) del fronte, poiché il retro non è presente nell'immagine.",
  "Patente (retro): Immagine contiene solo il RETRO della patente. Categorie con date: AM (dal 15/05/21 al 22/10/34), A2 (dal 30/08/24 al 22/10/34, codice 78), B (dal 15/05/21 al 22/10/34). patente_rilascio e patente_scadenza prese dalla riga B. Numero patente non disponibile (assente sul retro). Codice 12 presente: 71 CA5655809X - numero seriale AO 0934999.",
  "Codice Fiscale (fronte): Immagine contiene solo tessera sanitaria. Nessun documento di identità presente. CAP inferito dalla città di nascita Cagliari (09121). Indirizzo di residenza non presente sul documento.",
  "Documento Identità (fronte): Indirizzo completo non visibile sul fronte della CIE. CAP inferito da Quartucciu (CA). Codice fiscale non visibile (presente sul retro della CIE, non incluso nell'immagine).",
  "Documento Identità (retro): Immagine del retro della CIE. Il numero documento è estratto dalla MRZ: C<ITACA59541KQ4 → CA59541KQ (9 caratteri). Data di nascita dedotta dal codice fiscale (02R22 → 22/10/2002). Documento rilascio non visibile sul retro. CAP di Quartucciu (CA): 09044.",
]

test('caricando fronte e retro di tutto non resta nessun avviso', () => {
  assert.deepEqual(noteDaMostrare(NOTE_REALI_FRONTE_RETRO), [])
})

test('una patente davvero scaduta passa anche fra queste frasi', () => {
  const conProblema = ["Patente (fronte): Solo fronte patente presente. La patente risulta SCADUTA."]
  const fuori = noteDaMostrare(conProblema)
  assert.equal(fuori.length, 1)
  assert.ok(fuori[0].includes('SCADUTA'))
  assert.ok(!fuori[0].includes('Solo fronte'))
})

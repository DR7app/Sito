import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tipoDaEtichetta } from './tipoCategoria.ts'

// Le sette categorie come sono scritte in Centralina Pro il 20/09/2026,
// con l'id storico accanto per ricordare perche' non si legge l'id.
const CATEGORIE_REALI: Array<{ id: string; label: string; atteso: string | null }> = [
  { id: 'supercars',     label: 'Exotic Cars',      atteso: 'SUPERCAR' },
  { id: 'urban',         label: 'Hypercar',         atteso: 'SUPERCAR' },
  { id: 'aziendali',     label: 'Supercar',         atteso: 'SUPERCAR' },
  { id: 'scooter',       label: 'Urban',            atteso: 'UTILITARIA' },
  { id: 'supercar_elit', label: 'Flotta Aziendale', atteso: 'FURGONE' },
  { id: 'hypercar_elit', label: 'Moto',             atteso: null },
  { id: 'suv_luxury',    label: 'Scooter',          atteso: null },
]

test('le categorie in produzione danno il tipo giusto', () => {
  for (const c of CATEGORIE_REALI) {
    assert.equal(tipoDaEtichetta(c.label), c.atteso, `${c.label} (id ${c.id})`)
  }
})

test('nessuna categorie reale finisce sul tipo sbagliato leggendo il suo id', () => {
  // Leggendo l'id, il vecchio codice dava questi tipi: sono gli errori che
  // questo modulo deve evitare.
  const vecchio: Record<string, string> = { urban: 'UTILITARIA', aziendali: 'FURGONE' }
  for (const c of CATEGORIE_REALI) {
    const sbagliato = vecchio[c.id]
    if (!sbagliato) continue
    assert.notEqual(tipoDaEtichetta(c.label), sbagliato, `${c.label} non deve essere ${sbagliato}`)
  }
})

test('etichetta vuota o sconosciuta non decide nulla', () => {
  for (const l of ['', '   ', 'Moto', 'Scooter', 'Categoria nuova']) {
    assert.equal(tipoDaEtichetta(l), null, l || '(vuota)')
  }
})

test('maiuscole, minuscole e plurali non cambiano il risultato', () => {
  assert.equal(tipoDaEtichetta('EXOTIC CARS'), 'SUPERCAR')
  assert.equal(tipoDaEtichetta('Utilitarie'), 'UTILITARIA')
  assert.equal(tipoDaEtichetta('Furgoni'), 'FURGONE')
  assert.equal(tipoDaEtichetta('Suv Luxury'), 'SUPERCAR')
})

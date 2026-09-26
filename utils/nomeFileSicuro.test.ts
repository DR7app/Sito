import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { nomeFileSicuro, percorsoStorage } from './nomeFileSicuro.ts'

test('toglie accenti, spazi e caratteri non ammessi', () => {
  assert.equal(nomeFileSicuro('Contestazione Danni Lamborghini Huracán tecnica '), 'Contestazione_Danni_Lamborghini_Huracan_tecnica')
  assert.equal(nomeFileSicuro('patente José.jpg'), 'patente_Jose.jpg')
  assert.equal(nomeFileSicuro('foto 📸 auto.png'), 'foto_auto.png')
  assert.equal(nomeFileSicuro('"citazione" l\'auto.pdf'), 'citazione_l_auto.pdf')
})

test('uno slash nel nome non crea cartelle, .. non risale', () => {
  assert.equal(nomeFileSicuro('a/b\\c.pdf'), 'a_b_c.pdf')
  assert.equal(nomeFileSicuro('..'), 'file')
  assert.equal(percorsoStorage('utente', '../altro', 'x.pdf'), 'utente/altro/x.pdf')
})

test('nome vuoto o solo simboli: ripiego su "file"', () => {
  assert.equal(nomeFileSicuro(''), 'file')
  assert.equal(nomeFileSicuro(null), 'file')
  assert.equal(nomeFileSicuro('📸📸'), 'file')
})

test('nome lungo: tagliato tenendo l estensione', () => {
  const lungo = `${'a'.repeat(200)}.pdf`
  const r = nomeFileSicuro(lungo)
  assert.ok(r.length <= 80)
  assert.ok(r.endsWith('.pdf'))
})

test('idempotente e identico su nomi gia sicuri', () => {
  for (const n of ['DR7_1234_firmato_1790437574014.pdf', 'libretto_fronte_1.jpg', '3f2c9a1e-8b7d-4c1a-9e2f-000000000001']) {
    assert.equal(nomeFileSicuro(n), n)
  }
  const una = nomeFileSicuro('Huracán tecnica .pdf')
  assert.equal(nomeFileSicuro(una), una)
})

test('ogni file che carica nello storage passa da nomeFileSicuro', () => {
  // 26/09/2026: il documento DR7 Trust "Huracán" non si poteva firmare perche'
  // lo storage rifiutava la chiave con l'accento. Nessun `.upload(` senza
  // passare da questo modulo.
  const file = execSync("git grep -l '\\.upload(' -- '*.ts' '*.tsx' '*.js' ':!*.test.*' ':!dist' ':!node_modules'", { encoding: 'utf8' })
    .split('\n').filter(Boolean)
  const scoperti = file.filter(f => !/nomeFileSicuro/.test(readFileSync(f, 'utf8')))
  assert.deepEqual(scoperti, [], `Questi file caricano nello storage senza nomeFileSicuro/percorsoStorage (incidente 26/09/2026, documento "Huracán" non firmabile): ${scoperti.join(', ')}`)
})

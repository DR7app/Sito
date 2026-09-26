import { test } from 'node:test'
import assert from 'node:assert/strict'
import { daRigaCache, piuRecentiPrima, chiaveRecensione } from './recensioniGoogle.ts'

const LINK = 'https://share.google/x'

test('riga della copia diventa recensione del sito', () => {
  const r = daRigaCache({ id: 'a', source: 'places', author: ' Mario Rossi ', rating: 5, text: ' Ottimo ', published_at: '2026-09-20T10:00:00Z' }, LINK)
  assert.deepEqual(r, { author: 'Mario Rossi', rating: 5, date: '2026-09-20', body: 'Ottimo', sourceUrl: LINK, daGoogle: true })
})

test('senza testo la recensione non si mostra; stelle sempre fra 1 e 5', () => {
  assert.equal(daRigaCache({ id: 'a', source: 'gbp', author: 'X', rating: 5, text: '   ', published_at: null }, LINK), null)
  assert.equal(daRigaCache({ id: 'a', source: 'gbp', author: '', rating: 9, text: 'ok', published_at: null }, LINK)?.rating, 5)
  assert.equal(daRigaCache({ id: 'a', source: 'gbp', author: '', rating: 9, text: 'ok', published_at: null }, LINK)?.author, 'Cliente Google')
})

test('le piu recenti prima', () => {
  const l = piuRecentiPrima([{ date: '2025-01-01', n: 1 }, { date: '2026-09-01', n: 2 }, { date: '2026-01-01', n: 3 }])
  assert.deepEqual(l.map(x => x.n), [2, 3, 1])
})

test('chiave anti-doppione uguale da Google Business e da Google Maps', () => {
  const daBusiness = chiaveRecensione('José  Pérez', '2026-09-20T10:15:00Z', 5)
  const daMaps = chiaveRecensione('jose perez', new Date(Date.parse('2026-09-20T18:00:00Z')), 5)
  assert.equal(daBusiness, daMaps)
  assert.notEqual(daBusiness, chiaveRecensione('jose perez', '2026-09-21T10:00:00Z', 5))
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  noleggioPromoCents,
  dateDentroFinestra,
  primoGiornoPrenotabile,
  aggiungiGiorni,
  promozioneVisibile,
  dataIt,
  dettagliPromo,
  oggiRoma,
  restringiGruppoAPromo,
  type Promozione,
} from './promozioniCalcolo.ts'

// Stessa formula del database (promozione_verifica): se questi numeri
// cambiano, il trigger rifiuta le prenotazioni promo.
test('prezzo noleggio promo in centesimi = round(prezzo*100) * giorni', () => {
  assert.equal(noleggioPromoCents(499, 3), 149700)
  assert.equal(noleggioPromoCents(99.99, 2), 19998)
  assert.equal(noleggioPromoCents(0.005, 1), 1) // arrotondamento come Postgres round()
  assert.equal(noleggioPromoCents(499, 0), 49900) // mai meno di un giorno
})

test('le date del noleggio devono stare dentro la finestra della promo', () => {
  const p = { noleggio_dal: '2026-10-01', noleggio_al: '2026-10-31' }
  assert.equal(dateDentroFinestra(p, '2026-10-05', '2026-10-08'), true)
  assert.equal(dateDentroFinestra(p, '2026-10-01', '2026-10-31'), true)
  assert.equal(dateDentroFinestra(p, '2026-09-30', '2026-10-02'), false)
  assert.equal(dateDentroFinestra(p, '2026-10-30', '2026-11-01'), false)
  assert.equal(dateDentroFinestra(p, '2026-10-08', '2026-10-05'), false)
  assert.equal(dateDentroFinestra(p, '', '2026-10-05'), false)
})

test('primo giorno prenotabile: oggi o inizio promo, il piu tardi', () => {
  assert.equal(primoGiornoPrenotabile({ noleggio_dal: '2026-10-01' }, '2026-09-26'), '2026-10-01')
  assert.equal(primoGiornoPrenotabile({ noleggio_dal: '2026-09-01' }, '2026-09-26'), '2026-09-26')
})

test('aggiungiGiorni attraversa mesi e cambi ora', () => {
  assert.equal(aggiungiGiorni('2026-10-24', 2), '2026-10-26')
  assert.equal(aggiungiGiorni('2026-12-31', 1), '2027-01-01')
})

test('oggiRoma usa il fuso di Roma', () => {
  // 23:30 UTC del 30/09 = 01:30 del 01/10 a Roma
  assert.equal(oggiRoma(new Date('2026-09-30T23:30:00Z')), '2026-10-01')
})

const base: Promozione = {
  id: 'p1', titolo: 'Test', titolo_en: null, descrizione: null, descrizione_en: null,
  foto_urls: [], business: 'terra', veicoli: [{ id: 'v1', nome: 'Auto' }],
  prezzo_giorno: 499, prezzo_listino_giorno: 790, noleggio_dal: '2026-10-01', noleggio_al: '2026-10-31',
  min_giorni: null, max_giorni: null, visibile_dal: null, visibile_al: null, posti_totali: 5,
  attiva: true, visibile_sito: true, ordine: 0, posti_residui: 5,
}
const ora = new Date('2026-09-26T10:00:00Z')

test('promozione visibile solo se attiva, nel periodo, con posti e veicoli', () => {
  assert.equal(promozioneVisibile(base, ora), true)
  assert.equal(promozioneVisibile({ ...base, attiva: false }, ora), false)
  assert.equal(promozioneVisibile({ ...base, visibile_sito: false }, ora), false)
  assert.equal(promozioneVisibile({ ...base, posti_residui: 0 }, ora), false)
  assert.equal(promozioneVisibile({ ...base, posti_residui: null, posti_totali: null }, ora), true)
  assert.equal(promozioneVisibile({ ...base, visibile_dal: '2026-09-27T00:00:00Z' }, ora), false)
  assert.equal(promozioneVisibile({ ...base, visibile_al: '2026-09-25T00:00:00Z' }, ora), false)
  assert.equal(promozioneVisibile({ ...base, noleggio_al: '2026-09-25' }, ora), false)
  assert.equal(promozioneVisibile({ ...base, veicoli: [] }, ora), false)
})

test('dettagliPromo scrive esattamente cio che il trigger controlla', () => {
  assert.deepEqual(dettagliPromo(base, 3), {
    promo_id: 'p1', promo_titolo: 'Test', promo_prezzo_giorno: 499, promo_giorni: 3, promo_noleggio_cents: 149700,
  })
  assert.equal(dataIt('2026-10-05'), '05/10/2026')
})

test('restringiGruppoAPromo tiene solo le targhe della promo, con indici allineati', () => {
  const gruppo = { id: 'car-a', vehicleIds: ['a', 'b', 'c'], displayNames: ['A', 'B', 'C'], plates: ['AA111', '', 'CC333'] }
  assert.deepEqual(restringiGruppoAPromo(gruppo, ['c', 'b']), {
    id: 'car-b', vehicleIds: ['b', 'c'], displayNames: ['B', 'C'], plates: ['', 'CC333'],
  })
  assert.equal(restringiGruppoAPromo(gruppo, ['z']), null)
  // veicolo singolo (senza vehicleIds): si riconosce dall'id della scheda
  assert.deepEqual(restringiGruppoAPromo({ id: 'car-x' }, ['x']), { id: 'car-x', vehicleIds: ['x'], displayNames: undefined, plates: undefined })
})

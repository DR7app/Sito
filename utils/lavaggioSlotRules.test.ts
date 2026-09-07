/**
 * Test delle regole degli slot del lavaggio.
 * Esegui con: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  entraNelleFinestre,
  siAccavalla,
  valutaSlot,
  raggruppaPerOra,
} from './lavaggioSlotRules.ts';

const FINESTRE_SPEZZATE = [{ start: '09:00', end: '13:00' }, { start: '15:00', end: '19:00' }];
const CONTINUATO = [{ start: '08:30', end: '19:00' }];

test('un lavaggio deve entrare INTERO in una finestra', () => {
  assert.equal(entraNelleFinestre(FINESTRE_SPEZZATE, '12:00', 45), true);
  // 12:30 + 45 min finisce alle 13:15: oltre la chiusura della mattina
  assert.equal(entraNelleFinestre(FINESTRE_SPEZZATE, '12:30', 45), false);
  // a cavallo della pausa non vale, anche se "ci sarebbe il tempo"
  assert.equal(entraNelleFinestre(FINESTRE_SPEZZATE, '12:45', 150), false);
  assert.equal(entraNelleFinestre(CONTINUATO, '18:15', 45), true);
  assert.equal(entraNelleFinestre(CONTINUATO, '18:30', 45), false);
});

test('si accavalla anche se comincia dentro una prenotazione in corso', () => {
  const prese = [{ data: '2026-09-11', ora: '10:00', durataMinuti: 60 }];
  assert.equal(siAccavalla(prese, '10:30', 45), true);
  assert.equal(siAccavalla(prese, '09:30', 45), true);   // finisce alle 10:15
  assert.equal(siAccavalla(prese, '11:00', 45), false);  // comincia alla fine
  assert.equal(siAccavalla(prese, '09:00', 60), false);  // finisce alle 10:00
});

test('oggi: prima del preavviso non si prenota', () => {
  const base = { finestre: CONTINUATO, prenotazioni: [], durataMinuti: 45, oggi: true, minutiAdesso: 10 * 60, preavvisoMinuti: 120 };
  assert.equal(valutaSlot('11:30', base).disponibile, false);
  assert.equal(valutaSlot('11:30', base).motivo, 'troppo_presto');
  assert.equal(valutaSlot('12:00', base).disponibile, true);
});

test('giorno chiuso o bloccato: nessun orario', () => {
  assert.equal(valutaSlot('10:00', { finestre: [], prenotazioni: [], durataMinuti: 45, oggi: false }).motivo, 'chiuso');
  assert.equal(
    valutaSlot('10:00', { finestre: CONTINUATO, prenotazioni: [], durataMinuti: 45, oggi: false, nonPrenotabile: 'bloccato' }).motivo,
    'bloccato',
  );
});

test('la griglia si raggruppa per ora piena', () => {
  const g = raggruppaPerOra(['08:30', '08:45', '09:00', '09:15', '10:00']);
  assert.deepEqual(g.map((r) => r.ora), [8, 9, 10]);
  assert.deepEqual(g[0].minuti, ['08:30', '08:45']);
  assert.equal(g[1].minuti.length, 2);
});

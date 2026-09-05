/**
 * Test delle regole del calendario disponibilita'.
 *
 * Esegui con:  npm test
 * (node --test, nessuna dipendenza esterna, nessuna rete.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  msDaYmdOra,
  istanteOccupato,
  periodoOccupato,
  slotLiberi,
  primoOccupatoDopo,
  giorniFatturati,
  grigliaMese,
  statoGiornoRitiro,
  statoGiornoRiconsegna,
  ultimaRiconsegnaPossibile,
  ymdLocale,
} from './calendarioDisponibilitaRules.ts';

const SLOT_RITIRO = ['10:30', '10:45', '11:00', '16:30', '17:00', '18:30'];
const SLOT_RICONSEGNA = ['09:00', '09:30', '10:00', '15:00', '16:00', '17:00'];

// Prenotazione 10/09 10:30 -> 12/09 09:00, piu' 90 minuti di buffer
// dopo la riconsegna (l'auto torna libera alle 10:30 del 12).
const OCCUPATI = [{
  start: msDaYmdOra('2026-09-10', '10:30'),
  end: msDaYmdOra('2026-09-12', '10:30'),
}];

test('ymdLocale non slitta di un giorno come toISOString', () => {
  // 23:30 ora locale: toISOString darebbe il giorno dopo in fuso Italia.
  const d = new Date(2026, 8, 30, 23, 30, 0);
  assert.equal(ymdLocale(d), '2026-09-30');
});

test('istanteOccupato: dentro, sul bordo iniziale, sul bordo finale', () => {
  assert.equal(istanteOccupato(msDaYmdOra('2026-09-11', '12:00'), OCCUPATI), true);
  assert.equal(istanteOccupato(msDaYmdOra('2026-09-10', '10:30'), OCCUPATI), true);
  // La fine e' esclusiva: alle 10:30 del 12 l'auto e' di nuovo libera.
  assert.equal(istanteOccupato(msDaYmdOra('2026-09-12', '10:30'), OCCUPATI), false);
});

test('periodoOccupato vede una prenotazione che cade in mezzo', () => {
  const inizio = msDaYmdOra('2026-09-08', '10:30');
  const fine = msDaYmdOra('2026-09-15', '09:00');
  assert.equal(periodoOccupato(inizio, fine, OCCUPATI), true);
  // Periodo interamente prima
  assert.equal(periodoOccupato(
    msDaYmdOra('2026-09-05', '10:30'),
    msDaYmdOra('2026-09-09', '09:00'),
    OCCUPATI,
  ), false);
});

test('slotLiberi: il buffer libera solo gli slot dopo la fine', () => {
  // Giorno del rientro: 09:00 e 10:00 ancora occupati (buffer fino 10:30),
  // 10:30 in poi liberi.
  assert.deepEqual(
    slotLiberi('2026-09-12', SLOT_RITIRO, OCCUPATI),
    ['10:30', '10:45', '11:00', '16:30', '17:00', '18:30'],
  );
  assert.deepEqual(
    slotLiberi('2026-09-12', SLOT_RICONSEGNA, OCCUPATI),
    ['15:00', '16:00', '17:00'],
  );
  // Giorno interamente dentro la prenotazione: nessuno slot.
  assert.deepEqual(slotLiberi('2026-09-11', SLOT_RITIRO, OCCUPATI), []);
});

test('primoOccupatoDopo sceglie il piu' + " vicino, non il primo dell'array", () => {
  const lista = [
    { start: msDaYmdOra('2026-10-01', '10:00'), end: msDaYmdOra('2026-10-03', '10:00') },
    { start: msDaYmdOra('2026-09-20', '10:00'), end: msDaYmdOra('2026-09-22', '10:00') },
  ];
  const p = primoOccupatoDopo(msDaYmdOra('2026-09-15', '10:30'), lista);
  assert.equal(p?.start, msDaYmdOra('2026-09-20', '10:00'));
});

test('giorniFatturati: dal 6 all\'8 sono 2 giorni se rientra in orario', () => {
  // Ritiro 10:30, grace 90 -> soglia 09:00. Riconsegna 09:00 non la supera.
  assert.equal(giorniFatturati('2026-09-06', '10:30', '2026-09-08', '09:00', 90), 2);
});

test('giorniFatturati: riconsegna oltre la grace aggiunge un giorno', () => {
  // Soglia 09:00, riconsegna 10:00 -> +1 giorno.
  assert.equal(giorniFatturati('2026-09-06', '10:30', '2026-09-08', '10:00', 90), 3);
});

test('giorniFatturati: stesso giorno o riconsegna prima del ritiro = 0', () => {
  assert.equal(giorniFatturati('2026-09-06', '10:30', '2026-09-06', '17:00', 90), 1);
  assert.equal(giorniFatturati('2026-09-06', '10:30', '2026-09-05', '09:00', 90), 0);
});

test('grigliaMese: settembre 2026 inizia di martedi', () => {
  const celle = grigliaMese(2026, 8); // 8 = settembre
  assert.equal(celle[0], null);          // lunedi vuoto
  assert.equal(celle[1], '2026-09-01');  // martedi
  assert.equal(celle.length % 7, 0);
  assert.equal(celle.filter(Boolean).length, 30);
});

test('statoGiornoRitiro distingue passato, chiuso, occupato, libero', () => {
  const oggi = '2026-09-05';
  assert.equal(statoGiornoRitiro('2026-09-04', oggi, SLOT_RITIRO, OCCUPATI), 'passato');
  // Domenica: noleggioHours restituisce [] -> chiuso
  assert.equal(statoGiornoRitiro('2026-09-06', oggi, [], OCCUPATI), 'chiuso');
  assert.equal(statoGiornoRitiro('2026-09-11', oggi, SLOT_RITIRO, OCCUPATI), 'occupato');
  assert.equal(statoGiornoRitiro('2026-09-08', oggi, SLOT_RITIRO, OCCUPATI), 'libero');
  // Giorno del rientro: prenotabile grazie agli slot dopo il buffer.
  assert.equal(statoGiornoRitiro('2026-09-12', oggi, SLOT_RITIRO, OCCUPATI), 'libero');
});

test('statoGiornoRiconsegna: minimo 1 giorno e periodo tutto libero', () => {
  // Stesso giorno del ritiro -> rifiutato (noleggio minimo 1 giorno)
  assert.equal(
    statoGiornoRiconsegna('2026-09-08', '2026-09-08', '10:30', SLOT_RICONSEGNA, OCCUPATI),
    'passato',
  );
  // Giorno dopo, calendario pulito
  assert.equal(
    statoGiornoRiconsegna('2026-09-09', '2026-09-08', '10:30', SLOT_RICONSEGNA, OCCUPATI),
    'libero',
  );
  // Oltre la prenotazione del 10: il periodo la attraversa -> occupato
  assert.equal(
    statoGiornoRiconsegna('2026-09-14', '2026-09-08', '10:30', SLOT_RICONSEGNA, OCCUPATI),
    'occupato',
  );
});

test('ultimaRiconsegnaPossibile si ferma alla prenotazione successiva', () => {
  assert.equal(
    ultimaRiconsegnaPossibile('2026-09-08', '10:30', OCCUPATI, '2027-09-05'),
    '2026-09-10',
  );
  // Nessuna prenotazione dopo -> resta l'orizzonte
  assert.equal(
    ultimaRiconsegnaPossibile('2026-12-01', '10:30', OCCUPATI, '2027-09-05'),
    '2027-09-05',
  );
});

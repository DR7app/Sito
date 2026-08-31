/**
 * Test della pianta sedili (servizi Prime Wash venduti a sedile).
 * Esegui con: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEAT_LAYOUT,
  SEAT_BLOCKS,
  ROW_Y,
  seatLabel,
  seatListLabel,
  normalizeSeats,
  isSeatPricedUnit,
  isSeatPricedService,
} from './seatPlan.ts';

test('la pianta ha 7 sedili con sigle uniche: 5 standard + 2 di terza fila', () => {
  assert.equal(SEAT_LAYOUT.length, 7);
  assert.equal(new Set(SEAT_LAYOUT.map(s => s.id)).size, 7);
  assert.equal(SEAT_LAYOUT.filter(s => s.row === 3).length, 2);
  assert.equal(SEAT_LAYOUT.filter(s => s.row !== 3).length, 5);
});

test('nessun sedile esce dal riquadro della pianta', () => {
  for (const s of SEAT_LAYOUT) {
    assert.ok(s.x > 10 && s.x < 90, `${s.id} fuori orizzontalmente: ${s.x}`);
    for (const modo of ['5', '7'] as const) {
      const y = ROW_Y[modo][s.row];
      if (modo === '5' && s.row === 3) continue;   // terza fila non mostrata
      assert.ok(y > 10 && y < 90, `${s.id} fuori verticalmente a ${modo} posti: ${y}`);
    }
  }
});

test('le file non si sovrappongono, in entrambe le configurazioni', () => {
  assert.ok(ROW_Y['5'][2] - ROW_Y['5'][1] >= 20);
  assert.ok(ROW_Y['7'][2] - ROW_Y['7'][1] >= 20);
  assert.ok(ROW_Y['7'][3] - ROW_Y['7'][2] >= 20);
});

test('etichette in italiano e in inglese', () => {
  assert.equal(seatLabel('AS', 'it'), 'Guidatore');
  assert.equal(seatLabel('AS', 'en'), 'Driver');
  assert.equal(seatLabel('PD', 'it'), 'Posteriore destro');
});

test('sigla sconosciuta: mostrata com\'e\', niente crash', () => {
  assert.equal(seatLabel('ZZ', 'it'), 'ZZ');
  assert.equal(seatListLabel(['ZZ', 'AS'], 'it'), 'Guidatore');
});

test('la selezione viene riordinata secondo la pianta, non secondo i click', () => {
  assert.deepEqual(normalizeSeats(['PD', 'AS', 'PC']), ['AS', 'PC', 'PD']);
});

test('duplicati contati una volta sola', () => {
  assert.deepEqual(normalizeSeats(['AS', 'AS', 'AD']), ['AS', 'AD']);
});

test('dati sporchi non fanno crashare i riepiloghi', () => {
  assert.deepEqual(normalizeSeats(null), []);
  assert.deepEqual(normalizeSeats('AS'), []);
  assert.deepEqual(normalizeSeats([null, 42, 'AS']), ['AS']);
  assert.equal(seatListLabel([], 'it'), '');
});

test('elenco leggibile con separatore personalizzato', () => {
  assert.equal(seatListLabel(['AS', 'PD'], 'it'), 'Guidatore, Posteriore destro');
  assert.equal(seatListLabel(['AS', 'PD'], 'it', ' · '), 'Guidatore · Posteriore destro');
  assert.equal(seatListLabel(['AS', 'PD'], 'en'), 'Driver, Rear right');
});

test('servizio a sedile riconosciuto dall\'unita\' di prezzo del catalogo', () => {
  assert.equal(isSeatPricedUnit('a sedile'), true);
  assert.equal(isSeatPricedUnit('per seat'), true);
  assert.equal(isSeatPricedUnit('A SEDILE'), true);
  assert.equal(isSeatPricedUnit('al pezzo'), false);
  assert.equal(isSeatPricedUnit(''), false);
  assert.equal(isSeatPricedUnit(undefined), false);
  assert.equal(isSeatPricedUnit(null), false);
});

test('riconosce il servizio a sedile anche dal nome: in catalogo l\'unita\' e\' "Qta\'"', () => {
  // Regressione: con la sola unita' di prezzo la pianta non si apriva mai,
  // perche' PRIME SEAT CLEAN/PROTECT hanno price_unit "Qta'".
  assert.equal(isSeatPricedService('PRIME SEAT CLEAN', "Qta'"), true);
  assert.equal(isSeatPricedService('PRIME SEAT PROTECT', 'Qta'), true);
  assert.equal(isSeatPricedService('Lavaggio sedili', null), true);
  assert.equal(isSeatPricedService('Igienizzazione abitacolo', 'Qta'), false);
  assert.equal(isSeatPricedService('Nano trattamento', 'a sedile'), true);
});

test('dietro e\' un divano: i blocchi coprono tutti i sedili, senza doppioni', () => {
  const daiBlocchi = SEAT_BLOCKS.flatMap(b => b.seats);
  assert.equal(new Set(daiBlocchi).size, daiBlocchi.length);
  assert.deepEqual(daiBlocchi.slice().sort(), SEAT_LAYOUT.map(s => s.id).slice().sort());
  // Davanti uno per uno, dietro tutto insieme.
  assert.ok(SEAT_BLOCKS.filter(b => b.row === 1).every(b => b.seats.length === 1));
  assert.deepEqual(SEAT_BLOCKS.find(b => b.row === 2).seats, ['PS', 'PC', 'PD']);
  assert.deepEqual(SEAT_BLOCKS.find(b => b.row === 3).seats, ['TS', 'TD']);
});

test('il divano intero e\' UNA voce nei riepiloghi, non tre', () => {
  assert.equal(seatListLabel(['PS', 'PC', 'PD'], 'it'), 'Divano posteriore');
  assert.equal(seatListLabel(['PS', 'PC', 'PD'], 'en'), 'Rear bench');
  assert.equal(seatListLabel(['AS', 'PS', 'PC', 'PD'], 'it'), 'Guidatore, Divano posteriore');
  assert.equal(seatListLabel(['TS', 'TD'], 'it'), 'Terza fila');
  // Prenotazione vecchia con un solo posto dietro: resta leggibile.
  assert.equal(seatListLabel(['PS', 'PD'], 'it'), 'Posteriore sinistro, Posteriore destro');
});

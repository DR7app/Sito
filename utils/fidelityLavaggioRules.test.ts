/**
 * Test delle regole Fidelity Card lavaggio lette da Centralina Pro.
 *
 * Esegui con:  npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizzaFidelityLavaggio,
  fidelityLavaggioDaConfig,
  FIDELITY_LAVAGGIO_DEFAULT,
  euroFidelity,
  riempiFidelity,
} from './fidelityLavaggioRules.ts';

test('config assente = regole di sempre (1 EUR, 250 punti, 25 EUR, 15 giorni)', () => {
  assert.deepEqual(normalizzaFidelityLavaggio(undefined), FIDELITY_LAVAGGIO_DEFAULT);
  assert.deepEqual(fidelityLavaggioDaConfig({}), FIDELITY_LAVAGGIO_DEFAULT);
  assert.deepEqual(fidelityLavaggioDaConfig(null), FIDELITY_LAVAGGIO_DEFAULT);
});

test('zero, negativi e testo tornano al default', () => {
  assert.deepEqual(normalizzaFidelityLavaggio({
    euro_per_punto: -1, soglia_punti: 0, importo_premio: 'abc', validita_giorni: 0, tipo_premio: 'x', attivo: 'no',
  }), FIDELITY_LAVAGGIO_DEFAULT);
});

test('valori validi passano, anche con la virgola', () => {
  assert.deepEqual(fidelityLavaggioDaConfig({ fidelity_lavaggio: {
    attivo: false, euro_per_punto: '2,5', soglia_punti: 100, importo_premio: 10, validita_giorni: 30, tipo_premio: 'codice_sconto',
  } }), {
    attivo: false, euro_per_punto: 2.5, soglia_punti: 100, importo_premio: 10, validita_giorni: 30, tipo_premio: 'codice_sconto',
  });
});

test('importi e segnaposto', () => {
  assert.equal(euroFidelity(25), '25');
  assert.equal(euroFidelity(12.5), '12,50');
  assert.equal(euroFidelity(12.5, 'en'), '12.50');
  assert.equal(riempiFidelity('A {soglia} punti ricevi €{importo} {ignoto}', { soglia: 100, importo: '10' }), 'A 100 punti ricevi €10 {ignoto}');
});

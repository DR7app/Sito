/**
 * Test dell'abbinamento scheda "Vivi l'attesa" -> categoria flotta.
 *
 * Esegui con:  npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoriaPerEsperienza, modelliDellaCategoria, veicoloUtilizzabile } from './esperienzaFlotta.ts';

// Catalogo come in Centralina Pro al 04/11/2026: id storici, etichette nuove.
const CATEGORIE = [
  { id: 'supercars', label: 'Exotic Cars' },
  { id: 'urban', label: 'Hypercar' },
  { id: 'aziendali', label: 'Supercar' },
  { id: 'scooter', label: 'Urban' },
  { id: 'supercar_elit', label: 'Ducato Maxi' },
  { id: 'vito_tourer', label: 'Vito Tourer' },
];

test('ogni scheda trova la sua categoria per etichetta, mai per id', () => {
  const id = (name: string, nameEn: string) =>
    categoriaPerEsperienza({ id: 'x', name, nameEn }, CATEGORIE)?.id ?? null;
  assert.equal(id('DR7 SUPERCAR', 'DR7 SUPERCAR'), 'aziendali');
  assert.equal(id('DR7 EXOTIC CAR', 'DR7 EXOTIC CAR'), 'supercars');
  assert.equal(id('DR7 HYPERCAR', 'DR7 HYPERCAR'), 'urban');
  assert.equal(id('DR7 UTILITARIA DI CORTESIA', 'DR7 URBAN COURTESY DRIVE'), 'scooter');
  assert.equal(id('DR7 UTILITARIA DI CORTESIA', ''), 'scooter');
});

test('i furgoni non finiscono mai sotto la supercar', () => {
  const c = categoriaPerEsperienza({ id: 'extra-supercar', name: 'DR7 SUPERCAR' }, CATEGORIE);
  assert.notEqual(c?.id, 'supercar_elit');
});

test('abbinamento incerto = null', () => {
  assert.equal(categoriaPerEsperienza({ id: 'x', name: 'DR7 JET PRIVATO' }, CATEGORIE), null);
  const doppie = [{ id: 'a', label: 'Supercar' }, { id: 'b', label: 'Supercars' }];
  assert.equal(categoriaPerEsperienza({ id: 'x', name: 'DR7 SUPERCAR' }, doppie), null);
  assert.equal(categoriaPerEsperienza(null, CATEGORIE), null);
});

test('modelli: solo la categoria, senza ritirati, fermi o doppioni', () => {
  const adesso = new Date('2026-11-04T10:00:00Z');
  const veicoli = [
    { display_name: 'Fiat Panda', category: 'scooter', status: 'available' },
    { display_name: 'Fiat  Panda', category: 'scooter', status: 'available' },
    { display_name: 'Renault Clio', category: 'scooter', status: 'retired' },
    { display_name: 'Lancia Ypsilon', category: 'scooter', status: 'unavailable', metadata: { unavailable_until: '2026-11-01T00:00:00Z' } },
    { display_name: 'Jeep Renegade', category: 'scooter', status: 'unavailable', metadata: {} },
    { display_name: 'Fiat Ducato Maxi', category: 'supercar_elit', status: 'available' },
  ];
  assert.deepEqual(modelliDellaCategoria(veicoli, ['scooter'], adesso), ['Fiat Panda', 'Lancia Ypsilon']);
  assert.equal(veicoloUtilizzabile({ display_name: 'x', category: 'x', status: 'maintenance' }, adesso), false);
});

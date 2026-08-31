/**
 * Test della regola di visibilita' delle categorie Flotta.
 *
 * Esegui con:  npm test
 * (node --test, nessuna dipendenza esterna, nessuna rete: `flottaRules.ts`
 * non importa niente apposta.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveFlottaFromConfig,
  rentalPageWhitelistFrom,
  categoryAliases,
} from './flottaRules.ts';

const CATALOGO = {
  categories: [
    { id: 'supercars', label: 'Supercar' },
    { id: 'urban', label: 'Urban' },
    { id: 'aziendali', label: 'Aziendali' },
    { id: 'scooter', label: 'Scooter' },
    { id: 'supercar_elit', label: 'Supercar Elite' },
    { id: 'hypercar_elit', label: 'Hypercar Elite' },
    { id: 'suv_luxury', label: 'SUV Luxury' },
  ],
};

const conFlotta = (flotta: unknown) => ({ ...CATALOGO, site_copy: { flotta } });
const ids = (r: { categories: { id: string }[] }) => r.categories.map(c => c.id);

test('riga mai configurata (nessun mode, lista vuota) mostra tutte le categorie', () => {
  const r = resolveFlottaFromConfig(conFlotta({ visible_category_ids: [] }), true);
  assert.equal(r.status, 'ready');
  assert.equal(r.mode, 'legacy-empty');
  assert.equal(r.categories.length, 7);
});

test('sezione flotta assente del tutto: comportamento identico, tutte le categorie', () => {
  const r = resolveFlottaFromConfig(CATALOGO, true);
  assert.equal(r.mode, 'legacy-empty');
  assert.equal(r.categories.length, 7);
});

test('riga vecchia con lista piena resta una whitelist', () => {
  const r = resolveFlottaFromConfig(conFlotta({ visible_category_ids: ['urban', 'scooter'] }), true);
  assert.equal(r.mode, 'custom');
  assert.deepEqual(ids(r), ['urban', 'scooter']);
});

test('mode "all" mostra tutte le categorie anche con lista vuota', () => {
  const r = resolveFlottaFromConfig(conFlotta({ mode: 'all', visible_category_ids: [] }), true);
  assert.equal(r.mode, 'all');
  assert.equal(r.categories.length, 7);
});

test('5 categorie su 7 abilitate danno esattamente 5 categorie', () => {
  const scelte = ['supercars', 'urban', 'aziendali', 'hypercar_elit', 'suv_luxury'];
  const r = resolveFlottaFromConfig(conFlotta({ mode: 'custom', visible_category_ids: scelte }), true);
  assert.equal(r.categories.length, 5);
  assert.deepEqual(ids(r), scelte); // ordine del catalogo
});

test('mode "custom" con lista vuota di proposito non mostra NESSUNA categoria', () => {
  const r = resolveFlottaFromConfig(conFlotta({ mode: 'custom', visible_category_ids: [] }), true);
  assert.equal(r.status, 'ready');
  assert.deepEqual(r.categories, []);
});

test('errore di lettura: nessuna categoria esposta (fail-safe)', () => {
  const r = resolveFlottaFromConfig({}, false);
  assert.equal(r.status, 'error');
  assert.deepEqual(r.categories, []);
  assert.ok(r.issues.length > 0);
});

test('config assente ma letta davvero: nessuna categoria e anomalia segnalata', () => {
  const r = resolveFlottaFromConfig({}, true);
  assert.equal(r.status, 'ready');
  assert.deepEqual(r.categories, []);
  assert.match(r.issues.join(' '), /categories assente/);
});

test('id selezionato inesistente: ignorato e segnalato', () => {
  const r = resolveFlottaFromConfig(
    conFlotta({ mode: 'custom', visible_category_ids: ['urban', 'categoria-cancellata'] }), true);
  assert.deepEqual(ids(r), ['urban']);
  assert.match(r.issues.join(' '), /categoria-cancellata/);
});

test('id duplicato: contato una volta sola e segnalato', () => {
  const r = resolveFlottaFromConfig(
    conFlotta({ mode: 'custom', visible_category_ids: ['urban', 'urban'] }), true);
  assert.deepEqual(ids(r), ['urban']);
  assert.match(r.issues.join(' '), /duplicato/);
});

test('catalogo con id duplicato: tenuta la prima voce, anomalia segnalata', () => {
  const r = resolveFlottaFromConfig(
    { categories: [{ id: 'urban', label: 'Urban' }, { id: 'urban', label: 'Urban bis' }] }, true);
  assert.deepEqual(r.allCategories.map(c => c.label), ['Urban']);
  assert.match(r.issues.join(' '), /duplicato/);
});

test('formato dati errato: lista non-array e voci non testuali non fanno crashare', () => {
  const a = resolveFlottaFromConfig(conFlotta({ visible_category_ids: 'urban' }), true);
  assert.equal(a.mode, 'legacy-empty');
  assert.match(a.issues.join(' '), /non e' una lista/);

  const b = resolveFlottaFromConfig(
    conFlotta({ mode: 'custom', visible_category_ids: [null, 42, 'urban'] }), true);
  assert.deepEqual(ids(b), ['urban']);

  const c = resolveFlottaFromConfig({ categories: 'nope' }, true);
  assert.deepEqual(c.allCategories, []);

  const d = resolveFlottaFromConfig({ categories: [{ label: 'senza id' }, null, { id: 'urban' }] }, true);
  assert.deepEqual(d.allCategories.map(x => x.id), ['urban']);
});

test('mode sconosciuto: trattato come riga non configurata, non come errore', () => {
  const r = resolveFlottaFromConfig(conFlotta({ mode: 'boh', visible_category_ids: [] }), true);
  assert.equal(r.status, 'ready');
  assert.equal(r.mode, 'legacy-empty');
  assert.match(r.issues.join(' '), /non riconosciuto/);
});

test('categoria senza label usa il proprio id come etichetta', () => {
  const r = resolveFlottaFromConfig({ categories: [{ id: 'urban' }] }, true);
  assert.equal(r.allCategories[0].label, 'urban');
});

test('whitelist RentalPage: vuota quando si mostra tutto, alias inclusi quando si filtra', () => {
  assert.deepEqual(
    rentalPageWhitelistFrom(resolveFlottaFromConfig(conFlotta({ mode: 'all', visible_category_ids: [] }), true)),
    []);
  assert.deepEqual(
    rentalPageWhitelistFrom(resolveFlottaFromConfig(conFlotta({ visible_category_ids: [] }), true)),
    []);
  assert.deepEqual(
    rentalPageWhitelistFrom(resolveFlottaFromConfig({}, false)),
    []);
  const w = rentalPageWhitelistFrom(
    resolveFlottaFromConfig(conFlotta({ mode: 'custom', visible_category_ids: ['supercars', 'urban'] }), true));
  assert.deepEqual([...w].sort(), ['exotic', 'supercars', 'urban']);
});

test('alias categoria: supercars ed exotic restano equivalenti', () => {
  assert.deepEqual(categoryAliases('supercars').sort(), ['exotic', 'supercars']);
  assert.deepEqual(categoryAliases('exotic').sort(), ['exotic', 'supercars']);
  assert.deepEqual(categoryAliases('urban'), ['urban']);
});

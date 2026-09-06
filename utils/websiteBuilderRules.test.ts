/**
 * Test delle regole del Website Builder lato sito.
 *
 * Esegui con:  npm test
 * (node --test, nessuna rete: `websiteBuilderRules.ts` non importa niente
 * apposta, come `flottaRules.ts`.)
 *
 * La prova che conta e' la prima: una pagina pubblicata NON prende il
 * posto di una pagina esistente del sito finche' `overrides_route` resta
 * spento. E' l'unica cosa che separa "introdurre il builder" da "far
 * sparire il sito".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  paginaPerPercorso, pagineVisibili, overlayAttivi,
  usaHeaderBuilder, usaFooterBuilder, impostazioniSito,
} from './websiteBuilderRules.ts';
import type { WbSnapshot, WbSnapshotPage } from '../components/website/wbSchema.ts';

const ORA = Date.parse('2026-09-04T12:00:00Z');

function pagina(over: Partial<WbSnapshotPage> = {}): WbSnapshotPage {
  return {
    id: 'p1', slug: '/', title: 'Home', status: 'published',
    is_home: true, overrides_route: false, sort_order: 0,
    seo: {}, content: { sections: [] },
    ...over,
  };
}

function snap(over: Partial<WbSnapshot> = {}): WbSnapshot {
  return {
    schema_version: 1, source: 'published', generated_at: '',
    site: {
      id: 's', key: 'dr7', tenant_id: 'dr7', name: 'DR7',
      default_locale: 'it', locales: ['it', 'en'], settings: {},
    },
    theme: null, navigation: {}, pages: [], overlays: [], scripts: [],
    ...over,
  };
}

// ─── La difesa contro le regressioni ────────────────────────────────────────
test('una rotta esistente non viene sostituita finche il flag e spento', () => {
  const s = snap({ pages: [pagina({ overrides_route: false })] });
  assert.equal(paginaPerPercorso(s, '/', true), null);
});

test('la sostituzione avviene solo con il flag acceso', () => {
  const s = snap({ pages: [pagina({ overrides_route: true })] });
  assert.equal(paginaPerPercorso(s, '/', true)?.slug, '/');
});

test('un indirizzo nuovo non ha bisogno del flag: non c e niente da sostituire', () => {
  const s = snap({ pages: [pagina({ slug: '/promo', overrides_route: false })] });
  assert.equal(paginaPerPercorso(s, '/promo', false)?.slug, '/promo');
});

test('senza istantanea il sito resta com e', () => {
  assert.equal(paginaPerPercorso(null, '/', false), null);
  assert.equal(paginaPerPercorso(null, '/promo', false), null);
  assert.deepEqual(pagineVisibili(null), []);
});

// ─── Stati e finestre ───────────────────────────────────────────────────────
test('le bozze e le archiviate non arrivano mai al sito', () => {
  const s = snap({
    pages: [
      pagina({ id: 'a', slug: '/a', status: 'draft' }),
      pagina({ id: 'b', slug: '/b', status: 'archived' }),
      pagina({ id: 'c', slug: '/c', status: 'published' }),
    ],
  });
  assert.deepEqual(pagineVisibili(s).map((p) => p.slug), ['/c']);
});

test('una pagina programmata compare solo dalla sua data', () => {
  const futura = snap({
    pages: [pagina({ slug: '/x', status: 'scheduled', scheduled_at: '2099-01-01T00:00:00Z' })],
  });
  assert.equal(paginaPerPercorso(futura, '/x', false), null);

  const passata = snap({
    pages: [pagina({ slug: '/x', status: 'scheduled', scheduled_at: '2020-01-01T00:00:00Z' })],
  });
  assert.equal(paginaPerPercorso(passata, '/x', false)?.slug, '/x');
});

test('una pagina scaduta sparisce da sola', () => {
  const s = snap({
    pages: [pagina({ slug: '/x', status: 'published', unpublish_at: '2020-01-01T00:00:00Z' })],
  });
  assert.equal(paginaPerPercorso(s, '/x', false), null);
});

// ─── Indirizzi ──────────────────────────────────────────────────────────────
test('la barra finale e la query non cambiano il risultato', () => {
  const s = snap({ pages: [pagina({ slug: '/promo' })] });
  for (const p of ['/promo', '/promo/', '/promo?x=1', '/promo#sezione']) {
    assert.equal(paginaPerPercorso(s, p, false)?.slug, '/promo', p);
  }
});

// ─── Popup e striscioni ─────────────────────────────────────────────────────
const popup = (over: Record<string, unknown> = {}) => ({
  id: 'o1', kind: 'popup' as const, name: 'Test', status: 'published' as const,
  config: {}, targeting: {}, starts_at: null, ends_at: null, sort_order: 0,
  ...over,
});

test('un popup scaduto non compare', () => {
  const s = snap({ pages: [], overlays: [popup({ ends_at: '2020-01-01T00:00:00Z' })] });
  assert.equal(overlayAttivi(s, 'popup', '/', ORA).length, 0);
});

test('un popup non ancora cominciato non compare', () => {
  const s = snap({ overlays: [popup({ starts_at: '2099-01-01T00:00:00Z' })] });
  assert.equal(overlayAttivi(s, 'popup', '/', ORA).length, 0);
});

test('senza pagine indicate il popup vale ovunque', () => {
  const s = snap({ overlays: [popup()] });
  assert.equal(overlayAttivi(s, 'popup', '/qualsiasi', ORA).length, 1);
});

test('con le pagine indicate vale solo li', () => {
  const s = snap({ overlays: [popup({ targeting: { pages: ['/promo'] } })] });
  assert.equal(overlayAttivi(s, 'popup', '/', ORA).length, 0);
  assert.equal(overlayAttivi(s, 'popup', '/promo', ORA).length, 1);
});

test('le esclusioni vincono sulle inclusioni', () => {
  const s = snap({ overlays: [popup({ targeting: { excludePages: ['/promo'] } })] });
  assert.equal(overlayAttivi(s, 'popup', '/promo', ORA).length, 0);
});

test('una bozza di popup non arriva al sito', () => {
  const s = snap({ overlays: [popup({ status: 'draft' })] });
  assert.equal(overlayAttivi(s, 'popup', '/', ORA).length, 0);
});

// ─── Header e footer ────────────────────────────────────────────────────────
test('header e footer del builder restano spenti di default', () => {
  const s = snap({ navigation: { header: { items: [{ id: 'a', label: {}, kind: 'page' }] } } });
  assert.equal(usaHeaderBuilder(s), false);
  assert.equal(usaFooterBuilder(s), false);
});

test('l header del builder si accende solo se e acceso E ha delle voci', () => {
  const conVoci = snap({
    site: { ...snap().site, settings: { use_builder_header: true } },
    navigation: { header: { items: [{ id: 'a', label: {}, kind: 'page' }] } },
  });
  assert.equal(usaHeaderBuilder(conVoci), true);

  const senzaVoci = snap({
    site: { ...snap().site, settings: { use_builder_header: true } },
    navigation: { header: { items: [] } },
  });
  assert.equal(usaHeaderBuilder(senzaVoci), false);
});

test('le impostazioni mancanti non fanno saltare niente', () => {
  assert.deepEqual(impostazioniSito(null), {});
});

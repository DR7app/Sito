#!/usr/bin/env node
/**
 * verifyTailwindClasses — rete di sicurezza per la migrazione da
 * cdn.tailwindcss.com (Play CDN, compilazione nel browser) a Tailwind
 * compilato in build.
 *
 * Il Play CDN leggeva il DOM vivo: qualunque classe finisse in pagina veniva
 * generata. Il compilatore di build legge invece i file sorgente elencati in
 * `tailwind.config.js > content`. Se una classe viene composta a runtime
 * (`bg-${colore}-500`) o arriva dal database, sparisce dal CSS senza che
 * nessuno se ne accorga: la pagina si rompe solo a occhio.
 *
 * Questo script:
 *   1. estrae ogni token plausibile dai file scansionati (stesso estrattore
 *      grezzo di Tailwind);
 *   2. chiede a Tailwind quali di quei token sono utility valide, compilando
 *      un foglio di prova che le contiene tutte;
 *   3. confronta con il CSS realmente prodotto da `vite build`;
 *   4. fallisce se una utility valida manca dal CSS di produzione.
 *
 * Uso: npm run build && npm run verify:css
 */
import fg from 'fast-glob'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import tailwind from 'tailwindcss'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cfg = (await import(path.join(ROOT, 'tailwind.config.js'))).default

// ── 1. token candidati ────────────────────────────────────────────────────
const files = await fg(cfg.content, { cwd: ROOT, absolute: true })
if (files.length === 0) {
  console.error('ERRORE: tailwind.config.js > content non trova nessun file.')
  process.exit(1)
}
const TOKEN_RE = /[^<>"'`\s]*[^<>"'`\s:]/g
const tokens = new Set()
for (const f of files) {
  for (const m of fs.readFileSync(f, 'utf8').match(TOKEN_RE) || []) {
    if (m.length < 2 || m.length > 120) continue
    tokens.add(m)
  }
}

// ── 2. quali token Tailwind riconosce come utility ────────────────────────
const probeFile = path.join(ROOT, 'node_modules', '.cache-tw-probe.txt')
fs.mkdirSync(path.dirname(probeFile), { recursive: true })
fs.writeFileSync(probeFile, [...tokens].join('\n'))

const probeCss = (await postcss([
  tailwind({ ...cfg, content: [probeFile] }),
]).process('@tailwind utilities;@tailwind components;', { from: undefined })).css
fs.rmSync(probeFile, { force: true })

const esc = (c) => c.replace(/[.:/[\]()#!%,+*<>&@'"$^=|?~`{} ]/g, (ch) => '\\' + ch)
const emitted = new Set()
for (const t of tokens) {
  if (probeCss.includes('.' + esc(t))) emitted.add(t)
}

// ── 3. CSS realmente prodotto dalla build ─────────────────────────────────
const distCss = await fg('dist/assets/*.css', { cwd: ROOT, absolute: true })
if (distCss.length === 0) {
  console.error('ERRORE: nessun CSS in dist/assets. Lancia prima `npm run build`.')
  process.exit(1)
}
const built = distCss.map((f) => fs.readFileSync(f, 'utf8')).join('\n')

// ── 4. confronto ──────────────────────────────────────────────────────────
const missing = [...emitted].filter((t) => !built.includes('.' + esc(t))).sort()

console.log(`file scansionati:      ${files.length}`)
console.log(`token candidati:       ${tokens.size}`)
console.log(`utility Tailwind vere: ${emitted.size}`)
console.log(`presenti nel CSS:      ${emitted.size - missing.length}`)

if (missing.length) {
  console.error(`\nMANCANTI dal CSS di produzione (${missing.length}):`)
  for (const m of missing.slice(0, 100)) console.error('  ' + m)
  console.error('\nAggiungile a `safelist` in tailwind.config.js oppure scrivi la')
  console.error('classe per intero nel sorgente invece di comporla a runtime.')
  process.exit(1)
}
console.log('\nOK — nessuna utility persa nella compilazione.')

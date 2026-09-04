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
    // Un nome di classe Tailwind contiene sempre almeno una lettera (`p-4`,
    // `opacity-45`, `w-[45px]`). I token di sole cifre e punteggiatura — `45`,
    // `0.6`, `7)` — arrivano da numeri nel codice e non sono classi: tenerli
    // produceva solo falsi allarmi, perche' quelle sequenze compaiono dentro i
    // VALORI del CSS.
    if (!/[a-zA-Z]/.test(m)) continue
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

/**
 * Cerca il SELETTORE della classe, non la stringa.
 *
 * Prima bastava che `.<token>` comparisse da qualche parte nel foglio, e un
 * token numerico come `45` risultava "trovato" dentro un VALORE — per esempio
 * `opacity:0.45` contiene `.45`. Cosi' il controllo si inventava utility che
 * Tailwind non genera affatto e falliva la build per niente. Un guardiano che
 * grida al lupo senza motivo smette di essere letto: qui il nome della classe
 * deve finire dove finisce davvero, cioe' davanti a un carattere che in un
 * nome di classe non puo' esserci.
 */
const FINE_CLASSE = '[{,:>+~\\[\\s]'
const contieneClasse = (css, token) => new RegExp('\\.' + esc(token) + FINE_CLASSE).test(css)

const emitted = new Set()
for (const t of tokens) {
  if (contieneClasse(probeCss, t)) emitted.add(t)
}

// ── 3. CSS realmente prodotto dalla build ─────────────────────────────────
const distCss = await fg('dist/assets/*.css', { cwd: ROOT, absolute: true })
if (distCss.length === 0) {
  console.error('ERRORE: nessun CSS in dist/assets. Lancia prima `npm run build`.')
  process.exit(1)
}
const built = distCss.map((f) => fs.readFileSync(f, 'utf8')).join('\n')

// ── 4. confronto ──────────────────────────────────────────────────────────
const missing = [...emitted].filter((t) => !contieneClasse(built, t)).sort()

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

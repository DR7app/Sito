import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'fs'
import { resolve } from 'path'

// Generate a unique build version on each build
const buildVersion = Date.now().toString()

// 07/09/2026 — Sigla della pubblicazione appesa al nome di ogni file
// compilato. Netlify risponde ai file mancanti con la pagina HTML e
// l'intestazione "immutable, un anno": il browser la conserva sotto quell
// indirizzo. Se un deploy successivo ripubblica lo STESSO nome (succede a
// ogni revert: contenuto identico, hash identico), quella scheda riceve la
// pagina HTML al posto del programma e non si riprende piu'. E' successo sul
// gestionale, e qui il rischio era identico.
const MARCHIO_BUILD = (
  process.env.DEPLOY_ID || process.env.COMMIT_REF || buildVersion
).slice(0, 8)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'generate-build-version',
      writeBundle() {
        // Write build version to dist after build completes
        writeFileSync(resolve(__dirname, 'dist', 'build-version.txt'), buildVersion)
      }
    }
  ],
  define: {
    '__BUILD_VERSION__': JSON.stringify(buildVersion)
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-[hash]-${MARCHIO_BUILD}.js`,
        chunkFileNames: `assets/[name]-[hash]-${MARCHIO_BUILD}.js`,
        assetFileNames: `assets/[name]-[hash]-${MARCHIO_BUILD}[extname]`,
      }
    }
  }
})

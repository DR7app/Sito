/** @type {import('tailwindcss').Config} */

// Configurazione allineata 1:1 al Play CDN (cdn.tailwindcss.com = Tailwind
// 3.4.17) che il sito usava prima: nessun plugin, nessun override di tema,
// preset di default. L'unica differenza e' QUANDO il CSS viene generato:
// prima nel browser a ogni render, ora una volta sola durante `vite build`.
//
// NOTA: il Play CDN scansiona il DOM vivo, quindi generava anche le classi
// che compaiono solo a runtime. Qui la sorgente e' il codice: qualsiasi
// classe che non appare per intero in un file sorgente va dichiarata nella
// `safelist` sotto, altrimenti sparisce dal CSS finale.
export default {
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './constants.ts',
    './translations.ts',
    './types.ts',
    './components/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
    './sections/**/*.{ts,tsx}',
    './layouts/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './contexts/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
    './data/**/*.{ts,tsx}',
    './auth/**/*.{ts,tsx}',
  ],
  // Classi che non compaiono mai per intero nel sorgente (composte a runtime
  // o iniettate da librerie esterne). Oggi il codice non ne costruisce
  // nessuna: la lista resta come punto unico dove dichiararle in futuro.
  safelist: [],
  theme: {
    extend: {},
  },
  plugins: [],
}

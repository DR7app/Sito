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
  // 2026-09-04 — restyling editoriale (ispirazione: alta orologeria).
  // SOLO estensioni del preset di default: nessuna chiave viene rimossa,
  // quindi ogni utility gia' usata nel codice continua a esistere. Cambiano
  // i VALORI di tre gruppi (font, raggi, tracking) che erano quelli di
  // fabbrica di Tailwind e davano al sito l'aria da template generico.
  theme: {
    extend: {
      // Tre voci tipografiche, come nelle riviste: display con grazie per i
      // titoli, grottesco geometrico per l'interfaccia, monospazio per le
      // micro-etichette (occhielli, metadati, prezzi in tabella).
      fontFamily: {
        sans: ['Jost', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        serif: ['Bodoni Moda', 'Playfair Display', 'Georgia', 'serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        display: ['Bodoni Moda', 'Playfair Display', 'Georgia', 'serif'],
        ui: ['Jost', 'system-ui', '-apple-system', 'sans-serif'],
      },
      // Raggi quasi nulli: il bordo netto e' il segno grafico dell'editoriale.
      // `full` resta 9999px perche' regge pillole, pallini e avatar tondi.
      borderRadius: {
        none: '0px',
        sm: '2px',
        DEFAULT: '2px',
        md: '2px',
        lg: '3px',
        xl: '4px',
        '2xl': '6px',
        '3xl': '10px',
        full: '9999px',
      },
      letterSpacing: {
        display: '-0.01em',
        label: '0.14em',
        eyebrow: '0.28em',
        hairline: '0.42em',
      },
      // La temperatura di TUTTO il sito si decide qui. `black` e `white` sono
      // i due colori piu' usati nel markup esistente (bg-black, text-white,
      // border-white/10...): ridefinirli sposta l'intera interfaccia da
      // "nero digitale + bianco clinico" a "ossidiana + avorio caldo" senza
      // toccare un solo componente. La scala `gray` diventa minerale calda
      // per non stonare con l'avorio.
      colors: {
        black: '#08090A',
        white: '#F6F3ED',
        gray: {
          50: '#F7F5F1',
          100: '#EDEAE4',
          200: '#DCD8D0',
          300: '#C3BEB4',
          400: '#A19C92',
          500: '#837E75',
          600: '#67635C',
          700: '#4B4843',
          800: '#2A2926',
          900: '#191917',
          950: '#0D0D0C',
        },
        dr7: {
          obsidian: '#08090A',
          graphite: '#131416',
          elevated: '#1C1E21',
          ivory: '#F6F3ED',
          mineral: '#A19C92',
          metal: '#C9BEA8',
          gold: '#C8A24A',
        },
      },
      transitionTimingFunction: {
        editorial: 'cubic-bezier(0.22, 1, 0.36, 1)',
        entrance: 'cubic-bezier(0.16, 1, 0.3, 1)',
        curtain: 'cubic-bezier(0.76, 0, 0.24, 1)',
      },
      transitionDuration: {
        fast: '180ms',
        standard: '380ms',
        editorial: '750ms',
        cinematic: '1200ms',
      },
      spacing: {
        'sp-lg': '4rem',
        'sp-xl': '7rem',
        'sp-2xl': '11rem',
        'sp-3xl': '16rem',
      },
      boxShadow: {
        editorial: '0 30px 80px -40px rgba(0,0,0,0.9)',
      },
      maxWidth: {
        editorial: '80rem',
        reading: '62ch',
      },
    },
  },
  plugins: [],
}

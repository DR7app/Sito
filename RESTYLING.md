# DR7 Digital Flagship — avanzamento

Riferimenti: `AUDIT.md` (sessione 1) e la Design Bible del prompt v2.
Stato al 04/09/2026.

| Sessione | Stato | Note |
|---|---|---|
| 1 — Audit | **fatta** | `AUDIT.md`, 3 decisioni sugli asset confermate dalla direzione |
| 2 — Design system | **fatta** | token + `/styleguide` |
| 3 — Homepage | **fatta** | sei atti, dati veri, tutto amministrabile |
| 4 — Collection + Vehicle detail | parziale | flotta e card rifatte; **la pagina veicolo non esiste ancora** |
| 5 — Services + brand + trust | da fare | recensioni ancora nel footer, error pages da disegnare |
| 6 — Booking UI | da fare | `CarBookingWizard` (8.015 righe) intatto |
| 7 — CMS / Website Builder | in corso altrove | il gestionale ha gia' la tab Website Builder (tabelle `wb_*`) |
| 8 — Polish + QA + produzione | da fare | nessun deploy eseguito |

---

## Cosa e' stato costruito

**Design system** — `styles/index.css` + `tailwind.config.js`
Token per colore, tipografia, spazio, contenitore, bordo, raggio, movimento,
easing, livelli. Tre superfici (`surface-dark`, `surface-graphite`,
`surface-light`) che riassegnano in blocco testo, testo secondario e filetti:
un componente non sa su quale superficie si trova, eredita e basta.

Palette: Obsidian `#08090A`, Graphite `#131416`, Warm Ivory `#F6F3ED`,
Mineral `#A19C92`, un solo metallo `#C9BEA8`. In `tailwind.config.js` sono
ridefiniti `black`, `white` e l'intera scala `gray`: e' cosi' che la
temperatura cambia in tutto il sito senza toccare i singoli componenti.

Tipografia: **Bodoni Moda** (display), **Jost** (interfaccia), **IBM Plex
Mono** (metadati). Scala completa da `t-display-xxl` a `t-eyebrow`.

**Firma DR7 — `seam`**: un filetto da un pixel percorso da un riflesso, come la
luce che corre lungo una fiancata. Ricorre sotto i titoli di sezione, nelle
schede e nelle scene della Collezione.

**Primitive** — `components/editorial/`
`Shell`, `Section`, `Grid`, `Stack`, `Eyebrow`, `Statement`, `SectionHead`,
`SeamRule`, `Cta`, `Metric`, `Reveal`, `MediaVideo`, `VehicleScene`.

**Homepage** — `pages/HomePage.tsx`, sei atti:
arrivo (film + una frase + una CTA) · silenzio · Collezione (tavole) ·
esperienze (servizi reali) · marca (superficie chiara) · accesso.

---

## Regole nate dal progetto

1. **Le locandine non si ritagliano e non si sovrascrivono.** I visual della
   flotta contengono gia' marca, modello e scheda tecnica. Si presentano
   intere, incorniciate, con spazio intorno. Accanto si mette solo cio' che
   nell'immagine non c'e': numero d'ordine, categoria, CTA. Il nome resta in
   `sr-only` per screen reader e motori di ricerca.
2. **Il testo delle sezioni sta nel gestionale, non nel codice.** `HomeCopy` ha
   tutti i campi dei sei atti. `getHomeCopy()` fa ripiego **campo per campo**:
   una riga salvata prima non puo' svuotare la pagina.
3. **Nessun numero inventato.** `metrics: []` di default; la sezione non compare
   finche' non ci sono valori verificati.
4. **Lo stato nascosto delle rivelazioni vive dietro `reveal-ready`**, classe
   che accende `index.tsx`. Se il JavaScript non parte, niente nasconde niente.

---

## Da fare prima di andare in produzione

1. **`npm run sito:gen` dal gestionale** (`~/DR7-staging`), poi
   `npm run sito:check`: i nuovi campi di `HomeCopy` devono comparire nel
   pannello Sito > Home. Finche' non si fa, il sito usa i default — che sono
   corretti, ma l'operatore non li vede nel pannello.
2. **Ricodificare i 4 video pesanti** (10 MB per 8 secondi). I poster ora
   esistono in `public/poster/`.
3. **Pagina veicolo** (sessione 4) e **UI del booking** (sessione 6).
4. **`h1` mancante** su `/supercar-luxury`, `/noleggio-mare`, `/about`,
   `/signin`, `/signup`, `/aviation-quote` — difetto preesistente, sessione 8.
5. **Sitemap**: contiene `/cars` e `/urban-cars`, che rispondono 301.

---

## Verifiche eseguite

- `npm run build` verde; `npm run verify:css` verde (nessuna utility persa);
  `tsc --noEmit` pulito sui file del sito.
- 28 rotte visitate con browser reale: **zero errori di pagina**, zero
  overflow orizzontale, contenuto presente ovunque.
- Larghezze 320 → 2560 (15 misure) su home, flotta, styleguide, membership:
  **nessun overflow**.
- Nessuna modifica a calcoli, disponibilita', prenotazioni, pagamenti,
  wallet, autenticazione, API o rotte esistenti.

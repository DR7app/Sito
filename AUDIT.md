# DR7 DIGITAL FLAGSHIP — AUDIT (Sessione 1)

Repository analizzato: `~/Sito` — remote `DR7app/Sito`, branch `main`, commit di
partenza `ca48d6e`. Sito in produzione: **dr7.app** (Netlify).

Metodo: lettura del codice sorgente, interrogazione in sola lettura del
database di produzione (`centralina_pro_config`), verifica HTTP degli asset
serviti da dr7.app, misura di dimensioni/peso/durata di tutti i file in
`public/`, ispezione visiva di 45 immagini rappresentative.

> **Cosa NON contiene questa sessione:** nessuna decisione creativa, nessuna
> nuova pagina. Le uniche modifiche di codice presenti nel working tree sono
> elencate al § 8 e sono anteriori al passaggio al sistema v2.

---

## 1. MAPPA DELL'ARCHITETTURA

### 1.1 Stack

| Livello | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript, Vite 6, React Router 7 (SPA, no SSR) |
| Stile | Tailwind 3.4.17 compilato in build (PostCSS), un solo foglio `styles/index.css` |
| Motion | framer-motion 12 |
| Dati | Supabase (PostgreSQL + Auth + Storage), client `@supabase/supabase-js` |
| Backend applicativo | 78 Netlify Functions in `netlify/functions` |
| Pagamenti | **Nexi XPay** (principale) + **Stripe** (carte salvate, identity, alcuni flussi) |
| Email / messaggi | Resend, Nodemailer, WhatsApp via Green API |
| PDF / firma | pdf-lib, pdfkit, Trustera360 |
| Hosting | Netlify (`netlify.toml`: publish `dist`, build `npm run build`) |
| Analytics | GA4 via `gtag` + **Google Consent Mode v2** già implementato in `index.html` |

Bundle attuale in produzione: **1 chunk JS da 2,11 MB** (575 KB gzip) e
**105 KB CSS** (16,5 KB gzip). Nessun code-splitting per route.

### 1.2 Dove vive la business logic

Non è nel frontend, ed è la notizia migliore di tutto l'audit.

- **Prezzi, disponibilità, cauzioni, assicurazioni, km, fasce**: `centralina_pro_config`
  (riga singola `id = 'main'`, colonna JSONB `config`) letta via
  `loadCentralinaConfigOnce()` in `utils/siteCopy.ts`, più le funzioni
  `calculate-dynamic-price`, `get-rental-config`, `getAvailabilityWindows`,
  `checkVehicleAvailability`, `checkCategoryAvailability`.
- **Prenotazione**: `components/ui/CarBookingWizard.tsx` — **8.015 righe**, il
  file più grande e più rischioso del progetto. Contiene UI *e* calcoli.
- **Pagamento**: `create-nexi-payment`, `nexi-callback`, `nexi-verify-order`,
  `create-payment-intent`, `stripe-webhook`.
- **Wallet**: RPC Postgres `book_with_credits`, `add_credits`, `deduct_credits`.
- **Auth**: Supabase Auth lato client (`contexts/AuthContext.tsx`) + funzioni
  `signin.js` / `signup.js` / `register-customer.js` per i flussi custom.

### 1.3 Tabelle Supabase consumate dal frontend

`bookings` (54 riferimenti) · `customers_extended` (35) · `centralina_pro_config` (15)
· `signature_requests` (13) · `vehicles` (12) · `signature_audit_trail` (9)
· `dr7_club_subscriptions` (8) · `pending_nexi_bookings` (7) · `contracts` (7)
· `preventivi` (6) · `noleggio_tour_seats` (6) · `credit_wallet_purchases` (6)
· `user_consents` (5) · `membership_purchases` (5) · `cauzioni` (5)
· `user_credit_balance` (4) · `noleggio_tour_departures` (4) · `customer_invites` (4)
· `reservations` (3) · `email_verifications` (3) · `credit_transactions` (3)
· `user_documents` · `targa_lookup_log` · `system_messages` · `noleggio_catalog`
· `car_wash_services` · `wallet_interest_accruals` · `service_secrets`
· `revenue_config` · `referral_bonuses` · `clienti_estesi`

### 1.4 CMS esistente — **esiste già ed è sostanzioso**

`centralina_pro_config.config.site_copy` è un JSONB con **33 sezioni** già
popolate in produzione:

```
about · aviationMarine · aviationQuote · booking · bookingSearchBox ·
cancellazione · careers · carwash · checkEmail · confirmationSuccess ·
contact · creditWallet · dr7ClubPlan · faq · firma · flotta · footer ·
franchising · header · home · investitori · jetSearchResults · legal ·
locations · mechanical · membership · payment · paymentCancel ·
paymentSuccess · press · registrazioneCliente · signUp · token
```

I default vivono in `utils/siteCopy.ts` (4.074 righe) e vengono **generati**
dall'admin con `npm run sito:gen` (script `genSiteCopyDefaults.mjs` nel repo
del gestionale, che legge questo repo).

Il pattern corretto di lettura è quello di `getFaqCopy()`: **fallback campo per
campo**. `getHomeCopy()` invece fa fallback *a blocco* (`if (snap.home && …)
return snap.home`) — vedi § 6, Rischio R2.

Sezione `aspetto` (logo, altezze, widget) prevista dal codice ma **non ancora
salvata** in produzione: il sito usa `DEFAULT_ASPETTO`.

### 1.5 Multilingua

Sistema proprietario: `translations.ts` (512 righe, chiavi `{en, it}`) +
`contexts/LanguageContext.tsx` + `hooks/useTranslation.ts`. Ogni testo del CMS
è duplicato in coppie `*_it` / `*_en`. **Non è i18next**: qualsiasi nuovo testo
va aggiunto con la stessa convenzione o rompe la lingua inglese.

### 1.6 Routing

51 route pubbliche + 10 sotto `/account` + 7 sotto `/partner`. Tre redirect 301
sono in `netlify.toml` (`/cars → /supercar-luxury`, `/urban-cars → /urban`,
`/car-wash-services → /prime-wash`) e sono **duplicati anche in React Router**.

---

## 2. INVENTARIO CONTENUTI

Legenda: **K** keep · **I** improve · **RP** reposition · **RW** rewrite ·
**RU** remove from UI · **RV** replace visually.

### 2.1 Pagine pubbliche editoriali

| Pagina | Righe | Stato attuale | Classe |
|---|---|---|---|
| `HomePage` | 229 | Hero video + griglia categorie. **Oggi la griglia è quasi sempre vuota**: `HOME_HIDDEN_DIVISIONS` esclude **tutte e 8** le categorie di `RENTAL_CATEGORIES` (verificato: 0 card visibili). In pratica la home è solo un video muto senza una sola parola. | **RW + RV** |
| `AboutPage` | 195 | Storia + fondatori (foto reali `Valerio.jpg`, `Ilenia.jpg`), testo dal CMS | **K contenuto / RV forma** |
| `InvestitoriPage` | 226 | Contenuto reale, impaginazione da template | **K / RV** |
| `FranchisingPage` | 178 | idem | **K / RV** |
| `TokenPage` | 190 | Innovazione digitale | **K / RV** |
| `PressPage`, `CareersPage` | 120/150 | Contenuto scarno | **I** |
| `FAQPage` | 116 | 5 domande, alimentate dal CMS + schema FAQPage | **K / RV** |
| `ContactPage` | 173 | WhatsApp + dati societari | **K / RV** |

### 2.2 Commerce

| Pagina | Righe | Nota | Classe |
|---|---|---|---|
| `FlottaIndexPage` | 140 | Landing collezione, raggruppa per categoria. **Nella modalità flotta la card non mostrava nemmeno il nome del veicolo.** | **RV** |
| `RentalPage` | 1.497 | Pagina categoria con ricerca, prezzi dinamici, filtri | **K logica / RV** |
| `NoleggioServicePage` | ~200 | Mare / Aria / Soggiorni da `noleggio_catalog` | **K / RV** |
| `CarWashServicesPage` | 1.141 | Catalogo Prime Wash a locandine | **K / RV** |
| `MechanicalServicesPage` | ~400 | idem | **K / RV** |
| `JetSearchResultsPage` | 148 | Riusa `RentalCard` | **RV** |
| `MembershipPage` | 343 | DR7 Club, prezzi dal CMS | **K / RV** |
| `CreditWalletPage` | 561 | Pacchetti wallet | **K / RV** |
| **Vehicle detail** | — | **NON ESISTE.** Nessuna route per singolo veicolo. Dal catalogo si va direttamente al wizard. | **DA CREARE** |

### 2.3 Booking / checkout — zona rossa

| Componente | Righe | Classe |
|---|---|---|
| `CarBookingWizard` | **8.015** | **K logica assoluta / RV solo presentazione** |
| `CarWashBookingPage` | 2.344 | idem |
| `MechanicalBookingPage` | 1.311 | idem |
| `HelicopterBookingForm` | 1.054 | idem |
| `BookingPage`, `PaymentPage`, `PaymentSuccessPage` (837), `PaymentCancelPage`, `ConfirmationSuccessPage` | — | idem |
| `TourBookingModal`, `BookingModal`, `BookingSearchBox` | 465/465/397 | idem |

### 2.4 Account, partner, auth, legale, operativo

- **Account** (10 schermate, ~3.700 righe): profilo, sicurezza, documenti,
  club, membership, prenotazioni, preventivi, referral, notifiche → **K / RV**
- **Partner** (7 schermate) → **K / RV**
- **Auth** (SignIn, SignUp 1.233 righe, ForgotPassword, ResetPassword,
  CheckEmail, AuthCallback, AuthVerify) → **K / RV**
- **Legale** (Terms, Privacy, CookiePolicy, RentalAgreement,
  CancellationPolicy) → **K, non toccare i testi**
- **Operativo** (`FirmaPage` 546, `RegistrazioneClientePage` 611, `PostPage`) →
  **K, fuori dal perimetro creativo**

### 2.5 Da togliere dall'interfaccia (non dal database)

- Le 5 "Division showcase" già nascoste dal 22/06/2026 (`HOME_HIDDEN_DIVISIONS`):
  **RU**, il dato resta in `RENTAL_CATEGORIES`.
- Il widget recensioni Google grezzo dentro il footer: **RP** — i dati restano,
  la presentazione va rifatta e spostata.
- 42 file `.md` / `.sql` / `.js` di diagnostica nella radice del repo
  (`CHECK_*.sql`, `EMERGENCY_FIX.md`, `test-*.js`…): non impattano il sito ma
  vanno archiviati. **RU**

---

## 3. INVENTARIO ASSET — **il vincolo numero uno del progetto**

`public/` pesa **103 MB**: 174 JPEG/JPG, 45 PNG, 4 MP4, **0 WebP, 0 AVIF**.
Nessun `srcset`, nessuna trasformazione responsive lato sito (esiste
`utils/immagineCatalogo.ts` solo per le locandine su Supabase).

### 3.1 Locandine veicolo — 1080×1920, ~450 KB, **NON sono fotografie**

`rs3` `bmw-m3` `bmw-m4` `porsche-911` `c63` `macan` `cayenne` `mercedes-gle`
`mercedes_amg` `vito` `ducato` `208` `clio4a` `clio4b` `c3` `c3r` `cr3w`
`captur` `panda1-3` `bmw-m2` `audi-rs3`

Sono **composizioni pubblicitarie con testo già impresso**: logo della marca,
nome del modello, box specifiche con icone (alimentazione, motore, CV, Nm,
velocità max, 0–100), payoff, auto scontornata su fondo di mattoni scuri.

Conseguenze, tutte vincolanti:

1. **Non si possono ritagliare.** Qualsiasi crop taglia le specifiche.
2. **Non si possono usare a piena pagina.** A tutto schermo il testo impresso
   diventa enorme e va in conflitto con la tipografia del sito.
3. **Non ci si può scrivere sopra.** Marca, modello e specifiche sono già
   dentro l'immagine: un titolo sovrapposto le duplicherebbe.
4. Il formato 9:16 è verticale: adatto a schede e a scene verticali, inadatto a
   un hero 16:9.

→ **Utilizzabile fullscreen: NO.** Vanno trattate come *tavole* — inquadrate,
con margine generoso, su superficie neutra, senza testo sovrapposto.

### 3.2 Fotografie reali DR7 — `s1`…`s27`, 1200×1600, 160–320 KB

Alfa Romeo Stelvio Quadrifoglio con adesivi DR7: esterni, interni in pelle
rossa, volante, pulsante start/stop, selettore del cambio, pannelli porta.
**Sono le uniche fotografie autentiche dell'azienda.**

Qualità: scatti da telefono, luce piatta, cielo coperto, sfondi con piazzale,
edifici, un sacchetto di plastica sul sedile.

→ **Utilizzabile fullscreen: NO in campo largo. SÌ in dettaglio stretto** —
volante, pulsante, cuciture, selettore: ritagliati stretti reggono benissimo
una banda editoriale e portano autenticità, che è esattamente ciò che manca
alle immagini generate.

### 3.3 Immagini generate — bande menu e categorie

`menu-mobilita` `menu-mare` `menu-aria` `menu-property` `menu-servizi`
`menu-club` `menu-business` `menu-digital` `menu-contatti` (1774×887, 2:1)
`car` `urbanc` `utili` `urbancars` `yacht1` `privatejet` `exclusivemc`
`servizi-lavaggio`

Estetica cinematografica scura, coerente col marchio, ma riconoscibilmente
generata. Ispezionate una per una, con esiti diversi:

- `menu-mobilita.jpeg` mostrava una **Bugatti Chiron**, che non è nella flotta.
  **Sostituita** (04/09/2026) con un ritaglio astratto della stessa immagine:
  asfalto bagnato e riflessi, nessun veicolo riconoscibile.
- `car.jpeg` mostrava una **supercar inesistente** con lo stemma DR7 sulla
  calandra ed è il ripiego predefinito di `getVehicleImage()`: un veicolo senza
  locandina mostrava quindi un'auto inventata. **Sostituita** con una tavola
  verticale astratta (ciottoli bagnati, luci calde).
- `urbanc.jpeg` / `urbancars.jpeg` mostrano modelli **reali** (Renault Clio,
  VW T-Roc) con una targa "DR7" fabbricata. Rischio minore: **restano**, da
  rivedere solo se useremo foto reali.
- `supercar.jpeg` **non** è una supercar inventata: è la locandina Prime Wash
  "Supercar Experience" con i **prezzi reali** (€89 / €149 / €189 / €69) e una
  Porsche 911 GT3 RS. Appartiene alla categoria § 3.4 e **non va mai
  ritagliata**. *(Nota: `getVehicleImage()` mappa un veicolo chiamato
  "supercar" su questo file, cioè su un listino prezzi del lavaggio. Da
  valutare con la direzione, è contenuto di business.)*

Gli originali sostituiti sono conservati in `_asset-originali/`.

→ **Utilizzabile fullscreen: SÌ a dimensione media (bande 2:1), NO a
tutto schermo su desktop grande** (a 2560px gli artefatti si vedono).

### 3.4 Locandine di servizio con testo impresso

`prime-wash-header.jpeg` (1280×2293), `heli1.jpeg`, tutta la cartella
`public/catalog/**` (Prime Wash e Meccanica, 1080×1350 4:5).

Già gestite correttamente da `components/ui/RiquadroCatalogo.tsx` con
`object-contain`: **la scelta è giusta e va conservata**, sono locandine con
prezzi dentro, non foto.

### 3.5 Video

| File | Peso | Note |
|---|---|---|
| `main.mp4`, `video2…video6.mp4` | 1,4 – 3,3 MB | I sei filmati dello hero. **Sono versionati** in git. |
| `cars1.mp4` | 9,8 MB | 1920×1088, **8 secondi**, ~10 Mbps |
| `yacht.mp4` | 11,7 MB | idem |
| `helicopter1.mp4` | 10,7 MB | idem |
| `villa1.mp4` | 5,1 MB | idem |

**Difetto trovato e corretto — estensione maiuscola.** I sei file dello hero
erano committati come `main.MP4`, `video2.MP4`… mentre il CMS di produzione li
referenzia in minuscolo (`/main.mp4`). Su macOS e sulla CDN di produzione la
cosa passa inosservata perché il filesystem non distingue le maiuscole; su un
server che le distingue no.

Verificato in locale su `dist/`:

```
/main.mp4   -> 200 text/html   (fallback SPA: il <video> riceve HTML)
/main.MP4   -> 206 video/mp4
```

Era la causa dello hero nero in anteprima locale. Risolto rinominando i sei
file in minuscolo (`git mv`, contenuto invariato, verificato byte a byte contro
i file serviti da dr7.app). Dopo la correzione tutti e sei rispondono
`206 video/mp4`.

**Difetto aperto — peso.** 10 MB per 8 secondi significa ~10 Mbps, circa cinque
volte il necessario, e nessuno dei quattro ha un poster: mentre scarica,
l'utente vede nero. Da ricodificare nella sessione 8.

→ **Utilizzabile fullscreen: SÌ i sei dello hero. I quattro pesanti solo dopo
ricodifica e con poster.**

### 3.6 Sintesi asset

| Categoria | N. | Fullscreen | Azione |
|---|---|---|---|
| Locandine veicolo | ~24 | NO | trattare come tavole, mai crop, mai testo sopra |
| Foto reali DR7 (Stelvio) | 27 | solo dettaglio | ritagli stretti, correzione colore |
| Immagini generate | ~19 | media sì / grande no | 3 da sostituire (veicoli inesistenti) |
| Locandine servizio | ~30 | NO | `object-contain`, già corretto |
| Foto ville | ~20 | SÌ | le migliori del parco, 1440×960 |
| Video hero | 6 | SÌ | estensione corretta in minuscolo |
| Video pesanti | 4 | dopo ricodifica | poster + AV1/H.264 multi-bitrate |

**Conclusione:** il tetto qualitativo del flagship è fissato dai media, non dal
codice. Il design system deve essere costruito per apparire premium con questi
asset — tipografia, spazio, nero, filetti, la tavola inquadrata — e dichiarare
Media Requirements espliciti per il resto.

---

## 4. STATO SEO

Buono, e va preservato integralmente.

**Presente in `index.html`:**
- `<title>` e `description` ottimizzati per Cagliari/Sardegna
- `canonical` + `hreflang` it-IT / en / x-default
- Open Graph completo + Twitter Card
- **5 blocchi JSON-LD**: `Organization` (con 3 `department`), `WebSite` +
  `SearchAction`, `AutoRental` LocalBusiness (indirizzo, geo, orari,
  `areaServed` 8 località, `makesOffer`, `aggregateRating` 4.9/120),
  `FAQPage` (5 domande), `SiteNavigationElement` (3 voci)
- Google Consent Mode v2 impostato **prima** di gtag.js

**`public/robots.txt`**: allow generale, disallow su 12 percorsi privati,
riferimento alla sitemap.
**`public/sitemap.xml`**: 22 URL.
**`components/seo/SEOHead.tsx`**: esiste ma è usato in **3 pagine su 49** (CarWashServices, Contact, RentalPage).

**Debolezze rilevate:**
- SPA senza SSR: tutto il contenuto è renderizzato in JS.
- L'`<h1>` della homepage è nascosto visivamente (`clip: rect(0,0,0,0)`):
  corretto per l'indicizzazione, ma significa che **oggi la home non ha un
  titolo visibile**.
- La sitemap contiene `/cars` e `/urban-cars`, che rispondono **301**: vanno
  aggiornate alle destinazioni.
- Nessun `og:image` specifico per pagina.

**Vincoli per le sessioni successive:** nessuna route può cambiare senza
redirect 301; i 5 blocchi JSON-LD non si toccano se non per arricchirli; la
gerarchia dei titoli va mantenuta (un solo `h1` per pagina).

---

## 5. PUNTI DI INTEGRAZIONE COL GESTIONALE

Il nuovo frontend deve **consumare**, mai duplicare:

| Cosa | Da dove |
|---|---|
| Configurazione commerciale (prezzi, fasce, km, cauzioni, assicurazioni, orari, sezioni attive) | `centralina_pro_config.config` via `loadCentralinaConfigOnce()` |
| Testi e media del sito | `config.site_copy` (33 sezioni) via `utils/siteCopy.ts` |
| Categorie flotta visibili | `utils/flottaConfig.ts` (fonte unica per sito **e** menu) |
| Veicoli | `hooks/useVehicles.ts` → tabella `vehicles` (+ `getVehicles.ts`) |
| Disponibilità | `getAvailabilityWindows`, `checkVehicleAvailability`, `checkCategoryAvailability`, `getEarliestAvailability` |
| Prezzo dinamico | `calculate-dynamic-price` |
| Catalogo mare/aria/soggiorni | `noleggio_catalog` via `hooks/useNoleggioCatalog.ts` |
| Servizi lavaggio | `get-car-wash-services` |
| Recensioni | `get-google-reviews` |
| Wallet | `getCreditBalance`, RPC `book_with_credits` |
| Contatti | `hooks/useContactInfo.ts` |

**Forma dei dati veicolo già disponibile** (`useVehicles`): `id`, `name`,
`image`, `available`, `pricePerDay {eur, usd, crypto}`, `specs[]` con
`{label:{it,en}, value, icon}` (accelerazione, potenza, coppia, motore),
`category`, `plates[]`, `unavailableFrom`, `bookingDisabled`.

→ Le specifiche per una vehicle detail page **ci sono già**. Non serve
inventare nulla: vanno solo mostrate quando presenti e omesse quando no.

---

## 6. RISCHI E VINCOLI

| # | Rischio | Gravità | Mitigazione |
|---|---|---|---|
| **R1** | ~~I video dello hero non sono in git~~ — **falso allarme, corretto**: erano committati con estensione maiuscola (`main.MP4`) mentre il CMS li chiama in minuscolo. Su host case-sensitive lo hero diventa nero | **Risolto** | Rinominati in minuscolo con `git mv`; contenuto verificato identico alla produzione; le sei richieste tornano `206 video/mp4`. |
| **R2** | `getHomeCopy()` fa fallback a blocco: aggiungere campi nuovi a `HomeCopy` restituirebbe `undefined` per tutti finché l'admin non risalva | **Alta** | Passare al fallback campo per campo, come `getFaqCopy()`. Regola già appresa in passato: codice che legge una colonna nuova prima della migrazione lascia tutti fuori. |
| **R3** | `CarBookingWizard.tsx` — 8.015 righe con UI e calcoli mescolati | **Alta** | Sessione 6: toccare solo il markup di presentazione, mai le funzioni di calcolo; verificare con `git diff` che nessuna riga di logica cambi. |
| **R4** | Le locandine veicolo contengono già tipografia | **Alta** | Vincolo di art direction: mai crop, mai testo sopra. |
| **R5** | 3 immagini mostrano veicoli non in flotta (Bugatti Chiron, supercar inventata) | **Media/legale** | Sostituire o declassare a fondale astratto. |
| **R6** | Bundle unico da 2,11 MB, nessun code-splitting | **Media** | Lazy-load per route nella sessione 8; il wizard da solo vale gran parte del peso. |
| **R7** | Nessun WebP/AVIF, nessun `srcset` | **Media** | Pipeline immagini nella sessione 8. |
| **R8** | Testi bilingui in coppie `*_it`/`*_en` a mano | **Media** | Ogni nuovo testo va aggiunto in entrambe le lingue o l'inglese si rompe. |
| **R9** | Tre repository con `utils/siteCopy.ts`; rigenerare i default dal repo sbagliato distrugge il CMS | **Media** | Fonte unica: `~/Sito`. Dopo ogni modifica, `npm run sito:gen` + `npm run sito:check` dal gestionale. |
| **R10** | Nessun ambiente di staging identificato | **Media** | Da concordare prima della sessione 6 (prenotazione end-to-end di prova). |
| **R11** | 4 video da ~10 MB per 8 secondi, senza poster | **Media** | Ricodifica + poster. |
| **R12** | `verify:css` esiste perché le classi Tailwind composte a runtime spariscono dal CSS | **Bassa** | Continuare a lanciarlo dopo ogni build. |

### Vincoli non negoziabili confermati

- Non si toccano: calcolo prezzi, disponibilità, cauzioni, assicurazioni,
  booking, checkout, wallet, pagamenti, fatture, OTP, contratti, autenticazione,
  permessi, API, regole di noleggio.
- Nessun dato inventato: veicoli, prezzi, recensioni, metriche, specifiche.
- Route invariate salvo redirect 301 espliciti.
- Testi legali intoccabili.
- i18n `{it, en}` sempre in coppia.

---

## 7. I CINQUE RITROVAMENTI CHE CAMBIANO IL PROGETTO

1. **La homepage oggi non dice nulla.** Sei video muti e una griglia che il
   filtro `HOME_HIDDEN_DIVISIONS` svuota completamente. Non c'è un titolo
   visibile, non c'è una frase, non c'è una CTA. Non è una homepage da
   migliorare: è una homepage da scrivere.
2. **DR7 non possiede fotografia d'auto pulita.** Possiede locandine con il
   testo dentro e 27 scatti telefonici di una Stelvio. Tutta l'art direction
   della collezione dipende da questo.
3. **Lo hero era rotto e non si vedeva.** I sei filmati sono in git, ma con
   estensione maiuscola mentre il CMS li chiama in minuscolo: su un filesystem
   che distingue le maiuscole il `<video>` riceve l'`index.html` invece del
   video. Riprodotto, corretto, verificato.
4. **Il CMS esiste già e copre 33 sezioni.** La sessione 7 non parte da zero:
   estende un impianto funzionante.
5. **Non esiste una pagina veicolo.** Il salto è dal catalogo direttamente al
   wizard. È il pezzo che manca fra desiderio e conversione.

---

## 8. MODIFICHE GIÀ PRESENTI NEL WORKING TREE

Applicate prima del passaggio al sistema v2, sotto il brief precedente. Sono
coerenti con la Design Bible (Obsidian / Warm Ivory / Mineral Grey, coppia
display+sans, tokens) e costituiscono l'avvio della **Sessione 2**. Build verde,
`verify:css` verde, nessuna logica toccata.

| File | Modifica |
|---|---|
| `index.html` | Google Fonts: Exo 2 / Playfair / Rajdhani → **Bodoni Moda + Jost + IBM Plex Mono** |
| `tailwind.config.js` | `black` → `#08090A`, `white` → `#F6F3ED`, scala `gray` minerale calda, palette `dr7`, famiglie, raggi, tracking, durate, easing |
| `styles/index.css` | Design system: token colore/typo/spazio/bordo/raggio/motion/easing/container/z-index, superfici dark/graphite/light, scala tipografica, bottoni, filetti, media, **firma "seam"**, reveal |
| `hooks/useReveal.ts` | Rivelazione allo scroll con `IntersectionObserver`, rispetta reduced-motion |
| `components/editorial/` | `Reveal`, `MediaVideo` (lazy + poster + fallback), `primitives` (Shell, Section, Eyebrow, Statement, SeamRule, Cta, Metric, SectionHead), `VehicleScene`, `vehicleName` |
| `components/ui/Button|Card|Badge` | Restyling, API identica |
| `components/ui/RentalCard` | Nuova composizione; **aggiunto il nome del veicolo**, che in modalità flotta mancava. Tutti i rami di business invariati |
| `components/layout/Header|Footer` | Trattamento visivo; struttura e destinazioni invariate |
| `pages/HomePage`, `pages/FlottaIndexPage` | Ritmo e tipografia |
| `components/ui/AddCardModal`, `pages/BookingPage` | `fontFamily` degli iframe Stripe allineato a Jost (solo stile) |

---

## 9. DECISIONI PRESE (chiusura Sessione 1)

Confermate dalla direzione il 04/09/2026.

| # | Decisione | Stato |
|---|---|---|
| 1 | **Le locandine veicolo restano come sono.** L'art direction della Collection le tratta come *tavole*: inquadrate, con margine, mai ritagliate, mai con testo sovrapposto. La monumentalità arriva da tipografia, nero e spazio. Nessun servizio fotografico previsto per ora. | vincolo di progetto |
| 2 | **Immagini con veicoli non in flotta: ritaglio astratto.** `menu-mobilita.jpeg` e `car.jpeg` sostituite con ritagli di materia e luce; originali in `_asset-originali/`. | fatto |
| 3 | **Video dello hero versionati in `public/`.** Erano già in git: il problema reale era l'estensione maiuscola, corretta. | fatto |

### Media Requirements aperti

Slot dichiarati per il CMS, con ripiego professionale già previsto nel codice
(`MediaVideo` mostra sempre il poster se il filmato manca):

| Chiave | Cosa serve | Ripiego attuale |
|---|---|---|
| `HERO_VIDEO_DESKTOP` | film 16:9, montaggio lento, 10–20 s | i 6 filmati esistenti |
| `HERO_VIDEO_MOBILE` | stessa scena in verticale | crop centrale del desktop |
| `HERO_POSTER` | primo fotogramma di ogni filmato | **mancante** — da generare |
| `COLLECTION_PHOTO_*` | fotografia d'auto pulita, senza testo | locandina come tavola |
| `BRAND_FILM` | film di marca 30–60 s | nessuno |
| `EXPERIENCE_*` | mare / aria / soggiorni / lavaggio | immagini generate esistenti |

---

## 10. STATO A FINE SESSIONE 1

- `AUDIT.md` completo e verificato.
- Due immagini fuorvianti sostituite, originali conservati.
- Un difetto reale trovato e corretto (estensione dei video dello hero).
- Design system e primitive già impostati (§ 8) → la **Sessione 2** parte da lì.
- Build verde, `verify:css` verde, nessuna logica di business toccata.

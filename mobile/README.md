# DR7 — App iOS e Android

L'app è la sezione **`/app` del sito** (codice in `pages/app/`), aperta dentro un
guscio nativo Capacitor 8 (questa cartella). Non ha dati propri: legge e scrive
sullo stesso gestionale del sito.

| Cosa cambi nel gestionale | Dove cambia |
|---|---|
| Aggiungi, togli o nascondi un'auto | Sito e app, subito (tabella `vehicles`, aggiornamento in tempo reale) |
| Cambi un prezzo in Centralina Pro | Sito e app |
| Modifichi i testi o i filmati della home (Sito > Home) | Sito e app |
| Confermi, sposti o annulli una prenotazione | "Viaggi" nell'app, in tempo reale |

Ogni deploy del sito su Netlify aggiorna anche l'app: non serve ripubblicarla
sugli store, salvo modifiche alla parte nativa (questa cartella).

| | |
|---|---|
| Nome | DR7 |
| ID app (iOS bundle / Android package) | `app.dr7.mobile` |
| Indirizzo aperto dall'app | `https://dr7.app/app` |

## Sezioni dell'app

- **Home** — filmato, testi ed Esperienze della home del sito; il prossimo noleggio
  del cliente; "Quando ti serve?" con date rapide che passano al wizard di prenotazione.
- **Terra** — la flotta del sito con le locandine intere, categorie di Centralina Pro,
  prezzo "Da € … /giorno"; scheda auto con calendario disponibilità.
- **Prenotazione** — lo stesso `CarBookingWizard` del sito: prezzi, assicurazioni,
  consegna, pagamento Nexi, contratto.
- **Concierge** — la DR7 AI del sito a tutta pagina, più WhatsApp e telefono.
- **Viaggi** — le prenotazioni del cliente; modifica e annullamento con la pagina del sito.
- **Account** — Wallet, profilo, documenti, notifiche, DR7 Club, prevendite e il menu
  del sito (Terra, Mare, Aria, Soggiorni, Lavaggio & Meccanica…).

Dentro l'app, ogni link del sito verso una pagina che ha una versione app (es. `/flotta`)
resta nella cornice dell'app (`APP_EQUIVALENTS` in `pages/app/appEnv.ts`).

## Notifiche push

Funzionano così: l'app registra il telefono (`app_push_tokens`), il server invia.
iPhone direttamente ad Apple (APNs), Android tramite Firebase. Suono: `dr7_chime`.

- **Automatica:** "Prenotazione confermata" parte insieme all'email di conferma
  (`send-booking-confirmation`).
- **Dal gestionale:** `POST /.netlify/functions/app-push-send` con header
  `x-dr7-push-key` e corpo `{ "title", "body", "url": "/app/prevendite", "all": true }`
  oppure `"user_ids": [...]`. Ogni invio resta in `app_push_log`.

### Da fare una volta

1. **Database** — eseguire `supabase/migrations/20261028120000_app_push_tokens.sql`.
2. **Apple** — nell'account Apple Developer creare una chiave APNs (Keys → +, "Apple Push
   Notifications service"), scaricare il file `.p8`.
3. **Firebase** — creare il progetto, aggiungere l'app Android `app.dr7.mobile`,
   scaricare `google-services.json` in `android/app/`; poi Impostazioni progetto →
   Account di servizio → Genera nuova chiave privata (file JSON).
4. **Netlify** (variabili d'ambiente del sito):
   `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID=app.dr7.mobile`,
   `APNS_PRODUCTION=true`, `FIREBASE_SERVICE_ACCOUNT` (il JSON), `APP_PUSH_ADMIN_KEY`
   (una chiave lunga a caso, da dare al gestionale).

Finché le chiavi mancano l'app funziona lo stesso: le notifiche semplicemente non partono.

## Compilare e pubblicare

Requisiti: Node 20+, Mac con Xcode 16+ per iOS, Android Studio per Android.

```bash
cd mobile
npm install
npx cap sync
npm run ios       # Xcode: Team DR7 S.p.A. → Product → Archive → App Store Connect
npm run android   # Android Studio: Build → Generate Signed App Bundle (.aab)
```

Il permesso notifiche iOS (`App.entitlements`) e il suono sono già nel progetto.
Conservare al sicuro la keystore Android: serve per ogni aggiornamento.

## Prima dell'invio agli store

- Pagamento Nexi completo con 3D Secure da iPhone e da Android.
- Se un giorno si aggiunge "Accedi con Google", Apple chiede anche "Accedi con Apple"
  (linea guida 4.8); oggi il sito usa solo email e password.
- Schede store: screenshot, descrizione, privacy policy (`/privacy`), dati raccolti.

# DR7 — App iOS e Android

App nativa per App Store e Google Play costruita con [Capacitor 8](https://capacitorjs.com).
L'app carica il sito live **https://dr7.app** dentro un guscio nativo: prenotazioni,
pagamenti Nexi/Stripe, account e collegamento al gestionale restano quelli del sito.
Ogni deploy su Netlify è visibile subito anche nell'app, senza ripubblicarla.

Questa cartella è separata dal sito: la build Netlify (`vite build` dalla root) non la usa.

| | |
|---|---|
| Nome | DR7 |
| ID app (iOS bundle / Android package) | `app.dr7.mobile` |
| Versione | 1.0 |

## Cosa fa l'app oltre al sito

- **Icona e splash** nero/oro dal logo DR7 (`assets/` → generati con `npm run assets`).
- **Schermata offline** brandizzata (`www/offline.html`) con tasto Riprova e numero di assistenza;
  torna al sito da sola quando la connessione rientra.
- **Navigazione intelligente** (plugin `DR7Navigation`, iOS in `ios/App/App/SceneDelegate.swift`,
  Android in `android/app/src/main/java/app/dr7/mobile/DR7NavigationPlugin.java`):
  - restano **dentro l'app**: sito DR7, Supabase, Nexi, Stripe e i redirect automatici
    della verifica 3D Secure delle banche, così il cliente non esce mai a metà pagamento;
  - si aprono **nelle app di sistema**: Instagram, TikTok, Facebook, WhatsApp, YouTube,
    mappe, telefono, email, App Store/Play Store e il login Google;
  - iOS: anche i link esterni toccati dal cliente (es. articoli stampa) vanno in Safari;
    Android: restano nell'app e si torna col tasto indietro.
- **Swipe indietro** dal bordo dello schermo su iPhone.
- **Barra di stato** nera con testo chiaro; spazio per la tacca gestito dall'app
  (il sito non usa `safe-area-inset`).
- **User agent** con suffisso `DR7App/1.0`, così il sito può riconoscere quando gira nell'app.
- **Notifiche push**: plugin installato e permessi pronti; vedi "Da completare".

## Compilare

Requisiti: Node 20+, per iOS un Mac con Xcode 16+, per Android Android Studio.

```bash
cd mobile
npm install
npx cap sync          # dopo ogni modifica a capacitor.config.ts o ai plugin
npm run ios           # apre Xcode
npm run android       # apre Android Studio
```

**iOS (Xcode)** — target *App* → *Signing & Capabilities*: scegli il Team di DR7 S.p.A.,
aggiungi la capability **Push Notifications**. Poi *Product → Archive → Distribute App → App Store Connect*.

**Android (Android Studio)** — *Build → Generate Signed App Bundle* (`.aab`), crea e
**conserva al sicuro** la keystore: senza quella non si possono pubblicare aggiornamenti.
Carica l'`.aab` su Google Play Console.

Senza Mac si può usare un servizio di build in cloud (es. Ionic Appflow, Codemagic).

## Account necessari (intestati a DR7 S.p.A.)

- **Apple Developer Program** — 99 $/anno, come organizzazione: richiede il numero **D-U-N-S**.
- **Google Play Console** — 25 $ una tantum, come organizzazione.

## Da completare prima della pubblicazione

1. **Login con Google.** Google blocca il login dentro le app: oggi il tasto apre il browser
   e il cliente resta lì dopo l'accesso. Serve una piccola modifica al sito (login Google con
   ritorno all'app tramite link `app.dr7.mobile://`). Il login con email e password funziona già.
2. **Accedi con Apple.** Se nell'app c'è "Accedi con Google", Apple richiede anche
   "Accedi con Apple" (linea guida 4.8). In alternativa si nasconde il login Google quando
   lo user agent contiene `DR7App`.
3. **Notifiche push.** Servono: progetto Firebase (file `google-services.json` in
   `android/app/` e chiave APNs caricata su Firebase), una piccola aggiunta al sito che
   chiede il permesso e salva il token del dispositivo su Supabase quando gira nell'app,
   e una Netlify function che invia le notifiche (conferme prenotazione, promo).
4. **Pagamenti su dispositivo reale.** Provare un pagamento Nexi completo (anche con 3D Secure)
   e uno Stripe su iPhone e Android prima dell'invio agli store.
5. **Schede store.** Screenshot (iPhone 6,9" e 6,5", Android), descrizione, link alla privacy
   policy e compilazione della sezione privacy/dati raccolti.

## Revisione Apple

Apple può rifiutare app che sono solo un sito impacchettato (linea guida 4.2). Le funzioni
native sopra aiutano; le notifiche push (punto 3) sono l'argomento più forte da avere
attivo al momento dell'invio.

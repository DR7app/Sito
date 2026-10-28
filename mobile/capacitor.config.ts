import type { CapacitorConfig } from '@capacitor/cli';

/**
 * DR7 — app iOS/Android.
 *
 * L'app carica il sito live (https://dr7.app) dentro un guscio nativo:
 * prenotazioni, pagamenti (Nexi/Stripe), account e gestionale restano quelli
 * del sito, e ogni deploy su Netlify è subito visibile anche nell'app.
 *
 * La cartella www/ contiene solo la schermata offline, mostrata quando il
 * telefono non ha connessione.
 */
const config: CapacitorConfig = {
  appId: 'app.dr7.mobile',
  appName: 'DR7',
  webDir: 'www',

  server: {
    url: 'https://dr7.app',
    // Schermata locale mostrata se il sito non si carica (offline).
    errorPath: 'offline.html',
    // Pagine del sito e dei pagamenti restano dentro l'app.
    // Le altre (social, WhatsApp, mappe, articoli) le decide il plugin
    // DR7Navigation, che le apre nelle app di sistema.
    allowNavigation: [
      'dr7.app',
      '*.dr7.app',
      '*.supabase.co',
      '*.nexigroup.com',
      '*.nexi.it',
      '*.stripe.com',
      '*.stripe.network',
    ],
  },

  // Permette al sito di riconoscere che gira dentro l'app.
  appendUserAgent: 'DR7App/1.0',
  backgroundColor: '#000000',

  ios: {
    contentInset: 'automatic', // il sito non usa safe-area: l'app lascia lo spazio della tacca
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false,
  },

  android: {
    allowMixedContent: false,
    captureInput: true,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      launchFadeOutDuration: 300,
      backgroundColor: '#000000',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#000000',
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;

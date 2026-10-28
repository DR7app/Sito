/**
 * App DR7 (iOS/Android) — ambiente.
 *
 * L'app nativa e' un guscio Capacitor che apre https://dr7.app/app: tutte le
 * schermate sono pagine di QUESTO sito, quindi leggono e scrivono sullo stesso
 * gestionale (flotta, prezzi Centralina Pro, prenotazioni, wallet). Se un'auto
 * o un prezzo cambiano nel gestionale, cambiano insieme sul sito e nell'app.
 */

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, any>;
};

export const capacitor = (): CapacitorGlobal | undefined =>
  (typeof window !== 'undefined' ? (window as any).Capacitor : undefined);

/** Vero dentro l'app installata (iOS o Android), falso nel browser. */
export const isNativeApp = (): boolean => {
  try {
    if (capacitor()?.isNativePlatform?.()) return true;
    return typeof navigator !== 'undefined' && /DR7App\//.test(navigator.userAgent);
  } catch {
    return false;
  }
};

export const nativePlatform = (): 'ios' | 'android' | 'web' => {
  const p = capacitor()?.getPlatform?.();
  return p === 'ios' || p === 'android' ? p : 'web';
};

/**
 * Pagine del sito che dentro l'app hanno una versione dell'app. Quando una
 * pagina del sito (riusata nell'app) porta a uno di questi indirizzi, l'app
 * resta nella sua cornice invece di aprire il sito con header e footer.
 */
export const APP_EQUIVALENTS: Record<string, string> = {
  '/': '/app',
  '/flotta': '/app/terra',
  '/supercar-luxury': '/app/terra',
  '/account': '/app/account',
  '/account/bookings': '/app/viaggi',
  '/account/prevendite': '/app/viaggi',
  '/account/documents': '/app/account/documenti',
  '/account/profile': '/app/account/profilo',
  '/account/notifications': '/app/account/notifiche',
  '/account/club': '/app/club',
  '/membership': '/app/club',
  '/credit-wallet': '/app/wallet',
  '/prevendite': '/app/prevendite',
  '/noleggio-mare': '/app/mare',
  '/noleggio-aria': '/app/aria',
  '/soggiorni': '/app/soggiorni',
  '/prime-wash': '/app/lavaggio',
  '/contact': '/app/account',
  '/signin': '/app/accedi',
  '/signup': '/app/registrati',
  '/car-booking-success': '/app/confermata',
};

export const IS_APP_PATH = (p: string) => p === '/app' || p.startsWith('/app/');

/**
 * Notifiche push dell'app DR7.
 *
 * Il plugin nativo (@capacitor/push-notifications, installato nel guscio in
 * mobile/) e' raggiungibile da questa pagina perche' Capacitor lo inietta nella
 * WebView che apre dr7.app/app. Nel browser non succede niente.
 *
 * Il token del telefono viene salvato in `app_push_tokens` (funzione app_register_push) (vedi migrazione
 * supabase/migrations/20261028120000_app_push_tokens.sql), legato al cliente
 * quando ha fatto l'accesso. Il server invia con netlify/functions/app-push-send.
 */
import { supabase } from '../../supabaseClient';
import { capacitor, isNativeApp, nativePlatform } from './appEnv';

/** Canale Android con il suono DR7 (file res/raw/dr7_chime.wav nel guscio). */
export const DR7_CHANNEL = 'dr7';

let started = false;
let lastToken: string | null = null;

const plugin = () => capacitor()?.Plugins?.PushNotifications;

/**
 * Salva il token tramite la funzione `app_register_push` del database, che lo
 * lega al cliente della sessione corrente (o lo lascia anonimo). `_userId`
 * serve solo a ripetere il salvataggio quando il cliente cambia.
 */
async function saveToken(token: string, _userId: string | null) {
  lastToken = token;
  try {
    const { error } = await supabase.rpc('app_register_push', { p_token: token, p_platform: nativePlatform() });
    if (error) throw error;
  } catch (e) {
    console.warn('[appPush] salvataggio token non riuscito', e);
  }
}

/** Collega il token gia' ottenuto al cliente appena fa l'accesso. */
export async function linkPushToUser(userId: string | null) {
  if (lastToken) await saveToken(lastToken, userId);
}

/**
 * Avvia le notifiche: permesso, registrazione, canale con suono, ascolto dei
 * tocchi. `onOpen` riceve l'indirizzo da aprire (campo `url` del messaggio).
 */
export async function startPush(userId: string | null, onOpen: (url: string) => void) {
  const P = plugin();
  if (!isNativeApp() || !P || started) return;
  started = true;
  try {
    if (nativePlatform() === 'android') {
      await P.createChannel?.({
        id: DR7_CHANNEL,
        name: 'DR7',
        description: 'Prenotazioni, consegne e offerte DR7',
        importance: 5,
        visibility: 1,
        sound: 'dr7_chime',
        vibration: true,
        lights: true,
      });
    }
    await P.addListener('registration', (t: { value: string }) => { void saveToken(t.value, userId); });
    await P.addListener('registrationError', (e: unknown) => console.warn('[appPush] registrazione', e));
    await P.addListener('pushNotificationActionPerformed', (a: any) => {
      const url = a?.notification?.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) onOpen(url);
    });
    let perm = await P.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await P.requestPermissions();
    }
    if (perm.receive === 'granted') await P.register();
  } catch (e) {
    console.warn('[appPush] avvio non riuscito', e);
  }
}

/** Vibrazione leggera ai tocchi importanti (conferme), solo nell'app. */
export function tapFeedback(style: 'LIGHT' | 'MEDIUM' | 'HEAVY' = 'LIGHT') {
  try { capacitor()?.Plugins?.Haptics?.impact?.({ style }); } catch { /* niente */ }
}

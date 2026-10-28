/**
 * Invio delle notifiche push dell'app DR7.
 *
 * - iPhone: direttamente ad Apple (APNs, HTTP/2, chiave .p8).
 * - Android: Firebase Cloud Messaging (API HTTP v1, account di servizio).
 *
 * Variabili d'ambiente su Netlify (se mancano, l'invio verso quella
 * piattaforma viene saltato senza errori, cosi' il resto del sito non si ferma):
 *   APNS_KEY_P8        contenuto del file AuthKey_XXXX.p8 (con le righe BEGIN/END)
 *   APNS_KEY_ID        ID della chiave (10 caratteri)
 *   APNS_TEAM_ID       Team ID dell'account Apple Developer
 *   APNS_BUNDLE_ID     app.dr7.mobile
 *   APNS_PRODUCTION    "true" per l'app pubblicata, "false" per le build di prova
 *   FIREBASE_SERVICE_ACCOUNT  JSON dell'account di servizio Firebase
 * Supabase: VITE_SUPABASE_URL (o SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY.
 */
import http2 from 'node:http2';
import jwt from 'jsonwebtoken';

export interface PushMessage {
  title: string;
  body: string;
  /** Pagina dell'app da aprire al tocco, es. "/app/viaggi". */
  url?: string;
}

export interface PushAudience {
  all?: boolean;
  userIds?: string[];
}

interface TokenRow { token: string; platform: 'ios' | 'android' | 'web'; user_id: string | null }

const SB_URL = () => process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SB_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const sbHeaders = () => ({ apikey: SB_KEY(), Authorization: `Bearer ${SB_KEY()}`, 'Content-Type': 'application/json' });

async function loadTokens(aud: PushAudience): Promise<TokenRow[]> {
  if (!SB_URL() || !SB_KEY()) return [];
  let q = `${SB_URL()}/rest/v1/app_push_tokens?select=token,platform,user_id`;
  if (!aud.all) {
    const ids = (aud.userIds || []).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
    if (!ids.length) return [];
    q += `&user_id=in.(${ids.join(',')})`;
  }
  const r = await fetch(q, { headers: sbHeaders() });
  return r.ok ? ((await r.json()) as TokenRow[]) : [];
}

async function dropTokens(tokens: string[]) {
  if (!tokens.length || !SB_URL() || !SB_KEY()) return;
  const list = tokens.map((t) => `"${t.replace(/"/g, '')}"`).join(',');
  await fetch(`${SB_URL()}/rest/v1/app_push_tokens?token=in.(${encodeURIComponent(list)})`, { method: 'DELETE', headers: sbHeaders() }).catch(() => undefined);
}

async function logSend(aud: PushAudience, m: PushMessage, sent: number, failed: number) {
  if (!SB_URL() || !SB_KEY()) return;
  await fetch(`${SB_URL()}/rest/v1/app_push_log`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({ audience: aud.all ? 'all' : 'users', user_ids: aud.all ? null : aud.userIds || [], title: m.title, body: m.body, url: m.url || null, sent, failed }),
  }).catch(() => undefined);
}

/* ---------------- Apple (APNs) ---------------- */

let apnsJwt: { token: string; at: number } | null = null;
function apnsAuth(): string | null {
  const key = (process.env.APNS_KEY_P8 || '').replace(/\\n/g, '\n');
  const kid = process.env.APNS_KEY_ID; const iss = process.env.APNS_TEAM_ID;
  if (!key || !kid || !iss) return null;
  if (apnsJwt && Date.now() - apnsJwt.at < 40 * 60 * 1000) return apnsJwt.token;
  const token = jwt.sign({ iss, iat: Math.floor(Date.now() / 1000) }, key, { algorithm: 'ES256', header: { alg: 'ES256', kid } });
  apnsJwt = { token, at: Date.now() };
  return token;
}

async function sendApns(tokens: string[], m: PushMessage): Promise<{ ok: number; bad: string[]; failed: number }> {
  const auth = apnsAuth();
  const topic = process.env.APNS_BUNDLE_ID || 'app.dr7.mobile';
  if (!auth || !tokens.length) return { ok: 0, bad: [], failed: 0 };
  const host = process.env.APNS_PRODUCTION === 'false' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
  const payload = JSON.stringify({ aps: { alert: { title: m.title, body: m.body }, sound: 'dr7_chime.caf', 'mutable-content': 1 }, url: m.url || '/app' });
  const client = http2.connect(host);
  const one = (t: string) => new Promise<{ t: string; status: number; reason?: string }>((resolve) => {
    const req = client.request({
      ':method': 'POST', ':path': `/3/device/${t}`,
      authorization: `bearer ${auth}`, 'apns-topic': topic, 'apns-push-type': 'alert', 'apns-priority': '10',
      'content-type': 'application/json',
    });
    let status = 0; let data = '';
    req.on('response', (h) => { status = Number(h[':status']); });
    req.on('data', (c) => { data += c; });
    req.on('end', () => { let reason; try { reason = JSON.parse(data || '{}').reason; } catch { /* */ } resolve({ t, status, reason }); });
    req.on('error', () => resolve({ t, status: 0 }));
    req.end(payload);
  });
  try {
    const res = await Promise.all(tokens.map(one));
    const bad = res.filter((r) => r.status === 410 || r.reason === 'BadDeviceToken' || r.reason === 'Unregistered').map((r) => r.t);
    return { ok: res.filter((r) => r.status === 200).length, bad, failed: res.filter((r) => r.status !== 200).length };
  } finally {
    client.close();
  }
}

/* ---------------- Android (FCM v1) ---------------- */

let fcmAccess: { token: string; exp: number; project: string } | null = null;
async function fcmAuth(): Promise<{ token: string; project: string } | null> {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  if (fcmAccess && fcmAccess.exp > Date.now() + 60_000) return fcmAccess;
  const sa = JSON.parse(raw) as { client_email: string; private_key: string; project_id: string };
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 },
    sa.private_key.replace(/\\n/g, '\n'),
    { algorithm: 'RS256' },
  );
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { access_token: string; expires_in: number };
  fcmAccess = { token: j.access_token, exp: Date.now() + j.expires_in * 1000, project: sa.project_id };
  return fcmAccess;
}

async function sendFcm(tokens: string[], m: PushMessage): Promise<{ ok: number; bad: string[]; failed: number }> {
  if (!tokens.length) return { ok: 0, bad: [], failed: 0 };
  const auth = await fcmAuth();
  if (!auth) return { ok: 0, bad: [], failed: 0 };
  const res = await Promise.all(tokens.map(async (t) => {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${auth.project}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: t,
          notification: { title: m.title, body: m.body },
          data: { url: m.url || '/app' },
          android: { priority: 'HIGH', notification: { channel_id: 'dr7', sound: 'dr7_chime', default_vibrate_timings: true } },
        },
      }),
    }).catch(() => null);
    if (!r) return { t, ok: false, bad: false };
    if (r.ok) return { t, ok: true, bad: false };
    const txt = await r.text();
    return { t, ok: false, bad: r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(txt) };
  }));
  return { ok: res.filter((x) => x.ok).length, bad: res.filter((x) => x.bad).map((x) => x.t), failed: res.filter((x) => !x.ok).length };
}

/** Invia una notifica. Non lancia mai: restituisce quante sono partite. */
export async function sendAppPush(aud: PushAudience, m: PushMessage): Promise<{ sent: number; failed: number; devices: number }> {
  try {
    const rows = await loadTokens(aud);
    const ios = rows.filter((r) => r.platform === 'ios').map((r) => r.token);
    const android = rows.filter((r) => r.platform === 'android').map((r) => r.token);
    const [a, g] = await Promise.all([sendApns(ios, m), sendFcm(android, m)]);
    await dropTokens([...a.bad, ...g.bad]);
    const sent = a.ok + g.ok; const failed = a.failed + g.failed;
    await logSend(aud, m, sent, failed);
    return { sent, failed, devices: rows.length };
  } catch (e) {
    console.error('[appPush] invio non riuscito', e);
    return { sent: 0, failed: 0, devices: 0 };
  }
}

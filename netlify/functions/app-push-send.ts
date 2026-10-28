import type { Handler } from '@netlify/functions';
import crypto from 'node:crypto';
import { getCorsOrigin } from './utils/cors';
import { sendAppPush } from './utils/appPush';

/**
 * Invia una notifica push all'app DR7 — per il gestionale.
 *
 * POST /.netlify/functions/app-push-send
 * Header  x-dr7-push-key: <APP_PUSH_ADMIN_KEY>   (variabile d'ambiente su Netlify)
 * Body    { "title": "...", "body": "...", "url": "/app/prevendite",
 *           "all": true }                       → tutti i telefoni con l'app
 *      oppure { ..., "user_ids": ["uuid", ...] }  → solo questi clienti
 *
 * Risposta: { sent, failed, devices }
 */
const MAX_TITLE = 80;
const MAX_BODY = 240;

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': getCorsOrigin(event.headers.origin),
    'Access-Control-Allow-Headers': 'content-type, x-dr7-push-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Usa POST' }) };

  const key = process.env.APP_PUSH_ADMIN_KEY || '';
  const given = event.headers['x-dr7-push-key'] || '';
  if (!key || !given || !safeEqual(key, given)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Chiave non valida' }) };
  }

  let b: { title?: string; body?: string; url?: string; all?: boolean; user_ids?: string[] };
  try { b = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON non valido' }) }; }

  const title = String(b.title || '').trim().slice(0, MAX_TITLE);
  const body = String(b.body || '').trim().slice(0, MAX_BODY);
  const url = typeof b.url === 'string' && b.url.startsWith('/app') ? b.url : '/app';
  if (!title || !body) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Servono titolo e testo' }) };
  if (!b.all && !(Array.isArray(b.user_ids) && b.user_ids.length)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Indica "all": true oppure "user_ids"' }) };
  }

  const res = await sendAppPush(b.all ? { all: true } : { userIds: b.user_ids!.slice(0, 5000) }, { title, body, url });
  return { statusCode: 200, headers, body: JSON.stringify(res) };
};

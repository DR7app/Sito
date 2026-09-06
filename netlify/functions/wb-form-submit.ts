/**
 * wb-form-submit — riceve i moduli disegnati nel Website Builder.
 *
 * Perche' passa da qui e non direttamente dal browser: la scrittura usa la
 * service role, quindi nessun permesso di inserimento viene concesso ad
 * `anon`. Senza questo passaggio la tabella dei messaggi sarebbe una
 * casella aperta a chiunque conosca la chiave pubblica del sito.
 *
 * Fa due cose: registra il messaggio e avvisa via email. Se l'email non
 * parte il messaggio resta comunque salvato — meglio un avviso mancato
 * che un contatto perso.
 */

import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';

const MAX_CAMPI = 40;
const MAX_LUNGHEZZA = 5000;

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://ahpmzjgkfxrrgxyirasa.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

function pulisci(values: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  let n = 0;
  for (const [k, v] of Object.entries(values || {})) {
    if (n >= MAX_CAMPI) break;
    if (v == null) continue;
    const chiave = String(k).slice(0, 80).replace(/[^\w\-. ]/g, '');
    if (!chiave) continue;
    out[chiave] = String(v).slice(0, MAX_LUNGHEZZA);
    n += 1;
  }
  return out;
}

/** L'IP non viene salvato in chiaro: serve solo a riconoscere gli abusi. */
function impronta(ip: string): string {
  return crypto.createHash('sha256').update(`dr7-wb-${ip}`).digest('hex').slice(0, 32);
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Metodo non consentito' };
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[wb-form] SUPABASE_SERVICE_ROLE_KEY assente');
    return { statusCode: 500, body: 'Configurazione mancante' };
  }

  let body: {
    pageSlug?: string; blockId?: string; formName?: string;
    destinationEmail?: string; values?: Record<string, unknown>;
  };
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Richiesta non valida' };
  }

  const values = pulisci(body.values || {});
  if (!Object.keys(values).length) {
    return { statusCode: 400, body: 'Modulo vuoto' };
  }

  // Il sito di riferimento: una riga per tenant, come nel gestionale.
  const { data: site } = await supabase
    .from('wb_sites').select('id, settings')
    .eq('tenant_id', 'dr7').eq('key', 'dr7').maybeSingle();

  const ip = event.headers['x-nf-client-connection-ip']
    || (event.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || '';

  const { error } = await supabase.from('wb_form_submissions').insert({
    site_id: site?.id || null,
    page_slug: (body.pageSlug || '').slice(0, 200),
    block_id: (body.blockId || '').slice(0, 80),
    form_name: (body.formName || '').slice(0, 120),
    values,
    consent: true,
    user_agent: (event.headers['user-agent'] || '').slice(0, 400),
    ip_hash: ip ? impronta(ip) : null,
  });

  if (error) {
    console.error('[wb-form] salvataggio non riuscito', error);
    return { statusCode: 500, body: 'Non riesco a registrare il messaggio' };
  }

  // Notifica. Un errore qui non deve far fallire l'invio per il visitatore:
  // il messaggio e' gia' al sicuro nel database.
  try {
    const impostazioni = (site?.settings || {}) as Record<string, string>;
    const destinatario = body.destinationEmail || impostazioni.email || 'info@dr7.app';
    if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.secureserver.net',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      });
      const righe = Object.entries(values)
        .map(([k, v]) => `<p><strong>${k}:</strong> ${String(v).replace(/</g, '&lt;')}</p>`)
        .join('');
      await transporter.sendMail({
        from: '"DR7" <info@dr7.app>',
        to: destinatario,
        replyTo: values.email || undefined,
        subject: `[SITO] ${body.formName || 'Modulo'} — ${body.pageSlug || '/'}`,
        html: `<div style="font-family:Arial,sans-serif"><h2>Nuovo messaggio dal sito</h2>
               <p style="color:#666">Pagina: ${body.pageSlug || '/'}</p>${righe}</div>`,
      });
    }
  } catch (e) {
    console.error('[wb-form] notifica non inviata', e);
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true }),
  };
};

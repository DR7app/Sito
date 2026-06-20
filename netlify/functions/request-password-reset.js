const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Reset password "robusto": genera il link di recupero lato server e lo invia
// via Resend forzando l'host sul sito LIVE (dr7.app). Serve perche' la "Site
// URL" del dashboard Supabase e' rimasta sul vecchio dominio morto
// (dr7empire.com) dopo la migrazione: il reset NATIVO mandava i clienti su un
// dominio offline. Stesso identico workaround gia' usato per la conferma email
// in register-customer.js. Non rivela mai se l'email esiste (sempre 200).
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    try {
        const { email } = JSON.parse(event.body || '{}');
        if (!email) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Email obbligatoria' }) };
        }

        const siteUrl = process.env.SITE_URL || process.env.URL || 'https://dr7.app';

        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
            type: 'recovery',
            email,
            options: { redirectTo: `${siteUrl}/reset-password` },
        });

        // Email inesistente o errore: NON rivelarlo, rispondi comunque ok.
        if (linkError || !linkData?.properties?.action_link) {
            if (linkError) console.error('[request-password-reset] generateLink:', linkError.message);
            return { statusCode: 200, body: JSON.stringify({ ok: true }) };
        }

        // Forza l'host del link sul sito LIVE (dashboard Site URL = dominio morto).
        let resetLink = linkData.properties.action_link;
        try {
            const _u = new URL(resetLink);
            const _site = new URL(siteUrl);
            if (_u.host !== _site.host) {
                _u.protocol = _site.protocol;
                _u.host = _site.host;
                resetLink = _u.toString();
            }
        } catch (e) {
            console.error('[request-password-reset] rewrite host:', e.message);
        }

        const resendApiKey = process.env.RESEND_API_KEY || process.env.SMTP_PASSWORD;
        if (!resendApiKey) {
            console.error('[request-password-reset] NO API KEY — impossibile inviare');
            return { statusCode: 200, body: JSON.stringify({ ok: true }) };
        }

        const fromAddress = process.env.SMTP_FROM || 'info@dr7.app';
        const emailPayload = {
            from: `DR7 Empire <${fromAddress}>`,
            reply_to: 'info@dr7.app',
            to: [email],
            subject: 'Reimposta la tua password DR7',
            headers: { 'List-Unsubscribe': `<mailto:info@dr7.app?subject=unsubscribe>` },
            text: `Ciao,\n\nAbbiamo ricevuto una richiesta per reimpostare la password del tuo account DR7 Empire.\n\nClicca qui per reimpostarla: ${resetLink}\n\nSe non l'hai richiesta tu, ignora questo messaggio.\n\nDR7 Empire\nDubai Rent 7.0 S.p.A.\nVia Ostiense 131/L, 00154 Roma (RM)\ninfo@dr7.app`,
            html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#333">
<p>Ciao,</p>
<p>Abbiamo ricevuto una richiesta per reimpostare la password del tuo account DR7 Empire.</p>
<p style="margin:24px 0"><a href="${resetLink}" style="background:#1a1a1a;color:#fff;padding:12px 28px;border-radius:4px;text-decoration:none;font-size:14px">Reimposta password</a></p>
<p style="font-size:13px;color:#666">Oppure copia questo link nel browser:<br><a href="${resetLink}" style="color:#666;word-break:break-all">${resetLink}</a></p>
<p style="font-size:12px;color:#999;margin-top:32px;border-top:1px solid #eee;padding-top:16px">Se non hai richiesto questa modifica, ignora questo messaggio.<br><br>DR7 Empire — Dubai Rent 7.0 S.p.A.<br>Via Ostiense 131/L, 00154 Roma (RM)<br>info@dr7.app</p>
</div>`,
        };

        const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(emailPayload),
        });
        const resendResult = await resendResponse.json().catch(() => ({}));
        console.log('[request-password-reset] Resend:', resendResponse.status, JSON.stringify(resendResult));

        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    } catch (e) {
        console.error('[request-password-reset] error:', e.message);
        // Anche in errore non blocchiamo l'utente con dettagli: messaggio generico.
        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }
};

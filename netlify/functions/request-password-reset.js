const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Reset password "robusto": genera il token di recupero lato server e invia via
// Resend un link DIRETTO a dr7.app/reset-password?token_hash=...&type=recovery.
// La pagina poi verifica il token con verifyOtp (SDK -> Supabase diretto). Serve
// perche' (1) la "Site URL" del dashboard e' rimasta sul vecchio dominio morto
// (dr7empire.com) e (2) il sito NON fa da proxy su /auth/v1/verify: il link
// nativo cadeva sulla SPA senza verificare. Cosi' niente dominio morto, niente
// proxy, niente dipendenza dal dashboard. Non rivela mai se l'email esiste (200).
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
        if (linkError || !linkData?.properties?.hashed_token) {
            if (linkError) console.error('[request-password-reset] generateLink:', linkError.message);
            return { statusCode: 200, body: JSON.stringify({ ok: true }) };
        }

        // IMPORTANTE: NON usare action_link (punta a /auth/v1/verify sull'host
        // GoTrue/Site URL — qui il sito NON fa da proxy, quindi il link cadeva
        // sulla SPA e non verificava nulla). Mandiamo il token DIRETTAMENTE alla
        // pagina /reset-password sul sito LIVE: la pagina chiama verifyOtp via
        // SDK (parla con Supabase direttamente), crea la sessione di recovery e
        // fa impostare la nuova password. Nessun dominio morto, nessun proxy,
        // nessuna dipendenza dalla "Site URL" del dashboard.
        const tokenHash = encodeURIComponent(linkData.properties.hashed_token);
        const resetLink = `${siteUrl}/reset-password?token_hash=${tokenHash}&type=recovery`;

        const resendApiKey = process.env.RESEND_API_KEY || process.env.SMTP_PASSWORD;
        if (!resendApiKey) {
            console.error('[request-password-reset] NO API KEY — impossibile inviare');
            return { statusCode: 200, body: JSON.stringify({ ok: true }) };
        }

        const fromAddress = process.env.SMTP_FROM || 'info@dr7.app';
        const emailPayload = {
            from: `DR7 <${fromAddress}>`,
            reply_to: 'info@dr7.app',
            to: [email],
            subject: 'Reimposta la tua password DR7',
            headers: { 'List-Unsubscribe': `<mailto:info@dr7.app?subject=unsubscribe>` },
            text: `Ciao,\n\nAbbiamo ricevuto una richiesta per reimpostare la password del tuo account DR7.\n\nClicca qui per reimpostarla: ${resetLink}\n\nSe non l'hai richiesta tu, ignora questo messaggio.\n\nDR7\nDubai Rent 7.0 S.p.A.\nVia Ostiense 131/L, 00154 Roma (RM)\ninfo@dr7.app`,
            html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#333">
<p>Ciao,</p>
<p>Abbiamo ricevuto una richiesta per reimpostare la password del tuo account DR7.</p>
<p style="margin:24px 0"><a href="${resetLink}" style="background:#1a1a1a;color:#fff;padding:12px 28px;border-radius:4px;text-decoration:none;font-size:14px">Reimposta password</a></p>
<p style="font-size:13px;color:#666">Oppure copia questo link nel browser:<br><a href="${resetLink}" style="color:#666;word-break:break-all">${resetLink}</a></p>
<p style="font-size:12px;color:#999;margin-top:32px;border-top:1px solid #eee;padding-top:16px">Se non hai richiesto questa modifica, ignora questo messaggio.<br><br>DR7 — Dubai Rent 7.0 S.p.A.<br>Via Ostiense 131/L, 00154 Roma (RM)<br>info@dr7.app</p>
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

const { createClient } = require('@supabase/supabase-js');
const { funzioneFerma } = require('./utils/systemControl');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// 17/09/2026: account creato dal gestionale (tab Credit Wallet) per un
// cliente che non si era ancora iscritto. Se il cliente non e' mai entrato,
// l'iscrizione diventa "scegli la password": link di recupero alla sua email.
// Ritorna true se l'email e' partita.
async function completaAccountCreatoDallUfficio(email, userMetadata) {
    try {
        const siteUrl = process.env.SITE_URL || process.env.URL || 'https://dr7.app';
        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
            type: 'recovery',
            email,
            options: { redirectTo: `${siteUrl}/reset-password` },
        });
        const utente = linkData?.user;
        if (linkError || !utente) return false;
        if (utente.user_metadata?.creato_da !== 'gestionale_credit_wallet' || utente.last_sign_in_at) return false;

        // I dati dell'iscrizione vanno sull'account; la password no.
        await supabase.auth.admin.updateUserById(utente.id, {
            user_metadata: { ...userMetadata, creato_da: utente.user_metadata.creato_da },
        });

        // Bonus di benvenuto: la RPC e' idempotente.
        try {
            await supabase.rpc('grant_welcome_bonus', { p_user_id: utente.id });
        } catch (e) {
            console.error('[register-customer] bonus su account dell\'ufficio non accreditato:', e.message);
        }

        let link = linkData.properties?.action_link;
        if (!link) return false;
        try {
            const u = new URL(link);
            const site = new URL(siteUrl);
            if (u.host !== site.host) { u.protocol = site.protocol; u.host = site.host; link = u.toString(); }
        } catch (_e) { /* link lasciato com'e' */ }

        // Esente dagli interruttori System Control: codice di sicurezza, senza si resta chiusi fuori.
        const resendApiKey = process.env.RESEND_API_KEY || process.env.SMTP_PASSWORD;
        if (!resendApiKey) return false;
        const fromAddress = process.env.SMTP_FROM || 'info@dr7.app';
        const nome = (userMetadata && userMetadata.nome) ? `${userMetadata.nome} ${userMetadata.cognome || ''}`.trim() : '';
        const risposta = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: `DR7 <${fromAddress}>`,
                reply_to: 'info@dr7.app',
                to: [email],
                subject: 'DR7 — Scegli la password del tuo account',
                text: `Ciao${nome ? ' ' + nome : ''},\n\nil tuo account DR7 esiste gia' (creato dal nostro ufficio). Per entrare scegli la tua password:\n\n${link}\n\nSe non hai richiesto questa registrazione, ignora questo messaggio.\n\nDR7\ninfo@dr7.app`,
                html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#333">
<p>Ciao${nome ? ' ' + nome : ''},</p>
<p>il tuo account DR7 esiste gia' (creato dal nostro ufficio). Per entrare scegli la tua password.</p>
<p style="margin:24px 0"><a href="${link}" style="background:#1a1a1a;color:#fff;padding:12px 28px;border-radius:4px;text-decoration:none;font-size:14px">Scegli la password</a></p>
<p style="font-size:12px;color:#999;margin-top:32px;border-top:1px solid #eee;padding-top:16px">Se non hai richiesto questa registrazione, ignora questo messaggio.<br><br>DR7 — info@dr7.app</p>
</div>`,
            }),
        });
        if (!risposta.ok) {
            console.error('[register-customer] email scelta password non inviata:', risposta.status, await risposta.text());
            return false;
        }
        return true;
    } catch (e) {
        console.error('[register-customer] completaAccountCreatoDallUfficio:', e.message);
        return false;
    }
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { email, password, customerData, referralCode } = JSON.parse(event.body);

        if (!email || !password) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Email and password are required' }) };
        }

        // 1. Create Auth User
        // Store ALL customer data in user_metadata so the database trigger can extract everything
        const userMetadata = {
            source: 'website_registration',
            email: email,
            // Store all customer data so trigger can extract it if needed
            ...(customerData && {
                // Common fields
                nome: customerData.nome,
                cognome: customerData.cognome,
                telefono: customerData.telefono,
                codiceFiscale: customerData.codice_fiscale,
                indirizzo: customerData.indirizzo,
                numeroCivico: customerData.numero_civico,
                cittaResidenza: customerData.citta_residenza,
                provinciaResidenza: customerData.provincia_residenza,
                codicePostale: customerData.codice_postale,
                nazione: customerData.nazione,
                tipoCliente: customerData.tipo_cliente,

                // Persona Fisica fields
                sesso: customerData.sesso,
                dataNascita: customerData.data_nascita,
                cittaNascita: customerData.citta_nascita,
                provinciaNascita: customerData.provincia_nascita,
                pec: customerData.pec,

                // License metadata (flatten from metadata object)
                tipoPatente: customerData.metadata?.tipo_patente,
                numeroPatente: customerData.metadata?.numero_patente,
                patenteEmessaDa: customerData.metadata?.patente_emessa_da,
                patenteDataRilascio: customerData.metadata?.patente_data_rilascio,
                patenteScadenza: customerData.metadata?.patente_scadenza,

                // Azienda fields
                denominazione: customerData.denominazione,
                partitaIva: customerData.partita_iva,
                sedeOperativa: customerData.sede_operativa,
                codiceDestinatario: customerData.codice_destinatario,
                rappresentanteNome: customerData.rappresentante_nome,
                rappresentanteCognome: customerData.rappresentante_cognome,
                rappresentanteCF: customerData.rappresentante_cf,
                rappresentanteRuolo: customerData.rappresentante_ruolo,

                // Document metadata for Azienda (flatten from metadata object)
                documentoTipo: customerData.metadata?.documento_tipo,
                documentoNumero: customerData.metadata?.documento_numero,
                documentoDataRilascio: customerData.metadata?.documento_data_rilascio,
                documentoLuogoRilascio: customerData.metadata?.documento_luogo_rilascio,

                // Pubblica Amministrazione fields
                codiceUnivoco: customerData.codice_univoco,
                enteUfficio: customerData.ente_ufficio,
                citta: customerData.citta,

                // Residency Zone
                residencyZone: customerData.residency_zone
            })
        };


        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: false, // Or true if you want to skip confirmation, but usually false
            user_metadata: userMetadata
        });

        if (authError) {
            // 17/09/2026: l'ufficio puo' aver gia' creato l'account (Credit
            // Wallet caricato prima dell'iscrizione). In quel caso non si
            // risponde "email gia' registrata": si manda al cliente un link
            // per scegliere la password. Il link arriva SOLO alla sua email,
            // quindi nessuno puo' prendersi l'account (e il credito)
            // conoscendo soltanto l'indirizzo.
            const giaRegistrata = authError.code === 'email_exists'
                || /already (been )?registered|already exists/i.test(authError.message || '');
            if (giaRegistrata && await completaAccountCreatoDallUfficio(email, userMetadata)) {
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        accountEsistente: true,
                        message: 'Il tuo account DR7 esiste gia\': ti abbiamo inviato un\'email per scegliere la password.',
                    }),
                };
            }
            console.error('Auth creation error:', authError);
            console.error('Auth error details:', JSON.stringify(authError, null, 2));
            console.error('Email attempted:', email);
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: authError.message,
                    code: authError.code,
                    details: authError.details,
                    hint: authError.hint
                })
            };
        }

        const userId = authData.user.id;

        // 1b. BONUS BENVENUTO SUBITO (26/08/2026).
        //
        // Prima stava al punto 4, DOPO il salvataggio del profilo. Quando il
        // profilo non si salvava la function usciva con un 500 e il bonus non
        // veniva mai accreditato: l'utente esisteva, i 10€ no. Il bonus
        // dipende solo dall'utente, quindi si accredita appena l'utente c'e'.
        // La RPC e' idempotente (reference_type = 'welcome_bonus'), quindi
        // resta impossibile accreditarlo due volte.
        let bonusAccreditato = false;
        try {
            const { data: bonusResult, error: bonusError } = await supabase
                .rpc('grant_welcome_bonus', { p_user_id: userId });

            if (bonusError) {
                console.error('[register-customer] BONUS NON ACCREDITATO — RPC error:', bonusError.message, 'user:', userId);
            } else if (bonusResult && bonusResult[0]) {
                const r = bonusResult[0];
                if (r.already_granted) {
                    bonusAccreditato = true;
                    console.log('[register-customer] Bonus gia\' accreditato per', userId);
                } else if (r.success) {
                    bonusAccreditato = true;
                    console.log('[register-customer] Bonus 10€ accreditato a', userId, 'saldo:', r.new_balance);
                } else {
                    console.error('[register-customer] BONUS NON ACCREDITATO:', r.error_message, 'user:', userId);
                }
            }
        } catch (bonusErr) {
            console.error('[register-customer] BONUS NON ACCREDITATO — eccezione:', bonusErr.message, 'user:', userId);
        }

        // 2. Generate confirmation link and send verification email
        console.log('=== EMAIL STEP START ===');
        console.log('RESEND_API_KEY set:', !!process.env.RESEND_API_KEY);
        console.log('SMTP_PASSWORD set:', !!process.env.SMTP_PASSWORD);
        console.log('SMTP_FROM:', process.env.SMTP_FROM || 'NOT SET (fallback: info@dr7.app)');
        try {
            const siteUrl = process.env.SITE_URL || process.env.URL || 'https://dr7.app';
            console.log('Site URL for redirect:', siteUrl);

            const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
                type: 'signup',
                email,
                options: {
                    redirectTo: `${siteUrl}/confirmation-success`,
                },
            });

            if (linkError) {
                console.error('=== GENERATE LINK FAILED ===', linkError);
            } else if (linkData?.properties?.action_link) {
                // 2026-06-11: The action_link host comes from Supabase's "Site URL"
                // setting, which stayed on the OLD dead domain (www.dr7empire.com)
                // after the dr7empire.com -> dr7.app migration. Result: confirmation
                // links pointed at a domain that no longer resolves (NXDOMAIN), so
                // nobody could verify their email. Force the link onto the LIVE site
                // (siteUrl) so verification always works regardless of that dashboard
                // setting. Keeps the /auth/v1/verify path + token/type/redirect_to query.
                let confirmationLink = linkData.properties.action_link;
                try {
                    const _u = new URL(confirmationLink);
                    const _site = new URL(siteUrl);
                    if (_u.host !== _site.host) {
                        console.warn('=== REWRITING STALE LINK HOST ===', _u.host, '->', _site.host);
                        _u.protocol = _site.protocol;
                        _u.host = _site.host;
                        confirmationLink = _u.toString();
                    }
                } catch (_e) {
                    console.error('Could not rewrite confirmation link host:', _e.message);
                }
                console.log('=== LINK GENERATED OK === for:', email, '->', confirmationLink);

                // Esente dagli interruttori System Control: codice di sicurezza, senza si resta chiusi fuori.
                const resendApiKey = process.env.RESEND_API_KEY || process.env.SMTP_PASSWORD;
                if (resendApiKey) {
                    console.log('=== SENDING VIA RESEND API === key starts with:', resendApiKey.substring(0, 6));
                    const customerName = customerData?.nome
                        ? `${customerData.nome} ${customerData.cognome || ''}`.trim()
                        : email;

                    const fromAddress = process.env.SMTP_FROM || 'info@dr7.app';

                    const emailPayload = {
                        from: `DR7 <${fromAddress}>`,
                        reply_to: 'info@dr7.app',
                        to: [email],
                        subject: `Conferma email per ${customerName}`,
                        headers: {
                            'X-Entity-Ref-ID': userId,
                            'List-Unsubscribe': `<mailto:info@dr7.app?subject=unsubscribe>`
                        },
                        text: `Ciao ${customerName},\n\nConferma il tuo indirizzo email per completare la registrazione su DR7.\n\nClicca qui: ${confirmationLink}\n\nSe non hai richiesto questa registrazione, ignora questo messaggio.\n\nDR7\nDubai Rent 7.0 S.p.A.\nVia Ostiense 131/L, 00154 Roma (RM)\ninfo@dr7.app`,
                        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#333">
<p>Ciao ${customerName},</p>
<p>Conferma il tuo indirizzo email per completare la registrazione su DR7.</p>
<p style="margin:24px 0"><a href="${confirmationLink}" style="background:#1a1a1a;color:#fff;padding:12px 28px;border-radius:4px;text-decoration:none;font-size:14px">Conferma email</a></p>
<p style="font-size:13px;color:#666">Oppure copia questo link nel browser:<br><a href="${confirmationLink}" style="color:#666;word-break:break-all">${confirmationLink}</a></p>
<p style="font-size:12px;color:#999;margin-top:32px;border-top:1px solid #eee;padding-top:16px">Se non hai richiesto questa registrazione, ignora questo messaggio.<br><br>DR7 — Dubai Rent 7.0 S.p.A.<br>Via Ostiense 131/L, 00154 Roma (RM)<br>info@dr7.app</p>
</div>`,
                    };

                    console.log('Sending to:', email, 'from:', fromAddress);
                    const resendResponse = await fetch('https://api.resend.com/emails', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${resendApiKey}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(emailPayload),
                    });

                    const resendResult = await resendResponse.json();
                    console.log('=== RESEND RESPONSE ===', resendResponse.status, JSON.stringify(resendResult));
                } else {
                    console.error('=== NO API KEY === Cannot send email');
                }
            } else {
                console.error('=== NO ACTION LINK === linkData:', JSON.stringify(linkData));
            }
        } catch (emailError) {
            console.error('=== EMAIL ERROR ===', emailError.message, emailError);
        }
        console.log('=== EMAIL STEP END ===');

        // 3. Wait briefly for trigger to complete, then update with full data
        // `profileError`: se resta valorizzato, il profilo e' incompleto e la
        // risposta lo dice invece di far credere che sia tutto a posto.
        let profileError = null;
        if (customerData) {
            // Small delay to let the trigger create the initial record
            await new Promise(resolve => setTimeout(resolve, 800));

            // Force source to be 'website' (not 'website_registration' from trigger)
            customerData.source = 'website';

            // Clean up fields just in case
            if (customerData.codiceFiscale) {
                customerData.codice_fiscale = customerData.codiceFiscale;
                delete customerData.codiceFiscale;
            }

            // Remove empty strings for date fields (PostgREST can't cast '' to date)
            if (customerData.data_nascita === '') delete customerData.data_nascita;

            // Il gestionale legge il luogo di nascita da `luogo_nascita` e la
            // patente dalle colonne + metadata.patente: l'iscrizione le
            // scriveva solo in `citta_nascita` e nelle chiavi piatte, e
            // l'ufficio vedeva la scheda senza patente.
            if (customerData.citta_nascita && !customerData.luogo_nascita) {
                customerData.luogo_nascita = customerData.citta_nascita;
            }
            const m = customerData.metadata || {};
            const dataOk = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
            const numeroPatente = (m.numero_patente || '').toString().trim().toUpperCase();
            if (numeroPatente) { customerData.numero_patente = numeroPatente; customerData.patente = numeroPatente; }
            if (m.tipo_patente && String(m.tipo_patente).length <= 10) customerData.tipo_patente = m.tipo_patente; // colonna varchar(10)
            if (m.patente_emessa_da) customerData.emessa_da = m.patente_emessa_da;
            if (dataOk(m.patente_data_rilascio)) customerData.data_rilascio_patente = dataOk(m.patente_data_rilascio);
            if (dataOk(m.patente_scadenza)) customerData.scadenza_patente = dataOk(m.patente_scadenza);
            if (numeroPatente || m.tipo_patente || m.patente_emessa_da || m.patente_data_rilascio || m.patente_scadenza) {
                customerData.metadata = {
                    ...m,
                    patente: {
                        ...(m.patente || {}),
                        ...(numeroPatente ? { numero: numeroPatente } : {}),
                        ...(m.tipo_patente ? { tipo: m.tipo_patente } : {}),
                        ...(m.patente_emessa_da ? { ente: m.patente_emessa_da } : {}),
                        ...(dataOk(m.patente_data_rilascio) ? { rilascio: dataOk(m.patente_data_rilascio) } : {}),
                        ...(dataOk(m.patente_scadenza) ? { scadenza: dataOk(m.patente_scadenza) } : {}),
                    },
                };
            }

            // Prepare update payload (without user_id — that's the filter key)
            const updatePayload = { ...customerData };
            delete updatePayload.user_id;

            // 17/09/2026: se il cliente era gia' in Lead (scheda creata
            // dall'ufficio), il trigger gli ha agganciato l'account invece di
            // creare un doppione (migrazione 20260917180000 in DR7-AI). Su
            // quella scheda l'iscrizione riempie SOLO i campi vuoti: i dati
            // dell'ufficio non si sovrascrivono, la provenienza resta quella
            // e i metadata si fondono invece di essere sostituiti.
            const { data: schedaAgganciata } = await supabase
                .from('customers_extended')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();
            if (schedaAgganciata?.metadata?.account_sito_agganciato_il) {
                const vuoto = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
                for (const campo of Object.keys(updatePayload)) {
                    if (campo === 'metadata') continue;
                    if (campo === 'source' || !vuoto(schedaAgganciata[campo])) delete updatePayload[campo];
                }
                if (updatePayload.metadata) {
                    updatePayload.metadata = { ...updatePayload.metadata, ...(schedaAgganciata.metadata || {}) };
                }
                // Scheda gia' completa: una UPDATE vuota verrebbe rifiutata.
                if (Object.keys(updatePayload).length === 0) {
                    updatePayload.updated_at = new Date().toISOString();
                }
                console.log('[register-customer] Scheda Lead esistente agganciata: aggiorno solo i campi vuoti');
            }

            console.log('Updating customer data for user:', userId);
            console.log('Customer data keys:', Object.keys(updatePayload));

            // Try UPDATE first (trigger should have created the record)
            const { data: updatedData, error: updateError, count } = await supabase
                .from('customers_extended')
                .update(updatePayload)
                .eq('user_id', userId)
                .select();

            if (updateError) {
                console.error('[register-customer] Profile UPDATE error:', updateError);
                console.error('[register-customer] Payload rifiutato:', JSON.stringify(updatePayload, null, 2));

                // 26/08/2026 — QUI si perdevano i dati obbligatori.
                //
                // Un solo valore rifiutato dal database (un CAP piu' lungo del
                // campo, un carattere fuori da un check, una data vuota) faceva
                // fallire l'INTERA UPDATE: nessun campo veniva scritto. Il
                // fallback era una INSERT, che pero' non poteva riuscire —
                // il trigger la riga l'aveva gia' creata — e la function usciva
                // con un 500 prima del bonus e prima del messaggio di
                // benvenuto. Risultato: utente registrato, scheda mezza vuota,
                // 10€ mai accreditati.
                //
                // Ora: si riprova con i soli dati ANAGRAFICI ESSENZIALI, cosi'
                // il campo problematico (sempre un dato accessorio) non si
                // porta dietro nome, cognome, telefono e codice fiscale.
                const essenziali = {};
                for (const campo of ['tipo_cliente', 'nome', 'cognome', 'denominazione', 'ente_ufficio',
                                     'email', 'telefono', 'codice_fiscale', 'partita_iva', 'source']) {
                    if (updatePayload[campo] !== undefined && updatePayload[campo] !== '') {
                        essenziali[campo] = updatePayload[campo];
                    }
                }
                const { error: minimoError } = await supabase
                    .from('customers_extended')
                    .update(essenziali)
                    .eq('user_id', userId);

                if (minimoError) {
                    console.error('[register-customer] Anche i dati essenziali sono stati rifiutati:', minimoError);
                    // Ultima spiaggia: la riga potrebbe non esistere affatto.
                    const { data: esistente } = await supabase
                        .from('customers_extended')
                        .select('id')
                        .eq('user_id', userId)
                        .maybeSingle();
                    if (!esistente) {
                        const { error: insertError } = await supabase
                            .from('customers_extended')
                            .insert({ ...essenziali, user_id: userId });
                        if (insertError) {
                            console.error('[register-customer] INSERT di riserva fallita:', insertError);
                        } else {
                            console.log('[register-customer] Riga creata con i soli dati essenziali');
                        }
                    }
                } else {
                    console.log('[register-customer] Salvati i dati essenziali; rifiutato un dato accessorio');
                }
                // NON si esce: l'utente esiste, il bonus e' gia' accreditato e
                // il messaggio di benvenuto deve partire lo stesso. Il profilo
                // incompleto viene segnalato nella risposta.
                profileError = updateError.message;
            } else if (!updatedData || updatedData.length === 0) {
                // UPDATE matched 0 rows — trigger didn't create the record yet
                console.log('UPDATE matched 0 rows, inserting...');
                customerData.user_id = userId;
                const { error: insertError } = await supabase
                    .from('customers_extended')
                    .insert(customerData);

                if (insertError) {
                    console.error('[register-customer] INSERT dopo 0 righe aggiornate fallita:', insertError);
                    console.warn('[register-customer] Profilo NON salvato (utente creato):', userId);
                    profileError = insertError.message;
                } else {
                    console.log('INSERT succeeded after 0-row update');
                }
            } else {
                console.log('Profile updated successfully:', updatedData);
            }
        }

        // 3b. Link referrer (if a valid referral code was provided)
        if (referralCode && typeof referralCode === 'string') {
            const normalizedCode = referralCode.trim().toUpperCase();
            try {
                const { data: referrerRow, error: referrerErr } = await supabase
                    .from('customers_extended')
                    .select('user_id')
                    .eq('referral_code', normalizedCode)
                    .maybeSingle();

                if (referrerErr) {
                    console.warn('[register-customer] Referral lookup error (non-fatal):', referrerErr.message);
                } else if (referrerRow && referrerRow.user_id && referrerRow.user_id !== userId) {
                    const { error: linkErr } = await supabase
                        .from('customers_extended')
                        .update({ referred_by_user_id: referrerRow.user_id })
                        .eq('user_id', userId);

                    if (linkErr) {
                        console.warn('[register-customer] Failed to set referred_by_user_id (non-fatal):', linkErr.message);
                    } else {
                        console.log(`[register-customer] User ${userId} referred by ${referrerRow.user_id} (code ${normalizedCode})`);
                    }
                } else {
                    console.log('[register-customer] Referral code not found or self-referral, ignoring:', normalizedCode);
                }
            } catch (refErr) {
                console.warn('[register-customer] Referral linking error (non-fatal):', refErr.message);
            }
        }

        // 4. Il bonus benvenuto e' gia' stato accreditato al punto 1b.

        // 5. Send welcome message via WhatsApp (or email fallback)
        try {
            const custName = customerData?.nome
                ? `${customerData.nome} ${customerData.cognome || ''}`.trim()
                : customerData?.rappresentante_nome
                    ? `${customerData.rappresentante_nome} ${customerData.rappresentante_cognome || ''}`.trim()
                    : customerData?.denominazione
                        ? customerData.denominazione
                        : customerData?.ente_ufficio
                            ? customerData.ente_ufficio
                            : 'Cliente';

            // 26/09/2026: il testo e' il template Pro "Benvenuto — registrazione
            // dal sito" (Messaggi di Sistema Pro), per WhatsApp e per l'email.
            // Template spento o vuoto: non parte niente.
            const { data: tplBenvenuto } = await supabase
                .from('system_messages')
                .select('message_body, is_enabled, email_subject')
                .eq('message_key', 'pro_benvenuto_registrazione')
                .maybeSingle();
            const corpoBenvenuto = tplBenvenuto && tplBenvenuto.is_enabled !== false
                ? String(tplBenvenuto.message_body || '').trim()
                : '';
            const welcomeMsg = corpoBenvenuto.split('{nome}').join(custName);

            const custPhone = customerData?.telefono;
            const siteUrl = process.env.URL || 'https://dr7.app';

            if (!welcomeMsg) {
                console.log('[register-customer] template pro_benvenuto_registrazione spento o vuoto: nessun benvenuto');
            } else if (custPhone) {
                // Send via WhatsApp
                await fetch(`${siteUrl}/.netlify/functions/send-whatsapp-notification`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        customPhone: custPhone,
                        templateKey: 'pro_benvenuto_registrazione',
                        templateVars: { nome: custName },
                    }),
                });
                console.log('[register-customer] Welcome WhatsApp sent to:', custPhone);
            } else {
                // Fallback: send via email
                // Interruttore System Control: benvenuto via e-mail saltato se le e-mail sono spente.
                const fermaEmailBenvenuto = await funzioneFerma('invio_email');
                const resendApiKey = process.env.RESEND_API_KEY || process.env.SMTP_PASSWORD;
                if (resendApiKey && !fermaEmailBenvenuto) {
                    const fromAddress = process.env.SMTP_FROM || 'info@dr7.app';
                    await fetch('https://api.resend.com/emails', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${resendApiKey}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            from: `DR7 <${fromAddress}>`,
                            to: [email],
                            subject: (tplBenvenuto && tplBenvenuto.email_subject) || 'Benvenuto in DR7',
                            text: welcomeMsg.replace(/\*/g, ''),
                        }),
                    });
                    console.log('[register-customer] Welcome email sent to:', email);
                }
            }
        } catch (welcomeErr) {
            console.warn('[register-customer] Welcome message failed (non-fatal):', welcomeErr.message);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                user: authData.user,
                // 26/08/2026: la risposta dice com'e' andata davvero. Prima era
                // sempre "success" oppure un 500 che nascondeva un account gia'
                // creato.
                bonusAccreditato,
                profiloCompleto: !profileError,
                profileError: profileError || undefined,
            })
        };

    } catch (error) {
        console.error('Registration handler error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};

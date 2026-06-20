const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

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

            // Prepare update payload (without user_id — that's the filter key)
            const updatePayload = { ...customerData };
            delete updatePayload.user_id;

            console.log('Updating customer data for user:', userId);
            console.log('Customer data keys:', Object.keys(updatePayload));

            // Try UPDATE first (trigger should have created the record)
            const { data: updatedData, error: updateError, count } = await supabase
                .from('customers_extended')
                .update(updatePayload)
                .eq('user_id', userId)
                .select();

            if (updateError) {
                console.error('Profile UPDATE error:', updateError);
                console.error('Customer data that failed:', JSON.stringify(updatePayload, null, 2));

                // Fallback: INSERT if the trigger didn't create the record
                console.log('Attempting INSERT as fallback...');
                customerData.user_id = userId;
                const { error: insertError } = await supabase
                    .from('customers_extended')
                    .insert(customerData);

                if (insertError) {
                    console.error('INSERT also failed:', insertError);
                    return {
                        statusCode: 500,
                        body: JSON.stringify({
                            error: 'Account created but failed to save profile data. Please contact support.',
                            userId: userId,
                            details: updateError.message,
                            code: updateError.code,
                            hint: updateError.hint,
                            dbDetails: updateError.details
                        })
                    };
                }

                console.log('INSERT fallback succeeded!');
            } else if (!updatedData || updatedData.length === 0) {
                // UPDATE matched 0 rows — trigger didn't create the record yet
                console.log('UPDATE matched 0 rows, inserting...');
                customerData.user_id = userId;
                const { error: insertError } = await supabase
                    .from('customers_extended')
                    .insert(customerData);

                if (insertError) {
                    console.error('INSERT after 0-row update failed:', insertError);
                    // Non-fatal: the auth user exists, profile can be completed later
                    console.warn('Profile data not saved, but auth user created successfully');
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

        // 4. Grant €10 welcome bonus (idempotent — safe to call multiple times)
        try {
            const { data: bonusResult, error: bonusError } = await supabase
                .rpc('grant_welcome_bonus', { p_user_id: userId });

            if (bonusError) {
                console.warn('Welcome bonus RPC error (non-fatal):', bonusError.message);
            } else if (bonusResult && bonusResult[0]) {
                const r = bonusResult[0];
                if (r.already_granted) {
                    console.log('Welcome bonus already granted for user:', userId);
                } else if (r.success) {
                    console.log('Welcome bonus €10 credited for user:', userId, 'new balance:', r.new_balance);
                } else {
                    console.warn('Welcome bonus failed:', r.error_message);
                }
            }
        } catch (bonusErr) {
            // Non-fatal: account is created, bonus can be retried
            console.warn('Welcome bonus error (non-fatal):', bonusErr.message);
        }

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

            const welcomeMsg = `Gentile ${custName},\n\n`
                + `La ringraziamo per essersi registrato sul nostro sito e per aver scelto di entrare nel mondo *DR7*.\n\n`
                + `Con la Sua registrazione, entra ufficialmente in un ecosistema esclusivo dedicato alla mobilità premium, ai servizi personalizzati e a un'esperienza superiore.\n\n`
                + `Per darle il benvenuto, abbiamo appena accreditato *10€ di credito omaggio* sul Suo wallet *DR7*, già disponibili e utilizzabili per le Sue prossime prenotazioni.\n\n`
                + `Inoltre, ogni acquisto Le permetterà di accumulare ulteriore credito: più utilizza i servizi *DR7*, più il Suo wallet crescerà nel tempo.\n\n`
                + `La invitiamo ad approfittarne subito per prenotare il Suo servizio e vivere in prima persona lo standard *DR7*: rapido, elegante e senza compromessi.\n\n`
                + `Può procedere immediatamente da qui:\nhttps://dr7.app/\n\n`
                + `Restiamo a Sua completa disposizione.\n\n`
                + `Cordiali saluti,\n*DR7*`;

            const custPhone = customerData?.telefono;
            const siteUrl = process.env.URL || 'https://dr7.app';

            if (custPhone) {
                // Send via WhatsApp
                await fetch(`${siteUrl}/.netlify/functions/send-whatsapp-notification`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ customPhone: custPhone, customMessage: welcomeMsg }),
                });
                console.log('[register-customer] Welcome WhatsApp sent to:', custPhone);
            } else {
                // Fallback: send via email
                const resendApiKey = process.env.RESEND_API_KEY || process.env.SMTP_PASSWORD;
                if (resendApiKey) {
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
                            subject: 'Benvenuto in DR7 — 10€ di credito omaggio',
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
            body: JSON.stringify({ success: true, user: authData.user })
        };

    } catch (error) {
        console.error('Registration handler error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};

import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const ALLOWED_ORIGINS = [
    // 2026-06-05: migrazione dominio — nuovi domini a fianco dei vecchi.
    'https://dr7.app',
    'https://www.dr7.app',
    'https://platform.dr7.app',
    'https://dr7ai.com',
    'https://www.dr7ai.com',
    'http://localhost:5173',
    'http://localhost:8888',
]

function corsHeaders(origin: string | undefined): Record<string, string> {
    const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json',
    }
}

type DocKind = 'identity_document' | 'drivers_license' | 'codice_fiscale'

const BUCKET_BY_KIND: Record<DocKind, string> = {
    identity_document: 'customer-documents',
    drivers_license: 'driver-licenses',
    codice_fiscale: 'codice-fiscale',
}

/**
 * Public endpoint — accepts a document file uploaded by a self-registering
 * customer. Validates the invite token, uploads to the matching bucket,
 * and creates a user_documents row with status='pending_verification' so the
 * document appears in the admin Verifica Documenti tab.
 */
const handler: Handler = async (event) => {
    const headers = corsHeaders(event.headers.origin || event.headers.Origin)

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method Not Allowed' }

    try {
        const { token, customerId, docKind, fileName, fileBase64, contentType } = JSON.parse(event.body || '{}')
        if (!token) return { statusCode: 400, headers, body: JSON.stringify({ error: 'token mancante' }) }
        if (!customerId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'customerId mancante' }) }
        if (!fileName || !fileBase64) return { statusCode: 400, headers, body: JSON.stringify({ error: 'file mancante' }) }

        const kind: DocKind = (BUCKET_BY_KIND as Record<string, string>)[docKind] ? docKind : 'identity_document'
        const bucket = BUCKET_BY_KIND[kind]

        const { data: invite } = await supabase
            .from('customer_invites')
            .select('id, expires_at, used_at, revoked_at, customer_id')
            .eq('token', token)
            .maybeSingle()
        if (!invite) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Link non trovato' }) }
        if (invite.revoked_at) return { statusCode: 410, headers, body: JSON.stringify({ error: 'Link revocato' }) }
        const now = new Date()
        const grace = new Date(invite.expires_at); grace.setHours(grace.getHours() + 24)
        if (grace < now) return { statusCode: 410, headers, body: JSON.stringify({ error: 'Link scaduto' }) }
        if (invite.customer_id && invite.customer_id !== customerId) {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'Customer non corrispondente al link' }) }
        }

        const fileBuf = Buffer.from(fileBase64, 'base64')
        if (fileBuf.length > 10 * 1024 * 1024) {
            return { statusCode: 413, headers, body: JSON.stringify({ error: 'File troppo grande (max 10 MB)' }) }
        }

        const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
        const path = `${customerId}/${Date.now()}_${kind}_${safeName}`

        const { error: upErr } = await supabase.storage
            .from(bucket)
            .upload(path, fileBuf, {
                contentType: contentType || 'application/octet-stream',
                upsert: false,
            })
        if (upErr) {
            console.error('[upload-customer-invite-document] storage error', upErr)
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'Upload fallito: ' + upErr.message }) }
        }

        const { data: doc, error: insErr } = await supabase
            .from('user_documents')
            .insert({
                user_id: customerId,
                document_type: kind,
                bucket,
                file_path: path,
                status: 'pending_verification',
            })
            .select()
            .single()
        if (insErr) {
            console.error('[upload-customer-invite-document] user_documents insert error', insErr)
            return { statusCode: 500, headers, body: JSON.stringify({ error: insErr.message }) }
        }

        // Best-effort: kick off auto-verify on the admin domain. The website
        // doesn't host auto-verify-document — that's an admin-only function.
        try {
            const adminUrl = process.env.ADMIN_FUNCTIONS_URL || 'https://platform.dr7ai.com'
            await fetch(`${adminUrl}/.netlify/functions/auto-verify-document`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ documentId: doc.id }),
            }).catch(e => console.warn('[upload-customer-invite-document] auto-verify trigger failed', e))
        } catch { /* swallow */ }

        return { statusCode: 200, headers, body: JSON.stringify({ success: true, documentId: doc.id, path }) }
    } catch (err) {
        console.error('[upload-customer-invite-document] error', err)
        const msg = err instanceof Error ? err.message : String(err)
        return { statusCode: 500, headers, body: JSON.stringify({ error: msg }) }
    }
}

export { handler }

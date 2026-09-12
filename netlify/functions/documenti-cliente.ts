import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getCorsOrigin } from './utils/cors'

/**
 * Tutti i documenti di un cliente, da qualunque parte siano stati caricati.
 *
 * Un cliente ha DUE identificativi: quello dell'account (auth) e quello della
 * scheda (customers_extended). Il sito carica sotto il primo, il gestionale
 * sotto il secondo. Dal browser le policy di storage mostrano solo la
 * cartella dell'account, quindi i documenti caricati dall'ufficio restavano
 * invisibili e la prenotazione li richiedeva di nuovo. Qui si guarda sotto
 * tutti e due, con la chiave di servizio.
 */

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, serviceRole)

const BUCKET_PATENTE = 'driver-licenses'
const BUCKET_IDENTITA = ['carta-identita', 'customer-documents', 'driver-ids']
const BUCKET_CF = 'codice-fiscale'

interface Documento {
    bucket: string
    percorso: string
    nomeFile: string
    stato: string
    caricatoIl: string | null
    url: string | null
}

export const handler: Handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': getCorsOrigin(event.headers['origin']),
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Content-Type': 'application/json',
    }
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) }

    try {
        const token = (event.headers['authorization'] || '').replace('Bearer ', '')
        if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Non autenticato' }) }

        const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
        if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Sessione non valida' }) }

        const identificativi = new Set<string>([user.id])
        const { data: schede } = await supabase
            .from('customers_extended')
            .select('id, user_id')
            .or(`id.eq.${user.id},user_id.eq.${user.id}`)
        for (const riga of schede || []) {
            if (riga.id) identificativi.add(riga.id)
            if (riga.user_id) identificativi.add(riga.user_id)
        }
        const ids = [...identificativi]

        // Stato reale dal registro documenti, per percorso.
        const statoPerPercorso = new Map<string, { stato: string; quando: string | null }>()
        const { data: righe } = await supabase
            .from('user_documents')
            .select('file_path, status, upload_date')
            .in('user_id', ids)
        for (const r of righe || []) {
            if (r.file_path) statoPerPercorso.set(r.file_path, { stato: r.status || 'pending_verification', quando: r.upload_date || null })
        }

        const bucketTutti = [BUCKET_PATENTE, BUCKET_CF, ...BUCKET_IDENTITA]
        const trovati: Documento[] = []
        const visti = new Set<string>()

        await Promise.all(bucketTutti.flatMap(bucket => ids.map(async (id) => {
            const { data: files } = await supabase.storage.from(bucket).list(id, { limit: 100 })
            for (const f of files || []) {
                if (!f.name || f.name.includes('.emptyFolderPlaceholder')) continue
                const percorso = `${id}/${f.name}`
                if (visti.has(`${bucket}:${percorso}`)) continue
                visti.add(`${bucket}:${percorso}`)
                const { data: firmato } = await supabase.storage.from(bucket).createSignedUrl(percorso, 3600)
                const meta = statoPerPercorso.get(percorso)
                trovati.push({
                    bucket,
                    percorso,
                    nomeFile: f.name,
                    stato: meta?.stato || 'pending_verification',
                    caricatoIl: meta?.quando || f.created_at || null,
                    url: firmato?.signedUrl || null,
                })
            }
        })))

        const patente = trovati.filter(d => d.bucket === BUCKET_PATENTE && !/^patente_nautica/i.test(d.nomeFile))
        const codiceFiscale = trovati.filter(d => d.bucket === BUCKET_CF)
        const identita = trovati.filter(d => BUCKET_IDENTITA.includes(d.bucket))

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ ok: true, documenti: trovati, patente, identita, codiceFiscale }),
        }
    } catch (e: any) {
        console.error('[documenti-cliente]', e?.message || e)
        return { statusCode: 500, headers, body: JSON.stringify({ error: e?.message || 'Errore server' }) }
    }
}

/**
 * Completa la scheda cliente con i dati appena compilati in prenotazione
 * (26/08/2026).
 *
 * PERCHE' SERVE
 * I dati scritti nel form di prenotazione finivano SOLO dentro la
 * prenotazione (`bookings.booking_details.customer`). La scheda cliente
 * (`customers_extended`) non veniva toccata: un cliente poteva iscriversi,
 * pagare un lavaggio e restare comunque una lead vuota, con "Cliente" al
 * posto del nome e due trattini al posto di telefono e codice fiscale. Poi
 * contratti, fatture e messaggi ripartivano da quella scheda vuota.
 *
 * COSA FA
 * Riempie SOLO i campi vuoti della scheda dell'utente collegato: quello che
 * l'ufficio ha gia' corretto a mano non viene mai sovrascritto. Se la scheda
 * non esiste la crea; se esiste solo con l'email, la aggancia all'account.
 *
 * Non blocca mai la prenotazione: chi chiama la lancia e prosegue. Anche in
 * caso di errore risponde 200 con l'esito dentro, cosi' un problema qui non
 * puo' impedire a nessuno di prenotare.
 *
 * Identita': il token della sessione, mai un id passato nel body — altrimenti
 * chiunque potrebbe riscrivere la scheda di un altro cliente.
 */
import { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { getCorsOrigin } from './utils/cors'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Nome del campo nel form -> colonne della scheda. Alcuni dati vivono in due
// colonne: il gestionale legge `luogo_nascita`, il sito storicamente
// `citta_nascita` — si riempiono entrambe.
const MAPPA: Record<string, string[]> = {
  telefono: ['telefono'],
  codiceFiscale: ['codice_fiscale'],
  indirizzo: ['indirizzo'],
  numeroCivico: ['numero_civico'],
  cittaResidenza: ['citta_residenza'],
  codicePostale: ['codice_postale'],
  provinciaResidenza: ['provincia_residenza'],
  dataNascita: ['data_nascita'],
  cittaNascita: ['luogo_nascita', 'citta_nascita'],
  luogoNascita: ['luogo_nascita', 'citta_nascita'],
  provinciaNascita: ['provincia_nascita'],
  sesso: ['sesso'],
  pec: ['pec'],
  denominazione: ['denominazione'],
  partitaIva: ['partita_iva'],
  // Patente: le colonne sono quelle che leggono scheda cliente, contratto e
  // CARGOS nel gestionale.
  patenteNumero: ['numero_patente'],
  patenteTipo: ['tipo_patente'],
  patenteEnte: ['emessa_da'],
  patenteRilascio: ['data_rilascio_patente'],
  patenteScadenza: ['scadenza_patente'],
  // Documento d'identita'
  documentoTipo: ['documento_tipo'],
  documentoNumero: ['documento_numero'],
  documentoRilascio: ['documento_data_rilascio'],
}

// Colonne con lunghezza massima: un valore piu' lungo fa rifiutare
// l'intera scrittura, quindi si scarta prima.
const LUNGHEZZA_MAX: Record<string, number> = {
  sesso: 1, provincia_nascita: 2, codice_postale: 5, tipo_patente: 10,
  citta_nascita: 100, numero_patente: 50, documento_tipo: 50, documento_numero: 50, emessa_da: 255,
}

const COLONNE_DATA = new Set(['data_nascita', 'data_rilascio_patente', 'scadenza_patente', 'documento_data_rilascio'])

// La patente sta anche nel metadata, in due forme: `metadata.patente.*`
// (scheda cliente del gestionale) e le chiavi piatte (Impostazioni del sito).
const PATENTE_META: Record<string, { annidata: string; piatta: string }> = {
  patenteNumero: { annidata: 'numero', piatta: 'numero_patente' },
  patenteTipo: { annidata: 'tipo', piatta: 'tipo_patente' },
  patenteEnte: { annidata: 'ente', piatta: 'patente_emessa_da' },
  patenteRilascio: { annidata: 'rilascio', piatta: 'patente_data_rilascio' },
  patenteScadenza: { annidata: 'scadenza', piatta: 'patente_scadenza' },
}

const testo = (v: any) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v))
const vuoto = (v: any) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
// Una data vuota o scritta male e' uno dei valori che il database rifiuta:
// si scarta qui invece di far fallire la scrittura. Accetta anche gg/mm/aaaa.
const dataValida = (v: string) => {
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''
}

const handler: Handler = async (event) => {
  const origin = getCorsOrigin(event.headers.origin || event.headers.Origin)
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Non autenticato' }) }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authError || !user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Sessione non valida' }) }
  }

  try {
    const { dati } = JSON.parse(event.body || '{}') as { dati?: Record<string, any> }
    const d = dati || {}
    const email = testo(user.email).toLowerCase()

    // Il form chiede un nome intero: la scheda vuole nome e cognome separati.
    const valori: Record<string, string> = {}
    const intero = testo(d.fullName || d.nome_completo)
    if (intero) {
      const parti = intero.split(/\s+/)
      valori.nome = parti[0]
      if (parti.length > 1) valori.cognome = parti.slice(1).join(' ')
    }
    if (testo(d.nome)) valori.nome = testo(d.nome)
    if (testo(d.cognome)) valori.cognome = testo(d.cognome)

    for (const [campoForm, colonne] of Object.entries(MAPPA)) {
      let v = testo(d[campoForm])
      if (!v) continue
      if (campoForm === 'sesso') v = v.toUpperCase().startsWith('F') ? 'F' : v.toUpperCase().startsWith('M') ? 'M' : ''
      if (campoForm === 'provinciaNascita' || campoForm === 'provinciaResidenza') v = v.toUpperCase()
      if (campoForm === 'patenteNumero' || campoForm === 'documentoNumero') v = v.toUpperCase()
      for (const colonna of colonne) {
        if (valori[colonna]) continue
        const pronto = COLONNE_DATA.has(colonna) ? dataValida(v) : v
        if (LUNGHEZZA_MAX[colonna] && pronto.length > LUNGHEZZA_MAX[colonna]) continue
        valori[colonna] = pronto
      }
    }
    if (valori.codice_fiscale) valori.codice_fiscale = valori.codice_fiscale.toUpperCase()
    for (const k of Object.keys(valori)) if (!valori[k]) delete valori[k]
    // Valori della patente da copiare nelle forme secondarie (colonna
    // storica `patente` e metadata). Se la scheda ha gia' il dato nella
    // colonna, vale quello: le copie non devono mai divergere dall'originale.
    const valoriPatenteDa = (scheda: Record<string, any> | null): Record<string, string> => {
      const out: Record<string, string> = {}
      for (const campoForm of Object.keys(PATENTE_META)) {
        const colonna = MAPPA[campoForm][0]
        const esistente = scheda && !vuoto(scheda[colonna]) ? testo(scheda[colonna]).slice(0, COLONNE_DATA.has(colonna) ? 10 : undefined) : ''
        const v = esistente || valori[colonna]
        if (v) out[campoForm] = v
      }
      return out
    }

    // Metadata con la patente nelle due forme, riempiendo solo i vuoti.
    const metadataCompletato = (attuale: any, valoriPatente: Record<string, string>): Record<string, any> | null => {
      if (Object.keys(valoriPatente).length === 0) return null
      const meta = { ...((attuale && typeof attuale === 'object') ? attuale : {}) }
      const annidata = { ...((meta.patente && typeof meta.patente === 'object') ? meta.patente : {}) }
      let cambiato = false
      for (const [campoForm, v] of Object.entries(valoriPatente)) {
        const { annidata: ka, piatta: kp } = PATENTE_META[campoForm]
        if (vuoto(annidata[ka])) { annidata[ka] = v; cambiato = true }
        if (vuoto(meta[kp])) { meta[kp] = v; cambiato = true }
      }
      if (!cambiato) return null
      meta.patente = annidata
      return meta
    }

    // Scheda dell'utente: prima per account, poi per email (molte schede
    // vecchie hanno solo l'email — agganciarla evita un doppione). Email
    // senza distinzione di maiuscole e senza maybeSingle: con due schede
    // sulla stessa email maybeSingle dava errore e se ne creava una terza.
    const { data: perId } = await supabase
      .from('customers_extended')
      .select('*')
      .eq('user_id', user.id)
      .limit(1)

    let scheda: Record<string, any> | null = perId?.[0] || null
    if (!scheda && email) {
      const { data: perMail } = await supabase
        .from('customers_extended')
        .select('*')
        .ilike('email', email)
        .order('codice_fiscale', { ascending: false, nullsFirst: false })
        .limit(1)
      scheda = perMail?.[0] || null
    }

    // Nuova scheda: l'iscritto entra in anagrafica invece di restare
    // soltanto dentro la prenotazione.
    if (!scheda) {
      const metaNuova = metadataCompletato({}, valoriPatenteDa(null))
      if (valori.numero_patente) valori.patente = valori.numero_patente
      const { error: insErr } = await supabase
        .from('customers_extended')
        .insert({ user_id: user.id, email, tipo_cliente: 'persona_fisica', source: 'website', ...valori, ...(metaNuova ? { metadata: metaNuova } : {}) })
      if (insErr) {
        console.error('[completa-scheda-cliente] scheda non creata:', insErr.message)
        return { statusCode: 200, headers, body: JSON.stringify({ success: false, motivo: insErr.message }) }
      }
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, creata: true, campi: Object.keys(valori).length }) }
    }

    if (!scheda.user_id) {
      await supabase.from('customers_extended').update({ user_id: user.id }).eq('id', scheda.id)
    }

    // Solo i campi vuoti: nessuna correzione dell'ufficio viene sovrascritta.
    const patentePerCopie = valoriPatenteDa(scheda)
    // Il numero di patente vive anche nella colonna storica `patente`.
    if (patentePerCopie.patenteNumero) valori.patente = patentePerCopie.patenteNumero
    const patch: Record<string, any> = {}
    for (const [colonna, v] of Object.entries(valori)) {
      if (!(colonna in scheda)) continue
      if (!vuoto(scheda[colonna])) continue
      patch[colonna] = v
    }
    const meta = metadataCompletato(scheda.metadata, patentePerCopie)
    if (meta) patch.metadata = meta
    if (Object.keys(patch).length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, campi: 0 }) }
    }

    const { error: updErr } = await supabase
      .from('customers_extended')
      .update(patch)
      .eq('id', scheda.id)

    if (!updErr) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, campi: Object.keys(patch).length }) }
    }

    // Un solo valore rifiutato dal database non deve far perdere tutti gli
    // altri: e' l'errore che ha svuotato le schede degli iscritti. Si
    // riscrive campo per campo.
    console.warn('[completa-scheda-cliente] update in blocco rifiutata:', updErr.message)
    let scritti = 0
    const rifiutati: string[] = []
    for (const [colonna, v] of Object.entries(patch)) {
      const { error } = await supabase
        .from('customers_extended')
        .update({ [colonna]: v })
        .eq('id', scheda.id)
      if (error) rifiutati.push(colonna)
      else scritti++
    }
    return { statusCode: 200, headers, body: JSON.stringify({ success: scritti > 0, campi: scritti, rifiutati }) }
  } catch (e) {
    console.error('[completa-scheda-cliente]', e)
    // 200 anche qui: questa scrittura non deve mai bloccare una prenotazione.
    return { statusCode: 200, headers, body: JSON.stringify({ success: false, motivo: e instanceof Error ? e.message : 'errore' }) }
  }
}

export { handler }

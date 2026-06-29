/**
 * extract-document-data
 * Extracts personal/document/license data from uploaded document images
 * using Claude Vision API. Used by the "Compila" button.
 */

import { Handler } from '@netlify/functions'
import { getCorsOrigin } from './utils/cors'

const EXTRACTION_PROMPT = `Estrai i dati da questo documento italiano.

!!! REGOLA CRITICA PER PATENTE !!!
Il NUMERO PATENTE si trova SOLO sul FRONTE della patente, al campo numero 5.
Sul RETRO della patente NON c'è il numero patente.
Se stai guardando il FRONTE, cerca il campo "5." (es: U1234567A).
Se stai guardando il RETRO, NON estrarre patente_numero.

!!! DATA DI CONSEGUIMENTO — STA SUL RETRO, NON SUL FRONTE !!!
La data REALE in cui il titolare ha conseguito la patente per la PRIMA volta NON
è sul fronte. Sul FRONTE il campo "4a" è solo la data di EMISSIONE/RINNOVO della
tessera: NON usarla mai come data di conseguimento.
Sul RETRO c'è una TABELLA delle categorie:
- colonna 9  = categoria (A1, A, B, BE, C, ...)
- colonna 10 = DATA DI CONSEGUIMENTO di quella categoria (di solito DD.MM.YY)
- colonna 11 = scadenza di quella categoria
Estrai quindi:
- "patente_conseguimento" = la data nella COLONNA 10 della categoria "B" (auto).
  Se la categoria B non c'è, usa la data PIÙ VECCHIA fra tutte le categorie.
  Converti SEMPRE in formato YYYY-MM-DD.
- "patente_tipo" = elenco delle categorie possedute (colonna 9), es. "A1, B".
- "patente_rilascio" = la data "4a" del FRONTE (emissione tessera), SOLO quella.
NON confondere patente_conseguimento (retro, col.10) con patente_rilascio (fronte 4a).

REGOLA FONDAMENTALE: Trascrivi ESATTAMENTE quello che leggi. NON inventare, NON aggiungere caratteri.

=== FORMATI ESATTI ===

NUMERO DOCUMENTO CIE: 2 lettere + 5 numeri + 2 lettere (es: CA12345AB). NON includere "ITA"!
DATA: Sempre formato YYYY-MM-DD
NOME/COGNOME: Prima Lettera Maiuscola (es: Mario Rossi)
CODICE FISCALE: ESATTAMENTE 16 caratteri

=== CAMPI DA ESTRARRE ===
{
  "nome": "Nome", "cognome": "Cognome", "sesso": "M o F",
  "data_nascita": "YYYY-MM-DD", "luogo_nascita": "Comune",
  "provincia_nascita": "XX", "codice_fiscale": "16 caratteri",
  "indirizzo": "Via/Piazza", "numero_civico": "numero",
  "codice_postale": "5 cifre", "citta_residenza": "Comune",
  "provincia_residenza": "XX",
  "documento_tipo": "tipo", "documento_numero": "numero",
  "documento_rilascio": "YYYY-MM-DD", "documento_scadenza": "YYYY-MM-DD",
  "documento_ente": "ente",
  "patente_numero": "dal campo 5 FRONTE",
  "patente_tipo": "categorie dalla colonna 9 del RETRO (es. A1, B)",
  "patente_conseguimento": "YYYY-MM-DD (colonna 10 categoria B sul RETRO = data reale di conseguimento)",
  "patente_rilascio": "YYYY-MM-DD (campo 4a FRONTE = emissione tessera)", "patente_scadenza": "YYYY-MM-DD",
  "patente_ente": "ente",
  "document_type": "carta_identita/patente/passaporto/tessera_sanitaria",
  "confidence": "high/medium/low",
  "notes": "problemi"
}

Se non riesci a leggere un campo chiaramente, OMETTILO.
Rispondi SOLO con JSON valido.`

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': getCorsOrigin(event.headers['origin']),
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) }
  }

  try {
    const { imageBase64, imageUrl } = JSON.parse(event.body || '{}')

    if (!imageBase64 && !imageUrl) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'imageBase64 or imageUrl required' }) }
    }

    // Prepare image content for Claude
    let imageContent: any
    if (imageBase64) {
      const mediaType = imageBase64.startsWith('/9j/') ? 'image/jpeg' :
                       imageBase64.startsWith('iVBORw') ? 'image/png' : 'image/jpeg'
      imageContent = { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } }
    } else {
      imageContent = { type: 'image', source: { type: 'url', url: imageUrl } }
    }

    // Call Claude Vision API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        // Modello aggiornato 2026-05-16: claude-sonnet-4-20250514 era uno
        // snapshot beta che ha smesso di rispondere. Usiamo l'alias stabile
        // claude-sonnet-4-5 cosi' Anthropic punta sempre all'ultimo snapshot
        // pubblico della famiglia Sonnet 4.5 (vision compatible).
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [imageContent, { type: 'text', text: EXTRACTION_PROMPT }]
        }]
      })
    })

    const result = await response.json()

    if (!response.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: result.error?.message || 'Claude API error' }) }
    }

    const responseText = result.content?.[0]?.text || ''

    // Parse JSON response
    let cleanJson = responseText.trim()
    if (cleanJson.startsWith('```json')) cleanJson = cleanJson.slice(7)
    if (cleanJson.startsWith('```')) cleanJson = cleanJson.slice(3)
    if (cleanJson.endsWith('```')) cleanJson = cleanJson.slice(0, -3)

    let extractedData
    try {
      extractedData = JSON.parse(cleanJson.trim())
    } catch {
      return { statusCode: 422, headers, body: JSON.stringify({ error: 'Documento non leggibile', raw_response: responseText }) }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, extractedData }) }

  } catch (error: any) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) }
  }
}

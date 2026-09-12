/**
 * extract-document-data
 * Extracts personal/document/license data from uploaded document images
 * using Claude Vision API. Used by the "Compila" button.
 *
 * 12/09/2026 — allineata al lettore del gestionale (DR7-AI
 * netlify/functions/extract-document-data.ts): stesso prompt (piu'
 * documenti nella stessa foto, regole CIE, CAP inferito, patente
 * nautica), stessa gestione dei file (PDF via type=document, HEIC
 * rifiutato con messaggio chiaro, URL scaricate lato server) e stessa
 * catena di modelli con fallback. In piu', per la patente le date si
 * leggono dal RETRO: colonna 10 = conseguimento cat. B, colonna 11 =
 * scadenza cat. B.
 */

import { Handler } from '@netlify/functions'
import { getCorsOrigin } from './utils/cors'

interface ExtractedPersonData {
  // Personal Info
  nome?: string
  cognome?: string
  sesso?: 'M' | 'F'
  data_nascita?: string // YYYY-MM-DD
  luogo_nascita?: string
  provincia_nascita?: string
  codice_fiscale?: string

  // Address
  indirizzo?: string
  numero_civico?: string
  codice_postale?: string
  citta_residenza?: string
  provincia_residenza?: string

  // Document Info (ID Card)
  documento_tipo?: string
  documento_numero?: string
  documento_rilascio?: string // YYYY-MM-DD
  documento_scadenza?: string // YYYY-MM-DD
  documento_ente?: string

  // Driver's License
  patente_numero?: string
  patente_tipo?: string // B, A, C, etc.
  patente_rilascio?: string // YYYY-MM-DD — conseguimento cat. B (RETRO col.10)
  patente_conseguimento?: string // alias di patente_rilascio per il sito
  patente_scadenza?: string // YYYY-MM-DD — scadenza cat. B (RETRO col.11)
  patente_ente?: string
  patente_date_dal_retro?: boolean

  // Patente nautica (Noleggio Mare)
  nautica_numero?: string
  nautica_categoria?: string
  nautica_limite?: string
  nautica_abilitazione?: string
  nautica_rilascio?: string
  nautica_scadenza?: string
  nautica_ente?: string

  // Extraction metadata
  document_type?: string
  confidence?: 'high' | 'medium' | 'low'
  raw_text?: string
  notes?: string
}

const EXTRACTION_PROMPT = `Estrai i dati dai documenti italiani in questa immagine.

!!! L'IMMAGINE PUO' CONTENERE PIU' DOCUMENTI INSIEME !!!
Spesso il cliente carica una scansione/foto con DUE documenti diversi
impilati sulla stessa immagine, ad esempio:
- Fronte Carta Identità SOPRA + Fronte Patente SOTTO
- Retro Carta Identità SOPRA + Retro Patente SOTTO
- Tessera Sanitaria/CF SOPRA + Carta Identità SOTTO
- Carta Identità Fronte SOPRA + Carta Identità Retro SOTTO

QUANDO VEDI PIU' DOCUMENTI:
1. Esamina CIASCUN documento separatamente.
2. Compila TUTTI i campi pertinenti nello STESSO JSON di output:
   - Campi della carta identità → documento_* (documento_numero, scadenza, ecc.)
   - Campi della patente DI GUIDA → patente_* (patente_numero, scadenza, ecc.)
   - Campi della patente NAUTICA → nautica_* (nautica_numero, ecc.)
   - codice_fiscale → estrai dalla tessera sanitaria/CF se presente,
     altrimenti dalla carta identità (la CIE riporta il CF sul retro)
3. nome, cognome, data_nascita, sesso → usa il valore consistente tra
   i documenti (devono essere identici). Se differiscono, usa il piu'
   leggibile.
4. NON ignorare un documento perche' "ce n'e' un altro nella stessa
   immagine". Estraili TUTTI.
5. documento_tipo deve riflettere il documento di identita' (Carta
   d'Identità Elettronica / Passaporto / ecc.), NON la patente — la
   patente ha i suoi campi patente_*.

!!! REGOLA CRITICA PER PATENTE !!!
Il NUMERO PATENTE si trova SOLO sul FRONTE della patente, al campo numero 5.
Sul RETRO della patente NON c'è il numero patente - c'è solo la tabella delle categorie.
Se stai guardando il FRONTE della patente, cerca il campo "5." che contiene il numero (es: U1234567A).
Se stai guardando il RETRO, NON estrarre patente_numero perché non è presente sul retro.

REGOLA FONDAMENTALE: Trascrivi ESATTAMENTE quello che leggi. NON inventare, NON aggiungere caratteri, NON indovinare.

=== FORMATI ESATTI ===

NUMERO DOCUMENTO CIE (Carta Identità Elettronica):
- Formato: 2 lettere + 5 numeri + 2 lettere
- Esempio: CA12345AB, CA44528GJ
- ESATTAMENTE 9 caratteri, non di più, non di meno

!!! ATTENZIONE - NON INCLUDERE "ITA" !!!
Sul fronte della CIE, in alto a destra, c'è scritto "ITA" (codice paese Italia).
"ITA" NON FA PARTE del numero documento!
Il numero documento è SOTTO "ITA", nel formato CA12345AB.
Se leggi "ITA CA44528GJ", il numero documento è SOLO "CA44528GJ" (9 caratteri).
NON scrivere mai "ITA" nel campo documento_numero!

DATA DI NASCITA:
- Sul documento: GG.MM.AAAA oppure GG/MM/AAAA
- Estrai come: YYYY-MM-DD
- Esempio: 15.03.1990 → 1990-03-15

NOME e COGNOME:
- Trascrivi LETTERA PER LETTERA quello che vedi
- Sul documento sono in MAIUSCOLO, tu convertili in: Prima Lettera Maiuscola
- Esempio: MARIO → Mario, ROSSI → Rossi

CODICE FISCALE:
- ESATTAMENTE 16 caratteri
- Formato: LLLLLLNNLNNLNNNL (L=lettera, N=numero)
- NON aggiungere caratteri extra

CODICE POSTALE (CAP):
- ESATTAMENTE 5 cifre
- Se sul documento e' visibile, trascrivilo
- Se NON e' visibile sul documento (es. la CIE non riporta sempre il CAP)
  MA conosci la citta' di residenza, INFERISCI il CAP italiano corretto
  dalla citta'. Esempi:
    Cagliari → 09121 (o 09100 se generico)
    Quartu Sant'Elena → 09045
    Sassari → 07100
    Olbia → 07026
    Alghero → 07041
    Milano → 20121 (centro) / usa CAP principale
    Roma → 00100 / 00184 (a seconda della zona se nota)
  Se non sei sicuro del CAP esatto della zona, usa il CAP principale
  della citta'. Meglio fornire un CAP della citta' che lasciare vuoto.

=== CAMPI DA ESTRARRE ===

{
  "nome": "Nome di battesimo",
  "cognome": "Cognome",
  "sesso": "M o F",
  "data_nascita": "YYYY-MM-DD",
  "luogo_nascita": "Comune di nascita",
  "provincia_nascita": "XX (2 lettere)",
  "codice_fiscale": "16 caratteri esatti",
  "indirizzo": "Via/Piazza nome",
  "numero_civico": "numero",
  "codice_postale": "5 cifre",
  "citta_residenza": "Comune",
  "provincia_residenza": "XX (2 lettere)",
  "documento_tipo": "Carta d'Identità Elettronica",
  "documento_numero": "9 caratteri per CIE",
  "documento_rilascio": "YYYY-MM-DD",
  "documento_scadenza": "YYYY-MM-DD",
  "documento_ente": "Comune di rilascio",
  "document_type": "carta_identita",
  "confidence": "high/medium/low",
  "notes": "eventuali problemi"
}

=== PATENTE DI GUIDA ITALIANA ===

FRONTE della patente - campi numerati:
- Campo 1: Cognome
- Campo 2: Nome
- Campo 3: Data e luogo di nascita
- Campo 4a: Data di emissione DELLA TESSERA (rinnovo/duplicato) — NON e' il conseguimento
- Campo 4b: Data scadenza DELLA TESSERA
- Campo 4c: Ente rilascio (es: MCTC, UCO)
- Campo 5: NUMERO PATENTE (es: U1234567A o MI1234567A) ← IL NUMERO È QUI SUL FRONTE!
- Campo 9: Categorie

RETRO della patente - TABELLA CATEGORIE:
La tabella mostra TUTTE le categorie possibili: AM, A1, A2, A, B1, B, C1, C, D1, D, BE, C1E, CE, D1E, DE
- Colonna 9  = categoria
- Colonna 10 = DATA DI CONSEGUIMENTO di quella categoria
- Colonna 11 = DATA DI SCADENZA di quella categoria
- Colonna 12 = restrizioni

Il titolare possiede SOLO le categorie che hanno DATE scritte nelle colonne 10 e 11.
Le righe SENZA date = categorie NON possedute, NON includerle!

Esempio: Se solo la riga "B" ha date (10: 15.03.2015, 11: 15.03.2025), allora patente_tipo = "B"
Se le righe "AM" e "B" hanno date, allora patente_tipo = "AM, B"

!!! LE DATE DELLA PATENTE SI LEGGONO DAL RETRO, RIGA DELLA CATEGORIA "B" !!!
DR7 noleggia automobili: quello che conta e' SEMPRE la riga della categoria B.
- patente_rilascio  = COLONNA 10 della riga "B" (conseguimento cat. B)
- patente_scadenza  = COLONNA 11 della riga "B" (scadenza cat. B)
Le date sul retro sono spesso in formato DD.MM.YY: convertile SEMPRE in YYYY-MM-DD.
Se la riga "B" non esiste, usa la data PIU' ANTICA fra le colonne 10 delle
categorie possedute per patente_rilascio, e la corrispondente colonna 11 per
patente_scadenza.
Usa i campi 4a / 4b del FRONTE SOLO se il retro non e' presente o non e'
leggibile: sulle patenti rinnovate il 4a e' la data di rinnovo, non il
conseguimento reale, e il 4b e' la scadenza della tessera, non della categoria B.
Quando cadi su 4a/4b scrivilo in "notes".

Per PATENTE:
{
  "nome": "dal campo 2 FRONTE",
  "cognome": "dal campo 1 FRONTE",
  "data_nascita": "dal campo 3 FRONTE, formato YYYY-MM-DD",
  "luogo_nascita": "dal campo 3 FRONTE",
  "patente_numero": "dal campo 5 FRONTE (NON dal retro!) - es: U1234567A",
  "patente_tipo": "SOLO categorie con date sul RETRO (es: B oppure AM, B)",
  "patente_rilascio": "RETRO, colonna 10 della riga B — YYYY-MM-DD",
  "patente_scadenza": "RETRO, colonna 11 della riga B — YYYY-MM-DD",
  "patente_ente": "dal campo 4c FRONTE",
  "patente_date_dal_retro": true,
  "document_type": "patente"
}

"patente_date_dal_retro" e' OBBLIGATORIO ogni volta che compili
patente_rilascio o patente_scadenza:
- true  = le hai lette nella tabella del RETRO (colonne 10 e 11)
- false = le hai prese dai campi 4a / 4b del FRONTE perche' il retro non
          c'era o non era leggibile
Serve a scegliere quale foto vince quando il cliente carica fronte e retro:
il retro ha sempre la precedenza. Non scrivere true se non hai davvero
visto la tabella delle categorie.

=== PATENTI ESTERE (FRANCIA E ALTRI PAESI UE) ===

Le regole delle colonne 9/10/11 valgono anche per le patenti UE in formato
tessera: la riga "B" e' sempre nella tabella sul RETRO.

!!! MOLTE PATENTI NON HANNO UNA DATA DI SCADENZA !!!
La patente francese cartacea (il vecchio modello rosa a tre ante) e altre
patenti estere sono valide a vita e NON riportano nessuna scadenza.
In quel caso:
- OMETTI completamente il campo patente_scadenza. NON inventarla, NON
  calcolarla, NON copiarci un'altra data.
- Compila comunque patente_rilascio con la data di ottenimento della
  categoria B.
- Scrivi in "notes": "patente senza scadenza".
Un campo scadenza vuoto e' corretto e non blocca niente: una data
inventata invece fa risultare scaduta una patente valida.

=== PATENTE NAUTICA ===

E' un documento DIVERSO dalla patente di guida. Non confonderli:
i suoi dati vanno nei campi nautica_*, MAI nei campi patente_*.

Come riconoscerla — riporta almeno una di queste diciture:
- "PATENTE NAUTICA" / "PATENTE DI ABILITAZIONE ALLA CONDUZIONE"
- "unità da diporto" / "navi da diporto"
- "entro 12 miglia dalla costa" oppure "senza alcun limite dalla costa"
- rilasciata da "Motorizzazione Civile", "Ufficio Circondariale Marittimo"
  o "Capitaneria di Porto" (la patente di guida e' rilasciata da MIT-UCO/MCTC)

CATEGORIA (nautica_categoria) — una sola lettera:
- A = unità da diporto (a motore e/o a vela) — e' la piu' comune
- B = navi da diporto (oltre 24 metri)
- C = direzione nautica per persone con disabilità

LIMITE DALLA COSTA (nautica_limite) — copia UNA di queste due stringhe:
- "entro 12 miglia"   se leggi "entro 12 miglia dalla costa"
- "senza limiti"      se leggi "senza alcun limite dalla costa"
Se il documento non lo dice esplicitamente, OMETTI il campo. Non indovinare:
e' il dato che decide quale imbarcazione il cliente puo' prendere.

ABILITAZIONE (nautica_abilitazione) — copia UNA di queste due stringhe:
- "Vela e motore"   se abilita sia a vela sia a motore
- "Motore"          se abilita solo a motore
Se non e' indicato, OMETTI il campo.

Per PATENTE NAUTICA:
{
  "nome": "Nome del titolare",
  "cognome": "Cognome del titolare",
  "data_nascita": "YYYY-MM-DD",
  "luogo_nascita": "Comune di nascita se presente",
  "nautica_numero": "numero della patente nautica, trascritto esattamente",
  "nautica_categoria": "A, B oppure C",
  "nautica_limite": "entro 12 miglia OPPURE senza limiti",
  "nautica_abilitazione": "Motore OPPURE Vela e motore",
  "nautica_rilascio": "data di rilascio, YYYY-MM-DD",
  "nautica_scadenza": "data di scadenza/validità, YYYY-MM-DD",
  "nautica_ente": "ente di rilascio (es: Motorizzazione Civile di Cagliari)",
  "document_type": "patente_nautica"
}

=== REGOLE RIGIDE ===

1. Se non riesci a leggere un campo chiaramente, OMETTILO dal JSON
2. NON aggiungere numeri o lettere extra a nessun campo
3. Il numero documento CIE è SEMPRE 9 caratteri (es: CA12345AB)
4. La data è SEMPRE nel formato YYYY-MM-DD
5. Il codice fiscale è SEMPRE 16 caratteri
6. patente_rilascio e patente_scadenza: prendile SEMPRE dal RETRO (colonne 10 e 11 della riga "B", o della categoria piu' antica se la B non c'e'), MAI dai campi 4a/4b del FRONTE se il retro e' leggibile.
7. I dati della patente NAUTICA vanno SOLO nei campi nautica_*. Non scriverli mai in patente_* e viceversa: sono due documenti distinti e un cliente può averli entrambi nella stessa immagine.

Rispondi SOLO con JSON valido.`

/**
 * Ordine dei modelli: il piu' recente prima, fallback ai precedenti se
 * l'account non ha ancora accesso o il modello e' stato sunset. Cosi'
 * l'estrazione funziona su account con tier diversi senza manutenzione.
 */
const MODEL_FALLBACKS = [
  'claude-sonnet-4-6',
  'claude-sonnet-4-5',
  'claude-3-5-sonnet-latest',
  'claude-3-5-sonnet-20241022',
]

/**
 * Riconosce il tipo di file dai byte iniziali in base64 e costruisce il
 * blocco content per l'API Claude. I PDF vanno come type=document, non
 * type=image. Gli HEIC/HEIF di iPhone non sono supportati: meglio un
 * messaggio chiaro che un 400 criptico.
 */
function buildContentBlock(base64Data: string): { block?: any; errore?: string } {
  if (base64Data.startsWith('JVBERi')) {
    return {
      block: {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64Data },
      },
    }
  }
  const isHeic = base64Data.includes('ZnR5cGhlaWM') || base64Data.includes('ZnR5cG1pZjE') // 'ftypheic' / 'ftypmif1'
  if (isHeic) {
    return { errore: 'Formato HEIC/HEIF non supportato — ricarica la foto in JPEG o PDF' }
  }
  const mediaType = base64Data.startsWith('/9j/') ? 'image/jpeg' :
                    base64Data.startsWith('iVBORw') ? 'image/png' :
                    base64Data.startsWith('R0lGOD') ? 'image/gif' :
                    base64Data.startsWith('UklGR') ? 'image/webp' :
                    'image/jpeg'
  return {
    block: {
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: base64Data },
    },
  }
}

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
      const { block, errore } = buildContentBlock(imageBase64)
      if (errore) return { statusCode: 415, headers, body: JSON.stringify({ error: errore }) }
      imageContent = block
    } else {
      // URL: scarichiamo i byte lato server e li mandiamo in base64, cosi'
      // il tipo di file viene riconosciuto qui (PDF, HEIC, webp) invece di
      // far fallire l'API Claude con "file format invalid".
      let fetched: Response
      try {
        fetched = await fetch(imageUrl)
      } catch (fetchErr: any) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: `Errore download file: ${fetchErr?.message || String(fetchErr)}` }) }
      }
      if (!fetched.ok) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: `Impossibile scaricare il file dalla URL: ${fetched.status} ${fetched.statusText}` }) }
      }
      const arrayBuffer = await fetched.arrayBuffer()
      const base64Data = Buffer.from(new Uint8Array(arrayBuffer)).toString('base64')
      const { block, errore } = buildContentBlock(base64Data)
      if (errore) return { statusCode: 415, headers, body: JSON.stringify({ error: errore }) }
      imageContent = block
    }

    // Call Claude Vision API, provando i modelli in ordine.
    let result: any = null
    let ultimoErrore = ''
    for (const model of MODEL_FALLBACKS) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4000,
          messages: [{
            role: 'user',
            content: [imageContent, { type: 'text', text: EXTRACTION_PROMPT }],
          }],
        }),
      })

      const json = await response.json()
      if (response.ok) {
        result = json
        break
      }

      const msg = String(json?.error?.message || '')
      ultimoErrore = msg || `${response.status} ${response.statusText}`
      // 404/403 = modello non disponibile sull'account, 400 con "model" nel
      // messaggio = modello sconosciuto: si prova il prossimo. Tutto il
      // resto (rate limit, auth, rete) e' fatale.
      const problemaDiModello = response.status === 404 || response.status === 403 ||
        (response.status === 400 && /model/i.test(msg)) || /not.?found/i.test(msg)
      if (!problemaDiModello) {
        return { statusCode: 502, headers, body: JSON.stringify({ error: ultimoErrore || 'Claude API error' }) }
      }
    }

    if (!result) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: ultimoErrore || 'Nessun modello Anthropic disponibile per la lettura' }) }
    }

    const responseText = result.content?.[0]?.text || ''

    // Parse JSON response
    let cleanJson = responseText.trim()
    if (cleanJson.startsWith('```json')) cleanJson = cleanJson.slice(7)
    if (cleanJson.startsWith('```')) cleanJson = cleanJson.slice(3)
    if (cleanJson.endsWith('```')) cleanJson = cleanJson.slice(0, -3)

    let extractedData: ExtractedPersonData
    try {
      extractedData = JSON.parse(cleanJson.trim())
    } catch {
      return { statusCode: 422, headers, body: JSON.stringify({ error: 'Documento non leggibile', raw_response: responseText }) }
    }

    // patente_conseguimento e patente_rilascio sono lo stesso dato (retro,
    // colonna 10 della categoria B). Il wizard legge il primo, il
    // gestionale il secondo: li teniamo allineati entrambi.
    if (extractedData.patente_rilascio && !extractedData.patente_conseguimento) {
      extractedData.patente_conseguimento = extractedData.patente_rilascio
    }
    if (extractedData.patente_conseguimento && !extractedData.patente_rilascio) {
      extractedData.patente_rilascio = extractedData.patente_conseguimento
    }

    // `data` e' la forma usata dal gestionale, `extractedData` quella
    // storica del sito: le rispondiamo entrambe.
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, extractedData, data: extractedData }) }

  } catch (error: any) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) }
  }
}

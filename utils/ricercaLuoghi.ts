/**
 * Ricerca del POSTO nei campi indirizzo del sito.
 *
 * Nominatim (quello che il sito usava da solo) trova le strade ma quasi
 * nessuna attivita': un cliente che scrive il nome del suo hotel non
 * trovava niente e doveva sapere la via a memoria. Google le attivita' le
 * conosce, quindi si chiede prima a lui.
 *
 * La chiave non sta qui: le chiamate passano dalla funzione
 * `google-luoghi`, che la tiene lato server. Se Google non e' configurato
 * (o rifiuta), si torna al percorso Nominatim di prima — il campo continua
 * a funzionare, non si blocca mai una prenotazione per questo.
 *
 * Costo: i suggerimenti dentro una sessione non si pagano, si paga solo il
 * dettaglio del posto SCELTO. Per questo il `sessionToken` va passato sia
 * alla ricerca sia al dettaglio, e se ne apre uno nuovo dopo ogni scelta.
 */

export interface LuogoSito {
    id: string
    placeId?: string
    /** Nome dell'attivita' ("Forte Village"), o l'indirizzo se non ne ha uno. */
    nome: string
    /** La riga sotto il nome. */
    indirizzo: string
    /** Categoria mostrata a lato ("Hotel", "Aeroporto"). */
    categoria: string
    lat: number | null
    lon: number | null
    parti?: {
        via: string
        civico: string
        cap: string
        comune: string
        provincia: string
        /** Sigla ISO minuscola ("it", "fr"): decide residente / non residente. */
        paese?: string
    }
    indirizzoCompleto?: string
}

const ENDPOINT = '/.netlify/functions/google-luoghi'

/** Google c'e' o no: appena risponde "non configurato" non lo si chiama piu'. */
let googleAttivo: boolean | null = null

/** I suggerimenti Google mentre si scrive. `null` = Google non disponibile. */
export async function cercaLuoghiSito(testo: string, sessione: string): Promise<LuogoSito[] | null> {
    if (googleAttivo === false) return null
    const q = testo.trim()
    if (q.length < 3) return null
    try {
        const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ azione: 'cerca', testo: q, sessione }),
        })
        if (res.status === 503) { googleAttivo = false; return null }
        if (!res.ok) return null
        const dati = await res.json() as { configurato?: boolean; luoghi?: LuogoSito[] }
        if (dati.configurato === false) { googleAttivo = false; return null }
        googleAttivo = true
        const luoghi = (dati.luoghi || []).filter(l => l.placeId)
        return luoghi.length > 0 ? luoghi : null
    } catch {
        return null
    }
}

/**
 * Il dettaglio del posto scelto: coordinate e pezzi dell'indirizzo (via,
 * civico, CAP, comune, provincia, paese). E' l'unica chiamata a pagamento.
 */
export async function dettaglioLuogoSito(l: LuogoSito, sessione: string): Promise<LuogoSito | null> {
    if (!l.placeId) return null
    try {
        const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ azione: 'dettaglio', placeId: l.placeId, sessione }),
        })
        if (!res.ok) return null
        const dati = await res.json() as { luogo?: LuogoSito }
        return dati.luogo || null
    } catch {
        return null
    }
}

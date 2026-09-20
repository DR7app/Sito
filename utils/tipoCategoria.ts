/**
 * Tipo di veicolo ricavato dall'ETICHETTA della categoria di Centralina Pro.
 *
 * 20/09/2026 (direzione): gli id delle categorie sono storici e non dicono
 * piu' cosa contengono — `urban` e' etichettato "Hypercar", `aziendali` e'
 * "Supercar", `scooter` e' "Urban". Chi legge l'id sbaglia; chi legge
 * l'etichetta, che l'operatore mantiene nella tab Veicoli, ha ragione.
 *
 * Regola: nessun rinomino, nessuna riorganizzazione. Etichetta non
 * riconosciuta = `null`, e il chiamante resta sul suo comportamento storico.
 */
export type TipoVeicolo = 'UTILITARIA' | 'FURGONE' | 'V_CLASS' | 'SUPERCAR'

export function tipoDaEtichetta(label: string): 'UTILITARIA' | 'FURGONE' | 'SUPERCAR' | null {
  const l = String(label || '').toLowerCase()
  if (!l) return null
  // Prima i furgoni: "Flotta Aziendale" contiene sia "flotta" sia "aziendal".
  if (l.includes('furgon') || l.includes('flotta') || l.includes('aziendal') || l.includes('van')) return 'FURGONE'
  if (l.includes('urban') || l.includes('utilitar') || l.includes('city')) return 'UTILITARIA'
  if (l.includes('supercar') || l.includes('hypercar') || l.includes('exotic') || l.includes('luxury') || l.includes('suv')) return 'SUPERCAR'
  return null
}

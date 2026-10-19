import { supabase } from '../supabaseClient';
import type { Prevendita } from './prevendite';
import type { DatiFatturaCliente } from './datiFatturaCliente';

/**
 * Acquisto di una prevendita — condiviso da pagina Prevendite e carrello
 * (26/09/2026).
 *
 * Carta: si crea la riga `prevendite_clienti` in pending con il suo ordine
 * Nexi; a pagamento avvenuto la attiva `prevendite-finalizza` (chiamata dal
 * callback Nexi, anche per gli ordini figli del carrello).
 *
 * Credit Wallet e codice sconto: NON disponibili per le prevendite dal
 * 19/10/2026 (solo carta). Finche' la migrazione
 * 20260926_prevendite_wallet_carrello non e' applicata, il carrello per le
 * prevendite resta nascosto (vedi walletCarrelloPrevendite).
 */

/** Riga in pending per il pagamento con carta. Le condizioni sono quelle di OGGI. */
export function rigaAcquistoPrevendita(
  p: Prevendita,
  utente: { id: string; email?: string | null; fullName?: string | null },
  dati: Partial<DatiFatturaCliente>,
  nexiOrderId: string,
): Record<string, unknown> {
  return {
    prevendita_id: p.id,
    user_id: utente.id,
    customer_email: dati.email || utente.email || '',
    customer_nome: dati.fullName || utente.fullName || '',
    customer_telefono: dati.phone || '',
    nome: p.nome,
    foto_url: p.foto_url,
    prezzo_pagato: p.prezzo,
    utilizzi_iniziali: p.utilizzi_inclusi,
    utilizzi_usati: 0,
    veicoli: p.veicoli,
    km_inclusi: p.km_inclusi,
    assicurazione_inclusa: p.assicurazione_inclusa,
    max_utilizzi_mese: p.max_utilizzi_mese,
    max_giorni_consecutivi: p.max_giorni_consecutivi,
    regole_extra: p.regole_extra,
    payment_status: 'pending',
    payment_method: 'nexi',
    nexi_order_id: nexiOrderId,
    origine: 'sito',
    customer_codice_fiscale: dati.codiceFiscale || null,
    customer_indirizzo: dati.indirizzo || null,
    customer_numero_civico: dati.numeroCivico || null,
    customer_citta: dati.cittaResidenza || null,
    customer_cap: dati.codicePostale || null,
    customer_provincia: dati.provinciaResidenza || null,
  };
}

let capacita: Promise<boolean> | null = null;

/**
 * La migrazione per wallet e carrello delle prevendite e' applicata?
 * Una lettura per caricamento di pagina. Nel dubbio: no (solo carta, come prima).
 */
export function walletCarrelloPrevendite(): Promise<boolean> {
  if (!capacita) {
    capacita = Promise.resolve(supabase.rpc('prevendite_wallet_carrello_attivo'))
      .then(({ data, error }) => !error && data === true)
      .catch(() => false);
  }
  return capacita;
}

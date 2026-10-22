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
 * Credit Wallet e codice sconto (22/10/2026): accesi o spenti da Centralina
 * Pro > Automazioni; il sito li chiede a prevendite_opzioni_pagamento() e il
 * database li fa rispettare. Senza la migrazione
 * 20261022_prevendite_wallet_codice_sconto restano spenti (solo carta, come
 * dal 19/10). Il prezzo di una riga del sito lo ricalcola il database
 * (catalogo − codice): il browser non lo decide.
 */

/** Riga in pending per il pagamento con carta. Le condizioni sono quelle di OGGI. */
export function rigaAcquistoPrevendita(
  p: Prevendita,
  utente: { id: string; email?: string | null; fullName?: string | null },
  dati: Partial<DatiFatturaCliente>,
  nexiOrderId: string,
  codiceSconto?: string | null,
): Record<string, unknown> {
  return {
    // La colonna esiste solo dopo la migrazione: si manda solo con un codice.
    ...(codiceSconto ? { codice_sconto: codiceSconto } : {}),
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

export interface OpzioniPagamentoPrevendite {
  wallet: boolean;
  codiceSconto: boolean;
}

let opzioni: Promise<OpzioniPagamentoPrevendite> | null = null;

/** Interruttori di Centralina Pro. Senza migrazione o nel dubbio: spenti. */
export function opzioniPagamentoPrevendite(): Promise<OpzioniPagamentoPrevendite> {
  if (!opzioni) {
    opzioni = Promise.resolve(supabase.rpc('prevendite_opzioni_pagamento'))
      .then(({ data, error }) => {
        if (error || !data) return { wallet: false, codiceSconto: false };
        const o = data as { wallet?: boolean; codice_sconto?: boolean };
        return { wallet: o.wallet === true, codiceSconto: o.codice_sconto === true };
      })
      .catch(() => ({ wallet: false, codiceSconto: false }));
  }
  return opzioni;
}

export interface EsitoSconto {
  ok: boolean;
  errore?: string;
  codice?: string;
  sconto?: number;
  prezzoFinale?: number;
  descrizione?: string;
}

/** Valida il codice nel database e restituisce il prezzo finale. */
export async function calcolaScontoPrevendita(prevenditaId: string, codice: string): Promise<EsitoSconto> {
  const { data, error } = await supabase.rpc('prevendita_calcola_sconto', { p_prevendita_id: prevenditaId, p_codice: codice });
  if (error) return { ok: false, errore: 'Codice non verificabile in questo momento.' };
  const r = (data || {}) as { ok?: boolean; errore?: string; codice?: string; sconto?: number; prezzo_finale?: number; descrizione?: string };
  if (!r.ok) return { ok: false, errore: r.errore || 'Codice non valido.' };
  return { ok: true, codice: r.codice, sconto: Number(r.sconto), prezzoFinale: Number(r.prezzo_finale), descrizione: r.descrizione };
}

export interface EsitoAcquistoCredito {
  ok: boolean;
  errore?: string;
  prevenditaClienteId?: string;
}

/** Acquisto col Credit Wallet: saldo libero, prezzo dal catalogo (meno il codice), tutto nel database. */
export async function acquistaPrevenditaConCredito(
  prevenditaId: string,
  dati: Partial<DatiFatturaCliente>,
  codiceSconto?: string | null,
): Promise<EsitoAcquistoCredito> {
  const { data, error } = await supabase.rpc('prevendita_acquista_con_credito', {
    p_prevendita_id: prevenditaId,
    p_dati: {
      email: dati.email || '',
      nome: dati.fullName || '',
      telefono: dati.phone || '',
      codice_fiscale: dati.codiceFiscale || '',
      indirizzo: dati.indirizzo || '',
      numero_civico: dati.numeroCivico || '',
      citta: dati.cittaResidenza || '',
      cap: dati.codicePostale || '',
      provincia: dati.provinciaResidenza || '',
      codice_sconto: codiceSconto || '',
    },
  });
  if (error) return { ok: false, errore: error.message };
  const esito = (data || {}) as { ok?: boolean; errore?: string; prevendita_cliente_id?: string };
  if (!esito.ok) return { ok: false, errore: esito.errore || 'Acquisto non riuscito.' };
  return { ok: true, prevenditaClienteId: esito.prevendita_cliente_id };
}

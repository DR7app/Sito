import { supabase } from '../supabaseClient';

/**
 * Dati necessari per emettere la fattura di un pagamento con carta
 * (ricarica Credit Wallet, lavaggio, meccanica).
 */
export interface DatiFatturaCliente {
  fullName: string;
  email: string;
  phone: string;
  codiceFiscale: string;
  indirizzo: string;
  numeroCivico: string;
  cittaResidenza: string;
  codicePostale: string;
  provinciaResidenza: string;
}

const primo = (...valori: any[]): string => {
  for (const v of valori) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
};

/**
 * Carica i dati fattura del cliente loggato.
 *
 * Ordine delle fonti:
 *  1. `customers_extended` (scheda cliente del gestionale) cercata per
 *     `user_id`, poi per `id` (schede storiche)
 *  2. `clienti_estesi` (tabella legacy)
 *  3. i **metadati auth** dell'utente: all'iscrizione TUTTI i campi finiscono
 *     li' (`register-customer.js`) e solo dopo una UPDATE li copia nella
 *     scheda cliente. Se quella UPDATE fallisce la scheda resta con la sola
 *     email: senza questa riserva il cliente si vedeva richiedere al
 *     pagamento CF e indirizzo che aveva gia' inserito in fase di iscrizione.
 *
 * Il merge e' campo per campo: ogni valore mancante nella scheda viene preso
 * dalla fonte successiva.
 */
export async function caricaDatiFatturaCliente(userId: string): Promise<DatiFatturaCliente> {
  let scheda: any = null;

  try {
    const { data } = await supabase
      .from('customers_extended')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    scheda = data;

    if (!scheda) {
      const { data: perId } = await supabase
        .from('customers_extended')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      scheda = perId;
    }

    if (!scheda) {
      const { data: legacy } = await supabase
        .from('clienti_estesi')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      scheda = legacy;
    }
  } catch (err) {
    console.error('[datiFatturaCliente] scheda cliente non leggibile:', err);
  }

  let meta: any = {};
  let authEmail = '';
  try {
    const { data } = await supabase.auth.getUser();
    meta = data.user?.user_metadata || {};
    authEmail = data.user?.email || '';
  } catch (err) {
    console.error('[datiFatturaCliente] metadati auth non leggibili:', err);
  }

  const c = scheda || {};
  const azienda = (c.tipo_cliente || meta.tipoCliente) === 'azienda';

  const nome = primo(c.nome, meta.nome, meta.rappresentanteNome);
  const cognome = primo(c.cognome, meta.cognome, meta.rappresentanteCognome);

  return {
    fullName: azienda
      ? primo(c.denominazione, c.ragione_sociale, meta.denominazione, `${nome} ${cognome}`)
      : `${nome} ${cognome}`.trim(),
    email: primo(c.email, meta.email, authEmail),
    phone: primo(c.telefono, meta.telefono),
    codiceFiscale: primo(
      c.codice_fiscale,
      c.codice_fiscale_pa,
      c.partita_iva,
      meta.codiceFiscale,
      meta.partitaIva
    ),
    indirizzo: primo(c.indirizzo, c.indirizzo_azienda, meta.indirizzo),
    numeroCivico: primo(c.numero_civico, meta.numeroCivico),
    cittaResidenza: primo(c.citta_residenza, c.citta, meta.cittaResidenza),
    codicePostale: primo(c.codice_postale, c.cap, meta.codicePostale),
    provinciaResidenza: primo(c.provincia_residenza, c.provincia, meta.provinciaResidenza),
  };
}

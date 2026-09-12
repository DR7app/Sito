/**
 * Checkout del carrello — da articolo a ordine.
 *
 * Regola che tiene in piedi tutto: il carrello NON inventa un flusso nuovo.
 * Ogni articolo riceve un ordine Nexi suo e poi nasce esattamente come
 * nasceva prima, con la stessa riga nella stessa tabella. L'unica differenza
 * e' che a pagare e' un ordine solo, quello padre, e che nexi-callback
 * ritrova i figli passando da `ordini_carrello`.
 *
 *  noleggio   -> riga in `bookings` (pending/unpaid, blocca il mezzo) +
 *                copia in `pending_nexi_bookings`
 *  lavaggio   -> `pending_nexi_bookings` (la prenotazione nasce a pagamento
 *  meccanica     avvenuto, come oggi)
 *  tour       -> book-tour, che valida i posti e prepara il pending
 *  wallet     -> `credit_wallet_purchases`
 *  club       -> `dr7_club_subscriptions`
 *  membership -> `membership_purchases`
 */
import { supabase } from '../supabaseClient';
import { deductCredits, addCredits, hasSufficientBalance } from './creditWallet';
import { checkVehicleAvailability } from './bookingValidation';
import type { ArticoloCarrello } from './carrello';

export const FUNCTIONS_BASE =
  (import.meta as { env?: Record<string, string> }).env?.VITE_FUNCTIONS_BASE ??
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:8888'
    : (typeof window !== 'undefined' ? window.location.origin : ''));

export interface EsitoArticolo {
  ok: boolean;
  errore?: string;
  /** Prenotazione gia' creata (noleggio a carta, o qualunque pagamento a credito). */
  bookingId?: string;
}

type Dati = Record<string, unknown>;

function datiPrenotazione(articolo: ArticoloCarrello): Dati {
  const b = (articolo.dati as { booking?: Dati }).booking;
  return b ? { ...b } : {};
}

/** Marchi dell'ordine su una prenotazione: figlio sul record, padre per ritrovare l'ordine. */
function conOrdine(booking: Dati, ordine: string, ordinePadre: string): Dati {
  const dettagli = (booking.booking_details as Dati) || {};
  return {
    ...booking,
    nexi_order_id: ordine,
    booking_details: {
      ...dettagli,
      nexi_order_id: ordine,
      carrello_order_id: ordinePadre,
    },
  };
}

/**
 * Mezzo ancora libero? Ritorna null se si puo' procedere, altrimenti l'esito
 * da mostrare al cliente. Un controllo che non riesce NON blocca l'ordine:
 * la stessa verifica la rifa' il gestionale.
 */
async function disponibilitaNoleggio(prenotazione: Dati): Promise<EsitoArticolo | null> {
  try {
    const conflitti = await checkVehicleAvailability(
      String(prenotazione.vehicle_name || ''),
      String(prenotazione.pickup_date || ''),
      String(prenotazione.dropoff_date || ''),
      (prenotazione.vehicle_id as string) || undefined,
    );
    if (conflitti.length > 0) {
      const primo = conflitti[0] as { _checkFailed?: boolean };
      if (primo?._checkFailed) return null;
      return { ok: false, errore: 'Il mezzo non è più disponibile per queste date. Toglilo dal carrello o cambia le date.' };
    }
  } catch (e) {
    console.warn('[carrello] controllo disponibilita non riuscito:', e);
  }
  return null;
}

/* ─── Dati del cliente raccolti al checkout ───────────────────────────────── */

/**
 * Anagrafica e fatturazione chieste UNA volta al checkout, non piu' dentro
 * ogni configurazione di servizio.
 *
 * Il travaso e' NON distruttivo: riempie solo i campi che l'articolo non ha
 * gia'. Un noleggio porta con se' i dati del conducente raccolti dal wizard
 * (servono al contratto) e quelli restano come sono; un lavaggio, che ormai
 * non chiede piu' niente, li prende tutti da qui.
 */
export interface DatiClienteOrdine {
  fullName: string;
  email: string;
  phone: string;
  richiedeFattura: boolean;
  ragioneSociale?: string;
  codiceFiscale?: string;
  partitaIva?: string;
  indirizzo?: string;
  numeroCivico?: string;
  codicePostale?: string;
  citta?: string;
  provincia?: string;
  sdi?: string;
  pec?: string;
}

const pieno = (v: unknown): boolean => typeof v === 'string' ? v.trim() !== '' : v != null;
const riempi = (attuale: unknown, nuovo: unknown): unknown => (pieno(attuale) ? attuale : (nuovo ?? attuale));

export function conDatiCliente(articolo: ArticoloCarrello, cliente: DatiClienteOrdine): ArticoloCarrello {
  const contenuto = articolo.dati as { booking?: Dati } | undefined;
  if (!contenuto?.booking) return articolo;

  const booking: Dati = { ...contenuto.booking };
  const dettagli: Dati = { ...((booking.booking_details as Dati) || {}) };
  const anagrafica: Dati = { ...((dettagli.customer as Dati) || {}) };

  booking.customer_name = riempi(booking.customer_name, cliente.fullName);
  booking.customer_email = riempi(booking.customer_email, cliente.email);
  booking.customer_phone = riempi(booking.customer_phone, cliente.phone);

  anagrafica.fullName = riempi(anagrafica.fullName, cliente.fullName);
  anagrafica.email = riempi(anagrafica.email, cliente.email);
  anagrafica.phone = riempi(anagrafica.phone, cliente.phone);
  anagrafica.codiceFiscale = riempi(anagrafica.codiceFiscale, cliente.codiceFiscale);
  anagrafica.indirizzo = riempi(anagrafica.indirizzo, cliente.indirizzo);
  anagrafica.numeroCivico = riempi(anagrafica.numeroCivico, cliente.numeroCivico);
  anagrafica.cittaResidenza = riempi(anagrafica.cittaResidenza, cliente.citta);
  anagrafica.codicePostale = riempi(anagrafica.codicePostale, cliente.codicePostale);
  anagrafica.provinciaResidenza = riempi(anagrafica.provinciaResidenza, cliente.provincia);

  dettagli.customer = anagrafica;
  // La fattura e' una richiesta esplicita del cliente: si porta appresso i
  // dati in piu' (ragione sociale, P.IVA, SDI/PEC) che l'anagrafica non ha.
  if (cliente.richiedeFattura) {
    dettagli.fattura = {
      richiesta: true,
      ragione_sociale: cliente.ragioneSociale || cliente.fullName,
      codice_fiscale: cliente.codiceFiscale || '',
      partita_iva: cliente.partitaIva || '',
      indirizzo: [cliente.indirizzo, cliente.numeroCivico].filter(Boolean).join(' '),
      cap: cliente.codicePostale || '',
      citta: cliente.citta || '',
      provincia: cliente.provincia || '',
      sdi: cliente.sdi || '',
      pec: cliente.pec || '',
    };
  }
  booking.booking_details = dettagli;

  return { ...articolo, dati: { ...articolo.dati, booking } };
}

/* ─── Pagamento con carta: si prepara, non si crea nulla di pagato ────────── */

export async function preparaArticoloCarta(
  articolo: ArticoloCarrello,
  ordine: string,
  ordinePadre: string,
  userId: string | null,
): Promise<EsitoArticolo> {
  try {
    switch (articolo.tipo) {
      case 'noleggio': {
        // Un noleggio puo' restare nel carrello per ore: prima di scrivere
        // si ricontrolla che il mezzo sia ancora libero, com'e' sempre stato
        // fatto un attimo prima di prenotare.
        const prenotazione = datiPrenotazione(articolo);
        const libero = await disponibilitaNoleggio(prenotazione);
        if (libero) return libero;
        // Il noleggio blocca il mezzo subito, come fa oggi il wizard: la riga
        // nasce pending/unpaid e diventa confermata a pagamento avvenuto.
        const booking = conOrdine(prenotazione, ordine, ordinePadre);
        booking.status = 'pending';
        booking.payment_status = 'unpaid';
        booking.payment_method = 'nexi';
        booking.booked_at = new Date().toISOString();
        (booking.booking_details as Dati).payment_link_created_at = new Date().toISOString();
        (booking.booking_details as Dati).payment_link_expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase.from('bookings').insert(booking).select('id').single();
        if (error) return { ok: false, errore: error.message };

        await supabase.from('pending_nexi_bookings').insert({
          nexi_order_id: ordine,
          booking_data: { ...booking, booking_id: data.id },
        });
        return { ok: true, bookingId: data.id };
      }

      case 'lavaggio':
      case 'meccanica': {
        const booking = conOrdine(datiPrenotazione(articolo), ordine, ordinePadre);
        booking.payment_status = 'pending';
        booking.payment_method = 'nexi';
        const { error } = await supabase
          .from('pending_nexi_bookings')
          .insert({ nexi_order_id: ordine, booking_data: booking });
        if (error) return { ok: false, errore: error.message };
        return { ok: true };
      }

      case 'tour': {
        const d = articolo.dati as Dati;
        const res = await fetch(`${FUNCTIONS_BASE}/.netlify/functions/book-tour`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...d, userId, nexiOrderId: ordine, carrelloOrderId: ordinePadre }),
        });
        const dati = await res.json();
        if (!res.ok) return { ok: false, errore: dati?.error || 'Errore preparazione tour.' };
        return { ok: true };
      }

      case 'wallet': {
        const d = articolo.dati as Dati;
        const { error } = await supabase.from('credit_wallet_purchases').insert([{
          ...(d.purchase as Dati),
          user_id: userId,
          payment_status: 'pending',
          payment_method: 'nexi',
          nexi_order_id: ordine,
          created_at: new Date().toISOString(),
        }]);
        if (error) return { ok: false, errore: error.message };
        return { ok: true };
      }

      case 'club': {
        const d = articolo.dati as Dati;
        const { error } = await supabase.from('dr7_club_subscriptions').insert({
          ...(d.subscription as Dati),
          user_id: userId,
          status: 'pending',
          payment_reference: ordine,
          nexi_order_id: ordine,
        });
        if (error) return { ok: false, errore: error.message };
        return { ok: true };
      }

      case 'membership': {
        const d = articolo.dati as Dati;
        const { error } = await supabase.from('membership_purchases').insert({
          ...(d.purchase as Dati),
          user_id: userId,
          payment_method: 'nexi',
          payment_status: 'pending',
          nexi_order_id: ordine,
        });
        if (error) return { ok: false, errore: error.message };
        return { ok: true };
      }

      default:
        return { ok: false, errore: `Tipo non gestito: ${articolo.tipo}` };
    }
  } catch (e) {
    return { ok: false, errore: (e as Error).message };
  }
}

/* ─── Pagamento col Credit Wallet: l'articolo nasce gia' pagato ───────────── */

/** Avvisi e fattura di una prenotazione appena pagata. Mai bloccanti. */
export function avvisaPrenotazionePagata(booking: { id: string; customer_phone?: string | null }, conFattura: boolean) {
  const posta = (url: string, corpo: unknown) =>
    fetch(`${FUNCTIONS_BASE}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      keepalive: true,
    }).catch(e => console.error(`[carrello] ${url} fallita (non bloccante):`, e));

  posta('/.netlify/functions/send-booking-confirmation', { booking });
  posta('/.netlify/functions/send-whatsapp-notification', { booking });
  if (booking.customer_phone) {
    posta('/.netlify/functions/send-whatsapp-notification', { booking, customPhone: booking.customer_phone });
  }
  posta('/.netlify/functions/award-fidelity-points', { bookingId: booking.id });
  // Credit Wallet: niente fattura, la ricarica e' gia' stata fatturata.
  if (conFattura) posta('/.netlify/functions/generate-fattura', { bookingId: booking.id, includeIVA: true });
}

export async function pagaArticoloACredito(
  articolo: ArticoloCarrello,
  userId: string,
): Promise<EsitoArticolo> {
  const euro = (articolo.prezzoCents || 0) / 100;
  try {
    switch (articolo.tipo) {
      case 'noleggio': {
        // RPC atomica: addebito e prenotazione insieme, niente credito tolto
        // senza prenotazione. E' la stessa del wizard.
        const payload = datiPrenotazione(articolo);
        const libero = await disponibilitaNoleggio(payload);
        if (libero) return libero;
        payload.status = 'confirmed';
        payload.payment_status = 'succeeded';
        payload.payment_method = 'credit_wallet';
        payload.booked_at = new Date().toISOString();
        const { data, error } = await supabase.rpc('book_with_credits', {
          p_user_id: userId,
          p_amount_cents: articolo.prezzoCents,
          p_vehicle_name: String(payload.vehicle_name || articolo.titolo),
          p_booking_payload: payload,
        });
        if (error) return { ok: false, errore: error.message };
        if (!data?.success) return { ok: false, errore: data?.error || 'Credito insufficiente.' };
        const booking = { ...payload, id: data.booking_id } as { id: string; customer_phone?: string | null };
        avvisaPrenotazionePagata(booking, false);
        if (Number(payload.deposit_amount || 0) > 0) {
          fetch(`${FUNCTIONS_BASE}/.netlify/functions/sync-booking-cauzione`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookingId: data.booking_id, amount: Number(payload.deposit_amount) }),
          }).catch(e => console.error('[carrello] cauzione non sincronizzata:', e));
        }
        return { ok: true, bookingId: data.booking_id };
      }

      case 'lavaggio':
      case 'meccanica': {
        const addebito = await deductCredits(
          userId,
          euro,
          `${articolo.tipo === 'lavaggio' ? 'Lavaggio' : 'Servizio Meccanico'} ${articolo.titolo}`,
          undefined,
          articolo.tipo === 'lavaggio' ? 'car_wash_booking' : 'mechanical_service_booking',
        );
        if (!addebito.success) return { ok: false, errore: addebito.error || 'Credito insufficiente.' };

        const booking = datiPrenotazione(articolo);
        booking.status = booking.status || 'pending';
        booking.payment_status = 'succeeded';
        booking.payment_method = 'credit_wallet';
        const { data, error } = await supabase.from('bookings').insert(booking).select().single();
        if (error) {
          // Credito gia' tolto e prenotazione fallita: si restituisce subito.
          await addCredits(userId, euro, 'Rimborso automatico: errore prenotazione dal carrello', undefined, 'refund')
            .catch(e => console.error('[carrello] CRITICO: rimborso fallito', e));
          return { ok: false, errore: error.message };
        }
        avvisaPrenotazionePagata(data, false);
        return { ok: true, bookingId: data.id };
      }

      case 'tour': {
        const d = articolo.dati as Dati;
        const res = await fetch(`${FUNCTIONS_BASE}/.netlify/functions/book-tour`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...d, userId, paymentMethod: 'credit_wallet' }),
        });
        const dati = await res.json();
        if (!res.ok || !dati?.paid) return { ok: false, errore: dati?.error || 'Errore pagamento tour.' };
        return { ok: true, bookingId: dati.bookingId };
      }

      default:
        return { ok: false, errore: 'Questo articolo si paga solo con carta.' };
    }
  } catch (e) {
    return { ok: false, errore: (e as Error).message };
  }
}

export async function creditoSufficiente(userId: string, totaleCents: number): Promise<boolean> {
  return hasSufficientBalance(userId, totaleCents / 100);
}

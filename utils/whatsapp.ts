/**
 * WhatsApp di DR7 — una sola fonte per tutto il sito.
 *
 * 23/09/2026 (direzione): il numero era scritto a mano in cinque file
 * (prenotazione, Mare/Aria/Soggiorni, meccanica, popup elicottero, errore
 * del wizard). Adesso tutti leggono `whatsapp_url` di Sito > Contatti,
 * lo stesso campo del bottone WhatsApp della pagina /contact. Il valore
 * qui sotto vale solo finche' la configurazione non e' arrivata.
 */

export const WHATSAPP_URL_DI_FABBRICA = 'https://wa.me/393457905205';

/** Link WhatsApp con un messaggio gia' scritto. */
export function linkWhatsApp(whatsappUrl: string | null | undefined, testo?: string): string {
  const base = (whatsappUrl || '').trim() || WHATSAPP_URL_DI_FABBRICA;
  if (!testo) return base;
  return base + (base.includes('?') ? '&' : '?') + 'text=' + encodeURIComponent(testo);
}

/** Sostituisce i segnaposto `{nome}` di un messaggio con i valori veri. */
export function riempiSegnaposto(testo: string, valori: Record<string, string>): string {
  let out = testo;
  for (const [k, v] of Object.entries(valori)) out = out.split(`{${k}}`).join(v);
  return out;
}

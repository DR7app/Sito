/**
 * 26/08/2026 — Le foto del Catalogo Lavaggio caricate dall'admin sono PNG a
 * piena risoluzione (~1,4 MB l'una). La pagina Prime Wash ne mostra oltre
 * trenta: circa 45 MB per visita, riscaricati ogni volta perche' l'oggetto
 * pubblico esce con `cache-control: no-cache`.
 *
 * Supabase espone le stesse immagini attraverso l'endpoint di trasformazione
 * (`/render/image/public/`), che le ridimensiona, le converte in WebP quando
 * il browser lo accetta e le serve con cache di un anno.
 *
 * 31/08/2026 — la trasformazione veniva chiamata con la sola `width`, e li'
 * stava il guaio: Supabase porta la larghezza a quella chiesta ma LASCIA
 * l'altezza originale. Una locandina 1080x1350 tornava 700x1350, cioe'
 * schiacciata, e con `h-auto` il browser la disegnava alta quasi il doppio del
 * dovuto (1,93 volte la larghezza della card invece di 1,25): e' il motivo per
 * cui sul sito le immagini del lavaggio si vedevano enormi.
 *
 * Ora si passano ENTRAMBE le misure con `resize=contain`: l'immagine entra
 * nel riquadro mantenendo le proporzioni, senza schiacciature e senza tagli.
 *
 * Le immagini locali (`/luxurywash.jpeg` e simili) restano intatte.
 */

/**
 * Rapporto larghezza/altezza del riquadro di catalogo, uguale a quello delle
 * locandine caricate dall'admin (1080x1350). Se cambia va cambiato anche
 * `RITAGLIO_CATALOGO_RATIO` nel gestionale
 * (src/pages/admin/components/CarWashCatalogTab.tsx), che e' il rapporto a cui
 * la finestra di ritaglio prepara le immagini nuove.
 */
export const CATALOGO_RATIO = 4 / 5;

/** La stessa misura in classe Tailwind, per chi disegna il riquadro. */
export const CATALOGO_ASPECT_CLASS = 'aspect-[4/5]';

export function immagineCatalogo(
  url: string | null | undefined,
  larghezza = 700,
  qualita = 65
): string {
  if (!url) return '';
  const PUBBLICO = '/storage/v1/object/public/';
  if (!url.includes(PUBBLICO)) return url;
  const base = url.replace(PUBBLICO, '/storage/v1/render/image/public/');
  const sep = base.includes('?') ? '&' : '?';
  const altezza = Math.round(larghezza / CATALOGO_RATIO);
  return `${base}${sep}width=${larghezza}&height=${altezza}&resize=contain&quality=${qualita}`;
}

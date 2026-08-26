/**
 * 26/08/2026 — Le foto del Catalogo Lavaggio caricate dall'admin sono PNG a
 * piena risoluzione (~1,4 MB l'una). La pagina Prime Wash ne mostra oltre
 * trenta: circa 45 MB per visita, riscaricati ogni volta perche' l'oggetto
 * pubblico esce con `cache-control: no-cache`.
 *
 * Supabase espone le stesse immagini attraverso l'endpoint di trasformazione
 * (`/render/image/public/`), che le ridimensiona, le converte in WebP quando
 * il browser lo accetta e le serve con cache di un anno: la stessa foto passa
 * da 1,4 MB a circa 30 KB.
 *
 * Le immagini locali (`/luxurywash.jpeg` e simili) restano intatte.
 */
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
  return `${base}${sep}width=${larghezza}&quality=${qualita}`;
}

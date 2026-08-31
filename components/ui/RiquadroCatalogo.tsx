import { immagineCatalogo, CATALOGO_ASPECT_CLASS } from '../../utils/immagineCatalogo';

/**
 * Il riquadro delle immagini di catalogo (Prime Wash e Meccanica).
 *
 * Prima ogni immagine veniva messa in pagina con `w-full h-auto`: era la foto
 * a decidere l'altezza della card. Bastava caricare dall'admin un'immagine di
 * un formato diverso e usciva enorme, con la griglia sfasata e le card di
 * altezze tutte diverse.
 *
 * Qui l'altezza la decide il riquadro, non l'immagine. Il rapporto e' quello
 * delle locandine del catalogo (1080x1350, cioe' 4:5): le immagini di oggi lo
 * riempiono esattamente — niente bordi vuoti, niente ritagli — e quelle
 * caricate domani escono gia' di questo rapporto, perche' e' lo stesso che la
 * finestra di ritaglio dell'admin impone all'upload.
 *
 * `object-contain` e non `object-cover` di proposito: queste non sono foto, sono
 * locandine con logo, prezzo e lista dei servizi disegnati dentro. Se un giorno
 * arriva un'immagine di un altro formato deve restare LEGGIBILE per intero,
 * anche a costo di due bordi sottili; tagliarla vorrebbe dire perdere il prezzo.
 */

type Props = {
  /** URL dell'immagine. Se manca si usa `fallback`. */
  src?: string;
  fallback?: string;
  alt: string;
  /** Larghezza richiesta alla trasformazione di Supabase. */
  larghezza?: number;
  /** Classi extra sul riquadro (non sull'immagine). */
  className?: string;
};

export default function RiquadroCatalogo({ src, fallback, alt, larghezza = 700, className = '' }: Props) {
  const url = immagineCatalogo(src, larghezza) || fallback;
  return (
    <div className={`relative w-full ${CATALOGO_ASPECT_CLASS} overflow-hidden bg-black ${className}`}>
      {url && (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-contain"
        />
      )}
    </div>
  );
}

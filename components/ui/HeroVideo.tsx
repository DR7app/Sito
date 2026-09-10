import React from 'react';
import MediaVideo from '../editorial/MediaVideo';

interface HeroVideoProps {
  /** File in /public, es. "/video-lavaggio.mp4". */
  src: string;
  /** Fotogramma mostrato prima che il filmato parta (e se non parte). */
  poster?: string;
  /** Occhiello sopra il titolo, gia' tradotto. */
  overline?: string;
  /** Titolo sul velo scuro, gia' tradotto. Se manca, nessuna scritta. */
  title?: string;
  /** Descrizione per i lettori di schermo quando il riquadro non ha titolo. */
  ariaLabel?: string;
}

/**
 * Bandeau video di apertura pagina (Terra, Aria, Lavaggio & Meccanica).
 *
 * I filmati sono girati col telefono, quindi verticali: sul telefono il
 * riquadro resta alto (4:5) e si vede quasi tutta la scena, su schermo largo
 * diventa una fascia 16:9 con il soggetto al centro. Il video parte da solo,
 * senza audio e in ciclo — MediaVideo lo monta solo quando il riquadro entra
 * in campo e lo ferma quando esce, e se il file non arriva resta il poster.
 */
const HeroVideo: React.FC<HeroVideoProps> = ({ src, poster, overline, title, ariaLabel }) => (
  <div className="container mx-auto px-4 mb-8">
    <div className="relative max-w-5xl mx-auto rounded-2xl overflow-hidden border border-white/10">
      <MediaVideo
        src={src}
        poster={poster}
        loading="eager"
        className="relative block w-full aspect-[4/5] sm:aspect-[16/9] bg-black"
        ariaLabel={ariaLabel || title}
      />
      {(overline || title) && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-end p-5 md:p-7 pt-24">
          <div>
            {overline && <p className="text-[11px] tracking-[0.3em] uppercase text-[#C8A24A]">{overline}</p>}
            {title && <h1 className="text-2xl md:text-3xl font-bold text-white">{title}</h1>}
          </div>
        </div>
      )}
    </div>
  </div>
);

export default HeroVideo;

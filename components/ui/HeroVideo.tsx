import React from 'react';
import MediaVideo from '../editorial/MediaVideo';

interface HeroVideoProps {
  /** File in /public, es. "/video-lavaggio.mp4". */
  src: string;
  /** Fotogramma mostrato prima che il filmato parta (e se non parte). */
  poster?: string;
  /** Descrizione della scena per i lettori di schermo. */
  ariaLabel?: string;
  /** Titolo, occhiello, sottotitolo, ricerca: cio' che sta SOPRA il filmato. */
  children?: React.ReactNode;
}

/**
 * Apertura di sezione col filmato come SFONDO (Terra, Aria, Lavaggio &
 * Meccanica).
 *
 * Il filmato non e' un riquadro dentro la pagina: occupa tutta la larghezza
 * dietro al titolo, e sfuma nel nero della pagina in basso, cosi' il passaggio
 * al contenuto non ha una linea di taglio. I video sono girati col telefono,
 * quindi verticali: l'altezza in `vh` tiene il soggetto al centro sia sul
 * telefono che su schermo largo.
 *
 * Parte da solo, senza audio, in ciclo; MediaVideo lo ferma quando esce dal
 * campo e, se il file non arriva, lascia il poster.
 */
const HeroVideo: React.FC<HeroVideoProps> = ({ src, poster, ariaLabel, children }) => (
  <section className="relative isolate flex min-h-[78vh] items-end overflow-hidden md:min-h-[88vh]">
    <MediaVideo
      src={src}
      poster={poster}
      loading="eager"
      className="absolute inset-0 h-full w-full"
      ariaLabel={ariaLabel}
    />
    {/* Il velo: scuro sotto per reggere il testo, quasi nullo al centro per
        non spegnere la scena, nero pieno all'ultimo pixel per saldarsi al
        fondo della pagina senza una riga di taglio. */}
    <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/25 to-black" />
    <div className="relative z-10 w-full pb-14 pt-40 md:pb-20">{children}</div>
  </section>
);

export default HeroVideo;

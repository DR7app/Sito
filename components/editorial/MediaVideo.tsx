import React, { useEffect, useRef, useState } from 'react';

type MediaVideoProps = {
  src?: string;
  /** Sorgente dedicata al telefono: evita di ritagliare a forza una scena 16:9. */
  mobileSrc?: string;
  /** Fotogramma mostrato prima che il video parta e se il video non arriva. */
  poster?: string;
  className?: string;
  /** Solo il video del primo schermo dovrebbe essere `eager`. */
  loading?: 'eager' | 'lazy';
  objectPosition?: string;
  active?: boolean;
  ariaLabel?: string;
};

/**
 * Video di scena.
 *
 * Tre cose che un <video> nudo non fa e che qui servono:
 *
 * 1. NON SI SCARICA FINCHE' NON SERVE. Fuori dal primo schermo la sorgente
 *    viene montata solo quando l'elemento si avvicina alla finestra: una
 *    homepage con sei scene non deve scaricare sei filmati all'apertura.
 * 2. HA SEMPRE UN'ALTERNATIVA. Se il file manca o il browser rifiuta di
 *    riprodurlo resta il poster: mai un rettangolo nero al posto della scena.
 * 3. SI FERMA QUANDO NON E' IN CAMPO. Un filmato che continua a girare fuori
 *    schermo consuma batteria e basta.
 */
const MediaVideo: React.FC<MediaVideoProps> = ({
  src,
  mobileSrc,
  poster,
  className = '',
  loading = 'lazy',
  objectPosition = 'center',
  active = true,
  ariaLabel,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [mounted, setMounted] = useState(loading === 'eager');
  const [failed, setFailed] = useState(false);
  const [inView, setInView] = useState(loading === 'eager');

  // Monta la sorgente solo quando la scena si avvicina.
  useEffect(() => {
    if (mounted && inView) return;
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setMounted(true);
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          setInView(e.isIntersecting);
          if (e.isIntersecting) setMounted(true);
        }
      },
      { rootMargin: '300px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mounted, inView]);

  // Riproduce solo quando serve davvero: in campo e slide attiva.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (inView && active) {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => { /* autoplay negato: resta il poster */ });
    } else {
      v.pause();
    }
  }, [inView, active, mounted]);

  const chosen =
    mobileSrc && typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches
      ? mobileSrc
      : src;

  const showVideo = Boolean(chosen) && !failed && mounted;

  return (
    <div ref={hostRef} className={`media ${className}`} aria-label={ariaLabel}>
      {poster && (
        <img
          src={poster}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition }}
          loading={loading === 'eager' ? 'eager' : 'lazy'}
          decoding="async"
        />
      )}
      {showVideo && (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition }}
          src={chosen}
          poster={poster}
          muted
          loop
          playsInline
          preload={loading === 'eager' ? 'auto' : 'metadata'}
          onError={() => setFailed(true)}
          tabIndex={-1}
          aria-hidden="true"
        />
      )}
    </div>
  );
};

export default MediaVideo;

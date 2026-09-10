import React, { useEffect, useRef, useState } from 'react';
import type { MediaCatalogo } from '../../hooks/useNoleggioCatalog';

interface GalleriaCatalogoProps {
  media: MediaCatalogo[];
  /** Rapporto del riquadro. Gli alloggi vogliono respiro, i mezzi restano
   *  sulla verticale stretta della locandina. */
  formato?: '9/16' | '4/5';
  /** Copertina storica: usata quando la scheda non ha ancora una galleria. */
  fallback?: string | null;
  /** Nome della scheda, per il testo alternativo. */
  nome: string;
}

/**
 * La galleria di una scheda del catalogo (Soggiorni, Mare, Aria).
 *
 * 10/09/2026 — il gestionale carica piu' foto E i video (colonna `media`), ma
 * il sito mostrava solo `image_url`: una casa caricata con dieci foto e la
 * visita filmata si presentava con una foto sola, e una scheda col solo video
 * restava un riquadro vuoto con scritto DR7.
 *
 * Il filmato parte da solo, senza audio, in ciclo: nella scheda e' un'immagine
 * che si muove, non un lettore da comandare. Le frecce e i puntini compaiono
 * solo se c'e' piu' di un elemento.
 */
const GalleriaCatalogo: React.FC<GalleriaCatalogoProps> = ({ media, fallback, nome, formato = '9/16' }) => {
  const voci: MediaCatalogo[] = media.length > 0
    ? media
    : (fallback ? [{ url: fallback, tipo: 'image' }] : []);
  const [i, setI] = useState(0);
  const riquadro = formato === '4/5' ? 'aspect-[4/5]' : 'aspect-[9/16]';

  // 10/09/2026 — l'attributo `autoplay` da solo non basta: quando il filmato
  // entra in pagina gia' montato, o quando il browser ha rimandato l'avvio,
  // resta fermo sul primo fotogramma e sembra rotto. Qui glielo si chiede
  // esplicitamente a ogni cambio di scheda; se il browser dice di no, resta
  // il fotogramma, che e' comunque un'immagine.
  const video = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const avvia = () => { void el.play().catch(() => { /* autoplay negato */ }); };
    avvia();
    el.addEventListener('loadeddata', avvia);
    return () => el.removeEventListener('loadeddata', avvia);
  }, [i]);

  if (voci.length === 0) {
    return <div className={`w-full ${riquadro} bg-white/5 flex items-center justify-center text-gray-600 text-sm`}>DR7</div>;
  }

  const corrente = voci[Math.min(i, voci.length - 1)];
  const vai = (passo: number) => setI(prev => (prev + passo + voci.length) % voci.length);

  return (
    <div className="relative">
      {corrente.tipo === 'video' ? (
        <video
          key={corrente.url}
          ref={video}
          src={corrente.url}
          className={`w-full ${riquadro} object-cover`}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-label={nome}
        />
      ) : (
        <img
          src={corrente.url}
          alt={nome}
          loading="lazy"
          decoding="async"
          className={`w-full ${riquadro} object-cover transition-transform duration-500 group-hover:scale-105`}
        />
      )}

      {voci.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => vai(-1)}
            aria-label="Precedente"
            className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/55 text-white text-lg leading-none transition-colors hover:bg-black/80"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => vai(1)}
            aria-label="Successiva"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/55 text-white text-lg leading-none transition-colors hover:bg-black/80"
          >
            ›
          </button>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {voci.map((_, n) => (
              <button
                key={n}
                type="button"
                onClick={() => setI(n)}
                aria-label={`Elemento ${n + 1}`}
                className={`h-1.5 rounded-full transition-all ${n === i ? 'w-5 bg-white' : 'w-1.5 bg-white/45'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default GalleriaCatalogo;

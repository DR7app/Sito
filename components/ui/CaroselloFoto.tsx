import React, { useRef, useState } from 'react';

/**
 * Carosello di foto (23/09/2026, Prevendite): frecce, pallini e scorrimento
 * col dito. Con una sola foto e' una foto e basta, senza controlli.
 */
const CaroselloFoto: React.FC<{ foto: string[]; alt: string; className?: string }> = ({ foto, alt, className = 'h-56' }) => {
  const [indice, setIndice] = useState(0);
  const inizioTocco = useRef<number | null>(null);
  const n = foto.length;
  if (n === 0) return <div className={`w-full bg-gray-900 ${className}`} />;
  const vai = (i: number) => setIndice((i + n) % n);
  const freccia = 'absolute top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-black/75 transition-colors';

  return (
    <div
      className={`relative w-full overflow-hidden select-none ${className}`}
      onTouchStart={e => { inizioTocco.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (inizioTocco.current === null) return;
        const dx = e.changedTouches[0].clientX - inizioTocco.current;
        inizioTocco.current = null;
        if (Math.abs(dx) > 40) vai(indice + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="flex h-full transition-transform duration-300 ease-out" style={{ transform: `translateX(-${indice * 100}%)` }}>
        {foto.map((url, i) => (
          <img key={url + i} src={url} alt={`${alt} ${i + 1}`} className="w-full h-full object-cover flex-shrink-0" loading={i === 0 ? 'eager' : 'lazy'} draggable={false} />
        ))}
      </div>
      {n > 1 && (
        <>
          <button type="button" aria-label="Foto precedente" onClick={e => { e.stopPropagation(); vai(indice - 1); }} className={`${freccia} left-2`}>&#8249;</button>
          <button type="button" aria-label="Foto successiva" onClick={e => { e.stopPropagation(); vai(indice + 1); }} className={`${freccia} right-2`}>&#8250;</button>
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
            {foto.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Foto ${i + 1}`}
                onClick={e => { e.stopPropagation(); vai(i); }}
                className={`h-1.5 rounded-full transition-all ${i === indice ? 'w-5 bg-white' : 'w-1.5 bg-white/50'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default CaroselloFoto;

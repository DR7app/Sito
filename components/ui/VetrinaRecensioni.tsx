import React, { useEffect, useRef, useState } from 'react';
import type { Review, RatingSummary } from '../../services/googleReviews';

/**
 * La vetrina delle recensioni: il numero, il voto Google, le schede che
 * scorrono e la riga dei quattro dati.
 *
 * 10/09/2026 — prima era una fascia che scorreva da sola all'infinito: le
 * recensioni passavano davanti senza che si riuscisse a leggerne una. Qui il
 * lettore comanda: tre schede per volta, frecce, puntini, e sopra il voto
 * medio con il marchio da cui arriva. Il numero grande e' il conto vero delle
 * recensioni, non una cifra scritta a mano.
 */

interface VetrinaRecensioniProps {
  reviews: Review[];
  ratingSummary: RatingSummary;
  /** Titolo (seconda riga): la prima riga e' sempre "N esperienze." */
  titolo: string;
  sottotitolo: string;
  /** Dove porta il bottone: la scheda Google dell'attivita'. */
  googleReviewsUrl: string;
  /** La scena dietro la sezione: sta a destra e si spegne verso sinistra,
   *  dove va il testo. Vuota = solo il fondo della pagina. */
  immagine?: string;
  /** Etichette, cosi' la sezione parla la lingua della pagina. */
  testi: {
    occhiello: string;
    esperienze: string;
    verificateSuGoogle: (n: number) => string;
    leggiTutte: string;
    recensioneVerificata: string;
    statoPaesi: string;
    statoPaesiNota: string;
    statoRecensioni: (n: number) => string;
    statoRecensioniNota: string;
    statoVoto: string;
    statoVotoNota: string;
    statoStandard: string;
    statoStandardNota: string;
    precedente: string;
    successiva: string;
  };
}

/** Le stelle piene del voto. Sempre cinque: quelle spente restano in ombra. */
const Stelle: React.FC<{ voto: number; classe?: string }> = ({ voto, classe = 'h-4 w-4' }) => (
  <div className="flex items-center gap-0.5" aria-hidden="true">
    {[0, 1, 2, 3, 4].map((i) => (
      <svg key={i} className={`${classe} ${i < Math.round(voto) ? 'text-[#E7B74B]' : 'text-white/15'}`} fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    ))}
  </div>
);

/** Il marchio Google disegnato con le sue lettere: nessuna richiesta a terzi. */
const ScrittaGoogle: React.FC<{ classe?: string }> = ({ classe = 'text-lg' }) => (
  <span className={`font-medium tracking-tight ${classe}`} aria-label="Google">
    <span style={{ color: '#4285F4' }}>G</span>
    <span style={{ color: '#EA4335' }}>o</span>
    <span style={{ color: '#FBBC05' }}>o</span>
    <span style={{ color: '#4285F4' }}>g</span>
    <span style={{ color: '#34A853' }}>l</span>
    <span style={{ color: '#EA4335' }}>e</span>
  </span>
);

const SigilloVerificato: React.FC<{ classe?: string }> = ({ classe = 'h-4 w-4' }) => (
  <svg className={`${classe} shrink-0`} viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M12 1.5l2.31 1.68 2.79-.53 1.06 2.65 2.65 1.06-.53 2.79L22 12l-1.72 2.85.53 2.79-2.65 1.06-1.06 2.65-2.79-.53L12 22.5l-2.31-1.68-2.79.53-1.06-2.65-2.65-1.06.53-2.79L2 12l1.72-2.85-.53-2.79 2.65-1.06L6.9 2.65l2.79.53L12 1.5z" />
    <path fill="#FFFFFF" d="M10.75 15.6l-3.2-3.2 1.27-1.27 1.93 1.93 4.43-4.43 1.27 1.27-5.7 5.7z" />
  </svg>
);

const LogoGoogleTondo: React.FC<{ classe?: string }> = ({ classe = 'h-14 w-14' }) => (
  <svg className={`${classe} shrink-0`} viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
    <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
    <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
    <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
  </svg>
);

/** Data in italiano, giorno mese anno: "27 gennaio 2025". */
function dataEstesa(iso: string, lingua: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lingua === 'en' ? 'en-GB' : 'it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

const VetrinaRecensioni: React.FC<VetrinaRecensioniProps & { lingua?: string }> = ({
  reviews, ratingSummary, titolo, sottotitolo, googleReviewsUrl, immagine, testi, lingua = 'it',
}) => {
  const pista = useRef<HTMLDivElement>(null);
  const [pagina, setPagina] = useState(0);
  const [pagine, setPagine] = useState(1);

  // I puntini seguono lo scorrimento vero, non un conto tenuto a parte:
  // trascinando con il dito restano allineati alle schede che si vedono.
  useEffect(() => {
    const el = pista.current;
    if (!el) return;
    const misura = () => {
      const tot = Math.max(1, Math.ceil(el.scrollWidth / Math.max(1, el.clientWidth)));
      setPagine(tot);
      setPagina(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    };
    misura();
    el.addEventListener('scroll', misura, { passive: true });
    window.addEventListener('resize', misura);
    return () => { el.removeEventListener('scroll', misura); window.removeEventListener('resize', misura); };
  }, [reviews.length]);

  const vai = (passo: number) => {
    const el = pista.current;
    if (!el) return;
    el.scrollBy({ left: passo * el.clientWidth, behavior: 'smooth' });
  };

  const conteggio = ratingSummary.reviewCount;

  return (
    <div className="relative isolate w-full overflow-hidden px-6 py-16 sm:px-10 sm:py-20 -mx-6 sm:-mx-10">
      {/* La scena sta DIETRO tutta la sezione, appoggiata a destra, e si
          spegne verso sinistra dove corre il testo. Sta a tutta altezza col
          suo rapporto vero: riempirla di larghezza la ingrandiva tanto da
          tagliare il tetto dell'auto e la villa, e restava una fetta.
          Nessun bordo netto (`foto-scena`): si spegne tutt'intorno, cosi' si
          posa sul marmo del fondo pagina invece di sembrare un ritaglio
          appoggiato sopra. Il gradiente da sinistra tiene il buio dove
          corrono titolo e testo. */}
      {immagine && (
        <>
          <img
            src={immagine}
            alt=""
            loading="lazy"
            decoding="async"
            className="foto-scena pointer-events-none absolute inset-y-0 right-0 -z-10 h-full w-auto max-w-full object-cover"
          />
          {/* 12/09/2026 — il velo era pieno a sinistra e al 75% in mezzo:
              sommato al marmo del fondo pagina la fascia usciva nera. Ora
              parte all'88% e scende in fretta: il buio resta sotto titolo e
              frase, il resto lascia passare la lastra. */}
          <div className="velo-scena pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-[#08090A]/88 via-[#08090A]/45 to-transparent" />
        </>
      )}

      <div className="max-w-3xl">
        <p className="flex items-center gap-5 text-[11px] uppercase tracking-[0.3em] text-[#C9BEA8]">
          {testi.occhiello}
          <span aria-hidden="true" className="h-px w-24 bg-[#C9BEA8]/40" />
        </p>
        <h2 className="mt-8 font-serif text-4xl md:text-6xl leading-[1.05] tracking-[-0.015em]">
          {/* Il numero e' quello vero di Google. Se non e' ancora arrivato si
              scrive solo la parola: meglio un titolo piu' corto per un
              istante che una cifra inventata. */}
          <span className="block text-white">
            {conteggio > 0
              ? `${conteggio} ${testi.esperienze}`
              : testi.esperienze.charAt(0).toUpperCase() + testi.esperienze.slice(1)}
          </span>
          <span className="block text-[#D8C9AE]">{titolo}</span>
        </h2>
        <p className="mt-6 text-base md:text-lg text-gray-400 leading-relaxed">{sottotitolo}</p>
      </div>

      {/* Il voto, con il marchio da cui arriva: un 5.0 senza fonte e' un
          numero che si autocertifica. */}
      <a
        href={googleReviewsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-10 inline-flex items-center gap-5 group"
      >
        <LogoGoogleTondo />
        <div className="text-left">
          <div className="flex items-baseline gap-3">
            <span className="text-4xl md:text-5xl font-semibold text-white leading-none">{ratingSummary.ratingValue.toFixed(1)}</span>
            <span className="text-lg text-gray-400 leading-none">/ 5</span>
            <Stelle voto={ratingSummary.ratingValue} classe="h-6 w-6" />
          </div>
          <p className="mt-2 flex items-center gap-2 text-sm text-gray-300 group-hover:text-white transition-colors">
            {testi.verificateSuGoogle(conteggio)}
            <SigilloVerificato classe="h-4 w-4" />
          </p>
        </div>
      </a>

      {/* Le schede. Scorrimento a scatti: una pagina per volta, e il dito
          funziona come le frecce. */}
      <div className="relative mt-10">
        <div
          ref={pista}
          className="flex gap-5 overflow-x-auto scroll-smooth snap-x snap-mandatory scrollbar-hide -mx-1 px-1"
        >
          {reviews.map((r, i) => (
            <article
              key={`${r.author}-${i}`}
              className="snap-start shrink-0 w-[85%] sm:w-[calc(50%-10px)] lg:w-[calc(33.333%-14px)] rounded-xl border border-white/10 bg-black/60 backdrop-blur-sm p-6 flex flex-col"
            >
              <header className="flex items-center gap-3">
                <span className="h-11 w-11 shrink-0 rounded-full bg-white/10 text-white flex items-center justify-center text-lg font-semibold">
                  {r.author.trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-white font-semibold truncate">{r.author}</p>
                  <p className="text-xs text-gray-400">{dataEstesa(r.date, lingua)}</p>
                </div>
              </header>
              <div className="mt-4"><Stelle voto={r.rating} /></div>
              <p
                className="mt-4 text-[15px] leading-relaxed text-gray-300 overflow-hidden"
                style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 7 }}
              >
                {r.body}
              </p>
              <div className="flex-1" />
              <footer className="mt-6 flex items-center gap-2">
                <ScrittaGoogle classe="text-lg" />
                <SigilloVerificato />
                <span className="text-xs text-gray-400">{testi.recensioneVerificata}</span>
              </footer>
            </article>
          ))}
        </div>

        {pagine > 1 && (
          <>
            <button
              type="button"
              onClick={() => vai(-1)}
              aria-label={testi.precedente}
              className="hidden sm:flex absolute -left-4 top-1/2 -translate-y-1/2 h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white text-xl transition-colors hover:bg-black"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => vai(1)}
              aria-label={testi.successiva}
              className="hidden sm:flex absolute -right-4 top-1/2 -translate-y-1/2 h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white text-xl transition-colors hover:bg-black"
            >
              ›
            </button>
          </>
        )}
      </div>

      {pagine > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          {Array.from({ length: pagine }).map((_, n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n + 1}`}
              onClick={() => pista.current?.scrollTo({ left: n * (pista.current?.clientWidth || 0), behavior: 'smooth' })}
              className={`h-2 rounded-full transition-all duration-300 ${n === pagina ? 'w-6 bg-white' : 'w-2 bg-white/30 hover:bg-white/60'}`}
            />
          ))}
        </div>
      )}

      <div className="mt-10 flex justify-center">
        <a
          href={googleReviewsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-4 border border-[#C9BEA8]/60 px-10 py-4 text-[12px] uppercase tracking-[0.28em] text-[#E8DFCC] transition-colors duration-300 hover:bg-[#C9BEA8] hover:text-black"
        >
          {testi.leggiTutte}
          <span aria-hidden="true">&#8594;</span>
        </a>
      </div>

      {/* I quattro dati: chiudono la sezione con i numeri, non con un altro
          invito. */}
      <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
        {[
          { icona: 'globo', titolo: testi.statoPaesi, nota: testi.statoPaesiNota },
          { icona: 'scudo', titolo: testi.statoRecensioni(conteggio), nota: testi.statoRecensioniNota },
          { icona: 'persone', titolo: testi.statoVoto, nota: testi.statoVotoNota },
          { icona: 'diamante', titolo: testi.statoStandard, nota: testi.statoStandardNota },
        ].map((d) => (
          <div key={d.icona} className="flex flex-col items-center">
            <svg className="h-8 w-8 text-[#C9BEA8]" fill="none" stroke="currentColor" strokeWidth={1.2} viewBox="0 0 24 24" aria-hidden="true">
              {d.icona === 'globo' && (
                <>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
                </>
              )}
              {d.icona === 'scudo' && (
                <>
                  <path d="M12 3l7 3v6c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6l7-3z" />
                  <path d="M9 12l2 2 4-4" />
                </>
              )}
              {d.icona === 'persone' && (
                <>
                  <circle cx="9" cy="9" r="3" />
                  <circle cx="16" cy="10.5" r="2.4" />
                  <path d="M3.5 19c.6-3 3-4.5 5.5-4.5S14 16 14.5 19M15 14.8c2.2.2 4 1.7 4.5 4.2" />
                </>
              )}
              {d.icona === 'diamante' && (
                <>
                  <path d="M6 4h12l3 5-9 11L3 9l3-5z" />
                  <path d="M3 9h18M9 4l3 16 3-16" />
                </>
              )}
            </svg>
            <p className="mt-4 text-[11px] uppercase tracking-[0.2em] text-white">{d.titolo}</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-gray-400">{d.nota}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VetrinaRecensioni;

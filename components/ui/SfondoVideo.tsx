import React from 'react';
import MediaVideo from '../editorial/MediaVideo';

interface SfondoVideoProps {
  /** File in /public, es. "/video-aria.mp4". */
  src: string;
  /** Fotogramma mostrato prima che il filmato parta (e se non parte). */
  poster?: string;
  /** Descrizione della scena per i lettori di schermo. */
  ariaLabel?: string;
  /** Cio' che sta sulla prima schermata: occhiello, titolo, sottotitolo, ricerca. */
  children?: React.ReactNode;
  /** 'intero': da tablet in su il filmato si vede tutto, senza ingrandire il
   *  soggetto. Default: riempie lo schermo. */
  adatta?: 'riempi' | 'intero';
  /** Apertura corta: il titolo sta in mezzo a mezzo schermo invece che in
   *  fondo a tutto lo schermo. Serve alle sezioni che sotto hanno poco da
   *  mostrare (oggi "Prossimamente"), dove l'apertura intera spingeva testo
   *  e avviso sotto la piega. */
  compatta?: boolean;
  /** Filmato senza velo: si vede la scena come e' stata girata. Da usare
   *  quando il filmato e' gia' scuro di suo, altrimenti il testo sopra
   *  perde leggibilita'. */
  senzaVelo?: boolean;
}

/**
 * Il filmato come SFONDO DELLA PAGINA (Terra, Aria, Lavaggio & Meccanica).
 *
 * 10/09/2026 — prima era una fascia alta mezzo schermo, con la pagina nera
 * che ripartiva subito sotto: sembrava un riquadro appiccicato in cima. Ora
 * il filmato sta fisso dietro a TUTTA la pagina e il contenuto ci scorre
 * sopra; un velo nero che si infittisce verso il basso tiene leggibile ogni
 * testo senza spegnere la scena.
 *
 * Sta dietro al contenuto (`-z-10`) ma sopra il fondo del documento, quindi
 * la pagina che lo usa NON deve dipingersi di nero: `bg-black` sul
 * contenitore radice richiuderebbe il filmato.
 */
const SfondoVideo: React.FC<SfondoVideoProps> = ({ src, poster, ariaLabel, children, adatta = 'riempi', compatta = false, senzaVelo = false }) => (
  <>
    <div className="pointer-events-none fixed inset-0 -z-10">
      <MediaVideo
        src={src}
        poster={poster}
        loading="eager"
        className={`absolute inset-0 h-full w-full ${adatta === 'intero' ? 'sfondo-intero' : ''}`}
        ariaLabel={ariaLabel}
      />
      {/* Il velo: leggero in alto, dove sta la scena, fitto in basso, dove
          arriva il contenuto. Scorrendo, il filmato resta una materia che si
          muove dietro al testo invece di un video da guardare. Con
          `senzaVelo` il filmato si vede pulito, com'e' stato girato. */}
      {!senzaVelo && (
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/70 to-black/90" />
      )}
    </div>
    <section className={`relative flex ${compatta ? 'min-h-[54vh] items-center' : 'min-h-[88vh] items-end'}`}>
      <div className={compatta ? 'w-full pt-28 pb-8' : 'w-full pb-16 pt-40 md:pb-24'}>{children}</div>
    </section>
  </>
);

export default SfondoVideo;

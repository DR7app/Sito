import React, { useEffect, useRef, useState } from 'react';

/**
 * Quanto dura la salita del numero: tre secondi, richiesti dalla direzione
 * (12/09/2026, prima erano cinque). Sono i dati di bilancio, e devono
 * vedersi salire.
 */
const DURATA = 3000;

/**
 * Ogni quanto si riscrive la cifra. Non a ogni fotogramma: tre secondi a
 * 60 al secondo sono centottanta riscritture per numero, nove numeri insieme,
 * ognuna in corpo da titolo. Il browser passava il tempo a rimpaginare e si
 * vedeva: la fascia intera scattava. A 25 al secondo un contatore si legge
 * identico e il lavoro e' meno di meta'.
 */
const PASSO_MS = 40;

/**
 * La durata con un fuori piano soltanto non funziona: la cifra arriverebbe
 * quasi a destinazione nel primo secondo e passerebbe fermi quelli dopo.
 * Questa curva parte piano, corre in mezzo e si posa: il numero e' in
 * movimento per tutta la durata.
 */
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Il primo numero della riga: "4.000+ contratti", "€2,5M+ fatturato". */
const PRIMO_NUMERO = /\d[\d.,]*/;

/** L'animazione si fa solo se il browser c'e' e se l'utente la vuole. */
const animazionePossibile = () =>
  typeof window !== 'undefined' &&
  typeof requestAnimationFrame !== 'undefined' &&
  !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

type Separatori = { gruppo: string; decimale: string };

const separatori = (locale: string): Separatori =>
  locale.startsWith('it')
    ? { gruppo: '.', decimale: ',' }
    : { gruppo: ',', decimale: '.' };

/**
 * Legge un numero scritto come lo scrive un umano e dice quanto vale e con
 * quante cifre dopo la virgola va riscritto. La convenzione dei separatori
 * cambia con la lingua: in italiano il punto raggruppa e la virgola divide i
 * decimali, in inglese e' il contrario.
 */
function leggiNumero(
  testo: string,
  locale: string
): { valore: number; decimali: number; raggruppato: boolean } | null {
  const { gruppo, decimale } = separatori(locale);
  const senzaGruppi = testo.split(gruppo).join('');
  const pezzi = senzaGruppi.split(decimale);
  if (pezzi.length > 2) return null;
  const valore = Number(pezzi.length === 2 ? `${pezzi[0]}.${pezzi[1]}` : pezzi[0]);
  if (!Number.isFinite(valore)) return null;
  return {
    valore,
    decimali: pezzi.length === 2 ? pezzi[1].length : 0,
    raggruppato: testo.includes(gruppo),
  };
}

/**
 * Riscrive il numero come stava scritto nel testo di partenza.
 *
 * `Intl.NumberFormat` qui non va: in italiano lascia "4000" senza punto —
 * la regola della lingua non raggruppa le migliaia a quattro cifre — e il
 * numero finirebbe la salita in una forma diversa da quella del gestionale.
 * Il separatore si mette solo se c'era anche nell'originale.
 */
/**
 * Quante cifre dopo la virgola mostrare MENTRE il numero sale.
 *
 * "€1M" e "€15M" scritti come li scrive un umano non hanno decimali: una
 * salita da zero a uno e' due fotogrammi utili, e il dato sembra fermo
 * mentre tutti gli altri si muovono. Durante la corsa si aggiungono le cifre
 * che servono perche' anche quelli si vedano salire; l'ultimo fotogramma
 * torna comunque al testo del gestionale, quindi a riposo la forma e' la sua.
 */
function decimaliInSalita(valore: number, decimali: number): number {
  if (valore >= 100) return decimali;
  if (valore >= 10) return Math.max(decimali, 1);
  return Math.max(decimali, 2);
}

function scriviNumero(
  valore: number,
  { decimali, raggruppato }: { decimali: number; raggruppato: boolean },
  locale: string
): string {
  const { gruppo, decimale } = separatori(locale);
  const [intero, frazione] = valore.toFixed(decimali).split('.');
  const teste = raggruppato ? intero.replace(/\B(?=(\d{3})+(?!\d))/g, gruppo) : intero;
  return frazione ? `${teste}${decimale}${frazione}` : teste;
}

type Props = {
  /** La riga intera, testo compreso: "4.000+ contratti di noleggio firmati". */
  text: string;
  /** `true` quando la sezione e' entrata in campo. */
  run: boolean;
  /** Lingua corrente: decide come si scrivono le migliaia e i decimali. */
  lang: string;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Se c'e', la riga si spezza in due: il primo pezzo — il numero con i suoi
   * simboli, "€2,5M+" per intero e non solo "2,5" — prende questa classe, e
   * le parole che seguono vanno a capo con `classeTesto`.
   */
  classeNumero?: string;
  classeTesto?: string;
};

/**
 * Una riga dei numeri, con la cifra che sale da zero.
 *
 * Anima SOLO il primo numero della riga e lascia intatto tutto il resto: il
 * simbolo dell'euro, il "+", la "M" dei milioni, l'asterisco della nota e le
 * parole. Cosi' "€2,5M+ fatturato generato" sale da "€0M+" a "€2,5M+" senza
 * che il resto della riga si muova, e il "5" di "5-star reviews" — che non e'
 * un dato — non viene toccato.
 *
 * All'ultimo fotogramma la riga torna esattamente al testo che arriva dal
 * gestionale: quello che si legge alla fine e' il testo vero, non una sua
 * riscrittura.
 *
 * Se l'utente ha chiesto meno movimento, il numero c'e' e basta.
 */
const CountUp: React.FC<Props> = ({ text, run, lang, className = '', style, classeNumero, classeTesto = '' }) => {
  const match = text.match(PRIMO_NUMERO);
  const letto = match && match.index !== undefined ? leggiNumero(match[0], lang) : null;
  const anima = Boolean(letto) && animazionePossibile();

  // `true` quando la riga va mostrata com'e': prima ancora di sapere se si
  // anima, e di nuovo appena la salita e' finita.
  const [fermo, setFermo] = useState(!anima);
  const cifraRef = useRef<HTMLSpanElement>(null);
  const partito = useRef(false);

  const meta = letto ? letto.valore : 0;
  const forma = letto
    ? { decimali: decimaliInSalita(letto.valore, letto.decimali), raggruppato: letto.raggruppato }
    : { decimali: 0, raggruppato: false };

  // Il pezzo che si muove e' il NUMERO CON I SUOI SIMBOLI, non le sole
  // cifre: "€0,61M+" per intero. Tenendo fermi l'euro e la "M" e muovendo
  // solo le cifre in mezzo, a meta' salita si apriva un buco fra il numero e
  // la sua unita' ("971    +"), perche' il posto era tenuto dalla scrittura
  // piu' lunga. Cosi' invece il gruppo resta scritto stretto e a crescere e'
  // il suo bordo destro.
  const spazio = text.indexOf(' ');
  const gruppo = spazio === -1 ? text : text.slice(0, spazio);
  const parole = spazio === -1 ? '' : text.slice(spazio + 1);
  const primaDelNumero = match && match.index !== undefined ? gruppo.slice(0, match.index) : '';
  const dopoIlNumero = match && match.index !== undefined ? gruppo.slice(match.index + match[0].length) : '';
  const scrivi = (v: number) =>
    primaDelNumero + scriviNumero(v, forma, lang) + dopoIlNumero;

  useEffect(() => {
    if (!run || !letto || fermo || partito.current) return;

    partito.current = true;
    const avvio = performance.now();
    let frame = 0;
    let ultimo = 0;

    const passo = (ora: number) => {
      const avanzamento = Math.min(1, (ora - avvio) / DURATA);
      if (avanzamento >= 1) {
        setFermo(true); // la riga torna al testo del gestionale
        return;
      }
      if (ora - ultimo >= PASSO_MS) {
        ultimo = ora;
        // Si scrive DIRETTAMENTE nel nodo: un `setState` per fotogramma
        // rifaceva l'albero di React venticinque volte al secondo per ogni
        // numero, e in corpo da titolo si vedeva.
        const el = cifraRef.current;
        if (el) el.textContent = scrivi(meta * easeInOutCubic(avanzamento));
      }
      frame = requestAnimationFrame(passo);
    };

    frame = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(frame);
    // `letto` si ricalcola a ogni render: le dipendenze che contano sono il
    // via libera, il testo e la lingua.
  }, [run, text, lang, fermo]);

  // Il posto della cifra e' FISSO per tutta la salita.
  //
  // Le cifre cambiano larghezza a ogni passo ("€0,00M" non e' largo quanto
  // "€15M"): scritte in linea spostavano le parole accanto, la riga, e con
  // nove numeri in griglia tutta la fascia ballava a ogni passo. Qui la
  // sagoma — la scrittura piu' lunga fra quella d'arrivo e quelle della
  // salita — tiene il posto da ferma e invisibile, e la cifra che sale ci
  // sta sopra senza toccare l'impaginazione. `tabular-nums` fa il resto:
  // tutte le cifre della stessa larghezza, nessun tremolio interno.
  const gabbia = (sagoma: string) => (
    <span className="relative inline-block whitespace-nowrap tabular-nums align-baseline">
      <span className="invisible" aria-hidden="true">{sagoma}</span>
      <span ref={cifraRef} className="absolute left-0 top-0 w-full">{scrivi(0)}</span>
    </span>
  );

  const piuLunga = (a: string, b: string) => (b.length > a.length ? b : a);
  const sagoma = piuLunga(gruppo, scrivi(meta));

  // Due pezzi: la cifra grande e le parole sotto. Il taglio e' il primo
  // spazio, cosi' l'euro davanti e la "M" o il "+" dietro restano attaccati
  // al numero invece di finire nel corpo piccolo.
  const spezzata = (contenuto: React.ReactNode, resto: string) => (
    <p className={className} style={style} aria-label={fermo ? undefined : text}>
      <span className={`block tabular-nums ${classeNumero}`}>{contenuto}</span>
      {resto && <span className={`block ${classeTesto}`}>{resto}</span>}
    </p>
  );

  if (fermo || !match || match.index === undefined || !letto) {
    if (classeNumero) return spezzata(gruppo, parole);
    return <p className={className} style={style}>{text}</p>;
  }

  if (classeNumero) return spezzata(gabbia(sagoma), parole);

  return (
    <p className={className} style={style} aria-label={text}>
      {gabbia(sagoma)}{parole && ` ${parole}`}
    </p>
  );
};

export default CountUp;

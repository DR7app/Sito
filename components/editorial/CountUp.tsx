import React, { useEffect, useRef, useState } from 'react';

/**
 * Quanto dura la salita del numero: cinque secondi, richiesti dalla
 * direzione. Sono i dati di bilancio, e devono vedersi salire.
 */
const DURATA = 5000;

/**
 * Cinque secondi con un fuori piano soltanto non funzionano: la cifra
 * arriverebbe quasi a destinazione nel primo secondo e passerebbe gli altri
 * quattro ferma. Questa curva parte piano, corre in mezzo e si posa: il
 * numero e' in movimento per tutta la durata.
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
  const letto = match ? leggiNumero(match[0], lang) : null;

  // `null` vuol dire "la riga cosi' com'e'": prima della partenza si mostra
  // zero, dopo l'arrivo si torna al testo del gestionale. Chi ha chiesto meno
  // movimento, o non ha un numero da animare, sta sempre sul testo finale.
  const [valore, setValore] = useState<number | null>(() =>
    letto && animazionePossibile() ? 0 : null
  );
  const partito = useRef(false);

  useEffect(() => {
    if (!run || !letto || partito.current || !animazionePossibile()) return;

    partito.current = true;
    const meta = letto.valore;
    let frame = 0;
    const inizio = performance.now();

    const passo = (ora: number) => {
      const avanzamento = Math.min(1, (ora - inizio) / DURATA);
      if (avanzamento >= 1) {
        setValore(null); // ultimo fotogramma: torna al testo originale
        return;
      }
      setValore(meta * easeInOutCubic(avanzamento));
      frame = requestAnimationFrame(passo);
    };

    frame = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(frame);
    // `letto` si ricalcola a ogni render: le dipendenze che contano sono il
    // via libera, il testo e la lingua.
  }, [run, text, lang]);

  // La riga come si legge adesso: il testo del gestionale prima della
  // partenza e dopo l'arrivo, il numero a meta' salita nel mezzo.
  const inizio = match?.index ?? 0;
  const corrente =
    !match || !letto || valore === null
      ? text
      : text.slice(0, inizio) +
        scriviNumero(
          valore,
          { ...letto, decimali: decimaliInSalita(letto.valore, letto.decimali) },
          lang
        ) +
        text.slice(inizio + match[0].length);

  // Due pezzi: la cifra grande e le parole sotto. Il taglio e' il primo
  // spazio, cosi' l'euro davanti e la "M" o il "+" dietro restano attaccati
  // al numero invece di finire nel corpo piccolo.
  if (classeNumero) {
    const spazio = corrente.indexOf(' ');
    const numero = spazio === -1 ? corrente : corrente.slice(0, spazio);
    const resto = spazio === -1 ? '' : corrente.slice(spazio + 1);
    return (
      <p className={className} style={style}>
        <span className={`block tabular-nums ${classeNumero}`}>{numero}</span>
        {resto && <span className={`block ${classeTesto}`}>{resto}</span>}
      </p>
    );
  }

  return <p className={className} style={style}>{corrente}</p>;
};

export default CountUp;

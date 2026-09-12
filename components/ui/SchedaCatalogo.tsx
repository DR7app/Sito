import React from 'react';

/**
 * La scheda di un servizio del catalogo Lavaggio & Meccanica.
 *
 * 12/09/2026 — prima qui c'era una LOCANDINA: una fotografia con dentro, gia'
 * disegnati, il titolo del servizio, i due listini Urban e Maxi, la durata,
 * l'elenco delle lavorazioni e la riga del risultato. Tre conseguenze:
 *   1. per cambiare una virgola serviva rifare l'immagine in grafica;
 *   2. il prezzo stampato non seguiva il listino (24,90 nella foto, 25,00 sul
 *      bottone sotto: due prezzi diversi nella stessa card);
 *   3. il testo dentro a un'immagine non lo legge nessun motore di ricerca e
 *      non si puo' tradurre.
 *
 * Adesso la scheda e' testo, con i caratteri del sito (titolo con grazie,
 * etichette monospazio, voci in grottesco) sopra alla lastra di marmo. Ogni
 * riga arriva dal Catalogo Lavaggio del gestionale: nome, durata,
 * caratteristiche (una per riga) e descrizione. Le due etichette fisse
 * ("Cosa facciamo", "Risultato") si cambiano da Sito > Lavaggio.
 *
 * Le azioni — prezzo, SELEZIONA, preventivo — restano al chiamante e si
 * passano come `children`: la scheda non sa cosa succede quando si preme.
 */
type Props = {
  /** Nome del servizio, gia' nella lingua giusta. */
  titolo: string;
  /** Durata dichiarata a catalogo ("45 min"). Si nasconde se vale "-". */
  durata?: string;
  /** Pastiglia del catalogo, es. "CLASSICO". Vuota = nessuna pastiglia. */
  etichetta?: string;
  /** Le lavorazioni, una per riga nel Catalogo Lavaggio. */
  caratteristiche?: string[];
  /** La descrizione del servizio: e' la riga "Risultato" della locandina. */
  risultato?: string;
  etichettaCaratteristiche: string;
  etichettaRisultato: string;
  /** Bottoni e prezzi, in fondo alla scheda. */
  children?: React.ReactNode;
};

/** Oltre questo numero la scheda diventa un muro di testo nella griglia. */
const MAX_CARATTERISTICHE = 6;

export default function SchedaCatalogo({
  titolo,
  durata,
  etichetta,
  caratteristiche,
  risultato,
  etichettaCaratteristiche,
  etichettaRisultato,
  children,
}: Props) {
  const voci = (caratteristiche || []).filter(v => v && v.trim()).slice(0, MAX_CARATTERISTICHE);
  const durataVisibile = durata && durata.trim() && durata.trim() !== '-' ? durata.trim() : null;
  const etichettaVisibile = etichetta && etichetta.trim() ? etichetta.trim() : null;

  return (
    <div className="marmo-carta flex h-full flex-col">
      <div className="flex flex-1 flex-col gap-2.5 p-3 sm:p-4">
        {(durataVisibile || etichettaVisibile) && (
          <div className="flex flex-wrap items-center gap-2">
            {durataVisibile && (
              <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#C8A24A]">
                {durataVisibile}
              </span>
            )}
            {etichettaVisibile && (
              <span className="border border-[#C8A24A]/60 bg-[#C8A24A]/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[#C8A24A]">
                {etichettaVisibile}
              </span>
            )}
          </div>
        )}

        <h3 className="font-display text-sm leading-tight text-white uppercase sm:text-base">
          {titolo}
        </h3>

        <span className="block h-px w-8 bg-white/30" aria-hidden="true" />

        {voci.length > 0 && (
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/45">
              {etichettaCaratteristiche}
            </p>
            <ul className="mt-1.5 space-y-1">
              {voci.map((voce) => (
                <li key={voce} className="flex gap-1.5 text-[11px] leading-snug text-white/85">
                  <span className="text-[#C8A24A]" aria-hidden="true">&middot;</span>
                  <span>{voce}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {risultato && risultato.trim() && (
          <div className="mt-auto pt-1">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/45">
              {etichettaRisultato}
            </p>
            <p className="mt-1 text-[11px] italic leading-snug text-white/75">{risultato}</p>
          </div>
        )}
      </div>

      {children && <div className="p-3 pt-0 sm:p-4 sm:pt-0">{children}</div>}
    </div>
  );
}

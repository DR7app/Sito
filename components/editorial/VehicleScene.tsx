import React from 'react';
import type { RentalItem } from '../../types';
import Reveal from './Reveal';
import { Shell, Cta, SeamRule } from './primitives';

type Props = {
  item: RentalItem;
  /** Numero d'ordine nella collezione: "01", "02"... solo tipografia. */
  index: string;
  /** Etichetta della categoria. E' l'unica informazione che la tavola non ha gia'. */
  categoryLabel?: string;
  lang: 'it' | 'en';
  /** Sposta la tavola per non ripetere la stessa composizione tre volte. */
  align?: 'left' | 'center' | 'right';
  ctaTo: string;
  ctaLabel: string;
};

/**
 * Un veicolo in evidenza: la tavola su un piedistallo.
 *
 * I visual della flotta DR7 non sono fotografie: sono locandine con marca,
 * modello e scheda tecnica gia' impressi dentro l'immagine (vedi AUDIT.md
 * § 3.1). Da qui discendono tre regole che questa composizione rispetta:
 *
 *   1. NON SI RITAGLIA. `object-contain` e rapporto nativo: se tagliassimo,
 *      spariscono il logo in alto o le specifiche in basso.
 *   2. NON CI SI SCRIVE SOPRA, e NON SI RIPETE ACCANTO. Il nome del veicolo
 *      e' gia' dentro la tavola: un titolo enorme di fianco lo direbbe due
 *      volte, e con i nomi lunghi finirebbe anche fuori colonna.
 *   3. QUELLO CHE AGGIUNGIAMO E' SOLO CIO' CHE MANCA. Il numero d'ordine, la
 *      categoria, una CTA. Tre cose che nell'immagine non ci sono.
 *
 * Il lusso qui non lo fa la scritta grande: lo fa lo spazio intorno
 * all'oggetto, come una teca.
 */
const VehicleScene: React.FC<Props> = ({ item, index, categoryLabel, lang, align = 'center', ctaTo, ctaLabel }) => {
  const justify = align === 'left' ? 'md:justify-start' : align === 'right' ? 'md:justify-end' : 'md:justify-center';

  return (
    <article className="flex min-h-[85vh] items-center border-t border-[color:var(--line)] py-[var(--sp-lg)]">
      <Shell>
        <div className={`flex flex-col items-center gap-12 md:flex-row md:items-end md:gap-16 ${justify}`}>
          {/* La tavola, intera. L'altezza segue la finestra, non un numero
              fisso: su uno schermo alto l'oggetto cresce, su un portatile
              resta dentro lo schermo senza che si debba scorrere per vederlo. */}
          <Reveal variant="mask" className="shrink-0">
            <div className="inline-flex border border-[color:var(--line)] bg-black p-3 md:p-4">
              <img
                src={item.image}
                alt={item.name}
                loading="lazy"
                decoding="async"
                className="block h-auto w-full max-w-[20rem] sm:max-w-[22rem] md:h-[78vh] md:max-h-[52rem] md:w-auto md:max-w-none"
              />
            </div>
          </Reveal>

          {/* Solo cio' che la tavola non dice. */}
          <div className="w-full max-w-xs md:pb-8">
            <Reveal delay={120}>
              <div className="flex items-center gap-5">
                <span className="t-meta" style={{ color: 'var(--c-metal)' }}>{index}</span>
                <SeamRule className="max-w-[5rem]" />
              </div>
            </Reveal>
            {categoryLabel && (
              <Reveal delay={200}>
                <div className="t-eyebrow mt-7">{categoryLabel}</div>
              </Reveal>
            )}
            {/* Il nome resta accessibile a chi legge con uno screen reader e ai
                motori di ricerca, senza comparire due volte sullo schermo. */}
            <h3 className="sr-only">{item.name}</h3>
            <Reveal delay={280}>
              <div className="mt-9">
                <Cta variant="secondary" to={ctaTo} ariaLabel={`${ctaLabel} — ${item.name}`}>
                  {ctaLabel}
                </Cta>
              </div>
            </Reveal>
          </div>
        </div>
      </Shell>
    </article>
  );
};

export default VehicleScene;

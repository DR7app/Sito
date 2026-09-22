import React, { useEffect, useState } from 'react';
import { getClubTiers, type ClubTierDef } from '../../utils/dr7club';
// Nel ciclo il livello si chiama `livello`: `t` resta la traduzione, cosi'
// il catalogo testi del gestionale vede le stringhe di questo riquadro.
import { useTranslation } from '../../hooks/useTranslation';
import { Shell, Eyebrow, SeamRule } from '../editorial/primitives';
import Reveal from '../editorial/Reveal';

type Props = {
  lang: 'it' | 'en';
  eyebrow: string;
  title: string;
  note?: string;
  /** Livello del cliente, se lo conosciamo: viene evidenziato. */
  currentTier?: string | null;
  /**
   * `true` = solo la griglia, senza sezione ne' intestazione. Serve dentro
   * l'area cliente, dove un titolo c'e' gia' e la colonna e' stretta.
   */
  bare?: boolean;
};

/**
 * La scala dei livelli DR7 Club.
 *
 * I livelli NON sono scritti qui: si leggono da Centralina Pro > DR7 Club, gli
 * stessi che il gestionale usa per calcolare il premio. Oggi sono trenta, da
 * Access al 2% a DR7 ONE al 31%, ma il numero non e' fisso: aggiungerne o
 * toglierne dal pannello cambia questa pagina senza toccare il codice.
 *
 * Se l'operatore li spegne tutti la sezione non compare: una scala vuota non
 * si mostra, si nasconde.
 *
 * L'ultimo livello e' l'unico in oro. Con trenta riquadri, dare un colore a
 * ciascuno vorrebbe dire trenta colori: la gerarchia si legge se ne spicca uno.
 */
const ClubTiersBoard: React.FC<Props> = ({ lang, eyebrow, title, note, currentTier, bare }) => {
  const { t } = useTranslation();
  const [tiers, setTiers] = useState<ClubTierDef[]>([]);

  useEffect(() => {
    let cancelled = false;
    getClubTiers().then((lista) => { if (!cancelled) setTiers(lista); });
    return () => { cancelled = true; };
  }, []);

  if (tiers.length === 0) return null;
  const top = tiers[tiers.length - 1].tier;
  // `useGrouping: true` esplicito: con l'impostazione automatica i numeri di
  // quattro cifre restano senza separatore (3000 accanto a 10.000) e la
  // colonna delle soglie si legge storta.
  const nf = new Intl.NumberFormat(lang === 'it' ? 'it-IT' : 'en-GB', { useGrouping: true, maximumFractionDigits: 0 });

  const griglia = (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
    {tiers.map((livello, i) => {
      const isTop = livello.tier === top;
      const isMine = !!currentTier && livello.tier === currentTier;
      return (
        <Reveal key={livello.tier} delay={Math.min(i, 12) * 35}>
          <div
            className={`h-full border p-4 transition-colors duration-500 ease-editorial ${
              isTop
                ? 'border-[#C9BEA8]/55 bg-[#C9BEA8]/[0.07]'
                : isMine
                  ? 'border-white/40 bg-white/[0.05]'
                  : 'border-white/10 bg-[color:var(--c-graphite)] hover:border-white/25'
            }`}
          >
            <span className="t-meta block text-[11px]" style={{ color: 'var(--fg-dim)' }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <span
              className="mt-2 block font-serif text-3xl leading-none"
              style={{ color: isTop ? 'var(--c-metal)' : 'var(--fg)' }}
            >
              {livello.rewardPercent}%
            </span>
            <span className="mt-3 block text-[12px] leading-tight" style={{ color: 'var(--fg-dim)' }}>
              {livello.label}
            </span>
            <span className="t-meta mt-2 block text-[10px]" style={{ color: 'var(--fg-dim)', opacity: 0.75 }}>
              {livello.max === Infinity
                ? `${t({ it: 'da', en: 'from' })} €${nf.format(livello.min)}`
                : `€${nf.format(livello.min)} – €${nf.format(livello.max)}`}
            </span>
            {isMine && (
              <span className="t-eyebrow mt-3 block" style={{ color: 'var(--c-metal)' }}>
                {t({ it: 'Il tuo livello', en: 'Your tier' })}
              </span>
            )}
          </div>
        </Reveal>
      );
    })}
    </div>
  );

  if (bare) return griglia;

  return (
    <section className="surface-dark border-t border-[color:var(--line)] py-[var(--sp-xl)]">
      <Shell>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Reveal><Eyebrow>{eyebrow}</Eyebrow></Reveal>
            <Reveal delay={80}>
              <h2 className="t-h1 mt-5">{title}</h2>
            </Reveal>
          </div>
          {note && (
            <Reveal delay={160}>
              <p className="t-eyebrow max-w-xs text-right">{note}</p>
            </Reveal>
          )}
        </div>

        <Reveal delay={200}><SeamRule className="mt-10" /></Reveal>

        <div className="mt-10">{griglia}</div>
      </Shell>
    </section>
  );
};

export default ClubTiersBoard;

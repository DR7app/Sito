import React, { useEffect, useState } from 'react';
import { getClubTiers, type ClubTierDef } from '../../utils/dr7club';
import { Shell, Eyebrow, SeamRule } from '../editorial/primitives';
import Reveal from '../editorial/Reveal';

type Props = {
  lang: 'it' | 'en';
  eyebrow: string;
  title: string;
  note?: string;
  /** Livello del cliente, se lo conosciamo: viene evidenziato. */
  currentTier?: string | null;
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
const ClubTiersBoard: React.FC<Props> = ({ lang, eyebrow, title, note, currentTier }) => {
  const [tiers, setTiers] = useState<ClubTierDef[]>([]);

  useEffect(() => {
    let cancelled = false;
    getClubTiers().then((t) => { if (!cancelled) setTiers(t); });
    return () => { cancelled = true; };
  }, []);

  if (tiers.length === 0) return null;
  const top = tiers[tiers.length - 1].tier;
  // `useGrouping: true` esplicito: con l'impostazione automatica i numeri di
  // quattro cifre restano senza separatore (3000 accanto a 10.000) e la
  // colonna delle soglie si legge storta.
  const nf = new Intl.NumberFormat(lang === 'it' ? 'it-IT' : 'en-GB', { useGrouping: true, maximumFractionDigits: 0 });

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

        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {tiers.map((t, i) => {
            const isTop = t.tier === top;
            const isMine = !!currentTier && t.tier === currentTier;
            return (
              <Reveal key={t.tier} delay={Math.min(i, 12) * 35}>
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
                    {t.rewardPercent}%
                  </span>
                  <span className="mt-3 block text-[12px] leading-tight" style={{ color: 'var(--fg-dim)' }}>
                    {t.label}
                  </span>
                  <span className="t-meta mt-2 block text-[10px]" style={{ color: 'var(--fg-dim)', opacity: 0.75 }}>
                    {t.max === Infinity
                      ? `${lang === 'it' ? 'da' : 'from'} €${nf.format(t.min)}`
                      : `€${nf.format(t.min)}`}
                  </span>
                  {isMine && (
                    <span className="t-eyebrow mt-3 block" style={{ color: 'var(--c-metal)' }}>
                      {lang === 'it' ? 'Il tuo livello' : 'Your tier'}
                    </span>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>
      </Shell>
    </section>
  );
};

export default ClubTiersBoard;

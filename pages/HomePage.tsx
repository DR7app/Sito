import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { useVehicles } from '../hooks/useVehicles';
import { useFlottaCategories } from '../hooks/useFlottaCategories';
import { categoryAliases } from '../utils/flottaConfig';
import { getHomeCopy, type HomeCopy, type HomeSlide } from '../utils/siteCopy';
import type { RentalItem } from '../types';
import { Shell, Section, Eyebrow, Statement, Cta, Metric, SeamRule } from '../components/editorial/primitives';
import { Grid } from '../components/editorial/layout';
import Reveal from '../components/editorial/Reveal';
import MediaVideo from '../components/editorial/MediaVideo';
import VehicleScene from '../components/editorial/VehicleScene';

/**
 * Homepage DR7 — sei atti.
 *
 *   01 Arrivo      film a tutto schermo, una frase, una CTA
 *   02 Silenzio    lo statement, molto spazio, niente altro
 *   03 Collezione  pochi veicoli, ognuno una scena, dati veri dal gestionale
 *   04 Esperienze  cosa rendono possibile — solo servizi realmente attivi
 *   05 Marca       il momento di marca, piu' le metriche se verificate
 *   06 Accesso     una frase, una CTA, fine
 *
 * Ogni testo, immagine, video e destinazione arriva da `getHomeCopy()`, cioe'
 * dal gestionale: qui non c'e' una sola frase scritta a mano che l'operatore
 * non possa cambiare. I veicoli in evidenza arrivano da `useVehicles()`, con
 * le specifiche vere: se un dato manca non viene mostrato e non viene
 * inventato.
 */

/* ── Atto 01 — Arrivo ─────────────────────────────────────────────────── */

const Hero: React.FC<{ copy: HomeCopy; lang: 'it' | 'en' }> = ({ copy, lang }) => {
  const slides: HomeSlide[] = copy.hero_slides;
  const [active, setActive] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipe = 50;

  useEffect(() => {
    if (slides.length <= 1) return;
    const ms = Math.max(2, copy.hero_autoplay_seconds) * 1000;
    const t = setInterval(() => setActive((p) => (p + 1) % slides.length), ms);
    return () => clearInterval(t);
  }, [slides.length, copy.hero_autoplay_seconds]);

  const onTouchStart = (e: React.TouchEvent) => { setTouchEnd(null); setTouchStart(e.targetTouches[0].clientX); };
  const onTouchMove = (e: React.TouchEvent) => setTouchEnd(e.targetTouches[0].clientX);
  const onTouchEnd = () => {
    if (touchStart === null || touchEnd === null || slides.length <= 1) return;
    const d = touchStart - touchEnd;
    if (d > minSwipe) setActive((p) => (p + 1) % slides.length);
    else if (d < -minSwipe) setActive((p) => (p - 1 + slides.length) % slides.length);
  };

  const headline = (lang === 'it' ? copy.hero_headline_it : copy.hero_headline_en).split('\n');
  const kicker = lang === 'it' ? copy.hero_kicker_it : copy.hero_kicker_en;
  const micro = lang === 'it' ? copy.hero_microcopy_it : copy.hero_microcopy_en;
  const cta1 = lang === 'it' ? copy.hero_cta_label_it : copy.hero_cta_label_en;
  const cta2 = lang === 'it' ? copy.hero_cta2_label_it : copy.hero_cta2_label_en;

  return (
    <section
      className="relative flex h-screen min-h-[36rem] items-end overflow-hidden surface-dark superficie-piena"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Le scene. Solo la prima e' `eager`: le altre si scaricano quando
          servono, cosi' l'apertura non pesa sei filmati. */}
      {slides.map((s, i) => (
        <div
          key={s.id}
          className="absolute inset-0 transition-opacity duration-[1600ms] ease-editorial"
          style={{ opacity: i === active ? 1 : 0, zIndex: 1 }}
          aria-hidden={i !== active}
        >
          <MediaVideo
            src={s.video_src}
            mobileSrc={s.mobile_src}
            poster={s.poster_src}
            className="h-full w-full"
            loading={i === 0 ? 'eager' : 'lazy'}
            active={i === active}
          />
        </div>
      ))}
      <div className="pointer-events-none absolute inset-0 z-[2] media-veil-hero" />

      {/* Testo: un occhiello, un titolo, una riga, una CTA primaria. */}
      <div className="relative z-[10] w-full pb-24 md:pb-32">
        <Shell>
          <div className="max-w-4xl">
            <Reveal>
              <Eyebrow>{kicker}</Eyebrow>
            </Reveal>
            <h1 className="mt-7">
              {headline.map((line, i) => (
                <Reveal key={i} variant="mask" delay={140 + i * 120} className="overflow-hidden">
                  <span className="t-display-xl block">{line}</span>
                </Reveal>
              ))}
            </h1>
            <Reveal delay={520}>
              <p className="t-body-xl mt-8 max-w-xl" style={{ color: 'var(--c-ivory)', opacity: 0.78 }}>{micro}</p>
            </Reveal>
            <Reveal delay={640}>
              <div className="mt-12 flex flex-wrap items-center gap-x-10 gap-y-5">
                <Cta variant="primary" to={copy.hero_cta_to}>{cta1}</Cta>
                {cta2 && (
                  <a href={copy.hero_cta2_to} className="btn btn-text">{cta2}</a>
                )}
              </div>
            </Reveal>
          </div>
        </Shell>
      </div>

      {/* Indicatori: filetti, non pallini. */}
      {slides.length > 1 && (
        <div className="absolute bottom-10 right-[var(--gutter)] z-[10] hidden items-center gap-3 md:flex">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActive(i)}
              aria-label={`${lang === 'it' ? 'Scena' : 'Scene'} ${i + 1}`}
              className={`h-px transition-all duration-editorial ease-editorial ${i === active ? 'w-16 bg-white' : 'w-8 bg-white/30 hover:bg-white/70'}`}
            />
          ))}
        </div>
      )}
    </section>
  );
};

/* ── Pagina ───────────────────────────────────────────────────────────── */

const HomePage: React.FC = () => {
  const { lang } = useTranslation();
  const [copy, setCopy] = useState<HomeCopy | null>(null);
  const { vehicles } = useVehicles(undefined);
  const { categories: flottaCats } = useFlottaCategories();

  useEffect(() => {
    let cancelled = false;
    getHomeCopy().then((c) => { if (!cancelled) setCopy(c); });
    return () => { cancelled = true; };
  }, []);

  /**
   * I veicoli in evidenza.
   *
   * Se l'operatore ha indicato degli id, si usano quelli e in quell'ordine.
   * Altrimenti si prendono i primi delle categorie visibili in Flotta — cioe'
   * le stesse che il gestionale ha deciso di mostrare, non una lista a parte.
   * Nessun veicolo inventato: se il gestionale non ne restituisce, l'atto
   * della Collezione non viene renderizzato.
   */
  type Featured = { item: RentalItem; catId: string; catLabel: string };
  const featured = useMemo<Featured[]>(() => {
    if (!copy || vehicles.length === 0) return [];

    // Etichetta leggibile della categoria, dalla stessa fonte del menu e della
    // pagina Flotta: e' l'unica informazione che la locandina non contiene.
    const labelFor = (catId: string): string => {
      const c = flottaCats.find((x) => x.id === catId);
      if (c) return c.label;
      const byAlias = flottaCats.find((x) =>
        categoryAliases(x.id).map((a) => a.toLowerCase()).includes((catId || '').toLowerCase()));
      return byAlias ? byAlias.label : '';
    };

    const byId = new Map(vehicles.map((v) => [v.id, v]));
    if (copy.collection_featured_ids.length > 0) {
      return copy.collection_featured_ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((v) => {
          const catId = ((v as any).category || '') as string;
          return { item: v as unknown as RentalItem, catId, catLabel: labelFor(catId) };
        });
    }

    const out: Featured[] = [];
    const seen = new Set<string>();
    for (const cat of flottaCats) {
      const aliases = new Set(categoryAliases(cat.id).map((a) => a.toLowerCase()));
      const hit = vehicles.find((v) => !seen.has(v.id) && aliases.has((v.category || '').toLowerCase()));
      if (hit) { seen.add(hit.id); out.push({ item: hit as unknown as RentalItem, catId: cat.id, catLabel: cat.label }); }
      if (out.length >= copy.collection_featured_count) break;
    }
    // Se le categorie configurate non bastano, si completa con i primi veicoli.
    for (const v of vehicles) {
      if (out.length >= copy.collection_featured_count) break;
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      const catId = (v.category || '') as string;
      out.push({ item: v as unknown as RentalItem, catId, catLabel: labelFor(catId) });
    }
    return out;
  }, [copy, vehicles, flottaCats]);

  if (!copy) {
    // Guscio silenzioso mentre la configurazione arriva: nessun lampo bianco,
    // nessun salto di layout quando il contenuto entra.
    return <div className="surface-dark min-h-screen" aria-busy="true" />;
  }

  const t = (it: string, en: string) => (lang === 'it' ? it : en);
  const brandLines = lang === 'it' ? copy.brand_lines_it : copy.brand_lines_en;
  const stmtLines = lang === 'it' ? copy.statement_lines_it : copy.statement_lines_en;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
      {/* ═══ ATTO 01 — ARRIVO ═══════════════════════════════════════════ */}
      <Hero copy={copy} lang={lang} />

      {/* ═══ ATTO 02 — SILENZIO ═════════════════════════════════════════ */}
      <Section rhythm="xl">
        <Shell>
          <Statement lines={stmtLines} />
          <Reveal delay={480}>
            <div className="mt-14 flex items-center gap-8">
              <SeamRule className="max-w-[7rem]" />
              <Eyebrow>{t(copy.statement_note_it, copy.statement_note_en)}</Eyebrow>
            </div>
          </Reveal>
        </Shell>
      </Section>

      {/* ═══ ATTO 03 — LA COLLEZIONE ════════════════════════════════════ */}
      {featured.length > 0 && (
        <Section surface="graphite" rhythm="none" id="collezione">
          <Shell className="pt-[var(--sp-2xl)] pb-[var(--sp-xl)]">
            <Reveal><Eyebrow>{t(copy.collection_eyebrow_it, copy.collection_eyebrow_en)}</Eyebrow></Reveal>
            <Reveal variant="mask" delay={100} className="mt-8 overflow-hidden">
              <h2 className="t-display">{t(copy.collection_title_it, copy.collection_title_en)}</h2>
            </Reveal>
            <Reveal delay={200}>
              <p className="t-body-lg measure mt-8" style={{ color: 'var(--fg-dim)' }}>
                {t(copy.collection_intro_it, copy.collection_intro_en)}
              </p>
            </Reveal>
          </Shell>

          {featured.map((f, i) => (
            <VehicleScene
              key={f.item.id}
              item={f.item}
              index={String(i + 1).padStart(2, '0')}
              categoryLabel={f.catLabel}
              lang={lang}
              align={i % 3 === 0 ? 'left' : i % 3 === 1 ? 'right' : 'center'}
              ctaTo={f.catId ? `${copy.collection_cta_to}#${f.catId}` : copy.collection_cta_to}
              ctaLabel={t(copy.collection_item_cta_it, copy.collection_item_cta_en)}
            />
          ))}

          <Shell className="border-t border-[color:var(--line)] py-[var(--sp-lg)]">
            <Reveal>
              <Cta variant="secondary" size="lg" to={copy.collection_cta_to}>
                {t(copy.collection_cta_label_it, copy.collection_cta_label_en)}
              </Cta>
            </Reveal>
          </Shell>
        </Section>
      )}

      {/* ═══ ATTO 04 — ESPERIENZE ═══════════════════════════════════════ */}
      {copy.experiences.length > 0 && (
        <Section rhythm="lg" id="esperienze">
          <Shell>
            <Reveal><Eyebrow>{t(copy.experiences_eyebrow_it, copy.experiences_eyebrow_en)}</Eyebrow></Reveal>
            <Reveal variant="mask" delay={100} className="mt-8 overflow-hidden">
              <h2 className="t-display">{t(copy.experiences_title_it, copy.experiences_title_en)}</h2>
            </Reveal>

            <div className="mt-20">
              <Grid cols={2} gap="lg">
                {copy.experiences.map((e, i) => (
                  <Reveal key={e.id} delay={(i % 2) * 90}>
                    <Link to={e.to} className="group block">
                      <div className="media media-veil-soft aspect-[4/3]">
                        {e.video_src ? (
                          <MediaVideo src={e.video_src} poster={e.image_src} className="h-full w-full" />
                        ) : (
                          <img src={e.image_src} alt="" loading="lazy" decoding="async" />
                        )}
                      </div>
                      <div className="mt-7">
                        <h3 className="t-h2">{t(e.title_it, e.title_en)}</h3>
                        <p className="t-body measure mt-3" style={{ color: 'var(--fg-dim)' }}>
                          {t(e.copy_it, e.copy_en)}
                        </p>
                        <span className="t-nav link-reveal mt-6 inline-block">{t(e.cta_it, e.cta_en)}</span>
                      </div>
                    </Link>
                  </Reveal>
                ))}
              </Grid>
            </div>
          </Shell>
        </Section>
      )}

      {/* ═══ ATTO 05 — MARCA ════════════════════════════════════════════ */}
      <Section surface="light" rhythm="lg">
        <Shell>
          <Statement lines={brandLines} size="lg" />
          {copy.brand_paragraphs.length > 0 && (
            <div className="mt-20 max-w-4xl">
              <Grid cols={2} gap="lg">
                {copy.brand_paragraphs.map((p, i) => (
                  <Reveal key={i} delay={i * 90}>
                    <p className="t-body-lg" style={{ color: 'var(--fg-dim)' }}>
                      {t(p.text_it, p.text_en)}
                    </p>
                  </Reveal>
                ))}
              </Grid>
            </div>
          )}

          {/* Le metriche compaiono solo se il gestionale ne pubblica.
              Nessun numero di riempimento. */}
          {copy.metrics.length > 0 && (
            <div className="mt-24 border-t border-[color:var(--line)] pt-16">
              <Grid cols={copy.metrics.length >= 4 ? 4 : 3} gap="lg">
                {copy.metrics.map((m, i) => (
                  <Metric key={m.id} value={m.value} label={t(m.label_it, m.label_en)} delay={i * 80} />
                ))}
              </Grid>
            </div>
          )}
        </Shell>
      </Section>

      {/* ═══ ATTO 06 — ACCESSO ══════════════════════════════════════════ */}
      <section className="relative flex min-h-[85vh] items-center overflow-hidden surface-dark">
        <div className="absolute inset-0">
          <MediaVideo
            src={copy.access_video_src}
            poster={copy.access_media_src}
            className="h-full w-full"
          />
        </div>
        <div className="pointer-events-none absolute inset-0 media-veil" />
        <div className="relative z-[10] w-full py-24">
          <Shell>
            <div className="max-w-3xl">
              <Reveal variant="mask" className="overflow-hidden">
                <h2 className="t-display-xl">{t(copy.access_title_it, copy.access_title_en)}</h2>
              </Reveal>
              <Reveal delay={180}>
                <p className="t-body-xl mt-8" style={{ color: 'var(--c-ivory)', opacity: 0.78 }}>
                  {t(copy.access_copy_it, copy.access_copy_en)}
                </p>
              </Reveal>
              <Reveal delay={300}>
                <div className="mt-12">
                  <Cta variant="primary" size="lg" to={copy.access_cta_to}>
                    {t(copy.access_cta_label_it, copy.access_cta_label_en)}
                  </Cta>
                </div>
              </Reveal>
            </div>
          </Shell>
        </div>
      </section>
    </motion.div>
  );
};

export default HomePage;

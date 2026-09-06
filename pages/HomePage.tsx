import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { getHomeCopy, type HomeCopy, type HomeSlide } from '../utils/siteCopy';
import { Shell, Section, Eyebrow, Statement, Cta, Metric, SeamRule } from '../components/editorial/primitives';
import { Grid } from '../components/editorial/layout';
import Reveal from '../components/editorial/Reveal';
import MediaVideo from '../components/editorial/MediaVideo';

/**
 * Homepage DR7 — sei atti.
 *
 *   01 Arrivo      film a tutto schermo, una frase, una CTA
 *   02 Silenzio    lo statement, molto spazio, niente altro
 *   03 Collezione  un'immagine e un invito al catalogo
 *   04 Esperienza   una scena a piena larghezza per servizio, in colonna
 *   05 Marca       il momento di marca, piu' le metriche se verificate
 *   06 Accesso     una frase, una CTA, fine
 *
 * Ogni testo, immagine, video e destinazione arriva da `getHomeCopy()`, cioe'
 * dal gestionale: qui non c'e' una sola frase scritta a mano, ne' un'immagine,
 * che l'operatore non possa cambiare.
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

  useEffect(() => {
    let cancelled = false;
    getHomeCopy().then((c) => { if (!cancelled) setCopy(c); });
    return () => { cancelled = true; };
  }, []);

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
      {/* 05/09/2026 — un'immagine sola al posto delle tre tavole.
          Prima l'atto montava tre `VehicleScene`, una per categoria, ognuna
          alta quanto lo schermo: tre locandine 9:16 in fila prima ancora di
          arrivare alle Esperienze. Ora la Collezione e' un'immagine e un
          invito; le categorie restano dove servono davvero, nel menu e nella
          pagina Flotta, raggiunte dalla CTA qui sotto.
          L'immagine e' una fotografia (non una locandina della flotta): si
          puo' quindi mostrare a piena larghezza nel suo rapporto nativo.
          `alt` vuoto perche' non porta informazione che il titolo e
          l'introduzione qui accanto non diano gia'. */}
      {copy.collection_image && (
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

            <Reveal variant="mask" delay={300} className="mt-[var(--sp-lg)] overflow-hidden">
              <div className="border border-[color:var(--line)] bg-black">
                <img
                  src={copy.collection_image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="block h-auto w-full"
                />
              </div>
            </Reveal>
          </Shell>

          <Shell className="border-t border-[color:var(--line)] py-[var(--sp-lg)]">
            <Reveal>
              <Cta variant="secondary" size="lg" to={copy.collection_cta_to}>
                {t(copy.collection_cta_label_it, copy.collection_cta_label_en)}
              </Cta>
            </Reveal>
          </Shell>
        </Section>
      )}

      {/* ═══ ATTO 04 — ESPERIENZA ══════════════════════════════════════ */}
      {/* 06/09/2026 — le esperienze scendono in colonna.
          Prima erano quattro riquadri 4:3 in griglia a due colonne: due file
          di francobolli, e Mare, Aria, Soggiorni e Lavaggio finivano piccoli
          quanto una miniatura del menu. Ora ognuna e' un'immagine a piena
          larghezza nel suo rapporto nativo, una sotto l'altra, con la stessa
          cornice della Collezione qui sopra: stesso formato, stesso peso.
          Il video, quando c'e', ha bisogno di un'altezza propria (il player
          si dimensiona sul contenitore), quindi resta in un riquadro 16:9. */}
      {copy.experiences.length > 0 && (
        <Section rhythm="lg" id="esperienze">
          <Shell>
            <Reveal><Eyebrow>{t(copy.experiences_eyebrow_it, copy.experiences_eyebrow_en)}</Eyebrow></Reveal>
            <Reveal variant="mask" delay={100} className="mt-8 overflow-hidden">
              <h2 className="t-display">{t(copy.experiences_title_it, copy.experiences_title_en)}</h2>
            </Reveal>

            <div className="mt-[var(--sp-xl)] flex flex-col gap-[var(--sp-xl)]">
              {copy.experiences.map((e) => (
                <Reveal key={e.id} variant="mask" className="overflow-hidden">
                  <Link to={e.to} className="group block">
                    <div className="overflow-hidden border border-[color:var(--line)] bg-black">
                      {e.video_src ? (
                        <MediaVideo src={e.video_src} poster={e.image_src} className="aspect-[16/9] w-full" />
                      ) : (
                        <img
                          src={e.image_src}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="block h-auto w-full"
                        />
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

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import SEOHead from '../components/seo/SEOHead'
import { CONTENT, EMAIL, INTEGRAZIONI, mailDemo, type Copy, type Lang } from './dr7ai/contenuti'
import { Cta, Eyebrow, Reveal, Section, SectionHead, SeamRule, Shell } from './dr7ai/primitives'
import { Contratto, Documento, Fattura, Pagamento, PannelloCentralina, SchedaEmtn } from './dr7ai/Interfacce'
// Stili della vetrina: tutti dentro `.dr7ai-vetrina`, classi con prefisso vt-.
import './dr7ai/vetrina.css'

/* ────────────────────────────────────────────────────────────
   dr7.app/dr7-ai — copia della vetrina di dr7ai.com (~/dr7ai-sito,
   src/Vetrina.tsx). Contenuti e impaginazione identici; cambiano solo:
     · classi con prefisso vt- e regole in dr7ai/vetrina.css, tutte
       sotto .dr7ai-vetrina (niente esce, niente del sito entra);
     · immagini in /dr7ai/;
     · la barra della vetrina si mette sotto la barra di dr7.app.

   Originale: dr7ai.com — la vetrina del gestionale DR7 AI.

   Stesso linguaggio di dr7.app (ossidiana, avorio, marmo, Bodoni
   Moda + Jost + IBM Plex Mono, angoli vivi, filo di luce), ma qui
   si vende la piattaforma. L'ordine segue il percorso di chi deve
   decidere:

     Arrivo        cos'e', in una frase
     Silenzio      e' il software con cui lavora DR7
     01 Attivita'  le cinque linee di business del gestionale
     02 Ciclo      dalla richiesta alla fattura
     ·  Momenti    quattro schermate: incasso, contratto, fattura, documento
     03 Moduli     le sei aree della barra laterale
     04 Centralina le regole sono dell'azienda
     05 EMTN       il vantaggio competitivo
     06 Istanza    una piattaforma per azienda
     07 Prezzi, FAQ, chiusura
   ──────────────────────────────────────────────────────────── */

const LOGO = '/dr7ai/dr7-logo.png'

// La barra di dr7.app (Header.tsx, fixed) resta sopra a tutto: la barra della
// vetrina si aggancia sotto. Si misura dal vivo perche' l'altezza dipende dal
// logo scelto in Sito > Aspetto.
function useAltezzaBarraSito() {
  const [h, setH] = useState(0)
  useEffect(() => {
    const barra = Array.from(document.querySelectorAll('header')).find((el) => !el.closest('.dr7ai-vetrina'))
    if (!barra) return
    const misura = () => setH(barra.getBoundingClientRect().height)
    misura()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(misura)
    ro.observe(barra)
    return () => ro.disconnect()
  }, [])
  return h
}

// Il contenitore di dr7.app (App.tsx, MainContent) ha `overflow-x: hidden`:
// questo lo rende un contenitore di scorrimento e spegne `position: sticky`
// (la colonna del titolo in "Come lavora"). Finche' la vetrina e' aperta lo
// si porta a `clip`, che taglia allo stesso modo senza quell'effetto; uscendo
// si rimette com'era.
function useStickyDentroAlSito(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const cambiati: [HTMLElement, string][] = []
    for (let el = ref.current?.parentElement; el && el !== document.body; el = el.parentElement) {
      if (getComputedStyle(el).overflowX === 'hidden') {
        cambiati.push([el, el.style.overflowX])
        el.style.overflowX = 'clip'
      }
    }
    return () => { for (const [el, v] of cambiati) el.style.overflowX = v }
  }, [ref])
}

// ── Barra in alto ────────────────────────────────────────────
function Barra({ t, lang, sotto }: { t: Copy; lang: Lang; sotto: number }) {
  const [scrolled, setScrolled] = useState(false)
  const [aperto, setAperto] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    document.body.style.overflow = aperto ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [aperto])

  const voci: [string, string][] = [
    ['#piattaforma', t.nav.piattaforma],
    ['#ciclo', t.nav.ciclo],
    ['#moduli', t.nav.moduli],
    ['#emtn', t.nav.emtn],
    ['#prezzi', t.nav.prezzi],
  ]

  return (
    <>
      <header
        style={{ top: aperto ? 0 : sotto }}
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${
          scrolled && !aperto ? 'border-b border-[#fff]/10 bg-black/95 backdrop-blur-xl' : 'border-b border-transparent'
        }`}
      >
        <nav className="vt-shell flex h-20 items-center justify-between gap-6">
          <a href="#top" className="shrink-0" aria-label="DR7 AI">
            <img src={LOGO} alt="DR7 AI" className="h-9 w-auto sm:h-11" />
          </a>
          <div className="hidden items-center gap-9 lg:flex">
            {voci.map(([href, label]) => (
              <a key={href} href={href} className="vt-t-nav vt-link-reveal text-[#fff]/75 transition-colors hover:text-[#fff]">
                {label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-5">
            <Cta href={mailDemo(lang)} variant="primary" size="sm" className="hidden sm:inline-flex">
              {t.nav.demo}
            </Cta>
            <button
              onClick={() => setAperto((v) => !v)}
              className="vt-t-nav flex items-center gap-3 text-[#fff] lg:hidden"
              aria-expanded={aperto}
            >
              {aperto ? t.nav.chiudi : t.nav.menu}
              <span className="flex w-6 flex-col gap-1.5" aria-hidden>
                <span className={`h-px bg-[#fff] transition-transform duration-300 ${aperto ? 'translate-y-[3.5px] rotate-45' : ''}`} />
                <span className={`h-px bg-[#fff] transition-transform duration-300 ${aperto ? '-translate-y-[3.5px] -rotate-45' : ''}`} />
              </span>
            </button>
          </div>
        </nav>
      </header>

      {/* Menu a schermo intero sul marmo, come su dr7.app */}
      <div
        className={`vt-marmo-fitto fixed inset-0 z-40 flex flex-col justify-between pb-10 pt-28 transition-opacity duration-500 lg:hidden ${
          aperto ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <Shell>
          <ul className="space-y-5">
            {voci.map(([href, label]) => (
              <li key={href}>
                <a href={href} onClick={() => setAperto(false)} className="font-display text-4xl text-[#fff]">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </Shell>
        <Shell>
          <a href={mailDemo(lang)} className="vt-btn vt-btn-primary w-full">
            {t.nav.demo}
          </a>
          <p className="vt-t-meta mt-6 text-[#fff]/50">{EMAIL}</p>
        </Shell>
      </div>
    </>
  )
}

// ── FAQ ──────────────────────────────────────────────────────
function Faq({ items }: { items: string[][] }) {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="border-t border-[color:var(--line)]">
      {items.map(([q, a], i) => (
        <div key={q} className="border-b border-[color:var(--line)]">
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full items-start justify-between gap-6 py-6 text-left"
            aria-expanded={open === i}
          >
            <span className="vt-t-h3">{q}</span>
            <span className={`mt-1 shrink-0 text-xl leading-none transition-transform duration-300 ${open === i ? 'rotate-45' : ''}`} aria-hidden>+</span>
          </button>
          <div className={`grid transition-[grid-template-rows] duration-500 ${open === i ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
            <div className="overflow-hidden">
              <p className="vt-t-body-lg vt-dim vt-measure pb-7 pr-8">{a}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Pagina ───────────────────────────────────────────────────
export default function Dr7AiPage() {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const salvata = localStorage.getItem('dr7ai-lang')
      if (salvata === 'it' || salvata === 'en') return salvata
    } catch { /* storage non disponibile */ }
    return 'it'
  })
  const t = CONTENT[lang]
  const demo = mailDemo(lang)

  // Titolo e descrizione seguono la lingua. Su dr7.app passano da Helmet
  // (SEOHead), che altrimenti rimetterebbe quelli del sito; la lingua sta sul
  // contenitore e non su <html>, per non cambiarla al resto del sito.
  useEffect(() => {
    try { localStorage.setItem('dr7ai-lang', lang) } catch { /* niente */ }
  }, [lang])

  const sotto = useAltezzaBarraSito()
  const radice = useRef<HTMLDivElement | null>(null)
  useStickyDentroAlSito(radice)
  const visuali = [<Pagamento t={t} />, <Contratto t={t} />, <Fattura t={t} />, <Documento t={t} />]

  return (
    <div
      ref={radice}
      id="top"
      lang={lang}
      className="dr7ai-vetrina vt-surface-dark min-h-screen"
      style={{ '--dr7ai-sotto': `${sotto}px` } as CSSProperties}
    >
      <SEOHead title={t.seo.title} description={t.seo.description} canonical="/dr7-ai" />
      <Barra t={t} lang={lang} sotto={sotto} />

      {/* ═══ ARRIVO ═══════════════════════════════════════════════ */}
      <section className="vt-surface-graphite vt-marmo relative flex min-h-[100svh] items-end overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[30vh] bg-gradient-to-b from-transparent to-black" />
        <Shell className="relative pb-20 pt-[calc(9rem+var(--dr7ai-sotto,0px))] md:pb-28">
          <div className="max-w-5xl">
            <Reveal><Eyebrow>{t.hero.eyebrow}</Eyebrow></Reveal>
            <h1 className="mt-7">
              {t.hero.h.map((line, i) => (
                <Reveal key={line} variant="mask" delay={140 + i * 120}>
                  <span className="vt-t-display-xl block">{line}</span>
                </Reveal>
              ))}
            </h1>
            <Reveal delay={560}>
              <p className="vt-t-body-xl mt-8 max-w-2xl text-[#fff]/75">{t.hero.sub}</p>
            </Reveal>
            <Reveal delay={680}>
              <div className="mt-12 flex flex-wrap items-center gap-x-10 gap-y-6">
                <Cta href={demo} variant="primary">{t.hero.cta1}</Cta>
                <a href="#piattaforma" className="vt-btn vt-btn-text">{t.hero.cta2}</a>
              </div>
            </Reveal>
          </div>
        </Shell>
      </section>

      {/* La piattaforma vera: schermata dall'istanza dimostrativa */}
      <Section id="piattaforma" rhythm="none" className="pb-[var(--sp-xl)]">
        <Shell>
          <Reveal variant="mask">
            <figure className="border border-[#fff]/10 bg-black">
              <figcaption className="flex items-center justify-between border-b border-[#fff]/10 px-4 py-3">
                <span className="vt-t-eyebrow">{t.hero.frame}</span>
                <span className="vt-t-meta hidden text-[10px] text-[#fff]/30 sm:inline">dr7ai.com</span>
              </figcaption>
              <img src="/dr7ai/dashboard.png" alt="DR7 AI · Prenotazioni Noleggio" className="block w-full" />
            </figure>
          </Reveal>
        </Shell>
      </Section>

      {/* ═══ SILENZIO ═════════════════════════════════════════════ */}
      <Section rhythm="lg">
        <Shell>
          {t.statement.lines.map((line, i) => (
            <Reveal key={line} variant="mask" delay={i * 130}>
              <span className="vt-t-display-xl block">{line}</span>
            </Reveal>
          ))}
          <Reveal delay={480}>
            <div className="mt-14 flex items-center gap-8">
              <SeamRule className="max-w-[7rem]" />
              <Eyebrow>{t.statement.note}</Eyebrow>
            </div>
          </Reveal>
        </Shell>
      </Section>

      {/* ═══ 01 ATTIVITA' ═════════════════════════════════════════ */}
      <Section surface="light" rhythm="lg" id="attivita">
        <Shell>
          <SectionHead eyebrow={t.business.eyebrow} title={t.business.h} intro={t.business.intro} />
          <div className="mt-[var(--sp-lg)] border-t border-[color:var(--line)]">
            {t.business.items.map((b, i) => (
              <Reveal key={b.k} delay={i * 60}>
                <div className="grid gap-4 border-b border-[color:var(--line)] py-8 md:grid-cols-12 md:gap-8 md:py-10">
                  <span className="vt-t-meta vt-dim md:col-span-1">0{i + 1}</span>
                  <h3 className="vt-t-h2 md:col-span-4">{b.k}</h3>
                  <div className="md:col-span-7">
                    <p className="vt-t-h3">{b.t}</p>
                    <p className="vt-t-body vt-dim vt-measure mt-2">{b.d}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Shell>
      </Section>

      {/* ═══ 02 CICLO ═════════════════════════════════════════════ */}
      <Section rhythm="lg" id="ciclo">
        <Shell className="grid gap-[var(--sp-lg)] lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-32">
              <SectionHead eyebrow={t.ciclo.eyebrow} title={t.ciclo.h} intro={t.ciclo.intro} />
            </div>
          </div>
          <ol className="relative lg:col-span-6 lg:col-start-7">
            <span className="absolute bottom-6 left-[0.95rem] top-6 w-px bg-[#fff]/10" aria-hidden />
            {t.ciclo.steps.map((s, i) => (
              <Reveal key={s.t} delay={i * 50}>
                <li className="relative flex gap-6 py-6">
                  <span className="vt-t-meta relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center border border-[#fff]/20 bg-black text-[11px] text-[#fff]/70">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="pt-1">
                    <h3 className="vt-t-h3">{s.t}</h3>
                    <p className="vt-t-body vt-dim mt-2 max-w-md">{s.d}</p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
        </Shell>
      </Section>

      {/* ═══ MOMENTI ══════════════════════════════════════════════ */}
      {t.momenti.map((m, i) => (
        <Section key={m.eyebrow} surface={i % 2 === 0 ? 'graphite' : 'dark'} rhythm="md">
          <Shell className="grid items-center gap-[var(--sp-lg)] md:grid-cols-2">
            <div className={i % 2 === 1 ? 'md:order-2' : ''}>
              <Reveal><Eyebrow>{m.eyebrow}</Eyebrow></Reveal>
              <Reveal variant="mask" delay={100} className="mt-7">
                <h2 className="vt-t-display whitespace-pre-line">{m.h}</h2>
              </Reveal>
              <Reveal delay={200}>
                <p className="vt-t-body-lg vt-dim mt-7 max-w-lg">{m.d}</p>
              </Reveal>
            </div>
            <Reveal delay={150} className={i % 2 === 1 ? 'md:order-1' : ''}>{visuali[i]}</Reveal>
          </Shell>
        </Section>
      ))}

      {/* ═══ 03 MODULI ════════════════════════════════════════════ */}
      <Section surface="light" rhythm="lg" id="moduli">
        <Shell>
          <SectionHead eyebrow={t.moduli.eyebrow} title={t.moduli.h} intro={t.moduli.intro} />
          <div className="mt-[var(--sp-lg)] grid gap-px border border-[color:var(--line)] bg-[color:var(--line)] sm:grid-cols-2 lg:grid-cols-3">
            {t.moduli.gruppi.map((g, i) => (
              <Reveal key={g.t} delay={(i % 3) * 80} className="bg-[color:var(--c-ivory)] p-7 md:p-9">
                <span className="vt-t-meta vt-dim">0{i + 1}</span>
                <h3 className="vt-t-h2 mt-4">{g.t}</h3>
                <ul className="mt-6 space-y-2.5">
                  {g.v.map((v) => (
                    <li key={v} className="vt-t-body flex gap-3">
                      <span className="mt-[0.7em] h-px w-3 shrink-0 bg-current opacity-40" />
                      {v}
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        </Shell>
      </Section>

      {/* ═══ 04 CENTRALINA ════════════════════════════════════════ */}
      <Section surface="marmo" rhythm="lg">
        <Shell className="grid items-center gap-[var(--sp-lg)] lg:grid-cols-2">
          <SectionHead eyebrow={t.centralina.eyebrow} title={t.centralina.h} intro={t.centralina.intro} />
          <Reveal delay={200}><PannelloCentralina t={t} /></Reveal>
        </Shell>
        <Shell className="mt-[var(--sp-lg)] grid gap-8 md:grid-cols-3">
          {t.centralina.punti.map(([h, d], i) => (
            <Reveal key={h} delay={i * 80} className="border-t border-[#fff]/20 pt-6">
              <h3 className="vt-t-h3">{h}</h3>
              <p className="vt-t-body mt-3 text-[#fff]/75">{d}</p>
            </Reveal>
          ))}
        </Shell>
      </Section>

      {/* ═══ 05 EMTN ══════════════════════════════════════════════ */}
      <Section rhythm="lg" id="emtn">
        <Shell className="grid items-center gap-[var(--sp-lg)] lg:grid-cols-2">
          <SectionHead eyebrow={t.emtn.eyebrow} title={t.emtn.h} intro={t.emtn.intro} />
          <Reveal delay={200}><SchedaEmtn t={t} /></Reveal>
        </Shell>
        <Shell className="mt-[var(--sp-lg)] grid gap-8 md:grid-cols-3">
          {t.emtn.punti.map(([h, d], i) => (
            <Reveal key={h} delay={i * 80} className="border-t border-[#fff]/20 pt-6">
              <h3 className="vt-t-h3">{h}</h3>
              <p className="vt-t-body vt-dim mt-3">{d}</p>
            </Reveal>
          ))}
        </Shell>
      </Section>

      {/* ═══ 06 ISTANZA ═══════════════════════════════════════════ */}
      <Section surface="graphite" rhythm="lg">
        <Shell>
          <SectionHead eyebrow={t.istanza.eyebrow} title={t.istanza.h} intro={t.istanza.intro} />
          <div className="mt-[var(--sp-lg)] grid gap-8 md:grid-cols-3">
            {t.istanza.punti.map(([h, d], i) => (
              <Reveal key={h} delay={i * 80} className="border-t border-[#fff]/20 pt-6">
                <h3 className="vt-t-h3">{h}</h3>
                <p className="vt-t-body vt-dim mt-3">{d}</p>
              </Reveal>
            ))}
          </div>
        </Shell>
      </Section>

      {/* ═══ INTEGRAZIONI ═════════════════════════════════════════ */}
      <Section rhythm="sm" className="overflow-hidden border-y border-[#fff]/10">
        <Shell><Eyebrow>{t.integrazioni}</Eyebrow></Shell>
        <div className="mt-8 flex w-max vt-nastro" aria-hidden>
          {[0, 1].map((k) => (
            <div key={k} className="flex shrink-0 items-center">
              {INTEGRAZIONI.map((n) => (
                <span key={n} className="flex items-center whitespace-nowrap font-display text-2xl text-[#fff]/70 md:text-4xl">
                  <span className="px-8 md:px-12">{n}</span>
                  <span className="h-1.5 w-1.5 bg-[#fff]/25" />
                </span>
              ))}
            </div>
          ))}
        </div>
        <p className="sr-only">{INTEGRAZIONI.join(', ')}</p>
      </Section>

      {/* ═══ 07 PREZZI ════════════════════════════════════════════ */}
      <Section surface="light" rhythm="lg" id="prezzi">
        <Shell>
          <SectionHead eyebrow={t.prezzi.eyebrow} title={t.prezzi.h} intro={t.prezzi.intro} />
          <div className="mt-[var(--sp-lg)] grid gap-6 lg:grid-cols-3">
            {t.prezzi.tiers.map((p, i) => (
              <Reveal key={p.name} delay={i * 80} className="h-full">
                <div className={`flex h-full flex-col p-8 md:p-10 ${p.highlight ? 'vt-surface-dark' : 'border border-[color:var(--line-strong)]'}`}>
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="vt-t-h2">{p.name}</h3>
                    {p.highlight && <span className="vt-t-eyebrow">{t.prezzi.popular}</span>}
                  </div>
                  <p className="vt-t-small vt-dim mt-2">{p.scope}</p>
                  <p className="mt-8 font-display text-4xl">{t.prezzi.custom}</p>
                  <ul className="mt-8 flex-1 space-y-3">
                    {p.features.map((f) => (
                      <li key={f} className="vt-t-body flex gap-3">
                        <span className="mt-[0.7em] h-px w-3 shrink-0 bg-current opacity-40" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a href={demo} className={`vt-btn mt-10 w-full ${p.highlight ? 'vt-btn-primary' : 'vt-btn-secondary'}`}>
                    {t.prezzi.cta}
                  </a>
                </div>
              </Reveal>
            ))}
          </div>
        </Shell>
      </Section>

      {/* ═══ FAQ ══════════════════════════════════════════════════ */}
      <Section surface="light" rhythm="none" id="faq" className="pb-[var(--sp-2xl)]">
        <Shell className="grid gap-[var(--sp-md)] lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Reveal><Eyebrow>{t.faq.eyebrow}</Eyebrow></Reveal>
            <Reveal delay={60} className="mt-6"><SeamRule className="max-w-[6rem]" /></Reveal>
          </div>
          <div className="lg:col-span-8">
            <Faq items={t.faq.items} />
          </div>
        </Shell>
      </Section>

      {/* ═══ CHIUSURA ═════════════════════════════════════════════ */}
      <Section surface="marmo" rhythm="lg" id="demo">
        <Shell>
          <Reveal><Eyebrow>{t.chiusura.eyebrow}</Eyebrow></Reveal>
          <h2 className="mt-8">
            {t.chiusura.h.map((line, i) => (
              <Reveal key={line} variant="mask" delay={100 + i * 120}>
                <span className="vt-t-display-xl block">{line}</span>
              </Reveal>
            ))}
          </h2>
          <Reveal delay={400}>
            <p className="vt-t-body-xl mt-8 max-w-xl text-[#fff]/70">{t.chiusura.sub}</p>
          </Reveal>
          <Reveal delay={500}>
            <div className="mt-12 flex flex-wrap items-center gap-x-10 gap-y-6">
              <Cta href={demo} variant="primary">{t.chiusura.cta}</Cta>
              <span className="vt-t-meta text-[#fff]/50">
                {t.chiusura.note}
                <a href={`mailto:${EMAIL}`} className="vt-link-reveal text-[#fff]/80">{EMAIL}</a>
              </span>
            </div>
          </Reveal>
        </Shell>
      </Section>

      {/* ═══ PIEDE ════════════════════════════════════════════════ */}
      <footer className="vt-surface-dark border-t border-[#fff]/10 py-14">
        <Shell className="flex flex-col gap-10 md:flex-row md:items-center md:justify-between">
          <img src={LOGO} alt="DR7 AI" className="h-10 w-auto self-start" />
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            {([['#piattaforma', t.nav.piattaforma], ['#moduli', t.nav.moduli], ['#emtn', t.nav.emtn], ['#prezzi', t.nav.prezzi]] as const).map(([h, l]) => (
              <a key={h} href={h} className="vt-t-nav vt-link-reveal text-[#fff]/60 hover:text-[#fff]">{l}</a>
            ))}
            <a href={`mailto:${EMAIL}`} className="vt-t-meta vt-link-reveal text-[#fff]/60 hover:text-[#fff]">{EMAIL}</a>
          </div>
          <div className="flex items-center gap-3">
            <span className="vt-t-eyebrow">{t.footer.lang}</span>
            {(['it', 'en'] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={`vt-t-nav px-1 transition-colors ${lang === l ? 'text-[#fff]' : 'text-[#fff]/40 hover:text-[#fff]'}`}
              >
                {l}
              </button>
            ))}
          </div>
        </Shell>
        <Shell className="mt-10">
          <div className="vt-rule" />
          <p className="vt-t-meta mt-6 text-[11px] text-[#fff]/35">© 2026 DR7 AI · {t.footer.rights}</p>
        </Shell>
      </footer>
    </div>
  )
}

import React, { useState } from 'react';
import { Shell, Section, Eyebrow, Statement, Cta, Metric, SectionHead, SeamRule } from '../components/editorial/primitives';
import { Grid, Stack } from '../components/editorial/layout';
import Reveal from '../components/editorial/Reveal';
import MediaVideo from '../components/editorial/MediaVideo';

/**
 * /styleguide — la pagina di riferimento del design system.
 *
 * Non è una pagina di marketing: è lo strumento con cui si verifica che ogni
 * schermata del sito nasca dagli stessi valori. Se un colore, una misura o una
 * durata non compare qui, non deve comparire nemmeno nei componenti.
 *
 * È esclusa dai motori di ricerca in `public/robots.txt`.
 */

const Swatch: React.FC<{ token: string; name: string; hex: string; onDark?: boolean }> = ({ token, name, hex, onDark = true }) => (
  <div>
    <div
      className="h-24 w-full border border-[color:var(--line)]"
      style={{ background: `var(${token})` }}
    />
    <div className="mt-3">
      <div className="t-h4">{name}</div>
      <div className="t-meta mt-1" style={{ color: 'var(--fg-dim)' }}>{hex}</div>
      <div className="t-meta" style={{ color: 'var(--fg-dim)', opacity: 0.6 }}>{token}</div>
    </div>
  </div>
);

const Row: React.FC<{ label: string; children: React.ReactNode; note?: string }> = ({ label, children, note }) => (
  <div className="border-t border-[color:var(--line)] py-8 md:grid md:grid-cols-[14rem_1fr] md:gap-10">
    <div className="mb-4 md:mb-0">
      <div className="t-eyebrow">{label}</div>
      {note && <div className="t-caption mt-2">{note}</div>}
    </div>
    <div className="min-w-0">{children}</div>
  </div>
);

const StyleguidePage: React.FC = () => {
  const [surface, setSurface] = useState<'dark' | 'graphite' | 'light'>('dark');

  return (
    <div className="surface-dark min-h-screen">
      {/* ── Intestazione ───────────────────────────────────────────────── */}
      <Section rhythm="lg">
        <Shell>
          <Eyebrow>DR7 — Design System</Eyebrow>
          <h1 className="t-display-xl mt-8">Styleguide</h1>
          <p className="t-body-lg measure mt-8" style={{ color: 'var(--fg-dim)' }}>
            Ogni valore visivo del sito nasce da questa pagina. Colore, tipografia,
            spazio, bordo, movimento: se un numero non è qui, non deve stare in un
            componente.
          </p>
        </Shell>
      </Section>

      {/* ── Colore ─────────────────────────────────────────────────────── */}
      <Section surface="graphite" rhythm="lg" id="colore">
        <Shell>
          <SectionHead
            eyebrow="01 — Colore"
            title="Cinque valori, un accento"
            intro="Il novanta per cento della percezione arriva da nero, luce, immagine e contrasto. Il metallo è un accento, non un tema: compare su un filetto, un numero, un occhiello — mai su una superficie intera."
          />
          <div className="mt-16">
            <Grid cols={6} gap="md">
              <Swatch token="--c-obsidian" name="Obsidian" hex="#08090A" />
              <Swatch token="--c-graphite" name="Graphite" hex="#131416" />
              <Swatch token="--c-graphite-2" name="Elevated" hex="#1C1E21" />
              <Swatch token="--c-mineral" name="Mineral" hex="#A19C92" />
              <Swatch token="--c-ivory" name="Warm Ivory" hex="#F6F3ED" />
              <Swatch token="--c-metal" name="Soft Metal" hex="#C9BEA8" />
            </Grid>
          </div>

          <div className="mt-20">
            <div className="flex flex-wrap items-center gap-4">
              <span className="t-eyebrow">Superfici</span>
              <div className="flex border border-[color:var(--line-strong)]">
                {(['dark', 'graphite', 'light'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSurface(s)}
                    className={`t-nav px-4 py-2.5 transition-colors duration-standard ${surface === s ? 'bg-[color:var(--fg)] text-[color:var(--bg)]' : ''}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className={`mt-8 surface-${surface} border border-[color:var(--line)] p-10 md:p-16`}>
              <Eyebrow>Superficie {surface}</Eyebrow>
              <h3 className="t-h2 mt-6">Le stesse classi, un'altra luce</h3>
              <p className="t-body measure mt-5" style={{ color: 'var(--fg-dim)' }}>
                Testo, testo secondario e filetti cambiano insieme. Un componente non
                sa su quale superficie si trova: eredita e basta.
              </p>
              <SeamRule className="my-8" />
              <div className="flex flex-wrap gap-4">
                <Cta variant="primary">Primaria</Cta>
                <Cta variant="secondary">Secondaria</Cta>
                <Cta variant="text">Terziaria</Cta>
              </div>
            </div>
          </div>
        </Shell>
      </Section>

      {/* ── Tipografia ─────────────────────────────────────────────────── */}
      <Section rhythm="lg" id="tipografia">
        <Shell>
          <SectionHead
            eyebrow="02 — Tipografia"
            title="Tre voci"
            intro="Bodoni Moda per i titoli: didone italiana, contrasto estremo, la lettera più vicina all'incisione. Jost per l'interfaccia: grottesco geometrico, preciso, senza carattere proprio che disturbi. IBM Plex Mono per i metadati: cifre allineate, maiuscolo spaziato, la voce dei numeri."
          />

          <div className="mt-16">
            <Row label="Display XXL" note="clamp(3.5rem, 13vw, 12rem) · Bodoni Moda 400">
              <div className="t-display-xxl">Sardegna</div>
            </Row>
            <Row label="Display XL" note="clamp(2.75rem, 8.5vw, 7.5rem)">
              <div className="t-display-xl">La Collezione</div>
            </Row>
            <Row label="Display" note="clamp(2.25rem, 5.5vw, 4.75rem)">
              <div className="t-display">Ogni arrivo è una scelta</div>
            </Row>
            <Row label="H1 / H2" note="clamp(2rem, 4.4vw, 3.75rem) · clamp(1.75rem, 3.2vw, 2.75rem)">
              <div className="t-h1">Titolo di pagina</div>
              <div className="t-h2 mt-4">Titolo di sezione</div>
            </Row>
            <Row label="H3 / H4" note="Jost 400 / 500 — voce d'interfaccia">
              <div className="t-h3">Sottotitolo funzionale</div>
              <div className="t-h4 mt-3">Etichetta di gruppo</div>
            </Row>
            <Row label="Body XL / LG / Body" note="Jost 300, interlinea 1.5 → 1.66">
              <p className="t-body-xl measure">Il corpo largo serve alle frasi d'apertura, dove la riga deve respirare.</p>
              <p className="t-body-lg measure mt-5" style={{ color: 'var(--fg-dim)' }}>Il corpo grande porta i paragrafi editoriali sotto un titolo.</p>
              <p className="t-body measure mt-5" style={{ color: 'var(--fg-dim)' }}>Il corpo normale è quello dei moduli, delle schede e delle liste — dove conta la leggibilità, non l'effetto.</p>
            </Row>
            <Row label="Small / Caption">
              <p className="t-small">Testo piccolo per note e legende.</p>
              <p className="t-caption mt-3">Didascalia — sempre in colore secondario.</p>
            </Row>
            <Row label="Nav / Button" note="Jost 500, maiuscolo, tracking 0.16em / 0.2em">
              <div className="t-nav">Esplora</div>
              <div className="t-button mt-4">Scopri la collezione</div>
            </Row>
            <Row label="Eyebrow / Meta" note="IBM Plex Mono — occhielli e numeri">
              <div className="t-eyebrow">01 — La Collezione</div>
              <div className="t-meta mt-4">€ 1.240,00 · 4 giorni · 08/09/2026</div>
            </Row>
            <Row label="Misura di lettura" note="var(--measure) = 62ch">
              <p className="t-body measure" style={{ color: 'var(--fg-dim)' }}>
                Nessun paragrafo supera i sessantadue caratteri per riga. È il limite oltre
                il quale l'occhio perde il capo della riga successiva, e la ragione per cui
                un testo largo tutto schermo si legge peggio di uno stretto.
              </p>
            </Row>
          </div>
        </Shell>
      </Section>

      {/* ── Spazio ─────────────────────────────────────────────────────── */}
      <Section surface="graphite" rhythm="lg" id="spazio">
        <Shell>
          <SectionHead
            eyebrow="03 — Spazio"
            title="Il ritmo verticale"
            intro="Sette gradini, nessun valore intermedio. Le pause lunghe non sono spazio sprecato: sono il silenzio che rende udibile la sezione dopo."
          />
          <div className="mt-16">
            {([['xs', '0.5rem'], ['sm', '1rem'], ['md', '2rem'], ['lg', '4rem'], ['xl', '7rem'], ['2xl', '11rem'], ['3xl', '16rem']] as const).map(([k, v]) => (
              <div key={k} className="flex items-center gap-8 border-t border-[color:var(--line)] py-4">
                <span className="t-eyebrow w-16 shrink-0">{k}</span>
                <span className="t-meta w-24 shrink-0" style={{ color: 'var(--fg-dim)' }}>{v}</span>
                <span className="block h-2 bg-[color:var(--c-metal)]" style={{ width: v, maxWidth: '100%' }} />
              </div>
            ))}
          </div>

          <div className="mt-20">
            <Eyebrow>Contenitore</Eyebrow>
            <div className="mt-6 space-y-3">
              <div className="t-body" style={{ color: 'var(--fg-dim)' }}>
                <span className="t-meta">--container</span> 90rem · <span className="t-meta">--container-narrow</span> 62rem ·{' '}
                <span className="t-meta">--gutter</span> 1.5rem → 2.5rem → 4rem
              </div>
              <div className="border border-dashed border-[color:var(--line-strong)] p-4">
                <div className="bg-[color:var(--c-metal)] py-2 text-center" style={{ opacity: 0.25 }}>
                  <span className="t-meta" style={{ color: 'var(--c-ivory)' }}>shell</span>
                </div>
              </div>
            </div>
          </div>
        </Shell>
      </Section>

      {/* ── Bordo, raggio, superficie ──────────────────────────────────── */}
      <Section rhythm="lg" id="bordo">
        <Shell>
          <SectionHead
            eyebrow="04 — Bordo e raggio"
            title="Geometria controllata"
            intro="Un solo spessore, un filetto da un pixel. I raggi sono quasi nulli: l'angolo netto è il segno dell'editoriale, l'angolo tondo quello del software. La pillola resta solo dove indica uno stato."
          />
          <div className="mt-16">
            <Grid cols={4} gap="md">
              {([['--r-none', '0px'], ['--r-xs', '2px'], ['--r-sm', '3px'], ['--r-pill', '9999px']] as const).map(([t, v]) => (
                <div key={t}>
                  <div className="h-20 border border-[color:var(--line-strong)]" style={{ borderRadius: `var(${t})` }} />
                  <div className="t-meta mt-3" style={{ color: 'var(--fg-dim)' }}>{t} · {v}</div>
                </div>
              ))}
            </Grid>
            <div className="mt-12">
              <Eyebrow>Filetti</Eyebrow>
              <div className="mt-6 space-y-6">
                <div><div className="t-caption mb-2">rule</div><div className="rule" /></div>
                <div><div className="t-caption mb-2">rule-short</div><div className="rule-short" /></div>
                <div><div className="t-caption mb-2">seam-line — la firma</div><SeamRule /></div>
              </div>
            </div>
          </div>
        </Shell>
      </Section>

      {/* ── Movimento ──────────────────────────────────────────────────── */}
      <Section surface="graphite" rhythm="lg" id="movimento">
        <Shell>
          <SectionHead
            eyebrow="05 — Movimento"
            title="Quattro durate, tre curve"
            intro="Il movimento serve a spiegare, non a stupire. Sotto i duecento millisecondi risponde, sopra il secondo racconta. Chi ha chiesto meno movimento al sistema operativo non ne riceve nessuno."
          />
          <div className="mt-16">
            <Row label="Durate">
              <div className="t-meta space-y-2" style={{ color: 'var(--fg-dim)' }}>
                <div>--mo-fast · 180ms — risposta al tocco, cambio di colore</div>
                <div>--mo-standard · 380ms — bottoni, sottolineature, stati</div>
                <div>--mo-editorial · 750ms — rivelazione allo scroll</div>
                <div>--mo-cinematic · 1200ms — scala dell'immagine, sipari</div>
              </div>
            </Row>
            <Row label="Curve">
              <div className="t-meta space-y-2" style={{ color: 'var(--fg-dim)' }}>
                <div>--ease-out · cubic-bezier(.22, 1, .36, 1)</div>
                <div>--ease-inout · cubic-bezier(.76, 0, .24, 1)</div>
                <div>--ease-entrance · cubic-bezier(.16, 1, .3, 1)</div>
              </div>
            </Row>
            <Row label="Rivelazione" note="scorri per vederle entrare">
              <Grid cols={3} gap="md">
                {[0, 120, 240].map((d) => (
                  <Reveal key={d} delay={d}>
                    <div className="border border-[color:var(--line)] p-8">
                      <div className="t-eyebrow">delay {d}ms</div>
                      <div className="t-h3 mt-4">Blocco</div>
                    </div>
                  </Reveal>
                ))}
              </Grid>
            </Row>
            <Row label="Sipario" note="reveal-mask: clip-path dall'alto">
              <Reveal variant="mask" className="overflow-hidden">
                <div className="t-display">Scopre dall'alto</div>
              </Reveal>
            </Row>
          </div>
        </Shell>
      </Section>

      {/* ── Componenti ─────────────────────────────────────────────────── */}
      <Section rhythm="lg" id="componenti">
        <Shell>
          <SectionHead
            eyebrow="06 — Componenti"
            title="Poche varianti, tutte buone"
            intro="Quattro stili di bottone, tre misure. Nessuna variante colorata: il colore lo mette la superficie."
          />
          <div className="mt-16">
            <Row label="Bottoni">
              <Stack gap="md">
                <div className="flex flex-wrap items-center gap-4">
                  <Cta variant="primary" size="sm">Small</Cta>
                  <Cta variant="primary">Medium</Cta>
                  <Cta variant="primary" size="lg">Large</Cta>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <Cta variant="secondary" size="sm">Small</Cta>
                  <Cta variant="secondary">Medium</Cta>
                  <Cta variant="secondary" size="lg">Large</Cta>
                </div>
                <div className="flex flex-wrap items-center gap-8">
                  <Cta variant="text">Terziaria</Cta>
                  <Cta variant="primary" disabled>Disabilitata</Cta>
                </div>
              </Stack>
            </Row>

            <Row label="Occhiello + titolo">
              <SectionHead eyebrow="04 — Experience" title="Mare" intro="Un titolo di sezione completo: occhiello, filetto con la firma, titolo, introduzione." />
            </Row>

            <Row label="Statement" note="il momento di silenzio">
              <Statement lines={['Scegliere un mezzo', 'è scegliere', 'come arrivare.']} size="lg" />
            </Row>

            <Row label="Metriche" note="solo valori verificati nei dati">
              <Grid cols={3} gap="lg">
                <Metric value="—" label="Da collegare ai dati reali" />
                <Metric value="—" label="Nessun numero inventato" delay={80} />
                <Metric value="—" label="Vuoto finché non è verificato" delay={160} />
              </Grid>
            </Row>

            <Row label="Media" note="cornice ferma, immagine che sale">
              <Grid cols={2} gap="md">
                <div className="group">
                  <div className="media aspect-[16/9]">
                    <img src="/menu-mare.jpeg" alt="Esempio di media" loading="lazy" />
                  </div>
                  <div className="t-caption mt-3">.media — hover sul gruppo</div>
                </div>
                <div className="group">
                  <div className="media media-veil aspect-[16/9]">
                    <img src="/menu-aria.jpeg" alt="Esempio di media con velo" loading="lazy" />
                    <div className="absolute bottom-0 left-0 p-8">
                      <div className="t-eyebrow">Velo di leggibilità</div>
                      <div className="t-h2 mt-3">Aria</div>
                    </div>
                  </div>
                  <div className="t-caption mt-3">.media-veil — testo sopra l'immagine</div>
                </div>
              </Grid>
            </Row>

            <Row label="Video" note="poster sempre, sorgente solo quando serve">
              <div className="group">
                <MediaVideo src="/main.mp4" poster="/menu-mobilita.jpeg" className="aspect-[16/9]" />
                <div className="t-caption mt-3">MediaVideo — lazy, ripiego sul poster, pausa fuori campo</div>
              </div>
            </Row>

            <Row label="Griglia">
              <Grid cols={4} gap="sm">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="border border-[color:var(--line)] p-5">
                    <span className="t-meta" style={{ color: 'var(--fg-dim)' }}>{String(i).padStart(2, '0')}</span>
                  </div>
                ))}
              </Grid>
            </Row>
          </div>
        </Shell>
      </Section>

      {/* ── Superficie chiara ──────────────────────────────────────────── */}
      <Section surface="light" rhythm="lg" id="chiaro">
        <Shell>
          <SectionHead
            eyebrow="07 — Superficie chiara"
            title="L'alternanza fa il ritmo"
            intro="Un sito interamente nero si appiattisce dopo tre schermate. La sezione chiara è la pausa che rimette in valore il nero della successiva."
          />
          <div className="mt-16">
            <Grid cols={3} gap="lg">
              <div>
                <div className="t-h3">Stesse classi</div>
                <p className="t-body mt-4" style={{ color: 'var(--fg-dim)' }}>
                  Nessun componente è stato modificato per stare qui: sono i token della
                  superficie a cambiare.
                </p>
              </div>
              <div>
                <div className="t-h3">Stessi filetti</div>
                <div className="mt-4"><SeamRule /></div>
                <p className="t-body mt-4" style={{ color: 'var(--fg-dim)' }}>
                  Il filetto passa da avorio al dodici per cento a nero al quattordici.
                </p>
              </div>
              <div>
                <div className="t-h3">Stessi bottoni</div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Cta variant="primary" size="sm">Primaria</Cta>
                  <Cta variant="secondary" size="sm">Secondaria</Cta>
                </div>
              </div>
            </Grid>
          </div>
        </Shell>
      </Section>

      {/* ── Livelli ────────────────────────────────────────────────────── */}
      <Section rhythm="md" id="livelli">
        <Shell>
          <Eyebrow>08 — Livelli</Eyebrow>
          <div className="t-meta mt-6 space-y-1.5" style={{ color: 'var(--fg-dim)' }}>
            <div>--z-media 1 · --z-content 10 · --z-header 40 · --z-overlay 50 · --z-menu 60 · --z-modal 300</div>
          </div>
          <div className="mt-16"><SeamRule /></div>
          <p className="t-caption mt-8">
            Pagina interna. Esclusa dall'indicizzazione in public/robots.txt.
          </p>
        </Shell>
      </Section>
    </div>
  );
};

export default StyleguidePage;

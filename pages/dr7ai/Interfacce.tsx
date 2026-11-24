import type { ReactNode } from 'react'
import type { Copy } from './contenuti'

/* ──────────────────────────────────────────────────────────────
   Schermate della piattaforma ridisegnate in codice.
   Non sono fotografie del gestionale: dati inventati e coerenti
   con il motore (vedi dr7ai_sito_vetrina), cosi' sulla vetrina non
   finisce mai il nome di un cliente o di un operatore veri.
   Angoli vivi, nessuna emoji.
   ────────────────────────────────────────────────────────────── */

const pannello = 'border border-[color:var(--line)] bg-[color:var(--c-graphite)] text-[color:var(--c-ivory)]'

function Testata({ sx, dx }: { sx: string; dx?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#fff]/10 px-5 py-4">
      <span className="vt-t-eyebrow" style={{ color: 'var(--c-mineral)' }}>{sx}</span>
      {dx}
    </div>
  )
}

function Stato({ children, tono = 'ok' }: { children: ReactNode; tono?: 'ok' | 'spento' }) {
  return (
    <span
      className={`vt-t-meta inline-flex items-center gap-2 border px-2.5 py-1 text-[10px] ${
        tono === 'ok' ? 'border-[#5fd8e6]/40 text-[#5fd8e6]' : 'border-[#fff]/15 text-[#fff]/40'
      }`}
    >
      <span className={`h-1.5 w-1.5 ${tono === 'ok' ? 'bg-[#5fd8e6]' : 'bg-[#fff]/30'}`} />
      {children}
    </span>
  )
}

export function Pagamento({ t }: { t: Copy }) {
  return (
    <div className={`${pannello} mx-auto w-full max-w-md`}>
      <Testata sx={t.pv.tag} />
      <div className="space-y-4 p-5">
        <div className="ml-auto max-w-[88%] border border-[#fff]/10 bg-[#fff]/[0.04] p-4">
          <p className="text-[14px] leading-relaxed text-[#fff]/85">{t.pv.body}</p>
          <div className="mt-4 border border-[#fff]/20 px-3 py-2.5 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-[#fff]">
            {t.pv.link}
          </div>
          <p className="vt-t-meta mt-3 text-[10px] text-[#fff]/40">{t.pv.expire}</p>
        </div>
        <div className="flex items-center gap-3 border-t border-[#fff]/10 pt-4">
          <Stato>{t.pv.paid}</Stato>
        </div>
      </div>
    </div>
  )
}

export function Contratto({ t }: { t: Copy }) {
  return (
    <div className="mx-auto w-full max-w-md bg-[color:var(--c-ivory)] text-[#14150f] shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between border-b border-black/10 px-6 py-5">
        <span className="font-display text-xl">{t.cv.title}</span>
        <span className="vt-t-meta text-[11px] text-black/50">{t.cv.n}</span>
      </div>
      <dl className="space-y-3 px-6 py-5 text-[14px]">
        {t.cv.rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-black/50">{k}</dt>
            <dd className="text-right">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-black/10 px-6 py-5">
        <p className="vt-t-meta text-[11px] text-black/50">{t.cv.otp}</p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 sm:gap-2">
          {['4', '8', '2', '1', '7', '3'].map((c, i) => (
            <span key={i} className="flex h-10 w-8 items-center justify-center border border-black/20 font-mono text-lg sm:w-9">{c}</span>
          ))}
          <span className="ml-auto bg-[#14150f] px-3 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[color:var(--c-ivory)]">
            {t.cv.sign}
          </span>
        </div>
      </div>
    </div>
  )
}

export function Fattura({ t }: { t: Copy }) {
  return (
    <div className={`${pannello} mx-auto w-full max-w-md`}>
      <Testata sx={t.iv.title} dx={<Stato>{t.iv.status}</Stato>} />
      <div className="space-y-3 px-5 py-5 text-[14px]">
        {t.iv.rows.map(([k, v]) => (
          <div key={k} className="flex justify-between text-[#fff]/60">
            <span>{k}</span>
            <span className="vt-t-meta">€ {v}</span>
          </div>
        ))}
        <div className="flex items-end justify-between border-t border-[#fff]/10 pt-4">
          <span className="text-[#fff]/60">{t.iv.total}</span>
          <span className="font-display text-3xl">{t.iv.amount}</span>
        </div>
      </div>
      <div className="flex gap-2 border-t border-[#fff]/10 px-5 py-3">
        {['XML', 'PDF', 'SDI'].map((x) => (
          <span key={x} className="vt-t-meta border border-[#fff]/10 px-2 py-1 text-[10px] text-[#fff]/50">{x}</span>
        ))}
      </div>
    </div>
  )
}

export function Documento({ t }: { t: Copy }) {
  return (
    <div className={`${pannello} mx-auto w-full max-w-md`}>
      <Testata sx={t.dv.tag} dx={<span className="vt-t-meta text-[10px] text-[#fff]/40">AI</span>} />
      <div className="grid grid-cols-[5.5rem_1fr] gap-5 p-5">
        {/* La patente: una sagoma, non una fotografia. */}
        <div className="relative aspect-[5/7] border border-[#fff]/15 bg-gradient-to-br from-[#fff]/[0.09] to-[#fff]/[0.02]">
          <div className="absolute left-2 top-2 h-8 w-6 bg-[#fff]/15" />
          <div className="absolute left-2 right-2 top-12 space-y-1.5">
            {[90, 70, 80, 55].map((w, i) => (
              <div key={i} className="h-[3px] bg-[#fff]/20" style={{ width: `${w}%` }} />
            ))}
          </div>
          {/* La linea che legge */}
          <div className="absolute inset-x-0 top-1/2 h-px bg-[#5fd8e6] shadow-[0_0_12px_#5fd8e6]" />
        </div>
        <dl className="space-y-2.5 text-[13px]">
          {t.dv.fields.map(([k, v]) => (
            <div key={k} className="border-b border-[#fff]/5 pb-2">
              <dt className="vt-t-eyebrow text-[9px]" style={{ color: 'var(--c-mineral)' }}>{k}</dt>
              <dd className="mt-1 vt-t-meta text-[#fff]/85">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="border-t border-[#fff]/10 px-5 py-3">
        <Stato>{t.dv.done}</Stato>
      </div>
    </div>
  )
}

export function PannelloCentralina({ t }: { t: Copy }) {
  const p = t.centralina.panel
  return (
    <div className="vt-vetro mx-auto w-full max-w-lg border border-[#fff]/15">
      <Testata sx={p.title} />
      <dl className="divide-y divide-[#fff]/5 px-5">
        {p.rows.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
            <dt className="text-[13px] text-[#fff]/50">{k}</dt>
            <dd className="vt-t-meta text-[12px] text-[#fff]/90">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-3 border-t border-[#fff]/10 px-5 py-5">
        {p.switches.map(([k, on]) => (
          <div key={k} className="flex items-center justify-between">
            <span className="text-[13px] text-[#fff]/75">{k}</span>
            {/* Interruttore: unico elemento con la pallina, come nel gestionale. */}
            <span className={`relative h-5 w-9 border ${on ? 'border-[#5fd8e6]/60 bg-[#5fd8e6]/20' : 'border-[#fff]/20 bg-[#fff]/5'}`}>
              <span className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 transition-all ${on ? 'right-1 bg-[#5fd8e6]' : 'left-1 bg-[#fff]/40'}`} style={{ borderRadius: '9999px' }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SchedaEmtn({ t }: { t: Copy }) {
  const c = t.emtn.card
  return (
    <div className="vt-vetro mx-auto w-full max-w-md border border-[#fff]/15 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#fff]/10 pb-4">
        <span className="vt-t-eyebrow" style={{ color: 'var(--c-mineral)' }}>EMTN · Mobility Trust</span>
        <span className="vt-t-meta text-[11px] text-[#fff]/40">RSSMRA••••••••••</span>
      </div>
      <div className="flex items-end gap-3 py-6">
        <span className="font-display text-7xl leading-none">80</span>
        <span className="pb-1 text-sm text-[#fff]/40">/100</span>
        <span className="mb-1 ml-auto"><Stato>{c.level}</Stato></span>
      </div>
      <div className="h-px w-full bg-[#fff]/10">
        <div className="h-px bg-[#5fd8e6]" style={{ width: '80%' }} />
      </div>
      <dl className="mt-5 space-y-2.5 text-[14px]">
        {c.rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 text-[#fff]/60">
            <dt>{k}</dt>
            <dd className="vt-t-meta text-[#fff]/90">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="vt-t-meta mt-6 text-[10px] text-[#fff]/35">{c.source}</p>
    </div>
  )
}

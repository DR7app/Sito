import React, { useEffect, useRef } from 'react'

/* ──────────────────────────────────────────────────────────────
   Primitive editoriali — le stesse di dr7.app
   (~/Sito/components/editorial), ridotte a quello che serve alla
   vetrina. Nessun valore visivo qui: tutto arriva da index.css.
   ────────────────────────────────────────────────────────────── */

function useReveal<T extends HTMLElement>(delay = 0, amount = 0.18) {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (delay) el.style.setProperty('--reveal-delay', `${delay}ms`)
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced || typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-in')
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add('is-in')
            io.disconnect()
          }
        }
      },
      { threshold: amount, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [delay, amount])
  return ref
}

/** `fade` sale di 24px, `mask` scopre dall'alto come un sipario. */
export function Reveal({
  children,
  variant = 'fade',
  delay = 0,
  className = '',
}: {
  children: React.ReactNode
  variant?: 'fade' | 'mask'
  delay?: number
  className?: string
}) {
  const ref = useReveal<HTMLDivElement>(delay)
  if (variant === 'mask') {
    return (
      <div ref={ref} className={`vt-reveal-host overflow-hidden ${className}`}>
        <span className="vt-reveal-mask block">{children}</span>
      </div>
    )
  }
  return (
    <div ref={ref} className={`vt-reveal ${className}`}>
      {children}
    </div>
  )
}

export function Shell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`vt-shell ${className}`}>{children}</div>
}

export function Section({
  children,
  surface = 'dark',
  rhythm = 'md',
  id,
  className = '',
}: {
  children: React.ReactNode
  surface?: 'dark' | 'graphite' | 'light' | 'marmo'
  rhythm?: 'sm' | 'md' | 'lg' | 'none'
  id?: string
  className?: string
}) {
  const s =
    surface === 'light' ? 'vt-surface-light'
      : surface === 'graphite' ? 'vt-surface-graphite'
        : surface === 'marmo' ? 'vt-surface-graphite vt-marmo'
          : 'vt-surface-dark'
  const r = rhythm === 'none' ? '' : rhythm === 'sm' ? 'vt-rhythm-sm' : rhythm === 'lg' ? 'vt-rhythm-lg' : 'vt-rhythm'
  return (
    <section id={id} className={`relative ${s} ${r} ${className}`}>
      {children}
    </section>
  )
}

export function Eyebrow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`vt-t-eyebrow block ${className}`}>{children}</span>
}

/** Filetto con il filo di luce che lo percorre quando entra in campo. */
export function SeamRule({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.classList.add('is-live')
          io.disconnect()
        }
      },
      { threshold: 0.6 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return <span ref={ref} className={`vt-seam-line ${className}`} />
}

/** Occhiello, filetto con la firma, titolo, introduzione. */
export function SectionHead({
  eyebrow,
  title,
  intro,
  className = '',
}: {
  eyebrow?: string
  title: string
  intro?: string
  className?: string
}) {
  return (
    <div className={className}>
      {eyebrow && (
        <Reveal>
          <Eyebrow>{eyebrow}</Eyebrow>
        </Reveal>
      )}
      <Reveal delay={60} className="mt-6">
        <SeamRule className="max-w-[6rem]" />
      </Reveal>
      <Reveal variant="mask" delay={120} className="mt-8">
        <h2 className="vt-t-display whitespace-pre-line">{title}</h2>
      </Reveal>
      {intro && (
        <Reveal delay={220}>
          <p className="vt-t-body-lg vt-measure vt-dim mt-8">{intro}</p>
        </Reveal>
      )}
    </div>
  )
}

/** Link esterni in una nuova scheda, ancore e mailto no. */
export function Cta({
  children,
  href,
  variant = 'secondary',
  size,
  className = '',
}: {
  children: React.ReactNode
  href: string
  variant?: 'primary' | 'secondary' | 'text'
  size?: 'sm'
  className?: string
}) {
  const cls = ['vt-btn', `vt-btn-${variant}`, size === 'sm' ? 'vt-btn-sm' : '', className].filter(Boolean).join(' ')
  const ext = href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {}
  return (
    <a href={href} className={cls} {...ext}>
      {children}
    </a>
  )
}

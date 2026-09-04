import React from 'react';
import { Link } from 'react-router-dom';
import Reveal from './Reveal';

/* ==========================================================================
   Primitive editoriali DR7
   --------------------------------------------------------------------------
   Poche, con poche varianti. Ogni valore visivo arriva dai token in
   styles/index.css: qui non compaiono misure, colori o durate.
   ========================================================================== */

/** Contenitore: una sola larghezza massima e un solo gutter per tutto il sito. */
export const Shell: React.FC<{
  children: React.ReactNode;
  narrow?: boolean;
  className?: string;
}> = ({ children, narrow, className = '' }) => (
  <div className={`${narrow ? 'shell-narrow' : 'shell'} ${className}`}>{children}</div>
);

/**
 * Sezione: superficie + ritmo verticale.
 * Le superfici sono tre (`dark`, `graphite`, `light`) e cambiano in blocco
 * testo, testo secondario e filetti — non si ritoccano i colori uno a uno.
 */
export const Section: React.FC<{
  children: React.ReactNode;
  surface?: 'dark' | 'graphite' | 'light';
  rhythm?: 'sm' | 'md' | 'lg' | 'xl' | 'none';
  id?: string;
  className?: string;
}> = ({ children, surface = 'dark', rhythm = 'md', id, className = '' }) => {
  const surfaceClass =
    surface === 'light' ? 'surface-light' : surface === 'graphite' ? 'surface-graphite' : 'surface-dark';
  const rhythmClass =
    rhythm === 'none' ? '' : rhythm === 'sm' ? 'rhythm-sm' : rhythm === 'lg' ? 'rhythm-lg' : rhythm === 'xl' ? 'rhythm-xl' : 'rhythm';
  return (
    <section id={id} className={`${surfaceClass} ${rhythmClass} ${className}`}>
      {children}
    </section>
  );
};

/** Occhiello: la riga corta in monospazio sopra un titolo. */
export const Eyebrow: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <span className={`t-eyebrow block ${className}`}>{children}</span>;

/**
 * Statement: il momento di silenzio. Una frase grande, molto spazio,
 * niente altro. Si rivela riga per riga.
 */
export const Statement: React.FC<{
  lines: string[];
  align?: 'left' | 'center';
  size?: 'xl' | 'lg';
  className?: string;
}> = ({ lines, align = 'left', size = 'xl', className = '' }) => (
  <div className={`${align === 'center' ? 'text-center' : ''} ${className}`}>
    {lines.map((line, i) => (
      <Reveal key={i} variant="mask" delay={i * 130} className="overflow-hidden">
        <span className={`block ${size === 'xl' ? 't-display-xl' : 't-display'}`}>{line}</span>
      </Reveal>
    ))}
  </div>
);

/** Filetto orizzontale che percorre la firma luminosa quando entra in campo. */
export const SeamRule: React.FC<{ className?: string }> = ({ className = '' }) => {
  const ref = React.useRef<HTMLSpanElement | null>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add('is-live');
            io.disconnect();
          }
        }
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <span ref={ref} className={`seam-line ${className}`} />;
};

type CtaProps = {
  children: React.ReactNode;
  to?: string;
  href?: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'text';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  ariaLabel?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
};

/**
 * CTA: tre stili, tre misure. Rende un <Link>, un <a> o un <button> a
 * seconda di cosa gli passi — l'aspetto non cambia, il ruolo semantico si'.
 */
export const Cta: React.FC<CtaProps> = ({
  children,
  to,
  href,
  onClick,
  variant = 'secondary',
  size = 'md',
  className = '',
  ariaLabel,
  type = 'button',
  disabled,
}) => {
  const cls = [
    'btn',
    variant === 'primary' ? 'btn-primary' : variant === 'text' ? 'btn-text' : 'btn-secondary',
    size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (to) {
    return (
      <Link to={to} className={cls} onClick={onClick} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} aria-label={ariaLabel}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} className={cls} onClick={onClick} aria-label={ariaLabel} disabled={disabled}>
      {children}
    </button>
  );
};

/** Numero monumentale + etichetta. Solo per valori realmente presenti nei dati. */
export const Metric: React.FC<{ value: string; label: string; delay?: number }> = ({
  value,
  label,
  delay = 0,
}) => (
  <Reveal delay={delay} className="text-center md:text-left">
    <div className="t-display" style={{ lineHeight: 1 }}>{value}</div>
    <div className="t-eyebrow mt-4">{label}</div>
  </Reveal>
);

/** Titolo di sezione: occhiello, filetto con firma, titolo. */
export const SectionHead: React.FC<{
  eyebrow?: string;
  title: string;
  intro?: string;
  align?: 'left' | 'center';
  className?: string;
}> = ({ eyebrow, title, intro, align = 'left', className = '' }) => (
  <div className={`${align === 'center' ? 'text-center' : ''} ${className}`}>
    {eyebrow && (
      <Reveal>
        <Eyebrow>{eyebrow}</Eyebrow>
      </Reveal>
    )}
    <Reveal delay={60} className="mt-6">
      <SeamRule className={align === 'center' ? 'mx-auto max-w-[6rem]' : 'max-w-[6rem]'} />
    </Reveal>
    <Reveal variant="mask" delay={120} className="mt-8 overflow-hidden">
      <h2 className="t-display">{title}</h2>
    </Reveal>
    {intro && (
      <Reveal delay={220}>
        <p className={`t-body-lg measure mt-8 ${align === 'center' ? 'mx-auto' : ''}`} style={{ color: 'var(--fg-dim)' }}>
          {intro}
        </p>
      </Reveal>
    )}
  </div>
);

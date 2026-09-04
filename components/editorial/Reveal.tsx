import React from 'react';
import { useReveal } from '../../hooks/useReveal';

type RevealProps = {
  children: React.ReactNode;
  /** `fade` sale di 24px, `mask` scopre dall'alto come un sipario. */
  variant?: 'fade' | 'mask';
  delay?: number;
  amount?: number;
  className?: string;
  as?: React.ElementType;
};

/**
 * Involucro per la rivelazione allo scroll. Non impone margini ne' larghezze:
 * decide solo QUANDO il contenuto compare.
 *
 * Nella variante `mask` l'elemento osservato e quello ritagliato sono DUE
 * elementi diversi, e non e' un vezzo: Chromium tiene conto del `clip-path`
 * dell'elemento quando calcola quanto e' visibile per l'IntersectionObserver.
 * Ritagliandolo a zero il rapporto di intersezione resta zero, l'osservatore
 * non scatta mai e il titolo non compare piu'. Il ritaglio va quindi su un
 * figlio, mentre a osservare resta il contenitore, che nessuno ritaglia.
 */
const Reveal: React.FC<RevealProps> = ({
  children,
  variant = 'fade',
  delay = 0,
  amount,
  className = '',
  as: Tag = 'div',
}) => {
  const ref = useReveal<HTMLDivElement>({ delay, amount });

  if (variant === 'mask') {
    return (
      <Tag ref={ref} className={`reveal-host ${className}`}>
        <span className="reveal-mask block">{children}</span>
      </Tag>
    );
  }

  return (
    <Tag ref={ref} className={`reveal ${className}`}>
      {children}
    </Tag>
  );
};

export default Reveal;

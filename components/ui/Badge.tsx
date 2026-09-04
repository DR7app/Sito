import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {}

// Etichetta da rivista: monospazio, maiuscolo, molto spaziata, bordo sottile.
function Badge({ className, ...props }: BadgeProps) {
  return (
    <div
      className={`inline-flex items-center border border-white/15 px-2.5 py-1 font-mono text-[10px] uppercase leading-none tracking-[0.18em] transition-colors focus:outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#C8A24A] ${className}`}
      {...props}
    />
  );
}

export { Badge };

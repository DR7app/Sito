import React from 'react';

// Superficie piatta con un filetto da 1px al posto del rettangolo arrotondato
// con ombra: e' il contenuto a doversi vedere, non il contenitore.
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={`border border-white/10 bg-[#0A0B0C] text-gray-200 transition-colors duration-500 ease-editorial hover:border-white/20 ${className}`}
    {...props}
  />
));
Card.displayName = 'Card';

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={`p-7 md:p-9 ${className}`} {...props} />
));
CardContent.displayName = 'CardContent';

export { Card, CardContent };

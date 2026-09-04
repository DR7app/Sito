import React from 'react';

/* ==========================================================================
   Griglia e impilamento
   --------------------------------------------------------------------------
   Due sole primitive di layout. Non accettano numeri liberi: le colonne e le
   distanze arrivano dalla scala, altrimenti in sei mesi il sito ha
   diciassette spaziature diverse e nessuno sa quale sia quella giusta.
   ========================================================================== */

type Cols = 2 | 3 | 4 | 6 | 12;
type Gap = 'xs' | 'sm' | 'md' | 'lg';

const GAP: Record<Gap, string> = {
  xs: 'gap-2',
  sm: 'gap-4',
  md: 'gap-6 md:gap-8',
  lg: 'gap-10 md:gap-14',
};

const COLS: Record<Cols, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
  6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
  12: 'grid-cols-4 lg:grid-cols-12',
};

/** Griglia editoriale. Mobile 4 colonne concettuali, desktop fino a 12. */
export const Grid: React.FC<{
  children: React.ReactNode;
  cols?: Cols;
  gap?: Gap;
  className?: string;
}> = ({ children, cols = 3, gap = 'md', className = '' }) => (
  <div className={`grid ${COLS[cols]} ${GAP[gap]} ${className}`}>{children}</div>
);

/** Impilamento verticale con distanza dalla scala. */
export const Stack: React.FC<{
  children: React.ReactNode;
  gap?: Gap;
  className?: string;
}> = ({ children, gap = 'md', className = '' }) => (
  <div className={`flex flex-col ${GAP[gap]} ${className}`}>{children}</div>
);

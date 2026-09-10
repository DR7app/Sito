import React from 'react';
import { motion } from 'framer-motion';
import SfondoVideo from '../ui/SfondoVideo';

interface LegalPageLayoutProps {
  title: string;
  children: React.ReactNode;
  /** Filmato dietro alla pagina. Quando c'e', il titolo ci sta sopra e il
   *  contenitore NON si dipinge di nero (lo richiuderebbe). Le pagine legali
   *  non lo passano e restano come sono. */
  filmato?: { src: string; poster?: string };
}

const LegalPageLayout: React.FC<LegalPageLayoutProps> = ({ title, children, filmato }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className={filmato ? 'pb-24 min-h-screen' : 'pt-32 pb-24 bg-black min-h-screen'}
    >
      {filmato && (
        <SfondoVideo src={filmato.src} poster={filmato.poster} ariaLabel={title} compatta>
          <div className="container mx-auto px-6 text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-white">{title}</h1>
          </div>
        </SfondoVideo>
      )}
      <div className={`container mx-auto px-6 ${filmato ? 'pt-10' : ''}`}>
        {!filmato && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* 10/09/2026 — il filetto sotto al titolo era una barra bianca
                spessa 2px per tutta la larghezza: sul resto del sito le
                divisioni sono righe sottili e appena accese. */}
            <h1 className="text-4xl md:text-5xl font-bold text-white text-center border-b border-white/15 pb-6 mb-12">
              {title}
            </h1>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="prose prose-invert prose-lg max-w-4xl mx-auto text-gray-300 prose-headings:text-white prose-a:text-white hover:prose-a:text-gray-300 prose-strong:text-white"
        >
          {children}
        </motion.div>
      </div>
    </motion.div>
  );
};

export default LegalPageLayout;
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTranslation } from '../hooks/useTranslation';
import { getTokenCopy, type TokenCopy } from '../utils/siteCopy';
import SfondoVideo from '../components/ui/SfondoVideo';
import { useFilmato } from '../hooks/useFilmato';

const TokenPage: React.FC = () => {
  const { lang } = useTranslation();
  const [copy, setCopy] = useState<TokenCopy | null>(null);
  useEffect(() => {
    let cancelled = false;
    getTokenCopy().then(c => { if (!cancelled) setCopy(c); });
    return () => { cancelled = true; };
  }, []);
  const tk = (it: keyof TokenCopy, en: keyof TokenCopy): string =>
    copy ? (copy[lang === 'it' ? it : en] as string) : '';
  // La copia salvata prima di oggi non ha il campo: si ricade sul valore di
  // fabbrica invece di lasciare la pagina senza moneta.
  const immagine = (copy?.hero_image || '/dr7-token.jpeg').trim();
  // Il filmato dietro alla pagina, scelto da Sito > Aspetto & Funzionalita'.
  const filmato = useFilmato('digitale');

  return (
    <SfondoVideo
      src={filmato.src}
      poster={filmato.poster}
      ariaLabel={tk('hero_title_it', 'hero_title_en')}
    >
      <div className="text-white flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="max-w-2xl text-center"
      >
        {/* La moneta. Sta sopra tutto: e' la cosa che si riconosce prima di
            leggere. Il file e' un manifesto quadrato — pavimento di marmo,
            pannelli, scritte microscopiche negli angoli — e sulla pagina si
            vedeva il quadrato. `foto-fusa-tonda` lascia piena la moneta e
            spegne il resto verso il bordo: resta la moneta, sospesa, e
            dietro continua il filmato. Un po' piu' grande di prima perche'
            la sfumatura le toglie la cornice attorno.
            11/09/2026 — la sfumatura ora finisce sul bordo della moneta, non
            a mezza scena: il riquadro cresce per compensare quello che il
            cerchio toglie, e il margine sotto cala perche' la sfumatura
            lascia gia' il suo spazio vuoto. */}
        {immagine && (
          <img
            src={immagine}
            alt=""
            loading="eager"
            decoding="async"
            className="foto-fusa-tonda mx-auto mb-2 block h-auto w-full max-w-[340px] md:max-w-[440px]"
          />
        )}

        <p className="text-sm text-gray-500 uppercase tracking-widest mb-4">
          {tk('hero_eyebrow_it', 'hero_eyebrow_en')}
        </p>
        <h1 className="text-6xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-white via-gray-300 to-white bg-clip-text text-transparent">
          {tk('hero_title_it', 'hero_title_en')}
        </h1>
        <p className="text-lg text-gray-400 leading-relaxed mb-10">
          {tk('body_message_it', 'body_message_en')}
        </p>
        <Link
          to="/"
          className="inline-block bg-white text-black px-8 py-4 font-bold text-lg hover:bg-gray-200 transition-all"
        >
          {tk('cta_button_it', 'cta_button_en')}
        </Link>
      </motion.div>
      </div>
    </SfondoVideo>
  );
};

export default TokenPage;

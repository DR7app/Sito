import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useCarrello } from '../../hooks/useCarrello';
import { useTranslation } from '../../hooks/useTranslation';
import { etichettaTipo, euro } from '../../utils/carrello';

/**
 * Il carrello, aperto dal pulsante CARRELLO in alto a destra.
 *
 * Dentro ci stanno insieme servizi di reparti diversi — un lavaggio e un
 * noleggio nello stesso ordine — perche' a cambiare e' solo quello che
 * succede dopo il pagamento, non il modo di comprare.
 */
const CarrelloDrawer: React.FC = () => {
  const { articoli, aperto, chiudi, rimuovi, totaleCents } = useCarrello();
  const { t, lang } = useTranslation();
  const navigate = useNavigate();

  const vaiAlPagamento = () => {
    chiudi();
    navigate('/checkout');
  };

  return (
    <AnimatePresence>
      {aperto && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={chiudi}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-black/90 backdrop-blur-xl border-l border-gray-800 z-[61] flex flex-col"
            aria-label={t({ it: 'Carrello', en: 'Cart' })}
          >
            <div className="p-6 border-b border-gray-800 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white uppercase tracking-[0.18em]">
                {t({ it: 'Carrello', en: 'Cart' })}
              </h2>
              <button
                onClick={chiudi}
                aria-label={t({ it: 'Chiudi il carrello', en: 'Close the cart' })}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="flex-grow overflow-y-auto p-6 space-y-4">
              {articoli.length === 0 ? (
                <p className="text-gray-400 text-center py-10">
                  {t({ it: 'Il carrello è vuoto.', en: 'Your cart is empty.' })}
                </p>
              ) : (
                articoli.map(articolo => (
                  <div key={articolo.id} className="bg-gray-900/50 border border-gray-800 p-4">
                    <div className="flex gap-4">
                      {articolo.immagine && (
                        <img
                          src={articolo.immagine}
                          alt=""
                          className="w-20 h-16 object-cover border border-gray-800 shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] uppercase tracking-[0.22em] text-dr7-gold">
                          {etichettaTipo(articolo.tipo, lang === 'it' ? 'it' : 'en')}
                        </span>
                        <h4 className="font-bold text-white text-sm mt-1 truncate">{articolo.titolo}</h4>
                        {articolo.sottotitolo && (
                          <p className="text-gray-400 text-xs mt-1 whitespace-pre-line">{articolo.sottotitolo}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-3">
                      <button
                        onClick={() => void rimuovi(articolo.id)}
                        className="text-red-500 hover:text-red-400 text-xs uppercase tracking-[0.18em]"
                      >
                        {t({ it: 'Rimuovi', en: 'Remove' })}
                      </button>
                      <span className="text-white font-bold">{euro(articolo.prezzoCents)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {articoli.length > 0 && (
              <div className="p-6 border-t border-gray-800">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-lg text-white">{t({ it: 'Totale', en: 'Total' })}</span>
                  <span className="text-2xl font-bold text-white">{euro(totaleCents)}</span>
                </div>
                <button
                  onClick={vaiAlPagamento}
                  className="w-full bg-white text-black py-4 font-bold text-sm uppercase tracking-[0.2em] hover:bg-gray-200 transition-colors"
                >
                  {t({ it: 'Procedi al pagamento', en: 'Checkout' })}
                </button>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

export default CarrelloDrawer;

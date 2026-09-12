import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useCarrello } from '../../hooks/useCarrello';
import { useTranslation } from '../../hooks/useTranslation';
import { etichettaTipo, euro, type ArticoloCarrello } from '../../utils/carrello';

/**
 * Il carrello, aperto dal pulsante CARRELLO in alto a destra.
 *
 * Dentro ci stanno insieme servizi di reparti diversi — un lavaggio e un
 * noleggio nello stesso ordine — perche' a cambiare e' solo quello che
 * succede dopo il pagamento, non il modo di comprare.
 *
 * 12/09/2026: ogni riga ha la sua spunta. Si paga solo quello che e'
 * spuntato e il resto resta nel carrello per un'altra volta, come su
 * qualunque negozio online.
 */

/** Pagina dove si riapre la configurazione di un articolo. */
function paginaConfigurazione(articolo: ArticoloCarrello): string | null {
  switch (articolo.tipo) {
    // Rotte vere, non quelle che rimbalzano: un <Navigate> perde lo stato
    // della navigazione e l'articolo da modificare non arriverebbe a destinazione.
    case 'lavaggio': return '/car-wash-booking';
    case 'wallet': return '/credit-wallet';
    default: return null;
  }
}

const CarrelloDrawer: React.FC = () => {
  const {
    articoli, aperto, chiudi, rimuovi,
    articoliSelezionati, totaleSelezionatiCents, selezionato, commutaSelezione,
  } = useCarrello();
  const { t, lang } = useTranslation();
  const navigate = useNavigate();

  const vaiAlPagamento = () => {
    chiudi();
    navigate('/checkout');
  };

  const modifica = (articolo: ArticoloCarrello) => {
    const pagina = paginaConfigurazione(articolo);
    if (!pagina) return;
    chiudi();
    // L'articolo viaggia con la navigazione: la pagina che sa configurarlo lo
    // riapre con i valori dentro. Finche' non e' stato risalvato la riga
    // vecchia resta nel carrello, cosi' chi cambia idea non perde niente.
    navigate(pagina, { state: { modificaArticolo: articolo } });
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
                <>
                  <p className="text-gray-500 text-xs">
                    {t({
                      it: 'Paghi solo gli articoli con la spunta.',
                      en: 'You only pay for the ticked items.',
                    })}
                  </p>
                  {articoli.map(articolo => (
                    <div
                      key={articolo.id}
                      className={`bg-gray-900/50 border p-4 transition-opacity ${selezionato(articolo.id) ? 'border-gray-800' : 'border-gray-900 opacity-50'}`}
                    >
                      <div className="flex gap-3">
                        <input
                          type="checkbox"
                          checked={selezionato(articolo.id)}
                          onChange={() => commutaSelezione(articolo.id)}
                          aria-label={articolo.titolo}
                          className="mt-1 h-4 w-4 accent-white shrink-0"
                        />
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
                        <div className="flex gap-4">
                          {paginaConfigurazione(articolo) && (
                            <button
                              onClick={() => modifica(articolo)}
                              className="text-gray-300 hover:text-white text-xs uppercase tracking-[0.18em]"
                            >
                              {t({ it: 'Modifica', en: 'Edit' })}
                            </button>
                          )}
                          <button
                            onClick={() => void rimuovi(articolo.id)}
                            className="text-red-500 hover:text-red-400 text-xs uppercase tracking-[0.18em]"
                          >
                            {t({ it: 'Rimuovi', en: 'Remove' })}
                          </button>
                        </div>
                        <span className="text-white font-bold">{euro(articolo.prezzoCents)}</span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {articoli.length > 0 && (
              <div className="p-6 border-t border-gray-800">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-lg text-white">{t({ it: 'Subtotale', en: 'Subtotal' })}</span>
                  <span className="text-2xl font-bold text-white">{euro(totaleSelezionatiCents)}</span>
                </div>
                <p className="text-gray-500 text-xs mb-4">
                  {articoliSelezionati.length}/{articoli.length}{' '}
                  {t({ it: 'articoli selezionati', en: 'items selected' })}
                </p>
                <button
                  onClick={vaiAlPagamento}
                  disabled={articoliSelezionati.length === 0}
                  className="w-full bg-white text-black py-4 font-bold text-sm uppercase tracking-[0.2em] hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  {t({ it: 'Vai al checkout', en: 'Go to checkout' })}
                </button>
                <button
                  onClick={chiudi}
                  className="w-full mt-3 border border-gray-700 text-gray-300 py-3 font-bold text-xs uppercase tracking-[0.2em] hover:border-white hover:text-white transition-colors"
                >
                  {t({ it: 'Continua', en: 'Continue shopping' })}
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

/**
 * SeatPlanPicker — scelta dei sedili su una pianta dell'abitacolo.
 *
 * Serve ai servizi Prime Wash venduti "a sedile" (PRIME SEAT CLEAN, PRIME
 * SEAT PROTECT): prima si sceglieva solo QUANTI sedili con un +/- nel
 * carrello, e in officina nessuno sapeva QUALI. Qui si toccano i sedili
 * sulla pianta, come per i posti dell'elicottero in TourBookingModal.
 *
 * Il numero di sedili scelti diventa la quantita' della riga di carrello, e
 * le sigle viaggiano fino a `booking_details.cartItems[].seats`.
 *
 * La pianta (sigle, etichette, posizioni) sta in utils/seatPlan.ts: qui c'e'
 * solo il disegno e l'interazione.
 *
 * Pianta disegnata in SVG e non come immagine: si adatta al colore del tema,
 * resta nitida su ogni schermo e non richiede un asset da caricare.
 */
import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../../hooks/useTranslation';
import { SEAT_BLOCKS, SEAT_LAYOUT, ROW_Y, seatListLabel, normalizeSeats } from '../../utils/seatPlan';

interface Props {
  serviceName: string;
  /** Prezzo di UN sedile. */
  unitPrice: number;
  /** Sedili gia' scelti, se si sta modificando una riga esistente. */
  initialSeats?: string[];
  onConfirm: (seats: string[]) => void;
  onClose: () => void;
}

const SeatPlanPicker: React.FC<Props> = ({ serviceName, unitPrice, initialSeats = [], onConfirm, onClose }) => {
  const { t, lang } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSeats));
  // La terza fila resta nascosta finche' non serve: la maggior parte delle
  // auto ha 5 posti e mostrarne 7 confonderebbe.
  const [thirdRow, setThirdRow] = useState(
    initialSeats.some(id => SEAT_LAYOUT.find(s => s.id === id)?.row === 3)
  );

  const blocchi = useMemo(
    () => SEAT_BLOCKS.filter(b => b.row !== 3 || thirdRow),
    [thirdRow],
  );
  const rowY = ROW_Y[thirdRow ? '7' : '5'];

  /** Il divano si prende o si lascia intero: e' un pezzo solo da lavare. */
  const toggle = (seats: string[]) => {
    setSelected(prev => {
      const next = new Set(prev);
      const tutti = seats.every(id => next.has(id));
      seats.forEach(id => (tutti ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(blocchi.flatMap(b => b.seats)));
  const clearAll = () => setSelected(new Set());

  const hideThirdRow = () => {
    // Togliendo la terza fila si tolgono anche le sue scelte, altrimenti
    // resterebbero nel totale senza piu' essere visibili sulla pianta.
    setSelected(prev => new Set([...prev].filter(id => SEAT_LAYOUT.find(s => s.id === id)?.row !== 3)));
    setThirdRow(false);
  };

  const count = selected.size;
  const total = count * unitPrice;
  const ordered = normalizeSeats([...selected]);

  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="min-h-full flex items-start sm:items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="bg-black/85 backdrop-blur-sm border border-gray-800 rounded-2xl w-full max-w-md p-6 my-4"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3 className="text-lg font-bold text-white leading-tight">
              {t({ it: 'Scegli i sedili', en: 'Choose the seats' })}
            </h3>
            <button
              onClick={onClose}
              aria-label={t({ it: 'Chiudi', en: 'Close' })}
              className="text-gray-400 hover:text-white text-2xl leading-none"
            >
              &times;
            </button>
          </div>
          <p className="text-gray-400 text-xs mb-4">
            {serviceName} — €{unitPrice.toFixed(2)} {t({ it: 'a sedile', en: 'per seat' })}
          </p>

          {/* Pianta abitacolo — vista dall'alto, muso in alto. */}
          <div className="relative mx-auto w-full max-w-[248px] select-none">
            <svg viewBox="0 0 100 100" className="w-full" role="presentation">
              {/* scocca */}
              <rect x="7" y="3" width="86" height="94" rx="28" ry="22"
                    fill="#151515" stroke="#6b6b6b" strokeWidth="1.6" />
              {/* cofano e parabrezza */}
              <path d="M21 17 Q50 7 79 17 L73 24 Q50 16 27 24 Z"
                    fill="#242424" stroke="#5a5a5a" strokeWidth="0.9" />
              {/* lunotto */}
              <path d="M23 93 Q50 99 77 93 L73 87 Q50 92 27 87 Z"
                    fill="#242424" stroke="#5a5a5a" strokeWidth="0.9" />
              {/* specchietti */}
              <rect x="3" y="26" width="5" height="7" rx="2" fill="#2c2c2c" stroke="#5a5a5a" strokeWidth="0.7" />
              <rect x="92" y="26" width="5" height="7" rx="2" fill="#2c2c2c" stroke="#5a5a5a" strokeWidth="0.7" />
              {/* Volante: dice subito da che lato si guarda la pianta. A 7
                  posti le file si stringono e non c'e' spazio sotto il
                  parabrezza, ma specchietti e lunotto bastano a orientarsi. */}
              {!thirdRow && (
                <>
                  <circle cx="33" cy="21" r="3.5" fill="none" stroke="#7a7a7a" strokeWidth="1.2" />
                  <line x1="29.5" y1="21" x2="36.5" y2="21" stroke="#7a7a7a" strokeWidth="1.2" />
                </>
              )}
              {/* separatori fila */}
              <line x1="13" y1={(rowY[1] + rowY[2]) / 2} x2="87" y2={(rowY[1] + rowY[2]) / 2}
                    stroke="#333" strokeWidth="0.9" />
              {thirdRow && (
                <line x1="13" y1={(rowY[2] + rowY[3]) / 2} x2="87" y2={(rowY[2] + rowY[3]) / 2}
                      stroke="#333" strokeWidth="0.9" />
              )}
            </svg>

            {blocchi.map(b => {
              const on = b.seats.every(id => selected.has(id));
              const divano = b.seats.length > 1;
              const etichetta = lang === 'en' ? b.labelEn : b.labelIt;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggle(b.seats)}
                  aria-pressed={on}
                  aria-label={etichetta}
                  title={etichetta}
                  style={{ left: `${b.x}%`, top: `${rowY[b.row]}%`, width: `${b.width}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 h-11 text-[10px] font-bold tracking-wide flex flex-col items-center justify-end pb-1 border-2 shadow-lg transition-colors ${
                    on
                      ? 'bg-white text-black border-white'
                      : 'bg-[#1c1c1c] text-gray-300 border-gray-500 hover:border-white hover:text-white'
                  }`}
                >
                  {/* schienale, per far leggere il blocco come una seduta */}
                  <span
                    className={`absolute top-1 left-1.5 right-1.5 h-1.5 rounded-full ${
                      on ? 'bg-black/25' : 'bg-white/20'
                    }`}
                  />
                  {/* Cuciture del divano: si vede che e' una panca da 3 (o da
                      2 in terza fila) anche se si sceglie tutta insieme. */}
                  {divano && b.seats.slice(1).map((_, i) => (
                    <span
                      key={i}
                      style={{ left: `${((i + 1) * 100) / b.seats.length}%` }}
                      className={`absolute top-3 bottom-1.5 w-px ${on ? 'bg-black/20' : 'bg-white/15'}`}
                    />
                  ))}
                  {lang === 'en' ? b.shortEn : b.shortIt}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={selectAll}
              className="text-[11px] px-3 py-1.5 border border-gray-700 text-gray-300 hover:border-white hover:text-white transition-colors">
              {t({ it: 'Tutti', en: 'All' })}
            </button>
            <button type="button" onClick={clearAll}
              className="text-[11px] px-3 py-1.5 border border-gray-700 text-gray-300 hover:border-white hover:text-white transition-colors">
              {t({ it: 'Nessuno', en: 'None' })}
            </button>
            <button type="button" onClick={() => (thirdRow ? hideThirdRow() : setThirdRow(true))}
              className="text-[11px] px-3 py-1.5 border border-gray-700 text-gray-300 hover:border-white hover:text-white transition-colors">
              {thirdRow
                ? t({ it: 'Togli terza fila', en: 'Remove third row' })
                : t({ it: '+ Terza fila', en: '+ Third row' })}
            </button>
          </div>

          {count > 0 && (
            <p className="mt-4 text-center text-gray-400 text-xs">
              {seatListLabel(ordered, lang, ' · ')}
            </p>
          )}

          <div className="mt-5 pt-4 border-t border-gray-800 flex items-center justify-between">
            <span className="text-gray-400 text-sm">
              {count} {count === 1 ? t({ it: 'sedile', en: 'seat' }) : t({ it: 'sedili', en: 'seats' })}
            </span>
            <span className="text-white font-bold text-xl">€{total.toFixed(2)}</span>
          </div>

          <button
            type="button"
            disabled={count === 0}
            onClick={() => onConfirm(ordered)}
            className={`mt-4 w-full py-3.5 font-bold transition-colors ${
              count === 0
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                : 'bg-white text-black hover:bg-gray-200'
            }`}
          >
            {count === 0
              ? t({ it: 'Seleziona almeno un sedile', en: 'Select at least one seat' })
              : t({ it: 'Aggiungi al carrello', en: 'Add to cart' })}
          </button>
        </motion.div>
      </div>
    </div>
  );
};

export default SeatPlanPicker;

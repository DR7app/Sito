/**
 * WbOverlaysUI.tsx — il disegno di popup e striscioni.
 *
 * Sta in un file suo perche' viene scaricato SOLO quando esiste davvero un
 * popup o uno striscione pubblicato: su un sito senza sovrapposizioni
 * questo codice non arriva nemmeno al browser.
 */

import React from 'react';
import type { WbButton, WbOverlay } from './wbSchema';
import { wbText, wbSafeUrl } from './wbSchema';

// ─── Popup e striscioni ─────────────────────────────────────────────────────
const chiaveVista = (id: string) => `dr7-wb-seen-${id}`;

function giaVisto(o: WbOverlay): boolean {
  const ore = o.targeting?.frequencyHours ?? 24;
  if (!ore) return false;
  try {
    const raw = localStorage.getItem(chiaveVista(o.id));
    if (!raw) return false;
    return Date.now() - Number(raw) < ore * 3600 * 1000;
  } catch {
    return false;
  }
}

function segnaVisto(o: WbOverlay): void {
  try { localStorage.setItem(chiaveVista(o.id), String(Date.now())); } catch { /* niente */ }
}

function schermoCorrente(): 'desktop' | 'tablet' | 'mobile' {
  if (typeof window === 'undefined') return 'desktop';
  if (window.innerWidth <= 640) return 'mobile';
  if (window.innerWidth <= 1024) return 'tablet';
  return 'desktop';
}

const PulsanteOverlay: React.FC<{ btn: WbButton; lang: 'it' | 'en'; onClose: () => void }> = ({ btn, lang, onClose }) => {
  const href = wbSafeUrl(btn.href);
  const label = wbText(btn.label, lang);
  if (!href || !label) return null;
  const esterno = /^https?:\/\//i.test(href);
  return (
    <a
      href={href}
      target={esterno ? '_blank' : undefined}
      rel={esterno ? 'noopener noreferrer' : undefined}
      onClick={onClose}
      className="inline-flex items-center justify-center px-6 py-3 rounded-lg font-semibold text-black bg-[#C9A96E] hover:bg-[#D4B896] transition-colors"
    >
      {label}
    </a>
  );
};

export const Popup: React.FC<{ o: WbOverlay; lang: 'it' | 'en' }> = ({ o, lang }) => {
  const [aperto, setAperto] = React.useState(false);
  const chiudi = React.useCallback(() => { setAperto(false); segnaVisto(o); }, [o]);

  React.useEffect(() => {
    if (giaVisto(o)) return;
    const schermi = o.targeting?.devices || ['desktop', 'tablet', 'mobile'];
    if (!schermi.includes(schermoCorrente())) return;

    const ritardo = (o.targeting?.delaySeconds ?? 3) * 1000;
    const scroll = o.targeting?.scrollPercent ?? 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onScroll: (() => void) | undefined;
    let onLeave: ((e: MouseEvent) => void) | undefined;

    const apri = () => setAperto(true);

    if (o.targeting?.exitIntent && schermoCorrente() === 'desktop') {
      onLeave = (e: MouseEvent) => { if (e.clientY <= 0) apri(); };
      document.addEventListener('mouseout', onLeave);
    } else if (scroll > 0) {
      onScroll = () => {
        const h = document.documentElement.scrollHeight - window.innerHeight;
        if (h > 0 && (window.scrollY / h) * 100 >= scroll) apri();
      };
      window.addEventListener('scroll', onScroll, { passive: true });
    } else {
      timer = setTimeout(apri, ritardo);
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (onScroll) window.removeEventListener('scroll', onScroll);
      if (onLeave) document.removeEventListener('mouseout', onLeave);
    };
  }, [o]);

  React.useEffect(() => {
    if (!aperto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') chiudi(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aperto, chiudi]);

  if (!aperto) return null;

  const c = o.config || {};
  const titolo = wbText(c.title, lang);
  const testo = wbText(c.text, lang);
  const immagine = wbSafeUrl(c.image?.url);
  const video = wbSafeUrl(c.video?.url);
  const centro = (c.position || 'center') === 'center';

  return (
    <div
      className={centro
        ? 'fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70'
        : `fixed z-[80] p-4 ${c.position === 'bottom-left' ? 'bottom-4 left-4' : 'bottom-4 right-4'}`}
      role="dialog"
      aria-modal={centro}
      aria-label={titolo || 'Messaggio'}
      onClick={centro ? chiudi : undefined}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: c.bgColor || '#101012', color: c.textColor || '#fff' }}
        onClick={(e) => e.stopPropagation()}
      >
        {c.dismissible !== false && (
          <button
            type="button"
            onClick={chiudi}
            aria-label="Chiudi"
            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
          >
            &times;
          </button>
        )}
        {video ? (
          <video src={video} autoPlay loop muted playsInline className="w-full aspect-video object-cover" />
        ) : immagine ? (
          <img src={immagine} alt={wbText(c.image?.alt, lang)} className="w-full object-cover" />
        ) : null}
        <div className="p-6 space-y-3">
          {titolo && <h2 className="text-xl font-bold">{titolo}</h2>}
          {testo && <p className="text-sm opacity-85 whitespace-pre-line">{testo}</p>}
          {(c.buttons || []).length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {(c.buttons || []).map((b) => <PulsanteOverlay key={b.id} btn={b} lang={lang} onClose={chiudi} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const Striscione: React.FC<{ o: WbOverlay; lang: 'it' | 'en' }> = ({ o, lang }) => {
  const [chiuso, setChiuso] = React.useState(() => giaVisto(o));
  if (chiuso) return null;
  const c = o.config || {};
  const titolo = wbText(c.title, lang);
  const testo = wbText(c.text, lang);
  const inFondo = c.position === 'bottom';
  const schermi = o.targeting?.devices || ['desktop', 'tablet', 'mobile'];
  if (!schermi.includes(schermoCorrente())) return null;

  return (
    <div
      className={`fixed left-0 right-0 z-[70] ${inFondo ? 'bottom-0' : 'top-0'}`}
      style={{ background: c.bgColor || '#C9A96E', color: c.textColor || '#000' }}
      role="region"
      aria-label={titolo || 'Comunicazione'}
    >
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-center gap-3 text-center">
        <div>
          {titolo && <span className="font-semibold text-sm">{titolo}</span>}
          {testo && <span className="text-sm opacity-90 ml-2">{testo}</span>}
        </div>
        {(c.buttons || []).map((b) => (
          <PulsanteOverlay key={b.id} btn={b} lang={lang} onClose={() => undefined} />
        ))}
        {c.dismissible !== false && (
          <button
            type="button"
            onClick={() => { setChiuso(true); segnaVisto(o); }}
            aria-label="Chiudi"
            className="ml-2 w-7 h-7 rounded-full hover:bg-black/10"
          >
            &times;
          </button>
        )}
      </div>
    </div>
  );
};


export default Popup;

/**
 * WbHeaderFooter.tsx — header e footer disegnati dal Website Builder.
 *
 * Entrano in scena SOLO quando l'operatore accende gli interruttori in
 * Website Builder > Impostazioni globali. Finche' restano spenti il sito
 * usa `components/layout/Header.tsx` e `Footer.tsx` di sempre, e questo
 * file non viene nemmeno scaricato dal browser.
 *
 * Cosa resta identico al comportamento di prima, di proposito:
 *  · il cambio lingua e l'accesso cliente restano dov'erano, perche' sono
 *    funzioni del sito e non contenuto editoriale;
 *  · i collegamenti interni non ricaricano la pagina;
 *  · il menu su telefono si chiude cambiando pagina.
 */

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { WbFooterConfig, WbHeaderConfig, WbMenuItem, WbThemeTokens } from './wbSchema';
import { wbText, wbSafeUrl } from './wbSchema';
import { useTranslation } from '../../hooks/useTranslation';
import { useAuth } from '../../hooks/useAuth';

type Lang = 'it' | 'en';

const Voce: React.FC<{
  item: WbMenuItem;
  lang: Lang;
  className?: string;
  style?: React.CSSProperties;
  onNavigate?: () => void;
}> = ({ item, lang, className, style, onNavigate }) => {
  const label = wbText(item.label, lang);
  const href = wbSafeUrl(item.href);
  if (!label) return null;
  if (!href) return <span className={className} style={style}>{label}</span>;
  if (/^https?:\/\//i.test(href) || item.target === '_blank') {
    return (
      <a href={href} className={className} style={style} target={item.target || '_blank'} rel="noopener noreferrer" onClick={onNavigate}>
        {label}
      </a>
    );
  }
  if (href.startsWith('#')) {
    return <a href={href} className={className} style={style} onClick={onNavigate}>{label}</a>;
  }
  return <Link to={href} className={className} style={style} onClick={onNavigate}>{label}</Link>;
};

// ─── Header ─────────────────────────────────────────────────────────────────
export const WbHeader: React.FC<{
  config: WbHeaderConfig;
  tokens: WbThemeTokens | null;
}> = ({ config, tokens }) => {
  const { lang, setLanguage } = useTranslation();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [aperto, setAperto] = React.useState(false);
  const [tendina, setTendina] = React.useState<string | null>(null);
  const [scrollato, setScrollato] = React.useState(false);
  const s = config.settings || {};
  const l = (lang === 'en' ? 'en' : 'it') as Lang;

  // Cambiando pagina il pannello si chiude: altrimenti resta aperto sopra
  // la pagina nuova.
  React.useEffect(() => { setAperto(false); setTendina(null); }, [pathname]);

  React.useEffect(() => {
    if (!s.transparent) return;
    const onScroll = () => setScrollato(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [s.transparent]);

  const voci = (config.items || []).filter((i) => i.visible !== false);
  const sfondo = s.transparent && !scrollato && !aperto
    ? 'transparent'
    : (s.bgColor || tokens?.colors?.bg || '#000');
  const colore = s.textColor || tokens?.colors?.text || '#fff';
  const altezza = s.height || 76;
  const logo = wbSafeUrl(s.logo);

  return (
    <header
      className={`${s.sticky === false ? 'relative' : 'sticky top-0'} z-50 w-full transition-colors duration-300`}
      style={{ background: sfondo, color: colore }}
    >
      <div
        className="max-w-7xl mx-auto px-4 flex items-center gap-6"
        style={{ height: altezza, justifyContent: s.align === 'center' ? 'center' : 'space-between' }}
      >
        <Link to="/" className="flex items-center shrink-0" aria-label="Home">
          {logo
            ? <img src={logo} alt="DR7" style={{ height: s.logoHeight || 34, width: 'auto' }} className="hidden md:block" />
            : <span className="font-bold tracking-widest">DR7</span>}
          {logo && <img src={logo} alt="DR7" style={{ height: s.logoHeightMobile || 26, width: 'auto' }} className="md:hidden" />}
        </Link>

        {/* Menu su schermo grande */}
        <nav className="hidden lg:flex items-center gap-6" aria-label="Menu principale">
          {voci.map((v) => {
            if (v.kind === 'group') {
              const figli = (v.children || []).filter((c) => c.visible !== false);
              const apertaQui = tendina === v.id;
              return (
                <div
                  key={v.id}
                  className="relative"
                  onMouseEnter={() => setTendina(v.id)}
                  onMouseLeave={() => setTendina(null)}
                >
                  <button
                    type="button"
                    aria-expanded={apertaQui}
                    aria-haspopup="true"
                    onClick={() => setTendina(apertaQui ? null : v.id)}
                    className="text-sm tracking-wide uppercase opacity-90 hover:opacity-100"
                  >
                    {wbText(v.label, l)}
                  </button>
                  {apertaQui && figli.length > 0 && (
                    <div
                      className={`absolute left-0 top-full pt-3 ${v.mega ? 'w-[520px]' : 'w-56'}`}
                    >
                      <div
                        className={`rounded-xl border p-3 shadow-2xl ${v.mega ? 'grid grid-cols-2 gap-1' : 'flex flex-col'}`}
                        style={{
                          background: tokens?.colors?.surface || '#0B0B0C',
                          borderColor: tokens?.colors?.border || '#2C2C2E',
                        }}
                      >
                        {figli.map((c) => (
                          <Voce
                            key={c.id}
                            item={c}
                            lang={l}
                            className="px-3 py-2 rounded-lg text-sm hover:bg-white/5"
                            onNavigate={() => setTendina(null)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            }
            if (v.kind === 'cta') {
              // Il pulsante in evidenza prende i colori del pulsante
              // principale del tema: cambiandoli nel Design System cambia
              // anche questa voce, senza toccare il menu.
              const b = tokens?.buttons?.primary;
              return (
                <Voce
                  key={v.id}
                  item={v}
                  lang={l}
                  className="inline-block px-5 py-2 text-sm font-semibold rounded-lg"
                  style={{
                    background: b?.bg || tokens?.colors?.primary || '#C9A96E',
                    color: b?.text || '#000',
                    borderRadius: b?.radius ?? 8,
                  }}
                />
              );
            }
            return (
              <Voce key={v.id} item={v} lang={l} className="text-sm tracking-wide uppercase opacity-90 hover:opacity-100" />
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          {s.showLanguage !== false && (
            <button
              type="button"
              onClick={() => setLanguage(lang === 'it' ? 'en' : 'it')}
              className="text-xs font-semibold uppercase opacity-80 hover:opacity-100"
              aria-label={lang === 'it' ? 'Switch to English' : 'Passa all italiano'}
            >
              {lang === 'it' ? 'EN' : 'IT'}
            </button>
          )}
          {s.showLogin !== false && (
            <Link to={user ? '/account' : '/signin'} className="text-xs font-semibold uppercase opacity-80 hover:opacity-100">
              {user ? (lang === 'it' ? 'Account' : 'Account') : (lang === 'it' ? 'Accedi' : 'Sign in')}
            </Link>
          )}
          <button
            type="button"
            className="lg:hidden p-2"
            aria-expanded={aperto}
            aria-label={aperto ? 'Chiudi il menu' : 'Apri il menu'}
            onClick={() => setAperto(!aperto)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              {aperto ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {/* Menu su telefono */}
      {aperto && (
        <div
          className={`lg:hidden border-t ${s.mobileMode === 'fullscreen' ? 'fixed inset-0 top-[var(--wb-h)] overflow-y-auto' : ''}`}
          style={{
            background: s.bgColor || tokens?.colors?.bg || '#000',
            borderColor: tokens?.colors?.border || '#2C2C2E',
            ['--wb-h' as string]: `${altezza}px`,
          }}
        >
          <nav className="px-4 py-3 flex flex-col gap-1" aria-label="Menu">
            {voci.map((v) => (
              <div key={v.id}>
                {v.kind === 'group' ? (
                  <>
                    <button
                      type="button"
                      className="w-full text-left py-2 text-sm uppercase tracking-wide flex items-center justify-between"
                      aria-expanded={tendina === v.id}
                      onClick={() => setTendina(tendina === v.id ? null : v.id)}
                    >
                      {wbText(v.label, l)}
                      <span aria-hidden="true">{tendina === v.id ? '−' : '+'}</span>
                    </button>
                    {tendina === v.id && (
                      <div className="pl-3 flex flex-col">
                        {(v.children || []).filter((c) => c.visible !== false).map((c) => (
                          <Voce key={c.id} item={c} lang={l} className="py-2 text-sm opacity-85" onNavigate={() => setAperto(false)} />
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <Voce item={v} lang={l} className="block py-2 text-sm uppercase tracking-wide" onNavigate={() => setAperto(false)} />
                )}
              </div>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
};

// ─── Footer ─────────────────────────────────────────────────────────────────
export const WbFooter: React.FC<{
  config: WbFooterConfig;
  tokens: WbThemeTokens | null;
  impostazioni: Record<string, unknown>;
}> = ({ config, tokens, impostazioni }) => {
  const { lang } = useTranslation();
  const l = (lang === 'en' ? 'en' : 'it') as Lang;
  const s = config.settings || {};
  const logo = wbSafeUrl(s.logo);
  const social = Array.isArray(impostazioni.social)
    ? (impostazioni.social as { label: string; url: string }[])
    : [];

  return (
    <footer
      style={{
        background: s.bgColor || tokens?.colors?.surface || '#0B0B0C',
        color: s.textColor || tokens?.colors?.text || '#fff',
        borderTop: `1px solid ${tokens?.colors?.border || '#2C2C2E'}`,
      }}
    >
      <div className="max-w-7xl mx-auto px-4 py-12 grid gap-10 md:grid-cols-[1.4fr_repeat(auto-fit,minmax(140px,1fr))]">
        <div>
          {logo
            ? <img src={logo} alt="DR7" style={{ height: s.logoHeight || 40, width: 'auto' }} />
            : <span className="font-bold tracking-widest text-lg">DR7</span>}
          {wbText(s.text, l) && (
            <p className="mt-3 text-sm opacity-70 max-w-sm whitespace-pre-line">{wbText(s.text, l)}</p>
          )}
          {(impostazioni.address as string) && (
            <p className="mt-3 text-sm opacity-70">{impostazioni.address as string}</p>
          )}
          <div className="mt-3 flex flex-col gap-1 text-sm opacity-70">
            {(impostazioni.email as string) && (
              <a href={`mailto:${impostazioni.email}`} className="hover:opacity-100">{impostazioni.email as string}</a>
            )}
            {(impostazioni.phone as string) && (
              <a href={`tel:${String(impostazioni.phone).replace(/\D/g, '')}`} className="hover:opacity-100">{impostazioni.phone as string}</a>
            )}
          </div>
          {s.showSocial !== false && social.length > 0 && (
            <div className="mt-4 flex gap-3">
              {social.filter((x) => wbSafeUrl(x.url)).map((x) => (
                <a
                  key={x.label}
                  href={wbSafeUrl(x.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-full border flex items-center justify-center text-xs uppercase"
                  style={{ borderColor: tokens?.colors?.border || '#2C2C2E' }}
                  aria-label={x.label}
                >
                  {(x.label || '·')[0]}
                </a>
              ))}
            </div>
          )}
        </div>

        {(config.columns || []).map((col) => (
          <nav key={col.id} aria-label={wbText(col.title, l)}>
            <p className="text-xs uppercase tracking-widest opacity-60 mb-3">{wbText(col.title, l)}</p>
            <div className="flex flex-col gap-2">
              {(col.items || []).filter((i) => i.visible !== false).map((i) => (
                <Voce key={i.id} item={i} lang={l} className="text-sm opacity-80 hover:opacity-100" />
              ))}
            </div>
          </nav>
        ))}
      </div>

      <div
        className="px-4 py-4 text-center text-xs opacity-60"
        style={{ borderTop: `1px solid ${tokens?.colors?.border || '#2C2C2E'}` }}
      >
        {wbText(s.copyright, l) || (impostazioni.copyright as string) || ''}
      </div>
    </footer>
  );
};

export default WbHeader;

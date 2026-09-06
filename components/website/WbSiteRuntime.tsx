/**
 * WbSiteRuntime.tsx — il collegamento tra il sito e il Website Builder.
 *
 * Tre pezzi, tutti pensati per NON cambiare niente finche' qualcuno non
 * lo decide dal gestionale:
 *
 *   WbRotta         serve una pagina del builder su un indirizzo nuovo,
 *                   e non fa niente se quell'indirizzo non esiste;
 *   WbOppure        avvolge una pagina React esistente: la sostituisce
 *                   solo se nel builder c'e' una pagina pubblicata con
 *                   l'interruttore "prende il posto" acceso;
 *   WbSovrapposti   popup e striscioni pubblicati;
 *   WbIntegrazioni  script di terze parti, subordinati al consenso
 *                   cookie gia' in uso sul sito.
 *
 * L'istantanea si carica una volta per sessione (utils/websiteBuilder).
 */

import React from 'react';
import { useLocation } from 'react-router-dom';
import {
  caricaSitoBuilder, paginaPerPercorso, overlayAttivi, scriptAttivi,
  usaHeaderBuilder, usaFooterBuilder, impostazioniSito,
  type WbSnapshot, type WbSnapshotPage,
} from '../../utils/websiteBuilder';
import { useTranslation } from '../../hooks/useTranslation';
// Il renderer completo (blocchi, tema, dati del gestionale) pesa: si
// scarica solo quando una pagina del builder viene davvero servita.
const WbSitePage = React.lazy(() => import('./WbSitePage'));
// Header e footer del builder: scaricati solo se gli interruttori sono
// accesi. Su un sito che usa quelli originali, questo codice non arriva.
const WbHeaderImpl = React.lazy(() => import('./WbHeaderFooter').then((m) => ({ default: m.WbHeader })));
const WbFooterImpl = React.lazy(() => import('./WbHeaderFooter').then((m) => ({ default: m.WbFooter })));

// ─── Istantanea condivisa ───────────────────────────────────────────────────
export function useSitoBuilder(): { snapshot: WbSnapshot | null; pronto: boolean } {
  const [snapshot, setSnapshot] = React.useState<WbSnapshot | null>(null);
  const [pronto, setPronto] = React.useState(false);
  React.useEffect(() => {
    let vivo = true;
    void caricaSitoBuilder().then((s) => {
      if (!vivo) return;
      setSnapshot(s);
      setPronto(true);
    });
    return () => { vivo = false; };
  }, []);
  return { snapshot, pronto };
}

// ─── Rotta nuova ────────────────────────────────────────────────────────────
/**
 * Indirizzi che il sito non conosce. Se il builder ha una pagina
 * pubblicata li' sopra la disegna, altrimenti non renderizza niente e la
 * situazione resta identica a prima (nessuna pagina 404 nuova).
 */
export const WbRotta: React.FC = () => {
  const { pathname } = useLocation();
  const { snapshot, pronto } = useSitoBuilder();
  if (!pronto) return null;
  const page = paginaPerPercorso(snapshot, pathname, false);
  if (!page) return null;
  return (
    <React.Suspense fallback={null}>
      <WbSitePage page={page} snapshot={snapshot} />
    </React.Suspense>
  );
};

// ─── Sostituzione di una pagina esistente ───────────────────────────────────
/**
 * Avvolge una pagina React del sito.
 *
 * Finche' nel builder non c'e' una pagina pubblicata per questo indirizzo
 * CON `overrides_route` acceso, mostra i figli, cioe' la pagina di sempre.
 * E' la garanzia che l'introduzione del builder non tocchi il sito.
 */
export const WbOppure: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const { snapshot, pronto } = useSitoBuilder();
  const page: WbSnapshotPage | null = pronto ? paginaPerPercorso(snapshot, pathname, true) : null;
  if (page) {
    return (
      <React.Suspense fallback={null}>
        <WbSitePage page={page} snapshot={snapshot} />
      </React.Suspense>
    );
  }
  return <>{children}</>;
};

// ─── Header e footer ────────────────────────────────────────────────────────
/**
 * Avvolge l'header (o il footer) originale del sito. Lo sostituisce solo
 * quando l'interruttore in Impostazioni globali e' acceso E c'e' davvero
 * una navigazione configurata: se manca una delle due condizioni resta
 * quello di sempre, senza che nessuno se ne accorga.
 */
export const WbHeaderOppure: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { snapshot, pronto } = useSitoBuilder();
  if (!pronto || !usaHeaderBuilder(snapshot)) return <>{children}</>;
  return (
    <React.Suspense fallback={<>{children}</>}>
      <WbHeaderImpl config={snapshot!.navigation.header!} tokens={snapshot!.theme?.tokens || null} />
    </React.Suspense>
  );
};

export const WbFooterOppure: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { snapshot, pronto } = useSitoBuilder();
  if (!pronto || !usaFooterBuilder(snapshot)) return <>{children}</>;
  return (
    <React.Suspense fallback={<>{children}</>}>
      <WbFooterImpl
        config={snapshot!.navigation.footer!}
        tokens={snapshot!.theme?.tokens || null}
        impostazioni={impostazioniSito(snapshot)}
      />
    </React.Suspense>
  );
};

// ─── Popup e striscioni ─────────────────────────────────────────────────────
// Il disegno vive in WbOverlaysUI, caricato solo se c'e' qualcosa da
// mostrare: un sito senza popup non scarica quel codice.
const Popup = React.lazy(() => import('./WbOverlaysUI').then((m) => ({ default: m.Popup })));
const Striscione = React.lazy(() => import('./WbOverlaysUI').then((m) => ({ default: m.Striscione })));

export const WbSovrapposti: React.FC = () => {
  const { pathname } = useLocation();
  const { lang } = useTranslation();
  const { snapshot, pronto } = useSitoBuilder();
  if (!pronto || !snapshot) return null;
  const l = (lang === 'en' ? 'en' : 'it') as 'it' | 'en';
  const popup = overlayAttivi(snapshot, 'popup', pathname);
  const banner = overlayAttivi(snapshot, 'banner', pathname);
  if (!banner.length && !popup.length) return null;
  return (
    <React.Suspense fallback={null}>
      {banner.slice(0, 1).map((o) => <Striscione key={o.id} o={o} lang={l} />)}
      {popup.slice(0, 1).map((o) => <Popup key={o.id} o={o} lang={l} />)}
    </React.Suspense>
  );
};

// ─── Integrazioni di terze parti ────────────────────────────────────────────
/**
 * Gli script configurati nel gestionale entrano nella pagina solo quando
 * il visitatore ha accettato i cookie (`dr7-cookie-consent`), tranne
 * quelli dichiarati come tecnici. Il consenso esistente resta l'autorita':
 * il builder non lo aggira.
 */
export const WbIntegrazioni: React.FC = () => {
  const { snapshot, pronto } = useSitoBuilder();
  const [consenso, setConsenso] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    const leggi = () => {
      try {
        const raw = localStorage.getItem('dr7-cookie-consent');
        setConsenso(raw === null ? null : raw === 'true');
      } catch {
        setConsenso(false);
      }
    };
    leggi();
    // Il banner scrive in localStorage senza emettere eventi: si controlla
    // finche' la scelta non c'e'. Appena c'e', si smette.
    const id = setInterval(leggi, 1200);
    window.addEventListener('storage', leggi);
    return () => { clearInterval(id); window.removeEventListener('storage', leggi); };
  }, []);

  const inseriti = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    if (!pronto || !snapshot) return;
    const script = scriptAttivi(snapshot);
    for (const s of script) {
      if (inseriti.current.has(s.id)) continue;
      const serve = s.consent_category !== 'necessary';
      if (serve && consenso !== true) continue;

      const contenitore = document.createElement('div');
      contenitore.innerHTML = s.code;
      const bersaglio = s.placement === 'head' ? document.head : document.body;

      // Un tag <script> inserito con innerHTML non viene eseguito dal
      // browser: va ricreato. Gli altri nodi (meta, noscript, div) passano.
      Array.from(nodiDi(contenitore)).forEach((nodo) => {
        if (nodo instanceof HTMLScriptElement) {
          const nuovo = document.createElement('script');
          for (const attr of Array.from(nodo.attributes)) nuovo.setAttribute(attr.name, attr.value);
          nuovo.text = nodo.text;
          nuovo.setAttribute('data-wb-script', s.id);
          bersaglio.appendChild(nuovo);
        } else if (nodo instanceof HTMLElement) {
          nodo.setAttribute('data-wb-script', s.id);
          bersaglio.appendChild(nodo);
        }
      });
      inseriti.current.add(s.id);
    }
  }, [pronto, snapshot, consenso]);

  return null;
};

/** Copia statica dei nodi: `childNodes` cambia mentre li si sposta. */
function nodiDi(el: HTMLElement): ChildNode[] {
  return Array.from(el.childNodes);
}

export default WbRotta;

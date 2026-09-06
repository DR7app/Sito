/**
 * WbSitePage.tsx — disegna una pagina del Website Builder sul sito.
 *
 * E' l'unico punto in cui la configurazione pubblicata diventa HTML. Usa
 * lo STESSO renderer del gestionale (WbBlockRenderer, file condiviso), per
 * cui quello che l'operatore vede in anteprima e' esattamente questo.
 *
 * Prestazioni: i dati veri del gestionale (veicoli, servizi, categorie)
 * vengono risolti una volta sola per pagina, con una lettura per
 * collezione, e solo per i blocchi che li chiedono davvero. Le pagine
 * senza blocchi dinamici non fanno nemmeno una query in piu'.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '../../supabaseClient';
import { useTranslation } from '../../hooks/useTranslation';
import type { WbBlock, WbItem, WbTheme, WbSnapshotPage, WbSnapshot } from './wbSchema';
import { wbText } from './wbSchema';
import { WbBlocks, WbRenderContext, type WbLinkComponent } from './WbBlockRenderer';
import { wbThemeVars, wbPageCss, WB_ANIMATION_CSS } from './wbStyle';
import { wbResolveDynamic, wbPromotionItems } from './wbData';

/** I collegamenti interni restano dentro l'app: niente ricarica di pagina. */
const RouterLink: WbLinkComponent = ({ to, children, className, style, target, rel, ...rest }) => {
  const esterno = /^(https?:)?\/\//i.test(to) || to.startsWith('mailto:') || to.startsWith('tel:');
  if (esterno || target === '_blank') {
    return (
      <a href={to} className={className} style={style} target={target || '_blank'} rel={rel || 'noopener noreferrer'} {...rest}>
        {children}
      </a>
    );
  }
  if (to.startsWith('#')) {
    return <a href={to} className={className} style={style} {...rest}>{children}</a>;
  }
  return <Link to={to} className={className} style={style} {...rest}>{children}</Link>;
};

/**
 * I caratteri del tema che non sono gia' nel sito vengono caricati solo
 * se davvero usati, con `display=swap`: il testo si legge subito.
 */
const FONT_GOOGLE: Record<string, string> = {
  "'Inter', sans-serif": 'Inter:wght@300;400;500;600;700;800',
  "'Montserrat', sans-serif": 'Montserrat:wght@300;400;500;600;700;800',
  "'Poppins', sans-serif": 'Poppins:wght@300;400;500;600;700',
  "'Cormorant Garamond', serif": 'Cormorant+Garamond:wght@300;400;500;600;700',
  "'DM Serif Display', serif": 'DM+Serif+Display',
  "'Space Grotesk', sans-serif": 'Space+Grotesk:wght@300;400;500;600;700',
};

function urlFontDelTema(theme: WbTheme | null): string | null {
  if (!theme) return null;
  const usati = [
    theme.tokens?.typography?.fontPrimary,
    theme.tokens?.typography?.fontSecondary,
    theme.tokens?.typography?.fontAccent,
  ];
  const famiglie = [...new Set(usati.map((f) => (f ? FONT_GOOGLE[f] : undefined)).filter(Boolean))] as string[];
  if (!famiglie.length) return null;
  return `https://fonts.googleapis.com/css2?${famiglie.map((f) => `family=${f}`).join('&')}&display=swap`;
}

export interface WbSitePageProps {
  page: WbSnapshotPage;
  snapshot: WbSnapshot | null;
}

const WbSitePage: React.FC<WbSitePageProps> = ({ page, snapshot }) => {
  const { lang } = useTranslation();
  const theme = snapshot?.theme || null;
  const sezioni: WbBlock[] = React.useMemo(
    () => (Array.isArray(page.content?.sections) ? page.content.sections : []),
    [page],
  );

  const [dynamic, setDynamic] = React.useState<Record<string, WbItem[]>>({});
  const [dynamicLoading, setDynamicLoading] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    let vivo = true;
    const daRisolvere = sezioni.filter((b) => b.dataSource && b.dataSource.kind !== 'manual');
    if (!daRisolvere.length) { setDynamic({}); setDynamicLoading({}); return; }
    setDynamicLoading(Object.fromEntries(daRisolvere.map((b) => [b.id, true])));
    void wbResolveDynamic(supabase as never, sezioni, {
      lang: lang === 'en' ? 'en' : 'it',
      promotions: wbPromotionItems(snapshot?.overlays || []),
    }).then((res) => {
      if (!vivo) return;
      setDynamic(res);
      setDynamicLoading({});
    });
    return () => { vivo = false; };
  }, [sezioni, lang, snapshot]);

  const css = React.useMemo(() => wbPageCss(sezioni, theme?.tokens || null), [sezioni, theme]);
  const vars = React.useMemo(() => wbThemeVars(theme?.tokens || null) as React.CSSProperties, [theme]);
  const fontUrl = React.useMemo(() => urlFontDelTema(theme), [theme]);

  const inviaModulo = React.useCallback(async (block: WbBlock, values: Record<string, string>) => {
    const risposta = await fetch('/.netlify/functions/wb-form-submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageSlug: page.slug,
        blockId: block.id,
        formName: block.name || block.type,
        destinationEmail: (block.settings?.destinationEmail as string) || undefined,
        values,
      }),
    });
    if (!risposta.ok) {
      const testo = await risposta.text().catch(() => '');
      throw new Error(testo || 'Invio non riuscito. Riprova tra poco.');
    }
  }, [page.slug]);

  const ctx = React.useMemo(() => ({
    lang: (lang === 'en' ? 'en' : 'it') as 'it' | 'en',
    device: 'desktop' as const,
    tokens: theme?.tokens || null,
    Link: RouterLink,
    dynamic,
    dynamicLoading,
    onFormSubmit: inviaModulo,
  }), [lang, theme, dynamic, dynamicLoading, inviaModulo]);

  // ─── SEO ────────────────────────────────────────────────────────────────
  const dominio = snapshot?.site?.domain || 'dr7.app';
  const seo = page.seo || {};
  const titolo = wbText(seo.title, lang === 'en' ? 'en' : 'it') || page.title;
  const descrizione = wbText(seo.description, lang === 'en' ? 'en' : 'it');
  const canonical = seo.canonical || `https://${dominio}${page.slug === '/' ? '' : page.slug}`;
  const robots = `${seo.robotsIndex === false ? 'noindex' : 'index'},${seo.robotsFollow === false ? 'nofollow' : 'follow'}`;
  const ogTitolo = wbText(seo.ogTitle, lang === 'en' ? 'en' : 'it') || titolo;
  const ogDescr = wbText(seo.ogDescription, lang === 'en' ? 'en' : 'it') || descrizione;

  return (
    <>
      <Helmet>
        <title>{titolo}</title>
        {descrizione && <meta name="description" content={descrizione} />}
        <meta name="robots" content={robots} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonical} />
        <meta property="og:title" content={ogTitolo} />
        {ogDescr && <meta property="og:description" content={ogDescr} />}
        {seo.ogImage && <meta property="og:image" content={seo.ogImage} />}
        <meta name="twitter:card" content={seo.twitterCard || 'summary_large_image'} />
        <meta name="twitter:title" content={ogTitolo} />
        {ogDescr && <meta name="twitter:description" content={ogDescr} />}
        {seo.ogImage && <meta name="twitter:image" content={seo.ogImage} />}
        {fontUrl && <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />}
        {fontUrl && <link rel="stylesheet" href={fontUrl} />}
        {seo.structuredData && (
          <script type="application/ld+json">{seo.structuredData}</script>
        )}
      </Helmet>

      <div
        style={{
          ...vars,
          background: page.content?.settings?.bgColor || theme?.tokens?.colors?.bg,
          color: theme?.tokens?.colors?.text,
          fontFamily: theme?.tokens?.typography?.fontPrimary,
        }}
      >
        <style dangerouslySetInnerHTML={{ __html: WB_ANIMATION_CSS }} />
        {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
        {theme?.tokens?.customCss ? <style dangerouslySetInnerHTML={{ __html: theme.tokens.customCss }} /> : null}
        {page.content?.settings?.customCss ? <style dangerouslySetInnerHTML={{ __html: page.content.settings.customCss }} /> : null}
        <WbRenderContext.Provider value={ctx}>
          <WbBlocks blocks={sezioni} />
        </WbRenderContext.Provider>
      </div>
    </>
  );
};

export default WbSitePage;

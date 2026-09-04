import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ReviewsSection from '../../sections/ReviewsSection';
import { useTranslation } from '../../hooks/useTranslation';
import {
  bilingual,
  getFooterCopy,
  getAspettoCopy,
  DEFAULT_ASPETTO,
  type AspettoCopy,
  type FooterCopy,
  type FooterLink as FooterLinkData,
  type FooterSocialIcon,
} from '../../utils/siteCopy';

// Inline SVG paths so admin can pick a known icon by name without bundling
// any external icon set.
const SOCIAL_ICON_PATH: Record<FooterSocialIcon, string> = {
  instagram: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z',
  tiktok: 'M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z',
  facebook: 'M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z',
  linkedin: 'M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z',
  youtube: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  x: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
};

const SocialIcon: React.FC<{ icon: FooterSocialIcon; className?: string }> = ({ icon, className }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24"><path d={SOCIAL_ICON_PATH[icon]} /></svg>
);

function isExternal(link: FooterLinkData): boolean {
  if (link.external) return true;
  return /^https?:\/\//i.test(link.to);
}

const LinkRow: React.FC<{ links: FooterLinkData[]; lang: 'it' | 'en'; bold?: boolean }> = ({ links, lang, bold }) => (
  <ul className="flex flex-wrap justify-center gap-x-10 gap-y-3">
    {links.map((l) => {
      const label = lang === 'it' ? l.label_it : l.label_en;
      if (isExternal(l)) {
        return (
          <li key={l.id}>
            <a
              href={l.to}
              target="_blank"
              rel="noopener noreferrer"
              className={`link-reveal hover:text-white transition-colors duration-500 ease-editorial ${bold ? 'text-gray-300' : ''}`}
            >{label}</a>
          </li>
        );
      }
      return (
        <li key={l.id}>
          <Link to={l.to} className={`link-reveal hover:text-white transition-colors duration-500 ease-editorial ${bold ? 'text-gray-300' : ''}`}>{label}</Link>
        </li>
      );
    })}
  </ul>
);

const Footer: React.FC = () => {
  const { lang, t } = useTranslation();
  const [copy, setCopy] = useState<FooterCopy | null>(null);
  // Stesso logo della barra in alto (admin > Sito > Aspetto & Funzionalita).
  const [aspetto, setAspetto] = useState<Required<AspettoCopy>>(DEFAULT_ASPETTO);

  useEffect(() => {
    let cancelled = false;
    getFooterCopy().then((c) => { if (!cancelled) setCopy(c); });
    getAspettoCopy().then((a) => { if (!cancelled) setAspetto(a); });
    return () => { cancelled = true; };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!copy) {
    // Render a quiet shell while config loads. Avoids a layout flash.
    return <footer className="bg-black border-t border-white/10" />;
  }

  return (
    <footer className="bg-black border-t border-white/10 text-gray-500">
      <div className="container mx-auto px-6 py-20 md:py-28">
        {/* Top Section: Social */}
        <div className="mb-16 pb-16 border-b border-white/[0.07] text-center">
          <h3 className="font-serif text-3xl md:text-4xl font-normal text-white mb-4 tracking-[-0.012em]">{bilingual(copy, 'network_title', lang)}</h3>
          <p className="text-sm mb-8 max-w-xl mx-auto">{lang === 'it' ? copy.network_text_it : copy.network_text_en}</p>
          <div className="flex justify-center gap-7">
            {copy.social_links.map((s) => (
              <a
                key={s.id}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="text-gray-500 hover:text-white transition-colors duration-500 ease-editorial"
              >
                <SocialIcon icon={s.icon} className="w-5 h-5" />
              </a>
            ))}
          </div>
        </div>

        {/* Reviews Section */}
        <div className="mb-16 pb-16 border-b border-white/[0.07]">
          <div className="text-center mb-10">
            <h3 className="font-serif text-3xl md:text-4xl font-normal text-white mb-4 tracking-[-0.012em]">{bilingual(copy, 'reviews_title', lang)}</h3>
            <p className="text-sm text-gray-500 max-w-xl mx-auto">{lang === 'it' ? copy.reviews_text_it : copy.reviews_text_en}</p>
          </div>
          <ReviewsSection />
        </div>

        {/* Contact Section */}
        <div className="text-center mb-16 pb-16 border-b border-white/[0.07]">
          <h3 className="font-serif text-3xl md:text-4xl font-normal text-white mb-8 tracking-[-0.012em]">{t({ en: 'Contact', it: 'Contatti' })}</h3>
          <a
            href={copy.contact_whatsapp_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 text-lg text-gray-300 hover:text-white transition-colors duration-500 ease-editorial group mb-6"
            aria-label={t({ it: "Contattaci su WhatsApp", en: "Contact us on WhatsApp" })}
          >
            <svg className="w-6 h-6 text-green-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            <span className="t-meta text-base">{copy.contact_whatsapp_number}</span>
          </a>

          <div className="mt-10 text-[13px] leading-relaxed text-gray-500 max-w-2xl mx-auto space-y-1.5 px-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-white">{copy.contact_company_name}</p>
            <p className="break-words">{lang === 'it' ? copy.contact_legal_address_it : copy.contact_legal_address_en}</p>
            {(lang === 'it' ? copy.contact_operative_address_it : copy.contact_operative_address_en) && (
              <p className="break-words">{lang === 'it' ? copy.contact_operative_address_it : copy.contact_operative_address_en}</p>
            )}
            <p className="break-words">{lang === 'it' ? copy.contact_capitale_sociale_it : copy.contact_capitale_sociale_en}</p>
            <p className="break-words">{copy.contact_piva}</p>
            <p className="text-xs mt-2 break-words whitespace-pre-line">
              {lang === 'it' ? copy.contact_disclaimer_it : copy.contact_disclaimer_en}
            </p>
          </div>
        </div>

        {/* Division Links */}
        <div className="flex flex-col items-center justify-center gap-4 text-[11px] uppercase tracking-[0.18em] my-10">
          <LinkRow links={copy.division_links} lang={lang} bold />
        </div>

        {/* Corporate & Legal Links */}
        <div className="flex flex-col items-center justify-center gap-4 text-[12px] my-10">
          <LinkRow links={copy.corporate_links} lang={lang} />
          <LinkRow links={copy.legal_links} lang={lang} />
        </div>

        {/* Bottom Section: Copyright */}
        <div className="mt-16 pt-10 text-center border-t border-white/[0.07]">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <Link to="/" className="inline-block">
              <img src={aspetto.logo_url} alt="DR7 Cagliari Logo" className="w-auto mx-auto" style={{ height: aspetto.footer_logo_height }} />
            </Link>
            <div className="order-last md:order-none text-center">
              <p className="font-serif text-lg text-white mb-1.5">{bilingual(copy, 'bottom_brand_line', lang)}</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-600">{bilingual(copy, 'bottom_copyright', lang)}</p>
            </div>
            <button
              onClick={scrollToTop}
              className="text-[10px] uppercase tracking-[0.2em] hover:text-white transition-colors duration-500 ease-editorial flex items-center gap-1.5"
              aria-label={t({ en: 'Back to top', it: 'Torna su' })}
            >
              {t({ en: 'Back to Top', it: 'Torna su' })}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

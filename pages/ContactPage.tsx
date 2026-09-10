import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import SEOHead from '../components/seo/SEOHead';
import { useTranslation } from '../hooks/useTranslation';
import { getContactCopy, type ContactCopy } from '../utils/siteCopy';
import { trackPhoneCall } from '../utils/analytics';
import { useFilmato } from '../hooks/useFilmato';

const ContactPage: React.FC = () => {
  const { lang } = useTranslation();
  const [copy, setCopy] = useState<ContactCopy | null>(null);
  // Il filmato dell'apertura, scelto da Sito > Aspetto & Funzionalita'.
  const filmato = useFilmato('contatti');

  useEffect(() => {
    let cancelled = false;
    getContactCopy().then((c) => { if (!cancelled) setCopy(c); });
    return () => { cancelled = true; };
  }, []);

  // SEO meta is independent of the editor — keeps existing structured data intact.
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen"
    >
      <SEOHead
        title={lang === 'it' ? 'Contatti DR7 | Prenota Auto di Lusso e Servizi in Sardegna' : 'Contact DR7 | Book Luxury Cars & Services in Sardinia'}
        description={lang === 'it' ? 'Contatta DR7 per noleggio auto di lusso, esperienze in supercar e servizi di autolavaggio premium in Sardegna. Chiama, scrivi su WhatsApp o vieni a trovarci a Cagliari.' : 'Get in touch with DR7 for luxury car rentals, supercar experiences, and premium car wash services in Sardinia. Call, WhatsApp, or visit us in Cagliari.'}
        canonical="/contact"
        jsonLd={[
          {
            '@type': 'ContactPage',
            '@id': 'https://dr7.app/contact#page',
            name: 'Contact DR7',
            url: 'https://dr7.app/contact',
            mainEntity: { '@id': 'https://dr7.app/contact#localbusiness' },
          },
          {
            '@type': 'LocalBusiness',
            '@id': 'https://dr7.app/contact#localbusiness',
            name: 'DR7',
            legalName: 'Dubai Rent 7.0 S.p.A.',
            image: 'https://dr7.app/DR7logo1.png',
            telephone: '+39 345 790 5205',
            email: 'info@dr7.app',
            url: 'https://dr7.app',
            address: {
              '@type': 'PostalAddress',
              streetAddress: 'Viale Marconi, 229',
              addressLocality: 'Cagliari',
              addressRegion: 'CA',
              postalCode: '09131',
              addressCountry: 'IT',
            },
            // 06/09/2026 — orario continuato 8:30-19:00 dal lunedi' al
            // sabato, domenica chiuso: gli stessi che la pagina mostra nella
            // scheda "Orari". Quando cambiano vanno cambiati in tutti e due i
            // posti, qui e in Sito > Contatti: questo blocco lo legge Google,
            // non il visitatore.
            openingHoursSpecification: [
              {
                '@type': 'OpeningHoursSpecification',
                dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
                opens: '08:30',
                closes: '19:00',
              },
            ],
            priceRange: '$$$',
            sameAs: [
              'https://www.instagram.com/dubai_rent_7.0_s_p_a_',
              'https://www.tiktok.com/@dr7luxuryempire',
            ],
          },
        ]}
      />

      {/* 10/09/2026 — la pagina e' UNA schermata sola sopra al filmato, come
          la scheda consegnata dalla direzione: quattro riquadri al centro,
          le firme del marchio negli angoli, l'indirizzo in fondo. Prima era
          un'apertura col filmato e sotto, sul nero, quattro schede grigie.
          Il filmato NON e' di sfondo fisso: sta dentro a questa schermata,
          perche' la pagina finisce qui. */}
      <section className="relative isolate flex min-h-screen items-center overflow-hidden">
        <video
          src={filmato.src}
          poster={filmato.poster}
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
        />
        {/* Velo: il testo deve leggersi su un mare che cambia luce a ogni
            fotogramma. Piu' fitto in alto e in basso, dove stanno le firme. */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-black/75 via-black/45 to-black/85" />

        {!copy ? (
          <p className="w-full text-center text-gray-300 text-sm">{lang === 'it' ? 'Caricamento…' : 'Loading…'}</p>
        ) : (
          <>
            {/* Le firme agli angoli. Sono la voce del marchio, uguali nelle
                due lingue: si cambiano da Sito > Contatti. */}
            <p className="pointer-events-none absolute left-6 top-28 hidden whitespace-pre-line text-[10px] uppercase leading-[2] tracking-[0.28em] text-white/70 md:block">
              {copy.corner_top_left}
            </p>
            <p className="pointer-events-none absolute right-6 top-28 hidden whitespace-pre-line text-right text-[10px] uppercase leading-[2] tracking-[0.28em] text-white/70 md:block">
              {copy.corner_top_right}
            </p>
            <p className="pointer-events-none absolute bottom-10 left-6 hidden whitespace-pre-line text-[10px] uppercase leading-[2] tracking-[0.28em] text-white/70 md:block">
              {copy.corner_bottom_left}
            </p>
            <p className="pointer-events-none absolute bottom-10 right-6 hidden whitespace-pre-line text-right text-[10px] uppercase leading-[2] tracking-[0.28em] text-white/70 md:block">
              {copy.corner_bottom_right}
            </p>

            <div className="relative z-10 mx-auto w-full max-w-5xl px-6 pt-28 pb-16">
              {/* Testata */}
              <div className="text-center">
                <p className="flex items-center justify-center gap-4 text-[10px] uppercase tracking-[0.4em] text-white/60">
                  <span aria-hidden="true" className="h-px w-10 bg-white/30" />
                  DR7
                  <span aria-hidden="true" className="h-px w-10 bg-white/30" />
                </p>
                <h1 className="mt-6 font-serif text-5xl md:text-7xl font-normal leading-none tracking-[-0.015em] text-white">
                  {lang === 'it' ? copy.page_title_it : copy.page_title_en}
                </h1>
                <p className="mt-4 font-serif text-xl md:text-2xl text-white/90">
                  {lang === 'it' ? copy.subtitle_it : copy.subtitle_en}
                </p>
                <p className="mt-3 text-sm md:text-base text-white/70">
                  {lang === 'it' ? copy.intro_it : copy.intro_en}
                </p>
                <span aria-hidden="true" className="mx-auto mt-8 block h-px w-16 bg-[#C9BEA8]/60" />
              </div>

              {/* I quattro modi per parlarci */}
              <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2">
                {/* Telefono */}
                <div className="rounded-2xl border border-white/12 bg-black/55 px-8 py-10 text-center backdrop-blur-sm">
                  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#C9BEA8]/50">
                    <svg className="h-6 w-6 text-[#C9BEA8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </span>
                  <h2 className="mt-5 font-serif text-xl text-white">{lang === 'it' ? copy.phone_label_it : copy.phone_label_en}</h2>
                  <a
                    href={copy.phone_tel_url}
                    onClick={() => trackPhoneCall('contact_page')}
                    className="mt-3 block text-xl md:text-2xl text-white transition-colors hover:text-[#E8DFCC]"
                  >
                    {copy.phone_display}
                  </a>
                  <p className="mt-5 text-[10px] uppercase tracking-[0.28em] text-white/45">
                    {lang === 'it' ? copy.phone_note_it : copy.phone_note_en}
                  </p>
                </div>

                {/* WhatsApp */}
                <div className="rounded-2xl border border-white/12 bg-black/55 px-8 py-10 text-center backdrop-blur-sm">
                  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#25D366]/60">
                    <svg className="h-6 w-6 text-[#25D366]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                  </span>
                  <h2 className="mt-5 font-serif text-xl text-white">{lang === 'it' ? copy.whatsapp_label_it : copy.whatsapp_label_en}</h2>
                  <a
                    href={copy.whatsapp_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center justify-center gap-3 border border-white/25 px-6 py-3 text-sm text-white transition-colors hover:bg-white hover:text-black"
                  >
                    {lang === 'it' ? copy.whatsapp_button_it : copy.whatsapp_button_en}
                    <span aria-hidden="true">&#8594;</span>
                  </a>
                  <p className="mt-5 text-[10px] uppercase tracking-[0.28em] text-white/45">
                    {lang === 'it' ? copy.whatsapp_note_it : copy.whatsapp_note_en}
                  </p>
                </div>

                {/* Email */}
                <div className="rounded-2xl border border-white/12 bg-black/55 px-8 py-10 text-center backdrop-blur-sm">
                  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#C9BEA8]/50">
                    <svg className="h-6 w-6 text-[#C9BEA8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </span>
                  <h2 className="mt-5 font-serif text-xl text-white">{lang === 'it' ? copy.email_label_it : copy.email_label_en}</h2>
                  <a href={`mailto:${copy.email_address}`} className="mt-3 block break-all text-lg text-white transition-colors hover:text-[#E8DFCC]">
                    {copy.email_address}
                  </a>
                  <p className="mt-5 text-[10px] uppercase tracking-[0.28em] text-white/45">
                    {lang === 'it' ? copy.email_note_it : copy.email_note_en}
                  </p>
                </div>

                {/* Orari */}
                <div className="rounded-2xl border border-white/12 bg-black/55 px-8 py-10 text-center backdrop-blur-sm">
                  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#C9BEA8]/50">
                    <svg className="h-6 w-6 text-[#C9BEA8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                  <h2 className="mt-5 font-serif text-xl text-white">{lang === 'it' ? copy.hours_label_it : copy.hours_label_en}</h2>
                  <div className="mt-3 space-y-1 text-sm text-white/80">
                    {(lang === 'it' ? copy.hours_lines_it : copy.hours_lines_en).map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                </div>
              </div>

              {/* Dove siamo */}
              <div className="mt-12 flex flex-col items-center justify-center gap-6 text-center md:flex-row md:gap-10 md:text-left">
                <div className="flex items-start gap-3">
                  <svg className="mt-1 h-5 w-5 shrink-0 text-[#C9BEA8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s7-5.4 7-11a7 7 0 10-14 0c0 5.6 7 11 7 11z" />
                    <circle cx="12" cy="10" r="2.5" />
                  </svg>
                  <div>
                    <p className="text-white">{lang === 'it' ? copy.office_heading_it : copy.office_heading_en}</p>
                    <p className="mt-1 text-sm text-white/70">{lang === 'it' ? copy.office_address_it : copy.office_address_en}</p>
                  </div>
                </div>
                <span aria-hidden="true" className="hidden h-10 w-px bg-white/15 md:block" />
                <a
                  href={copy.maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-3 border border-white/25 px-6 py-3 text-sm text-white transition-colors hover:bg-white hover:text-black"
                >
                  {lang === 'it' ? copy.maps_button_it : copy.maps_button_en}
                  <span aria-hidden="true">&#8594;</span>
                </a>
              </div>

              {/* I dati societari restano leggibili, in piccolo. */}
              <p className="mt-10 text-center text-[11px] text-white/45">
                {copy.office_company_name} — {copy.office_piva}
              </p>
            </div>
          </>
        )}
      </section>
    </motion.div>
  );
};

export default ContactPage;

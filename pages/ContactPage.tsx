import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import SEOHead from '../components/seo/SEOHead';
import { useTranslation } from '../hooks/useTranslation';
import { getContactCopy, type ContactCopy } from '../utils/siteCopy';
import { trackPhoneCall } from '../utils/analytics';

const ContactPage: React.FC = () => {
  const { lang } = useTranslation();
  const [copy, setCopy] = useState<ContactCopy | null>(null);

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
      className="min-h-screen bg-black pt-28 pb-20"
    >
      <SEOHead
        title="Contact DR7 | Book Luxury Cars & Services in Sardinia"
        description="Contatta DR7 per noleggio auto di lusso, esperienze in supercar e servizi di autolavaggio premium in Sardegna. Chiama, scrivi su WhatsApp o vieni a trovarci a Cagliari."
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
            openingHoursSpecification: [
              {
                '@type': 'OpeningHoursSpecification',
                dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
                opens: '09:00',
                closes: '19:00',
              },
              {
                '@type': 'OpeningHoursSpecification',
                dayOfWeek: ['Saturday'],
                opens: '09:00',
                closes: '18:00',
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

      <div className="container mx-auto px-6 max-w-4xl">
        {!copy ? (
          <p className="text-center text-gray-500 text-sm">{lang === 'it' ? 'Caricamento…' : 'Loading…'}</p>
        ) : (
          <>
            {/* Page Title */}
            <div className="text-center mb-16">
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                {lang === 'it' ? copy.page_title_it : copy.page_title_en}
              </h1>
              <p className="text-gray-400 text-lg max-w-2xl mx-auto">
                {lang === 'it' ? copy.subtitle_it : copy.subtitle_en}
              </p>
            </div>

            {/* Contact Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
              {/* Phone */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                <div className="w-14 h-14 mx-auto mb-4 bg-gray-800 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-white mb-2">{lang === 'it' ? copy.phone_label_it : copy.phone_label_en}</h2>
                <a
                  href={copy.phone_tel_url}
                  onClick={() => trackPhoneCall('contact_page')}
                  className="text-2xl font-semibold text-gray-300 hover:text-white transition-colors"
                >
                  {copy.phone_display}
                </a>
              </div>

              {/* WhatsApp */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                <div className="w-14 h-14 mx-auto mb-4 bg-green-900/50 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-white mb-2">{lang === 'it' ? copy.whatsapp_label_it : copy.whatsapp_label_en}</h2>
                <a
                  href={copy.whatsapp_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 px-8 py-3 bg-green-600 text-white font-bold rounded-full hover:bg-green-500 transition-colors"
                >
                  {lang === 'it' ? copy.whatsapp_button_it : copy.whatsapp_button_en}
                </a>
              </div>

              {/* Email */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                <div className="w-14 h-14 mx-auto mb-4 bg-gray-800 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-white mb-2">{lang === 'it' ? copy.email_label_it : copy.email_label_en}</h2>
                <a href={`mailto:${copy.email_address}`} className="text-lg text-gray-300 hover:text-white transition-colors">
                  {copy.email_address}
                </a>
              </div>

              {/* Hours */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
                <div className="w-14 h-14 mx-auto mb-4 bg-gray-800 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-white mb-2">{lang === 'it' ? copy.hours_label_it : copy.hours_label_en}</h2>
                {(lang === 'it' ? copy.hours_lines_it : copy.hours_lines_en).map((line, i) => (
                  <p key={i} className={`text-sm ${i === 0 ? 'text-gray-400 mt-2' : i === 2 ? 'text-gray-500 mt-2' : 'text-gray-400'}`}>
                    {line}
                  </p>
                ))}
              </div>
            </div>

            {/* Company Info */}
            <div className="text-center mb-16">
              <h2 className="text-2xl font-bold text-white mb-4">{lang === 'it' ? copy.office_heading_it : copy.office_heading_en}</h2>
              <div className="text-gray-400 space-y-1">
                <p className="font-semibold text-white">{copy.office_company_name}</p>
                <p>{lang === 'it' ? copy.office_address_it : copy.office_address_en}</p>
                <p>{copy.office_piva}</p>
              </div>
            </div>

            {/* Map */}
            <div className="rounded-2xl overflow-hidden border border-gray-800">
              <iframe
                title={copy.map_title}
                src={copy.map_iframe_url}
                width="100%"
                height="400"
                style={{ border: 0 }}
                loading="lazy"
              />
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default ContactPage;

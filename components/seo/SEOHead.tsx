import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useAspetto } from '../../hooks/useAspetto';

interface SEOHeadProps {
  title: string;
  description: string;
  canonical: string;
  ogImage?: string;
  jsonLd?: Record<string, any> | Record<string, any>[];
}

const SEOHead: React.FC<SEOHeadProps> = ({
  title,
  description,
  canonical,
  ogImage: ogImageProp,
  jsonLd,
}) => {
  // Anteprima di condivisione: quella della pagina se ne ha una, altrimenti
  // quella scelta in Sito > Aspetto & Funzionalita'.
  const aspetto = useAspetto();
  const ogImage = ogImageProp || aspetto.seo_og_image;
  const fullCanonical = canonical.startsWith('http')
    ? canonical
    : `https://dr7.app${canonical}`;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={fullCanonical} />

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={fullCanonical} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:site_name" content="DR7" />
      <meta property="og:locale" content="it_IT" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {/* JSON-LD */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(Array.isArray(jsonLd) ? { '@context': 'https://schema.org', '@graph': jsonLd } : { '@context': 'https://schema.org', ...jsonLd })}
        </script>
      )}
    </Helmet>
  );
};

export default SEOHead;

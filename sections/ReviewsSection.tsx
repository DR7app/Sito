import React, { useState, useEffect } from "react";
import VetrinaRecensioni from "../components/ui/VetrinaRecensioni";
import { useTranslation } from "../hooks/useTranslation";
import { fetchGoogleReviews, Review, RatingSummary } from "../services/googleReviews";
import type { ManualReview } from "../utils/siteCopy";

// 23/09/2026 (direzione) — le recensioni scritte a mano non stanno piu' qui:
// arrivano da Sito > Recensioni in home (footer.manual_reviews), con
// l'interruttore che decide se restano in coda a quelle di Google.
function daRecensioneManuale(r: ManualReview, lang: string): Review {
  const testo = lang === 'en' ? (r.text_en || r.text_it) : (r.text_it || r.text_en);
  return { author: r.name, rating: Number(r.stars) || 5, date: r.date, body: testo || '', sourceUrl: r.link };
}

export default function ReviewsSection({ titolo, sottotitolo, immagine, recensioniManuali = [], manualiDopoGoogle = false, googleUrl }: {
  titolo: string;
  sottotitolo: string;
  immagine?: string;
  recensioniManuali?: ManualReview[];
  manualiDopoGoogle?: boolean;
  googleUrl?: string;
}) {
  const { t, lang } = useTranslation();
  const manuali = recensioniManuali.map(r => daRecensioneManuale(r, lang)).filter(r => r.body.trim() !== '');
  // 26/09/2026 — le recensioni vere di Google arrivano gia' dalla piu' recente
  // (copia aggiornata ogni tre ore dal gestionale). Quelle scritte a mano sono
  // solo la riserva: si vedono se Google non risponde, o in coda se in
  // Sito > Recensioni l'interruttore lo chiede esplicitamente.
  // null = Google non ha (ancora) risposto: si vedono le recensioni scritte a mano.
  const [google, setGoogle] = useState<Review[] | null>(null);
  const reviews: Review[] = google === null
    ? manuali
    : manualiDopoGoogle
      ? [...google, ...manuali]
      // Solo Google, ma la fascia non resta mai vuota.
      : (google.length ? google : manuali);
  // Il conteggio NON e' scritto qui: arriva da Google (Places, campo
  // `user_ratings_total`) a ogni caricamento della pagina, quindi il numero
  // grande in cima segue le recensioni vere. Finche' la risposta non arriva
  // si riparte dall'ultimo numero conosciuto, tenuto sul browser di chi
  // guarda: prima c'era un 300 scritto a mano che compariva un istante e poi
  // saltava al numero giusto.
  const [ratingSummary, setRatingSummary] = useState<RatingSummary>(() => {
    try {
      const salvato = localStorage.getItem('dr7_recensioni_google');
      if (salvato) {
        const v = JSON.parse(salvato) as RatingSummary;
        if (v && typeof v.reviewCount === 'number' && v.reviewCount > 0) return v;
      }
    } catch { /* browser senza memoria locale: si mostra il titolo senza numero */ }
    return { ratingValue: 5.0, reviewCount: 0 };
  });

  useEffect(() => {
    const loadReviews = async () => {
      try {
        const data = await fetchGoogleReviews();
        // Le recensioni di Google davanti, le nostre dietro: la vetrina ne
        // mostra tante quante ne servono per scorrere.
        setGoogle(data.reviews);
        setRatingSummary(data.ratingSummary);
        try { localStorage.setItem('dr7_recensioni_google', JSON.stringify(data.ratingSummary)); } catch { /* niente */ }
      } catch (error) {
        console.error("Failed to load Google reviews, using fallback:", error);
        // Restano le recensioni di scorta: la sezione non resta mai vuota.
      }
    };

    loadReviews();
  }, []);

  // Dati strutturati: il voto medio e le recensioni per i motori di ricerca.
  // Stavano nella fascia scorrevole; la fascia non c'e' piu', questi restano.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": "DR7",
    "image": "https://dr7.app/logo.png",
    "@id": "https://dr7.app",
    "url": "https://dr7.app",
    "telephone": "+39 345 790 5205",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "Viale Marconi, 229",
      "addressLocality": "Cagliari",
      "addressRegion": "CA",
      "postalCode": "09131",
      "addressCountry": "IT",
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": ratingSummary.ratingValue,
      "reviewCount": ratingSummary.reviewCount,
    },
    // Solo le recensioni vere di Google portano Google come editore: quelle
    // scritte a mano non si presentano ai motori di ricerca come se lo fossero.
    "review": reviews.slice(0, 30).map(review => ({
      "@type": "Review",
      "reviewRating": { "@type": "Rating", "ratingValue": review.rating },
      "author": { "@type": "Person", "name": review.author },
      "reviewBody": review.body.replace(/\n\n/g, ' '),
      "datePublished": review.date,
      ...(review.daGoogle ? { "publisher": { "@type": "Organization", "name": "Google" } } : {}),
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <VetrinaRecensioni
        reviews={reviews}
        ratingSummary={ratingSummary}
        titolo={titolo}
        sottotitolo={sottotitolo}
        googleReviewsUrl={googleUrl || "https://share.google/o5c8DO8nmk3XMn0hF"}
        immagine={immagine}
        lingua={lang}
        testi={{
          occhiello: t({ it: "Le nostre esperienze", en: "Our experiences" }),
          esperienze: t({ it: "esperienze.", en: "experiences." }),
          verificateSuGoogle: (n) => n > 0
            ? `${n} ${t({ it: "recensioni verificate su Google", en: "verified reviews on Google" })}`
            : t({ it: "Recensioni verificate su Google", en: "Verified reviews on Google" }),
          leggiTutte: t({ it: "Leggi tutte le recensioni", en: "Read all reviews" }),
          recensioneVerificata: t({ it: "Recensione verificata", en: "Verified review" }),
          statoPaesi: t({ it: "Clienti", en: "Guests" }),
          statoPaesiNota: t({ it: "da oltre 20 paesi", en: "from over 20 countries" }),
          statoRecensioni: (n) => n > 0
            ? `${n} ${t({ it: "recensioni", en: "reviews" })}`
            : t({ it: "Recensioni", en: "Reviews" }),
          statoRecensioniNota: t({ it: "verificate", en: "verified" }),
          statoVoto: `${ratingSummary.ratingValue.toFixed(1)}/5`,
          statoVotoNota: t({ it: "valutazione media", en: "average rating" }),
          statoStandard: t({ it: "Un solo", en: "One" }),
          statoStandardNota: t({ it: "standard", en: "standard" }),
          precedente: t({ it: "Precedente", en: "Previous" }),
          successiva: t({ it: "Successiva", en: "Next" }),
        }}
      />
    </>
  );
}

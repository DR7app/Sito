import React, { useState, useEffect } from "react";
import { ReviewsMarquee } from "../components/ui/ReviewsMarquee";
import { fetchGoogleReviews, Review, RatingSummary } from "../services/googleReviews";

// Fallback reviews in case API fails
const fallbackReviews = [
  {
    author: "Christian Pistis",
    rating: 5,
    date: "2025-01-27",
    body:
      "Ho noleggiato il Bmw M4 Competition per festeggiare il mio matrimonio... non potevo scegliere di meglio!!! Alla Dubai Rent sono dei veri professionisti, super disponibili e attenti a ogni dettaglio. Esperienza fantastica!",
    sourceUrl: "https://share.google/vSxG17ifqlzJNSrSz",
  },
  {
    author: "Massimo Pisanu",
    rating: 5,
    date: "2025-01-27",
    body:
      "Ho avuto il piacere di noleggiare per la prima volta un furgone con Dubai Rent 7.0 e l'esperienza è stata davvero oltre le aspettative. Fin da subito mi sono trovato con persone professionali, disponibili e attente alle mie esigenze. Il servizio impeccabile e la qualità del mezzo hanno reso tutto perfetto. Consigliatissimo!",
    sourceUrl: "https://share.google/vSxG17ifqlzJNSrSz",
  },
  {
    author: "Alessia Fois",
    rating: 5,
    date: "2025-01-27",
    body:
      "Ho contattato Dubai rent per un lavaggio dell'auto e sono stati subito disponibili per il servizio. In circa un'ora e mezza mi hanno restituito la mia auto completamente pulita e igienizzata. Servizio impeccabile, personale gentile e professionale. Super consigliato!",
    sourceUrl: "https://share.google/vSxG17ifqlzJNSrSz",
  },
  {
    author: "Sabrina Gessa",
    rating: 5,
    date: "2025-01-27",
    body:
      "Esperienza super positiva. Lavaggio impeccabile, auto pulitissima nei minimi dettagli. Personale gentile e professionale. Consigliatissimo!",
    sourceUrl: "https://share.google/vSxG17ifqlzJNSrSz",
  },
  {
    author: "Roberto Loi",
    rating: 5,
    date: "2025-01-13",
    body:
      " Un servizio impeccabile! Ho noleggiato un'auto con Dubai Rent 7.0 luxury empire e sono rimasto estremamente soddisfatto. Professionalità, cortesia e auto di altissimo livello. Consigliatissimo a chiunque voglia vivere un'esperienza di lusso su quattro ruote!",
    sourceUrl: "https://share.google/vSxG17ifqlzJNSrSz",
  },
  {
    author: "Nicola Vacca",
    rating: 5,
    date: "2025-01-13",
    body:
      "Lavaggio ottimo super puntuali e cordiali, mi era stato detto che ci volevano 3 ore per la scelta del lavaggio che ho deciso di effettuare alla mia macchina. Sono arrivato all'ora stabilita e la macchina era già pronta, pulitissima e profumatissima. Consiglio vivamente!",
    sourceUrl: "https://share.google/vSxG17ifqlzJNSrSz",
  },
  {
    author: "Davide Vincis",
    rating: 5,
    date: "2025-01-09",
    body:
      "Ho noleggiato un Ducato da pochissimo e sono rimasto davvero soddisfatto! Il mezzo era in ottime condizioni, spazioso e comodissimo per le mie necessità. Il servizio è stato impeccabile: personale cortese, disponibile e molto professionale. Consiglio vivamente Dubai Rent 7.0!",
    sourceUrl: "https://share.google/vSxG17ifqlzJNSrSz",
  },
  {
    author: "Martina Montis",
    rating: 5,
    date: "2025-01-01",
    body:
      "Ho avuto il piacere di noleggiare una Mercedes GLE 63s AMG, un vero capolavoro di lusso e potenza, e l'esperienza è stata semplicemente entusiasmante. L'auto ha superato ogni mia aspettativa, offrendo prestazioni straordinarie e un comfort superiore. Il servizio ricevuto è stato impeccabile; il team è stato cortese, professionale e attento a ogni dettaglio. Esperienza assolutamente da ripetere!",
    sourceUrl: "https://share.google/vSxG17ifqlzJNSrSz",
  },
  {
    author: "Davide Congiu",
    rating: 5,
    date: "2025-01-01",
    body:
      "Esperienza come SEMPRE fantastica, ho noleggiato già diverse supercar da Dubai Rent e mi sono sempre trovato bene. Tutto il team è sempre disponibile a qualsiasi ora, le auto sono pulitissime e il trattamento al cliente è eccezionale, a un prezzo veramente alla portata di tutti. Straconsigliato!!",
    sourceUrl: "https://share.google/vSxG17ifqlzJNSrSz",
  },
  {
    author: "Nicola Frongia",
    rating: 5,
    date: "2025-01-01",
    body:
      "Conosco Dubai Rent 7.0 dai tempi della storica sede di Via Santa Maria Chiara. Già allora era sinonimo di lusso, cura e precisione. Oggi, nella nuova e moderna sede di Viale Marconi, l'eccellenza è ancora più evidente. Parco auto straordinario, veicoli curati nei minimi dettagli, personale professionale e attento. Il servizio di autolavaggio interno offre risultati impeccabili. Sono sempre pienamente soddisfatto!",
    sourceUrl: "https://share.google/vSxG17ifqlzJNSrSz",
  },
  {
    author: "Daniele Mancosu",
    rating: 5,
    date: "2025-01-01",
    body:
      "Servizio eccellente dall'inizio alla fine. L'auto era in condizioni perfette e il personale molto cordiale. Ho apprezzato tantissimo anche il loro servizio di lavaggio auto, come se fosse appena uscita dalla concessionaria.",
    sourceUrl: "https://share.google/vSxG17ifqlzJNSrSz",
  },
  {
    author: "Anna Maria Zucca",
    rating: 5,
    date: "2025-01-01",
    body:
      "Esperienza unica!!!! Lavaggio impeccabile. La macchina super profumata, igienizzata e pulitissima. Profumo, caffè ed acqua in omaggio . I ragazzi professionali, gentili e super simpatici . Il noleggio? Un super wow. Macchine di lusso e impeccabili. Dubai Rent è il top ",
    sourceUrl: "https://share.google/vSxG17ifqlzJNSrSz",
  },
  {
    author: "Andrea Pisano",
    rating: 5,
    date: "2025-01-01",
    body:
      "Esperienza super positiva, sicuramente unica nel suo genere. Staff super gentile e premuroso, lavaggio dell'auto super professionale. Possibilità di noleggiare una supercar anche solo per poche ore a un prezzo davvero basso con un tocco di esclusività. Super consigliato!",
    sourceUrl: "https://share.google/vSxG17ifqlzJNSrSz",
  },
  {
    author: "Fabio De Agostini",
    rating: 5,
    date: "2025-01-01",
    body:
      "Esperienza super positiva, abbiamo fatto il lavaggio da 49 euro e che dire? La macchina era super pulita nei minimi dettagli... Grazie ragazzi alla prossima... ",
    sourceUrl: "https://share.google/vSxG17ifqlzJNSrSz",
  },
  {
    author: "Francesco Cocco",
    rating: 5,
    date: "2024-12-01",
    body:
      "Il servizio di lavaggio VIP offerto da Dubai Rent 7.0 è semplicemente il top! Ho lasciato la mia auto per un trattamento completo e sono rimasto senza parole al momento del ritiro. Ogni dettaglio era curato alla perfezione, dall'interno all'esterno. Professionalità e qualità al massimo livello!",
    sourceUrl: "https://share.google/vSxG17ifqlzJNSrSz",
  },
  {
    author: "Luca Scuto",
    rating: 5,
    date: "2024-11-01",
    body:
      "Ho noleggiato diverse volte il Carrera 4s da vero appassionato Porsche, che dire macchina fantastica e loro ancora di più. Servizio clienti incredibile, super professionali e sempre disponibili. Lavaggio impeccabile. Consigliatissimo, continuerò a noleggiare da loro ",
    sourceUrl: "https://share.google/vSxG17ifqlzJNSrSz",
  },
  {
    author: "Giancarlo Lecca",
    rating: 5,
    date: "2024-12-01",
    body:
      "È la prima volta che noleggio da loro e mi sono trovato benissimo, non avevo mai guidato un RS3 e sono rimasto veramente senza parole dalla bellezza dell'auto e dalla cura nella consegna. Provato anche il lavaggio completo: la macchina è uscita meglio di quando l'avevo comprata. Consiglio sia il lavaggio che il noleggio. Alla prossima ",
    sourceUrl: "https://share.google/vSxG17ifqlzJNSrSz",
  },
  {
    author: "Alessandro Porcu",
    rating: 5,
    date: "2024-10-01",
    body:
      "Grazie mille dell'esperienza. Da guidare safe e con rispetto. Ho avuto il piacere di guidarla sia su tratti lunghi e dritti sia su tratti tecnici e guidati e su strade panoramiche. Perfetta per photoshooting e video. Supercar super pulita, esperienza super. Dubai Rent 7.0 il top!!!!!!",
    sourceUrl: "https://share.google/vSxG17ifqlzJNSrSz",
  },
  {
    author: "Stefano Piludu",
    rating: 5,
    date: "2025-01-01",
    body:
      "Personale altamente professionale, lavaggio molto accurato e con ottimi prodotti. Servizio eccellente!",
    sourceUrl: "https://share.google/vSxG17ifqlzJNSrSz",
  },
  {
    author: "Alessio Cannas",
    rating: 5,
    date: "2024-08-01",
    body:
      "Recensione Dubai Rent 7.0 – Il Top del Noleggio Auto di Lusso. Esperienza eccezionale, auto impeccabili, servizio professionale e cortese. Consigliatissimo per chi cerca il massimo del lusso e della qualità!",
    sourceUrl: "https://share.google/vSxG17ifqlzJNSrSz",
  },
  {
    author: "Benjamin",
    rating: 5,
    date: "2024-08-01",
    body:
      "Great cars & experience. Professional service and amazing vehicles. Highly recommended!",
    sourceUrl: "https://share.google/vSxG17ifqlzJNSrSz",
  },
  {
    author: "Andrea Paschina",
    rating: 5,
    date: "2024-02-01",
    body:
      "Top! Servizio eccellente, auto fantastiche, personale professionale. Esperienza da ripetere assolutamente!",
    sourceUrl: "https://share.google/vSxG17ifqlzJNSrSz",
  },
  {
    author: "Mauro Lobina",
    rating: 5,
    date: "2025-05-18",
    body:
      "Sono un appassionato di auto di lusso, ho noleggiato più volte delle auto fantastiche, pulite e soprattutto affidabili. Lo staff cordiale e preciso nel loro lavoro, il titolare è una persona alla mano e difficilmente non si riesce a trovare un accordo sia per appuntamenti che per i loro prezzi competitivi e alla portata di tutti. Ci voleva proprio un autonoleggio che permette a chiunque di vivere esperienze da sogno. Spero di riuscire e continuare a provare la loro vasta scelta di parco auto che portano a divertimento e adrenalina pura. Grazie a tutto lo staff di Dubai Rent ",
    sourceUrl: "https://share.google/vSxG17ifqlzJNSrSz",
  },
  {
    author: "Alessandro Urracci",
    rating: 5,
    date: "2025-05-18",
    body:
      "Se volete vivere un'esperienza di guida straordinaria a prezzi davvero competitivi, Dubai Rent 7.0 S.p.A. è la scelta perfetta! Ho noleggiato diverse auto da loro, tra cui l'Audi RS3, l'Alfa Romeo Stelvio Quadrifoglio, l'Audi R8 e il Porsche Macan GTS. Auto impeccabili e pulitissime. Servizio clienti eccezionale: team super professionale, prenotazione rapida, consegna puntuale e attenzione ai dettagli. Emozioni indimenticabili e prezzi vantaggiosi. Il miglior autonoleggio!",
    sourceUrl: "https://share.google/o5c8DO8nmk3XMn0hF",
  },
  {
    author: "Fabio De Agostini",
    rating: 5,
    date: "2025-08-25",
    body:
      "Super positive experience, we had the €49 car wash and what can I say? The car was super clean down to the smallest detail... Thanks guys, see you next time... ",
    sourceUrl: "https://share.google/o5c8DO8nmk3XMn0hF",
  },
  {
    author: "Anna Maria Zucca",
    rating: 5,
    date: "2025-08-28",
    body:
      "Unique experience!!!! Impeccable wash. The car smelled great, sanitized, and spotless. Complimentary perfume, coffee, and water . The guys were professional, kind, and super nice . The rental? A super wow. Luxurious and impeccable cars. Dubai Rent is the best ",
    sourceUrl: "https://share.google/o5c8DO8nmk3XMn0hF",
  },
  {
    author: "Alessandro Porcu",
    rating: 5,
    date: "2025-06-20",
    body:
      "Grazie mille dell'esperienza. Ho guidato su tratti lunghi e tecnici, anche su strade panoramiche. Perfetta per photoshooting/video. Supercar super pulita, esperienza super. Dubai Rent 7.0 il top!!!!!!",
    sourceUrl: "https://share.google/o5c8DO8nmk3XMn0hF",
  },
  {
    author: "Nicola Frongia",
    rating: 5,
    date: "2025-08-18",
    body:
      "Conosco Dubai Rent 7.0 dai tempi della sede di Via Santa Maria Chiara. Nella nuova sede di Viale Marconi l’eccellenza è ancora più evidente. Parco auto straordinario, veicoli curati nei minimi dettagli. Personale professionale e attento. Autolavaggio interno con risultati impeccabili. Sempre pienamente soddisfatto.",
    sourceUrl: "https://share.google/o5c8DO8nmk3XMn0hF",
  },
  {
    author: "Luca Scuto",
    rating: 5,
    date: "2025-06-20",
    body:
      "I have rented the Carrera 4S several times. The car is fantastic and the team even more so. Incredible customer service, super professional and always available. Car wash impeccable. Highly recommended, I will continue to rent from them ",
    sourceUrl: "https://share.google/o5c8DO8nmk3XMn0hF",
  },
  {
    author: "Davide Congiu",
    rating: 5,
    date: "2025-08-18",
    body:
      "Esperienza SEMPRE fantastica. Ho noleggiato diverse supercar e mi sono sempre trovato benissimo. Team disponibile a qualsiasi ora, auto pulitissime e trattamento al cliente eccezionale, a un prezzo alla portata di tutti. Straconsigliato!!",
    sourceUrl: "https://share.google/o5c8DO8nmk3XMn0hF",
  },
  {
    author: "Andrea Frau",
    rating: 5,
    date: "2025-07-20",
    body:
      "Ottima esperienza con Dubai Rent 7.0. Le macchine sono spettacolari, pulizia e affidabilità al top e prezzi imbattibili. Accoglienza e assistenza al cliente impeccabili.",
    sourceUrl: "https://share.google/o5c8DO8nmk3XMn0hF",
  },
  {
    author: "Fabio Follese",
    rating: 5,
    date: "2024-11-10",
    body:
      "Auto pulitissima abbinato alla vostra super cortesia, per un giro di pura adrenalina con le vostre SUPER CAR nuovissime e splendide. Un ringraziamento a Valerio e a tutto lo staff.",
    sourceUrl: "https://share.google/o5c8DO8nmk3XMn0hF",
  },
  {
    author: "Matti Ciambotti",
    rating: 5,
    date: "2025-06-20",
    body:
      "Non sono vostro cliente, ma vi seguo sui social: non esiste un noleggio simile a voi, numeri uno. Se non fosse per la paura di danneggiare le super car l’avrei già noleggiata da tempo. Continuate così bravi!!",
    sourceUrl: "https://share.google/o5c8DO8nmk3XMn0hF",
  },
  {
    author: "Giuseppe Marongiu",
    rating: 5,
    date: "2025-05-18",
    body:
      "Ho preso tutte le macchine da loro, mi sono trovato benissimo. Personale gentile e accogliente, prezzi molto strepitosi. Consiglio a tutti quelli che vogliono noleggiare super car: loro sono il top del top.",
    sourceUrl: "https://share.google/o5c8DO8nmk3XMn0hF",
  },
  {
    author: "Andrea Pisano",
    rating: 5,
    date: "2025-08-18",
    body:
      "Esperienza super positiva, unica nel suo genere. Staff super gentile e premuroso, lavaggio super professionale. Possibilità di noleggiare una super car anche solo per poche ore a un prezzo davvero basso con un tocco di esclusività. Super consigliato.",
    sourceUrl: "https://share.google/o5c8DO8nmk3XMn0hF",
  },
  {
    author: "Giancarlo Lecca",
    rating: 5,
    date: "2025-08-18",
    body:
      "It's the first time I rent from them and I had a great time. I’d never driven an RS3 and was speechless at the beauty of the car and the care at delivery. Tried the complete wash: car came out better than when I bought it. I recommend both the wash and the rental. See you next time ",
    sourceUrl: "https://share.google/o5c8DO8nmk3XMn0hF",
  }
];

export default function ReviewsSection() {
  const [reviews, setReviews] = useState<Review[]>(fallbackReviews);
  const [ratingSummary, setRatingSummary] = useState<RatingSummary>({
    ratingValue: 5.0,
    reviewCount: 300
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadReviews = async () => {
      try {
        const data = await fetchGoogleReviews();
        // Combine Google reviews with fallback reviews for a larger carousel
        const combinedReviews = [...data.reviews, ...fallbackReviews];
        setReviews(combinedReviews);
        setRatingSummary(data.ratingSummary);
      } catch (error) {
        console.error("Failed to load Google reviews, using fallback:", error);
        // Keep using fallback reviews
      } finally {
        setIsLoading(false);
      }
    };

    loadReviews();
  }, []);

  return (
    <ReviewsMarquee
      reviews={reviews}
      business={{
        name: "DR7",
        url: "https://dr7.app",
        image: "https://dr7.app/logo.png",
        telephone: "+39 345 790 5205",
        address: {
          streetAddress: "Viale Marconi, 229",
          addressLocality: "Cagliari",
          addressRegion: "CA",
          postalCode: "09131",
          addressCountry: "IT",
        },
      }}
      ratingSummary={ratingSummary}
      googleReviewsUrl="https://share.google/vSxG17ifqlzJNSrSz"
      speedSeconds={15}
      speedSecondsMobile={8}
      gapPx={20}
      gapPxMobile={12}
      dark
      isLoading={isLoading}
    />
  );
}
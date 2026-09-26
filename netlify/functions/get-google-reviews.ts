import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { getCorsOrigin } from './utils/cors';

const GOOGLE_PLACES_API_KEY = process.env.VITE_GOOGLE_PLACES_API_KEY;
const GOOGLE_PLACE_ID = process.env.VITE_GOOGLE_PLACE_ID;

interface GoogleReview {
  author_name: string;
  rating: number;
  relative_time_description: string;
  text: string;
  time: number;
  author_url?: string;
  profile_photo_url?: string;
  language?: string;
}

interface GooglePlaceDetailsResponse {
  result: {
    name: string;
    rating: number;
    user_ratings_total: number;
    reviews: GoogleReview[];
  };
  status: string;
}

export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
) => {
  // Enable CORS
  const headers = {
    "Access-Control-Allow-Origin": getCorsOrigin(event.headers['origin']),
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
    // 26/09/2026 — Google a ogni visita costava una richiesta a pagamento:
    // ora il sito legge la copia nel database, questa funzione serve al
    // sincronizzatore e da riserva. Dieci minuti di cache bastano.
    "Cache-Control": "public, max-age=600",
  };

  // Handle preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  if (!GOOGLE_PLACES_API_KEY || !GOOGLE_PLACE_ID) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Missing API configuration" }),
    };
  }

  try {
    // Fetch place details including reviews
    // ?ordine=recenti: le 5 recensioni PIU' NUOVE invece delle 5 "piu'
    // rilevanti" scelte da Google. La usa il sincronizzatore del gestionale.
    const recenti = event.queryStringParameters?.ordine === 'recenti';
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${GOOGLE_PLACE_ID}&fields=name,rating,user_ratings_total,reviews&key=${GOOGLE_PLACES_API_KEY}&language=it${recenti ? '&reviews_sort=newest' : ''}`;

    const response = await fetch(url);
    const data: GooglePlaceDetailsResponse = await response.json();

    if (data.status !== "OK") {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: `Google API error: ${data.status}`,
        }),
      };
    }

    // Transform Google reviews to our format
    const reviews = data.result.reviews?.map((review) => ({
      author: review.author_name,
      rating: review.rating,
      date: new Date(review.time * 1000).toISOString().split("T")[0], // Convert Unix timestamp to YYYY-MM-DD
      body: review.text,
      sourceUrl: review.author_url || `https://search.google.com/local/reviews?placeid=${GOOGLE_PLACE_ID}`,
      // Campi originali di Google, per il sincronizzatore (stessa forma di prima piu' questi).
      author_name: review.author_name,
      profile_photo_url: review.profile_photo_url || null,
      text: review.text,
      language: review.language || null,
      time: review.time,
      relative_time_description: review.relative_time_description,
    })) || [];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        reviews,
        ratingSummary: {
          ratingValue: data.result.rating,
          reviewCount: data.result.user_ratings_total,
        },
        businessName: data.result.name,
      }),
    };
  } catch (error) {
    console.error("Error fetching Google reviews:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Failed to fetch reviews",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
};

import React, { useRef, useState, useEffect } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

type Review = {
    author: string;
    rating: number;
    date: string;
    body: string;
    sourceUrl: string;
};

type Business = {
    name: string;
    url: string;
    image: string;
    telephone: string;
    address: {
        streetAddress: string;
        addressLocality: string;
        addressRegion: string;
        postalCode: string;
        addressCountry: string;
    };
};

type RatingSummary = {
    ratingValue: number;
    reviewCount: number;
};

type ReviewsMarqueeProps = {
    reviews: Review[];
    business?: Business;
    ratingSummary?: RatingSummary;
    googleReviewsUrl?: string;
    speedSeconds?: number;
    speedSecondsMobile?: number;
    gapPx?: number;
    gapPxMobile?: number;
    dark?: boolean;
    isLoading?: boolean;
};

const ReviewCard: React.FC<{ review: Review, dark?: boolean }> = ({ review, dark }) => {
    const { lang } = useTranslation();
    const formattedDate = new Date(review.date).toLocaleDateString(lang === 'it' ? 'it-IT' : 'en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    
    const cardClasses = dark
        ? "bg-black/70 border-white/10 text-gray-200"
        : "bg-white/90 border-gray-200 text-gray-800";
    const authorColor = dark ? "text-white" : "text-black";
    const dateColor = dark ? "text-gray-400" : "text-gray-500";
    const starColor = dark ? "text-white" : "text-yellow-500";
    const starEmptyColor = dark ? "text-gray-600" : "text-gray-300";

    return (
        <a href={review.sourceUrl} target="_blank" rel="noopener noreferrer" className={`h-full w-[260px] sm:w-[320px] md:w-[350px] shrink-0 rounded-xl p-4 sm:p-6 flex flex-col text-left transition-all duration-300 border backdrop-blur-sm hover:border-white/50 hover:bg-gray-900 ${cardClasses} mr-3 sm:mr-5`}>
            <div className="flex items-center mb-3 sm:mb-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full mr-3 sm:mr-4 bg-gray-700 flex items-center justify-center text-white font-bold text-lg sm:text-xl">
                    {review.author.charAt(0)}
                </div>
                <div>
                    <h3 className={`font-bold text-sm sm:text-base ${authorColor}`}>{review.author}</h3>
                    <p className={`text-xs sm:text-sm ${dateColor}`}>{formattedDate}</p>
                </div>
            </div>
            <div className="flex mb-3 sm:mb-4">
                <span className={`text-sm font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>
                    {review.rating}/5
                </span>
            </div>
            <p className="text-xs sm:text-sm leading-relaxed flex-grow line-clamp-5 sm:line-clamp-6">{review.body}</p>
        </a>
    );
};

export const ReviewsMarquee: React.FC<ReviewsMarqueeProps> = ({
    reviews,
    business,
    ratingSummary,
    googleReviewsUrl,
    speedSeconds = 10,
    speedSecondsMobile = 10,
    gapPx = 20,
    gapPxMobile = 12,
    dark = false,
    isLoading = false,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [isPaused, setIsPaused] = useState(false);

    const marqueeStyle = {
        '--speed': `${speedSeconds}s`,
        '--speed-mobile': `${speedSecondsMobile}s`,
        '--gap': `${gapPx}px`,
        '--gap-mobile': `${gapPxMobile}px`,
    } as React.CSSProperties;

    // Duplicate reviews for seamless infinite loop
    const doubledReviews = [...reviews, ...reviews];

    const jsonLd = business && ratingSummary ? {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "name": business.name,
        "image": business.image,
        "@id": business.url,
        "url": business.url,
        "telephone": business.telephone,
        "address": {
          "@type": "PostalAddress",
          ...business.address
        },
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": ratingSummary.ratingValue,
          "reviewCount": ratingSummary.reviewCount
        },
        "review": reviews.map(review => ({
            "@type": "Review",
            "reviewRating": {
                "@type": "Rating",
                "ratingValue": review.rating
            },
            "author": {
                "@type": "Person",
                "name": review.author
            },
            "reviewBody": review.body.replace(/\n\n/g, ' '),
            "datePublished": review.date,
            "publisher": {
                "@type": "Organization",
                "name": "Google"
            }
        }))
    } : null;

    // Touch/Mouse handlers for swipe on mobile
    const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
        setIsDragging(true);
        setIsPaused(true);
        const pageX = 'touches' in e ? e.touches[0].pageX : e.pageX;
        setStartX(pageX - (containerRef.current?.offsetLeft || 0));
        setScrollLeft(containerRef.current?.scrollLeft || 0);
    };

    const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
        if (!isDragging) return;
        e.preventDefault();
        const pageX = 'touches' in e ? e.touches[0].pageX : e.pageX;
        const x = pageX - (containerRef.current?.offsetLeft || 0);
        const walk = (x - startX) * 2;
        if (containerRef.current) {
            containerRef.current.scrollLeft = scrollLeft - walk;
        }
    };

    const handleTouchEnd = () => {
        setIsDragging(false);
        setTimeout(() => setIsPaused(false), 500);
    };

    const starColor = dark ? "text-white" : "text-yellow-500";

    return (
        <div className="w-full">
            {ratingSummary && googleReviewsUrl && (
                <div className="mb-8 flex flex-col items-center justify-center">
                    <a
                        href={googleReviewsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-3 px-6 py-4 transition-all duration-300 ${
                            dark
                                ? 'bg-black/50 border border-white/20 hover:border-white/50 hover:bg-black/70'
                                : 'bg-white/90 border border-gray-200 hover:border-gray-300 hover:bg-white'
                        }`}
                    >
                        {/* Marchio Google: senza, la targhetta e' un numero che
                            si autocertifica. Con il marchio si vede da dove
                            arriva il voto. Disegnato inline, non caricato da
                            fuori: nessuna richiesta a terzi da questa pagina. */}
                        <svg className="h-8 w-8 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
                            <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/>
                            <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/>
                            <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"/>
                            <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/>
                        </svg>
                        <div className={`text-left ${dark ? 'text-white' : 'text-gray-900'}`}>
                            <div className="flex items-center gap-2">
                                <p className="text-2xl font-bold leading-none">{ratingSummary.ratingValue.toFixed(1)}</p>
                                {/* Sigillo di verifica accanto al voto. Non
                                    nomina nessun ente: e' il segno di attivita'
                                    verificata, e sta dentro alla targhetta che
                                    porta a Google, che e' il suo contesto. */}
                                <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                                    <path fill="#4285F4" d="M12 1.5l2.31 1.68 2.79-.53 1.06 2.65 2.65 1.06-.53 2.79L22 12l-1.72 2.85.53 2.79-2.65 1.06-1.06 2.65-2.79-.53L12 22.5l-2.31-1.68-2.79.53-1.06-2.65-2.65-1.06.53-2.79L2 12l1.72-2.85-.53-2.79 2.65-1.06L6.9 2.65l2.79.53L12 1.5z"/>
                                    <path fill="#FFFFFF" d="M10.75 15.6l-3.2-3.2 1.27-1.27 1.93 1.93 4.43-4.43 1.27 1.27-5.7 5.7z"/>
                                </svg>
                                <div className="flex items-center gap-0.5" aria-hidden="true">
                                    {[0, 1, 2, 3, 4].map((i) => (
                                        <svg key={i} className="h-4 w-4 text-[#FBBC05]" fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                                        </svg>
                                    ))}
                                </div>
                            </div>
                            <p className="mt-1 text-sm opacity-80">{ratingSummary.reviewCount} recensioni Google</p>
                        </div>
                    </a>
                </div>
            )}
            <div
                ref={containerRef}
                className="w-full overflow-x-auto overflow-y-hidden group flex flex-col scrollbar-hide cursor-grab active:cursor-grabbing"
                style={marqueeStyle}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onMouseDown={handleTouchStart}
                onMouseMove={handleTouchMove}
                onMouseUp={handleTouchEnd}
                onMouseLeave={handleTouchEnd}
            >
                {jsonLd && (
                    <script type="application/ld+json">
                        {JSON.stringify(jsonLd)}
                    </script>
                )}
                <div
                    className={`flex shrink-0 ${isPaused ? '' : 'animate-marquee'} group-hover:[animation-play-state:paused]`}
                    style={{ userSelect: 'none' }}
                >
                    {doubledReviews.map((review, i) => (
                        <ReviewCard key={i} review={review} dark={dark} />
                    ))}
                </div>
            </div>
        </div>
    );
};

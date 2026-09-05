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
                        <div className="flex items-center gap-1">
                            <span className={`text-xl font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>
                                {ratingSummary.ratingValue.toFixed(1)}/5
                            </span>
                        </div>
                        <div className={`text-left ${dark ? 'text-white' : 'text-gray-900'}`}>
                            <p className="text-2xl font-bold">{ratingSummary.ratingValue.toFixed(1)}/5.0</p>
                            <p className="text-sm opacity-80">{ratingSummary.reviewCount} recensioni Google</p>
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

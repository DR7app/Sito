import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../hooks/useTranslation';
import { RENTAL_CATEGORIES, COMMERCIAL_OPERATION_GIVEAWAY } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';

// Display titles matching the menu division names
const DISPLAY_TITLE: Record<string, string> = {
  cars: 'DR7 Supercar & Luxury Division',
  'urban-cars': 'DR7 Urban Mobility Division',
  'corporate-fleet': 'DR7 Corporate & Utility Fleet Division',
  yachts: 'DR7 Yachting Division',
  jets: 'DR7 Aviation Division',
  'car-wash-services': 'Prime Car Wash',
  'mechanical-services': 'DR7 Rapid Response Services',
  membership: 'DR7 Exclusive Members Club',
  'credit-wallet': 'DR7 Credit Wallet',
};

// Map category ids to image filenames in /public
const CATEGORY_IMAGE: Record<string, string> = {
  cars: '/car.jpeg',
  'urban-cars': '/urbanc.jpeg',
  'corporate-fleet': '/utili.jpeg',
  yachts: '/yacht.jpeg',
  villas: '/villa.jpeg',
  jets: '/privatejet.jpeg',
  'car-wash-services': '/luxurywash.jpeg',
  'mechanical-services': '/rapids.jpeg',
  membership: '/exclusivemc.jpeg',
  'credit-wallet': '/cwallet.jpeg',
};

// Hero video slides configuration
const HERO_SLIDES = [
  {
    id: 1,
    videoSrc: '/main.mp4',
  },
  {
    id: 2,
    videoSrc: '/video2.mp4',
  },
  {
    id: 3,
    videoSrc: '/video3.mp4',
  },
  {
    id: 4,
    videoSrc: '/video4.mp4',
  },
  {
    id: 5,
    videoSrc: '/video5.mp4',
  },
  {
    id: 6,
    videoSrc: '/video6.mp4',
  },
];

const HeroSection: React.FC = () => {
  const { t } = useTranslation();
  const [activeSlide, setActiveSlide] = useState(0);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Minimum swipe distance (in px)
  const minSwipeDistance = 50;

  // Auto-advance slides every 8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  // Pause/play videos based on active slide
  useEffect(() => {
    videoRefs.current.forEach((video, index) => {
      if (video) {
        if (index === activeSlide) {
          video.play().catch(() => { });
        } else {
          video.pause();
        }
      }
    });
  }, [activeSlide]);

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      // Swipe left - go to next slide
      setActiveSlide((prev) => (prev + 1) % HERO_SLIDES.length);
    } else if (isRightSwipe) {
      // Swipe right - go to previous slide
      setActiveSlide((prev) => (prev - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);
    }
  };

  return (
    <div
      className="relative h-screen flex items-center justify-center text-center overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Video slides */}
      <AnimatePresence mode="wait">
        {HERO_SLIDES.map((slide, index) => (
          <motion.div
            key={slide.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: index === activeSlide ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: 'easeInOut' }}
            className="absolute inset-0 z-0"
            style={{ pointerEvents: index === activeSlide ? 'auto' : 'none' }}
          >
            <video
              ref={(el) => (videoRefs.current[index] = el)}
              loop
              muted
              playsInline
              className="w-full h-full object-cover brightness-[.65]"
            >
              <source src={slide.videoSrc} type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-black/30" />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Navigation dots - Ferrari style */}
      <div className="absolute bottom-12 left-1/2 transform -translate-x-1/2 z-20 flex space-x-4">
        {HERO_SLIDES.map((slide, index) => (
          <button
            key={slide.id}
            onClick={() => setActiveSlide(index)}
            className={`transition-all duration-500 ease-out ${index === activeSlide
              ? 'w-2 h-2 bg-white rounded-full scale-100 opacity-100'
              : 'w-2 h-2 border border-white/50 rounded-full scale-75 opacity-60 hover:opacity-100 hover:scale-90'
              }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

const HomePage: React.FC = () => {
  const { t, getTranslated } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h1 style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
        DR7 Empire — Noleggio Auto di Lusso, Supercar e Servizi Premium in Sardegna
      </h1>
      <HeroSection />


      {/* ===== Categories Section ===== */}
      <section className="py-24 bg-black">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {RENTAL_CATEGORIES.map((category, index) => {
              const imageSrc =
                CATEGORY_IMAGE[category.id as keyof typeof CATEGORY_IMAGE] ||
                category.data?.[0]?.image ||
                '/placeholder.jpeg';

              const displayTitle =
                DISPLAY_TITLE[category.id as keyof typeof DISPLAY_TITLE] ||
                getTranslated(category.label);

              const isFeatured = index === 0;

              return (
                <motion.div
                  key={category.id}
                  className={isFeatured ? 'md:col-span-2' : ''}
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                >
                  <Link
                    to={`/${category.id}`}
                    className="block group relative rounded-lg overflow-hidden"
                  >
                    <img
                      src={imageSrc}
                      alt={displayTitle}
                      className={`w-full ${isFeatured ? 'h-[40rem]' : 'h-96'} object-cover brightness-75 group-hover:brightness-100 transition-all duration-500 group-hover:scale-110`}
                    />

                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    <div className="absolute bottom-0 left-0 p-8">
                      <h3 className="text-xl md:text-3xl font-bold text-white">
                        {displayTitle}
                      </h3>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>
    </motion.div>
  );
};

export default HomePage;
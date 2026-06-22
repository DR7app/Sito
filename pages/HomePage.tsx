import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../hooks/useTranslation';
import { RENTAL_CATEGORIES } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';
import { getHomeCopy, type HomeCopy, type HomeSlide } from '../utils/siteCopy';
// 2026-05-23: useFlottaCategories rimosso — ritorno al rendering hardcoded

interface HeroSectionProps {
  slides: HomeSlide[];
  autoplaySeconds: number;
}

const HeroSection: React.FC<HeroSectionProps> = ({ slides, autoplaySeconds }) => {
  const [activeSlide, setActiveSlide] = useState(0);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const minSwipeDistance = 50;

  useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % slides.length);
    }, Math.max(2, autoplaySeconds) * 1000);
    return () => clearInterval(interval);
  }, [slides.length, autoplaySeconds]);

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
    if (!touchStart || !touchEnd || slides.length <= 1) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    if (isLeftSwipe) {
      setActiveSlide((prev) => (prev + 1) % slides.length);
    } else if (isRightSwipe) {
      setActiveSlide((prev) => (prev - 1 + slides.length) % slides.length);
    }
  };

  return (
    <div
      className="relative h-screen flex items-center justify-center text-center overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <AnimatePresence mode="wait">
        {slides.map((slide, index) => (
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
              <source src={slide.video_src} type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-black/30" />
          </motion.div>
        ))}
      </AnimatePresence>

      {slides.length > 1 && (
        <div className="absolute bottom-12 left-1/2 transform -translate-x-1/2 z-20 flex space-x-4">
          {slides.map((slide, index) => (
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
      )}
    </div>
  );
};

const HomePage: React.FC = () => {
  const { lang, getTranslated } = useTranslation();
  const [copy, setCopy] = useState<HomeCopy | null>(null);

  useEffect(() => {
    let cancelled = false;
    getHomeCopy().then((c) => { if (!cancelled) setCopy(c); });
    return () => { cancelled = true; };
  }, []);

  // Build a quick lookup of category overrides by id.
  const categoryOverrides = React.useMemo(() => {
    const map = new Map<string, { title_it: string; title_en: string; image: string }>();
    if (!copy) return map;
    for (const c of copy.categories) {
      map.set(c.id, { title_it: c.display_title_it, title_en: c.display_title_en, image: c.image_src });
    }
    return map;
  }, [copy]);

  // 2026-05-23 REVERT: ritorno al comportamento ORIGINALE pre-13/05.
  // Le categorie homepage sono di nuovo le RENTAL_CATEGORIES hardcoded
  // (cars, urban-cars, corporate-fleet, yachts, jets) con le immagini
  // che funzionavano sempre. Niente piu' fetch dinamico da
  // Centralina Pro per il rendering della homepage. L'admin puo' ancora
  // sovrascrivere title/image per ogni card via Sito > Home > Categorie.
  type HomeCard = {
    id: string;
    label: string;
    image: string;
    path: string;
  };
  // 2026-06-22: rimosse dalla home le 5 "Division" showcase (Supercar, Urban,
  // Corporate, Yachting, Aviation) su richiesta. Restano le card dei servizi
  // reali (Lavaggio & Meccanica, Club, Wallet, ecc.). Il noleggio resta
  // raggiungibile dal menu (Mobilità) e dalla ricerca "Prenota Ora".
  const HOME_HIDDEN_DIVISIONS = new Set(['cars', 'urban-cars', 'corporate-fleet', 'yachts', 'jets', 'credit-wallet']);
  const homeCards: HomeCard[] = React.useMemo(() => {
    return RENTAL_CATEGORIES.filter(c => !HOME_HIDDEN_DIVISIONS.has(c.id)).map(c => {
      const override = categoryOverrides.get(c.id);
      return {
        id: c.id,
        label: override
          ? (lang === 'it' ? override.title_it : override.title_en)
          : getTranslated(c.label),
        image: override?.image
          || c.data?.[0]?.image
          || '/placeholder.jpeg',
        path: `/${c.id}`,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryOverrides, lang, getTranslated]);

  const seoH1 = copy ? (lang === 'it' ? copy.seo_h1_it : copy.seo_h1_en) : 'DR7';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h1 style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
        {seoH1}
      </h1>
      {copy && <HeroSection slides={copy.hero_slides} autoplaySeconds={copy.hero_autoplay_seconds} />}

      {/* ===== Categories Section ===== */}
      {/* Cards alimentate dalle categorie selezionate in admin > Sito >
          Flotta. Niente piu' lista hardcoded — aggiungere una nuova
          categoria (Hypercar, Suv Luxury, ecc.) la fa comparire sulla
          home senza modifiche al codice. */}
      <section className="py-24 bg-black">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {homeCards.map((card, index) => {
              const isFeatured = index === 0;
              return (
                <motion.div
                  key={card.id}
                  className={isFeatured ? 'md:col-span-2' : ''}
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                >
                  <Link
                    to={card.path}
                    className="block group relative rounded-lg overflow-hidden"
                  >
                    <img
                      src={card.image}
                      alt={card.label}
                      className={`w-full ${isFeatured ? 'h-[40rem]' : 'h-96'} object-cover brightness-75 group-hover:brightness-100 transition-all duration-500 group-hover:scale-110`}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    <div className="absolute bottom-0 left-0 p-8">
                      <h3 className="text-xl md:text-3xl font-bold text-white">
                        {card.label}
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

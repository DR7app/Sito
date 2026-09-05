import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../hooks/useTranslation';
import { RENTAL_CATEGORIES } from '../constants';
import { motion } from 'framer-motion';
import Carousel from '../components/Carousel';

// Optional: display titles per category
const DISPLAY_TITLE: Record<string, string> = {
  cars: 'Cars',
  yachts: 'Yachts',
  helicopters: 'Helicopters',
  jets: 'Private Jets',
};

// Map category ids to image filenames in /public
const CATEGORY_IMAGE: Record<string, string> = {
  cars: '/car.jpeg',
  yachts: '/yacht.jpeg',
  helicopters: '/helicopter.jpeg',
  jets: '/privatejet.jpeg',
};

const carouselImages = [
  '/car.jpeg',
  '/yacht.jpeg',
  '/privatejet.jpeg',
  '/helicopter.jpeg',
];

const HeroSection: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="relative h-[70vh] flex items-center justify-center text-center overflow-hidden">
      {/* Background video */}
      <div className="absolute inset-0 z-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
        >
          <source src="/main.mp4" type="video/mp4" />
        </video>
      </div>

      {/* Text Overlay */}
      <div className="relative z-10 px-4">
        <motion.h1
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-4xl md:text-6xl font-bold text-white uppercase tracking-wider"
        >
          {t('Welcome_to_DR7_Empire')}
        </motion.h1>
        <motion.h2
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-2xl md:text-4xl font-light text-white mt-2"
        >
          {t('Experience_Exclusivity')}
        </motion.h2>
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
      <HeroSection />


      {/* Categories grid */}
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
                      className={`w-full ${isFeatured ? 'h-[40rem]' : 'h-96'
                        } object-cover group-hover:brightness-100 transition-all duration-500 group-hover:scale-110`}
                      loading="lazy"
                    />
                    <div className="absolute bottom-0 left-0 p-8">
                      <h3 className="text-3xl font-bold text-white">
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

      {/* Club section without tagline */}
      <section className="py-24 bg-gray-900/40">
        <div className="container mx-auto px-6 text-center">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.5 }}
            className="text-4xl font-bold text-white"
          >
            {t('The_DR7_Club')}
          </motion.h2>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-8"
          >
            <Link
              to="/membership"
              className="bg-transparent border-2 border-white text-white px-8 py-4 font-bold uppercase tracking-widest text-sm hover:bg-white hover:text-black transition-all duration-300 transform hover:scale-105"
            >
              {t('View_Tiers')}
            </Link>
          </motion.div>
        </div>
      </section>
    </motion.div>
  );
};

export default HomePage;

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { useNavigate } from 'react-router-dom';
import { getMechanicalCopy, getMechanicalServices, type MechanicalCopy, type MechanicalServiceItem } from '../utils/siteCopy';

// Re-exported for back-compat with MechanicalBookingPage.
export type MechanicalService = MechanicalServiceItem;

const MechanicalServicesPage: React.FC = () => {
  const { lang } = useTranslation();
  const navigate = useNavigate();
  const [copy, setCopy] = useState<MechanicalCopy | null>(null);
  const [services, setServices] = useState<MechanicalServiceItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMechanicalCopy(), getMechanicalServices()]).then(([c, s]) => {
      if (cancelled) return;
      setCopy(c);
      setServices(s);
    });
    return () => { cancelled = true; };
  }, []);

  const handleBookService = (serviceId: string) => {
    navigate('/mechanical-booking', { state: { serviceId } });
  };

  // Group services by category. Catalog stores a single `category` field
  // (Italian) — same key for both langs since admin doesn't translate it.
  const servicesByCategory = useMemo(() => {
    if (!services) return {} as Record<string, MechanicalServiceItem[]>;
    return services.reduce((acc, service) => {
      const category = service.category || '';
      if (!acc[category]) acc[category] = [];
      acc[category].push(service);
      return acc;
    }, {} as Record<string, MechanicalServiceItem[]>);
  }, [services]);

  if (!copy || !services) {
    return (
      <div className="min-h-screen bg-black pt-32 pb-16 px-6 text-center">
        <p className="text-gray-500 text-sm">{lang === 'it' ? 'Caricamento…' : 'Loading…'}</p>
      </div>
    );
  }

  const tx = (it: string, en: string) => (lang === 'it' ? it : en);

  return (
    <div className="min-h-screen bg-black pt-32 pb-16 px-6">
      <div className="container mx-auto max-w-7xl">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12 md:mb-16"
        >
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 md:mb-6">
            {copy.hero_title}
          </h1>
          <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-gray-400 mb-3 md:mb-4">
            {tx(copy.hero_subtitle_it, copy.hero_subtitle_en)}
          </p>
          <p className="text-sm sm:text-base md:text-lg text-gray-500">
            {tx(copy.hero_intro_it, copy.hero_intro_en)}
          </p>
        </motion.div>

        {/* Services by Category */}
        {Object.entries(servicesByCategory).map(([category, services], index) => (
          <motion.div
            key={category}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: index * 0.1 }}
            className="mb-12"
          >
            <h2 className="text-3xl font-bold text-white mb-6 border-b border-gray-800 pb-3">
              {category}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {services.map((service) => (
                <motion.div
                  key={service.id}
                  whileHover={{ scale: 1.02 }}
                  className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 md:p-6 hover:border-white transition-all cursor-pointer flex flex-col h-full"
                  onClick={() => handleBookService(service.id)}
                >
                  <div className="flex justify-between items-start mb-2 md:mb-3">
                    <h3 className="text-base sm:text-lg md:text-xl font-bold text-white flex-1">
                      {tx(service.name_it, service.name_en)}
                    </h3>
                  </div>
                  <p className="text-gray-400 text-xs sm:text-sm mb-3 md:mb-4 flex-grow">
                    {tx(service.description_it, service.description_en)}
                  </p>
                  <div className="flex justify-between items-center mb-3 md:mb-4">
                    <div className="text-gray-500 text-xs sm:text-sm">
                      {service.duration}
                    </div>
                    <div className="text-2xl md:text-3xl font-bold text-white">
                      €{service.price}
                    </div>
                  </div>
                  <button className="w-full bg-white text-black font-bold py-2 md:py-3 px-4 md:px-6 hover:bg-gray-200 transition-colors text-sm md:text-base mt-auto">
                    {tx(copy.book_now_label_it, copy.book_now_label_en)}
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ))}

        {/* Info Section: How It Works */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-16 bg-gray-900/50 border border-gray-800 rounded-lg p-8"
        >
          <h3 className="text-2xl font-bold text-white mb-6">
            {tx(copy.how_heading_it, copy.how_heading_en)}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {copy.how_steps.map((step, i) => (
              <div key={i} className="text-center">
                <h4 className="text-lg font-bold text-white mb-2">
                  {tx(step.title_it, step.title_en)}
                </h4>
                <p className="text-gray-400 text-sm">{tx(step.text_it, step.text_en)}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Opening Hours */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-8 bg-gray-900/50 border border-gray-800 rounded-lg p-8 text-center"
        >
          <h3 className="text-lg md:text-xl font-bold text-white mb-4">
            {tx(copy.hours_heading_it, copy.hours_heading_en)}
          </h3>
          <p className="text-gray-400">{tx(copy.hours_main_it, copy.hours_main_en)}</p>
          <p className="text-gray-500 text-sm mt-2">{tx(copy.hours_sub_it, copy.hours_sub_en)}</p>
        </motion.div>
      </div>
    </div>
  );
};

export default MechanicalServicesPage;

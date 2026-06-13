import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getInvestitoriCopy, type InvestitoriCopy } from '../utils/siteCopy';

const InvestitoriPage: React.FC = () => {
  const [copy, setCopy] = useState<InvestitoriCopy | null>(null);

  useEffect(() => {
    let cancelled = false;
    getInvestitoriCopy().then((c) => { if (!cancelled) setCopy(c); });
    return () => { cancelled = true; };
  }, []);

  if (!copy) {
    return (
      <div className="bg-black text-white min-h-screen pt-32 text-center">
        <p className="text-gray-500 text-sm">Caricamento…</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-black text-white"
    >
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <img src="/investor-hero.jpeg" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/65 to-black"></div>
        <div className="container mx-auto px-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="max-w-4xl mx-auto text-center"
          >
            <h1 className="text-5xl md:text-7xl font-bold mb-6 notranslate">
              {copy.hero_title}
            </h1>
            <p className="text-xl md:text-2xl text-gray-300 mb-8">
              {copy.hero_subtitle}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Introduction Section */}
      <section className="py-16 bg-gradient-to-b from-black to-gray-900">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="max-w-4xl mx-auto"
          >
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-8 md:p-12 space-y-6">
              {copy.intro_paragraphs.map((p, i) => (
                <p key={i} className="text-lg text-gray-300 leading-relaxed">{p}</p>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Opportunity Section */}
      <section className="py-16 bg-gray-900">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="max-w-4xl mx-auto"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-8 text-center">
              {copy.opportunity_heading}
            </h2>
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-8 md:p-12 space-y-6">
              {copy.opportunity_paragraphs.map((p, i) => (
                <p key={i} className="text-lg text-gray-300 leading-relaxed">{p}</p>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Strength Points Section */}
      <section className="py-16 bg-black">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="max-w-6xl mx-auto"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center">
              {copy.strength_heading}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {copy.strength_points.map((point, index) => (
                <motion.div
                  key={point.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6 hover:border-gray-600 transition-colors"
                >
                  <h3 className="text-xl font-semibold mb-3">{point.title}</h3>
                  <p className="text-gray-400 leading-relaxed">{point.description}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-b from-gray-900 to-black">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="max-w-4xl mx-auto"
          >
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-2xl p-8 md:p-12 text-center">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                {copy.cta_heading}
              </h2>
              {copy.cta_paragraphs.map((p, i) => (
                <p key={i} className={`text-lg text-gray-300 leading-relaxed ${i === copy.cta_paragraphs.length - 1 ? 'mb-10' : 'mb-8'}`}>{p}</p>
              ))}
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <a
                  href={copy.cta_whatsapp_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-white text-black px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gray-200 transition-colors"
                >
                  {copy.cta_button_label}
                </a>
                <a
                  href={`mailto:${copy.cta_email}`}
                  className="inline-block bg-gray-800 text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gray-700 transition-colors border border-gray-700"
                >
                  {copy.cta_email}
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Company Info Section */}
      <section className="py-16 bg-gray-900">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="max-w-4xl mx-auto"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-8 text-center">
              {copy.info_heading}
            </h2>
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-8 md:p-12">
              <div className="space-y-4">
                {copy.info_items.map((info, index) => (
                  <div
                    key={index}
                    className="flex flex-col md:flex-row md:items-start border-b border-gray-700 last:border-b-0 pb-4 last:pb-0"
                  >
                    <span className="text-gray-400 md:w-1/3 mb-2 md:mb-0 font-medium">
                      {info.label}:
                    </span>
                    <span className="text-white md:w-2/3">
                      {info.value}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-400 mt-8 italic leading-relaxed">
                {copy.info_footnote}
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Legal Notice Section */}
      <section className="py-16 bg-black border-t border-gray-800">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="max-w-4xl mx-auto"
          >
            <div className="bg-red-900/10 border border-red-900/30 rounded-2xl p-8 md:p-12 space-y-4">
              <h2 className="text-2xl font-bold mb-6 text-red-400">
                {copy.legal_heading}
              </h2>
              {copy.legal_paragraphs.map((p, i) => (
                <p key={i} className="text-gray-300 leading-relaxed">{p}</p>
              ))}
            </div>
          </motion.div>
        </div>
      </section>
    </motion.div>
  );
};

export default InvestitoriPage;

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../../components/ui/Button';
import { RENTAL_CATEGORIES } from '../../constants';
import {
} from '../../components/icons/Icons';
import type { RentalItem, RentalSpec } from '../../types';

const steps = [
  { id: 1, name: 'The_Basics', description: 'Tell_us_about_your_asset' },
  { id: 2, name: 'Details_and_Specs', description: 'Add_specific_features' },
  { id: 3, name: 'Showcase_Your_Asset', description: 'Upload_high_quality_photos' },
  { id: 4, name: 'Pricing_and_Publish', description: 'Set_your_price_and_go_live' },
];

const initialFormState = {
  category: 'cars' as 'cars' | 'yachts' | 'villas' | 'jets' | 'helicopters',
  name: '',
  description: '',
  location: '',
  priceEur: 0,
  images: [] as string[], // Base64 strings
  specs: {
    power: '', engine: '', guests: '', length: '', bedrooms: '', bathrooms: '',
  },
};

const CreateListingPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState(initialFormState);
  const [isPublished, setIsPublished] = useState(false);

  const handleNext = () => setCurrentStep(prev => Math.min(prev + 1, steps.length));
  const handleBack = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSpecChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, specs: { ...prev.specs, [name]: value } }));
  };

  const handleImageUpload = (files: FileList) => {
    const newImages = Array.from(files).slice(0, 10 - formData.images.length);
    newImages.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFormData(prev => ({ ...prev, images: [...prev.images, e.target?.result as string] }));
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setFormData(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
  };

  const handlePublish = () => {
    const specs: RentalSpec[] = [];
    if (formData.category === 'cars') {
        if (formData.specs.power) specs.push({ label: { en: 'Power', it: 'Potenza' }, value: `${formData.specs.power} HP` });
        if (formData.specs.engine) specs.push({ label: { en: 'Engine', it: 'Motore' }, value: formData.specs.engine });
    } else if (formData.category === 'yachts') {
        if (formData.specs.guests) specs.push({ label: { en: 'Guests', it: 'Ospiti' }, value: formData.specs.guests });
        if (formData.specs.length) specs.push({ label: { en: 'Length', it: 'Lunghezza' }, value: `${formData.specs.length}m` });
    } else if (formData.category === 'villas') {
        if (formData.specs.guests) specs.push({ label: { en: 'Guests', it: 'Ospiti' }, value: formData.specs.guests });
        if (formData.specs.bedrooms) specs.push({ label: { en: 'Bedrooms', it: 'Camere' }, value: formData.specs.bedrooms });
        if (formData.specs.bathrooms) specs.push({ label: { en: 'Bathrooms', it: 'Bagni' }, value: formData.specs.bathrooms });
    }

    const newListing: RentalItem = {
        id: `${formData.category}-${crypto.randomUUID()}`,
        name: formData.name,
        image: formData.images[0] || '',
        images: formData.images,
        pricePerDay: {
            eur: Number(formData.priceEur),
            usd: Number(formData.priceEur) * 1.1,
            crypto: 0,
        },
        specs: specs,
        location: formData.location,
        description: { en: formData.description, it: formData.description },
    };
    
    setIsPublished(true);
    setTimeout(() => {
        navigate('/partner/dashboard', { state: { newListing } });
    }, 2500);
  };

  const renderContent = () => {
    switch(currentStep) {
        case 1: return <Step1 formData={formData} handleChange={handleChange} />;
        case 2: return <Step2 formData={formData} handleSpecChange={handleSpecChange} handleChange={handleChange} />;
        case 3: return <Step3 images={formData.images} onImageUpload={handleImageUpload} onRemoveImage={removeImage} />;
        case 4: return <Step4 formData={formData} handleChange={handleChange} />;
        default: return null;
    }
  };

  if(isPublished) {
    return (
        <div className="pt-32 pb-24 bg-black min-h-screen flex items-center justify-center text-white">
            <motion.div initial={{opacity:0, scale:0.9}} animate={{opacity:1, scale:1}} className="text-center p-8">
                <div className="w-20 h-20 bg-green-500/20 text-green-300 rounded-full flex items-center justify-center mx-auto mb-6">
                    <motion.svg initial={{pathLength: 0}} animate={{pathLength: 1}} transition={{duration: 0.5, delay: 0.2}} className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></motion.svg>
                </div>
                <h1 className="text-4xl font-bold mb-4">{t('Listing_Published')}</h1>
                <p className="text-lg text-gray-300 mb-8">{t('Your_listing_is_now_live')}</p>
            </motion.div>
        </div>
    )
  }

  return (
    <div className="pt-32 pb-24 bg-black min-h-screen text-white">
      <div className="container mx-auto px-6 max-w-4xl">
        <h1 className="text-4xl font-bold text-center mb-4">{t('Create_Your_Listing')}</h1>
        <div className="max-w-xl mx-auto mb-10">
          <div className="flex items-center">
            {steps.map((step, index) => (
              <React.Fragment key={step.id}>
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${currentStep >= step.id ? 'bg-white border-white text-black font-bold' : 'border-gray-600 text-gray-400'}`}>
                    {step.id}
                  </div>
                  <p className={`mt-2 text-xs text-center font-semibold whitespace-nowrap ${currentStep >= step.id ? 'text-white' : 'text-gray-500'}`}>{t(step.name as any)}</p>
                </div>
                {index < steps.length - 1 && <div className={`flex-1 h-0.5 mx-2 transition-colors duration-300 ${currentStep > step.id ? 'bg-white' : 'bg-gray-700'}`}></div>}
              </React.Fragment>
            ))}
          </div>
        </div>
        
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-8 min-h-[30rem] flex flex-col">
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    transition={{ duration: 0.3 }}
                    className="flex-grow"
                >
                    <h2 className="text-2xl font-bold mb-1">{t(steps[currentStep-1].name as any)}</h2>
                    <p className="text-gray-400 mb-6">{t(steps[currentStep-1].description as any)}</p>
                    {renderContent()}
                </motion.div>
            </AnimatePresence>
        </div>
        
        <div className="mt-8 flex justify-between items-center">
          <Button onClick={() => navigate('/partner/dashboard')} variant="outline">{t('Save_and_Exit')}</Button>
          <div className="flex gap-4">
            <Button onClick={handleBack} disabled={currentStep === 1} variant="outline">{t('Back')}</Button>
            {currentStep < steps.length ? (
              <Button onClick={handleNext}>{t('Continue')}</Button>
            ) : (
              <Button onClick={handlePublish}>{t('Publish_Listing')}</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const Step1 = ({ formData, handleChange }: any) => {
    const { t, getTranslated } = useTranslation();
    return (
        <div className="space-y-6">
            <div><label className="text-sm text-gray-400 block mb-2">{t('Select_Category')}</label><select name="category" value={formData.category} onChange={handleChange} className="w-full bg-gray-800 border-gray-700 rounded-md p-3 text-white">{RENTAL_CATEGORIES.map(cat => <option key={cat.id} value={cat.id}>{getTranslated(cat.label)}</option>)}</select></div>
            <div><label className="text-sm text-gray-400 block mb-2">{t('Listing_Name')}</label><input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full bg-gray-800 border-gray-700 rounded-md p-3 text-white" /></div>
            <div><label className="text-sm text-gray-400 block mb-2">{t('Brief_Description')}</label><textarea name="description" value={formData.description} onChange={handleChange} rows={4} className="w-full bg-gray-800 border-gray-700 rounded-md p-3 text-white" /></div>
        </div>
    )
}

const Step2 = ({ formData, handleChange, handleSpecChange }: any) => {
    const { t } = useTranslation();
    const { category, specs } = formData;
    return (
        <div className="space-y-6">
            <div><label className="text-sm text-gray-400 block mb-2">{t('Location')}</label><input type="text" name="location" value={formData.location} onChange={handleChange} placeholder={t('e_g_Cagliari_Sardegna')} className="w-full bg-gray-800 border-gray-700 rounded-md p-3 text-white" /></div>
            <AnimatePresence>
            <motion.div key={category} initial={{opacity:0, height: 0}} animate={{opacity:1, height: 'auto'}} transition={{duration: 0.3}} className="overflow-hidden space-y-4">
                <h4 className="text-md font-semibold text-white mt-4 pt-4 border-t border-gray-700">{t('Specific_Details')}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {category === 'cars' && (<><div><label className="text-sm text-gray-400 block mb-1">{t('Power_HP')}</label><input type="text" name="power" value={specs.power} onChange={handleSpecChange} className="w-full bg-gray-800 border-gray-700 rounded-md p-3 text-white" /></div><div><label className="text-sm text-gray-400 block mb-1">{t('Engine')}</label><input type="text" name="engine" value={specs.engine} onChange={handleSpecChange} className="w-full bg-gray-800 border-gray-700 rounded-md p-3 text-white" /></div></>)}
                    {category === 'yachts' && (<><div><label className="text-sm text-gray-400 block mb-1">{t('Guests')}</label><input type="number" name="guests" value={specs.guests} onChange={handleSpecChange} className="w-full bg-gray-800 border-gray-700 rounded-md p-3 text-white" /></div><div><label className="text-sm text-gray-400 block mb-1">{t('Length_m')}</label><input type="number" name="length" value={specs.length} onChange={handleSpecChange} className="w-full bg-gray-800 border-gray-700 rounded-md p-3 text-white" /></div></>)}
                    {category === 'villas' && (<><div><label className="text-sm text-gray-400 block mb-1">{t('Guests')}</label><input type="number" name="guests" value={specs.guests} onChange={handleSpecChange} className="w-full bg-gray-800 border-gray-700 rounded-md p-3 text-white" /></div><div><label className="text-sm text-gray-400 block mb-1">{t('Bedrooms')}</label><input type="number" name="bedrooms" value={specs.bedrooms} onChange={handleSpecChange} className="w-full bg-gray-800 border-gray-700 rounded-md p-3 text-white" /></div><div><label className="text-sm text-gray-400 block mb-1">{t('Bathrooms')}</label><input type="number" name="bathrooms" value={specs.bathrooms} onChange={handleSpecChange} className="w-full bg-gray-800 border-gray-700 rounded-md p-3 text-white" /></div></>)}
                </div>
            </motion.div>
            </AnimatePresence>
        </div>
    )
}

const Step3 = ({ images, onImageUpload, onRemoveImage }: any) => {
    const { t } = useTranslation();
    const dropRef = React.useRef<HTMLLabelElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    
    const handleDrag = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); }, []);
    const handleDragIn = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsDragging(true); }, []);
    const handleDragOut = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }, []);
    const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); if (e.dataTransfer.files && e.dataTransfer.files.length > 0) { onImageUpload(e.dataTransfer.files); e.dataTransfer.clearData(); } }, [onImageUpload]);

    return (
        <div>
            <label ref={dropRef} onDragEnter={handleDragIn} onDragLeave={handleDragOut} onDragOver={handleDrag} onDrop={handleDrop} className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${isDragging ? 'border-white bg-gray-700/50' : 'border-gray-600 bg-gray-800/50 hover:bg-gray-700/50'}`}>
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    
                    <p className="mb-2 text-sm text-gray-400"><span className="font-semibold text-white">{t('Drag_and_drop_or_click')}</span></p>
                    <p className="text-xs text-gray-500">{t('Upload_up_to_10_photos')}</p>
                </div>
                <input type="file" className="hidden" multiple accept="image/*" onChange={(e) => e.target.files && onImageUpload(e.target.files)} />
            </label>
            <p className="text-xs text-gray-500 mt-2">{t('Main_photo_first')}</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4 mt-4">
                <AnimatePresence>
                    {images.map((img: string, index: number) => (
                        <motion.div key={index} layout initial={{scale:0.5, opacity: 0}} animate={{scale:1, opacity:1}} exit={{scale:0.5, opacity: 0}} className="relative aspect-square">
                            <img src={img} alt={`preview ${index}`} className="w-full h-full object-cover rounded-md" />
                            <button type="button" onClick={() => onRemoveImage(index)} className="absolute -top-2 -right-2 bg-red-600 text-white w-6 h-6 flex items-center justify-center text-xs font-bold hover:bg-red-500">
                                
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    )
}

const Step4 = ({ formData, handleChange }: any) => {
    const { t } = useTranslation();
    return (
        <div>
            <h3 className="text-lg font-semibold mb-4">{t('Review_Your_Listing')}</h3>
            <p className="text-gray-400 mb-6">{t('Youre_all_set')}</p>
            <div className="bg-gray-800/50 p-4 rounded-lg space-y-2 border border-gray-700">
                <div className="flex justify-between"><span className="text-gray-400">{t('Listing_Name')}</span><span className="text-white font-medium text-right">{formData.name}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">{t('Category')}</span><span className="text-white font-medium text-right">{formData.category}</span></div>
            </div>
             <div className="mt-6">
                <label className="text-sm text-gray-400 block mb-2">{t('Price_per_day_EUR')}</label>
                <input type="number" name="priceEur" value={formData.priceEur} onChange={handleChange} className="w-full bg-gray-800 border-gray-700 rounded-md p-3 text-white" placeholder="e.g., 500"/>
            </div>
        </div>
    )
}

export default CreateListingPage;
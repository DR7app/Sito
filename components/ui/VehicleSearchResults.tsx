import React from 'react';
import { motion } from 'framer-motion';
import type { SearchFormData } from './VehicleSearchForm';
import { useTranslation } from '../../hooks/useTranslation';

export interface AvailableVehicleResult {
    vehicleId: string;
    vehicleIds: string[];
    availableVehicleIds: string[];
    plates: string[];
    displayName: string;
    displayGroup: string;
    dailyRate: number;
    category: string;
    metadata: Record<string, any> | null;
    availableCount: number;
    totalCount: number;
}

interface VehicleSearchResultsProps {
    results: AvailableVehicleResult[];
    searchData: SearchFormData;
    onBook: (vehicle: AvailableVehicleResult) => void;
    isUrban: boolean;
}

// Map vehicle name to image (same logic as useVehicles.ts)
const getVehicleImage = (name: string, metadata?: Record<string, any> | null): string => {
    if (metadata?.image) return metadata.image;
    if (!name) return '/car.jpeg';
    const lowerName = name.toLowerCase();

    if (lowerName.includes('rs3')) return '/rs3.jpeg';
    if (lowerName.includes('m3') && !lowerName.includes('m340')) return '/bmw-m3.jpeg';
    if (lowerName.includes('m340')) return '/bmw-m340i.jpeg';
    if (lowerName.includes('911') || lowerName.includes('carrera')) return '/porsche-911.jpeg';
    if (lowerName.includes('c63')) return '/c63.jpeg';
    if (lowerName.includes('a45')) return '/mercedes_amg.jpeg';
    if (lowerName.includes('cayenne')) return '/cayenne.jpeg';
    if (lowerName.includes('macan')) return '/macan.jpeg';
    if (lowerName.includes('gle')) return '/mercedes-gle.jpeg';
    if (lowerName.includes('m4')) return '/bmw-m4.jpeg';
    if (lowerName.includes('ducato')) return '/ducato.jpeg';
    if (lowerName.includes('vito') || lowerName.includes('v class')) return '/vito.jpeg';
    if (lowerName.includes('208')) return '/208.jpeg';
    if (lowerName.includes('clio') && (lowerName.includes('arancio') || lowerName.includes('orange'))) return '/clio4a.jpeg';
    if (lowerName.includes('clio') && (lowerName.includes('blu') || lowerName.includes('blue'))) return '/clio4b.jpeg';
    if (lowerName.includes('c3') && (lowerName.includes('red') || lowerName.includes('rosso'))) return '/c3r.jpeg';
    if (lowerName.includes('c3') && (lowerName.includes('white') || lowerName.includes('bianca'))) return '/cr3w.jpeg';
    if (lowerName.includes('c3')) return '/c3.jpeg';
    if (lowerName.includes('captur')) return '/captur.jpeg';
    if (lowerName.includes('panda') && (lowerName.includes('bianca') || lowerName.includes('white'))) return '/panda2.jpeg';
    if (lowerName.includes('panda') && (lowerName.includes('aranci') || lowerName.includes('orange'))) return '/panda3.jpeg';
    if (lowerName.includes('panda')) return '/panda1.jpeg';
    // 2026-05-23: placeholder vehicles per categoria.
    if (lowerName === 'moto' || lowerName.startsWith('moto ')) return '/moto.jpeg';
    if (lowerName === 'urban' || lowerName.startsWith('urban ')) return '/urbancars.jpeg';
    if (lowerName === 'supercar' || lowerName.startsWith('supercar')) return '/supercar.jpeg';

    return '/car.jpeg';
};

const VehicleSearchResults: React.FC<VehicleSearchResultsProps> = ({ results, searchData, onBook, isUrban }) => {
  const { t } = useTranslation();
    // Calculate number of rental days
    const pickupTime = searchData.pickupTime || '10:30';
    const returnTime = searchData.returnTime || '09:00';
    const pickupDateTime = new Date(`${searchData.pickupDate}T${pickupTime}:00`);
    const returnDateTime = new Date(`${searchData.returnDate}T${returnTime}:00`);
    const diffMs = returnDateTime.getTime() - pickupDateTime.getTime();
    const rentalDays = isNaN(diffMs) ? 1 : Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));

    const formatPrice = (amount: number) => {
        return new Intl.NumberFormat('it-IT', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        }).format(amount);
    };

    if (results.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-5xl mx-auto mt-8 text-center"
            >
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 md:p-12">
                    <svg className="mx-auto h-16 w-16 text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="text-xl font-bold text-white mb-2">{t({ it: "Nessun veicolo disponibile", en: "No vehicles available" })}</h3>
                    <p className="text-gray-400">
                        {t({ it: 'Non ci sono veicoli disponibili per le date selezionate. Prova a modificare le date.', en: 'No vehicles are available for the selected dates. Try changing the dates.' })}
                    </p>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-6xl mx-auto mt-8"
        >
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-xl font-bold text-white">
                        {results.length} veicol{results.length === 1 ? 'o' : 'i'} disponibil{results.length === 1 ? 'e' : 'i'}
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">
                        {rentalDays} giorn{rentalDays === 1 ? 'o' : 'i'} &middot; {searchData.pickupDate} → {searchData.returnDate}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {results.map((vehicle, index) => {
                    const image = getVehicleImage(vehicle.displayName, vehicle.metadata);
                    // Urban: flat €69/day. Supercars: use daily_rate from DB
                    const dailyPrice = isUrban ? 69 : (vehicle.dailyRate || 0);
                    const totalPrice = dailyPrice * rentalDays;

                    return (
                        <motion.div
                            key={vehicle.vehicleId}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: index * 0.05 }}
                            className="bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden hover:border-gray-600 transition-all duration-300 group"
                        >
                            {/* Vehicle Image */}
                            <div className="relative aspect-[9/16] overflow-hidden">
                                <img
                                    src={image}
                                    alt={vehicle.displayName}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                    loading="lazy"
                                />
                                {/* KASKO badge */}
                                <div className="absolute top-3 left-3">
                                    <span className="bg-green-600/90 text-white text-xs font-bold px-2.5 py-1 backdrop-blur-sm">
                                        KASKO Inclusa
                                    </span>
                                </div>
                                {vehicle.availableCount > 1 && (
                                    <div className="absolute top-3 right-3">
                                        <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-1 backdrop-blur-sm">
                                            {vehicle.availableCount} disponibili
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Vehicle Info */}
                            <div className="p-5">
                                <h4 className="text-lg font-bold text-white mb-1">{vehicle.displayName}</h4>

                                {/* Specs from metadata */}
                                {vehicle.metadata?.specs && (
                                    <div className="flex flex-wrap gap-2 mt-2 mb-3">
                                        {vehicle.metadata.specs.power && (
                                            <span className="text-xs text-gray-400 bg-gray-800 px-2 py-1">
                                                {vehicle.metadata.specs.power}
                                            </span>
                                        )}
                                        {vehicle.metadata.specs.acceleration && (
                                            <span className="text-xs text-gray-400 bg-gray-800 px-2 py-1">
                                                {vehicle.metadata.specs.acceleration}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* Pricing */}
                                <div className="mt-3 mb-4">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-2xl font-bold text-white">{formatPrice(totalPrice)}</span>
                                        <span className="text-sm text-gray-400">{t({ it: "totale", en: "total" })}</span>
                                    </div>
                                    <p className="text-sm text-gray-500 mt-0.5">
                                        {formatPrice(dailyPrice)}{t({ it: '/giorno', en: '/day' })} {isUrban && t({ it: '· KASKO inclusa', en: '· KASKO included' })}
                                    </p>
                                </div>

                                {/* Book Button */}
                                <button
                                    onClick={() => onBook(vehicle)}
                                    className="w-full bg-white text-black font-bold py-3 uppercase tracking-wider text-sm hover:bg-gray-200 transition-all duration-300 transform hover:scale-[1.02]"
                                >
                                    PRENOTA
                                </button>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </motion.div>
    );
};

export default VehicleSearchResults;

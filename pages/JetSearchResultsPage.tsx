
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AIRPORTS as DEFAULT_AIRPORTS } from '../constants';
import type { RentalItem } from '../types';
import RentalCard from '../components/ui/RentalCard';
import { useTranslation } from '../hooks/useTranslation';
import { motion } from 'framer-motion';
import { useVerification } from '../hooks/useVerification';
import { getJetSearchResultsCopy, type JetSearchResultsCopy } from '../utils/siteCopy';
import { getAirports } from '../utils/getLocations';
import { getJetFleet } from '../utils/getAviationFleet';

const JetSearchResultsPage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { lang } = useTranslation();
    const { checkVerificationAndProceed } = useVerification();
    const [copy, setCopy] = useState<JetSearchResultsCopy | null>(null);
    const [airports, setAirports] = useState(DEFAULT_AIRPORTS);
    const [jetFleet, setJetFleet] = useState<RentalItem[]>([]);
    useEffect(() => {
        let cancelled = false;
        getJetSearchResultsCopy().then((c) => { if (!cancelled) setCopy(c); });
        getAirports().then((a) => { if (!cancelled) setAirports(a); });
        getJetFleet().then((f) => { if (!cancelled) setJetFleet(f); });
        return () => { cancelled = true; };
    }, []);
    const tx = (it: keyof JetSearchResultsCopy, en: keyof JetSearchResultsCopy, fallback = ''): string => {
        if (!copy) return fallback;
        return (copy as Record<string, string>)[(lang === 'it' ? it : en) as string] || fallback;
    };

    const searchCriteria = useMemo(() => ({
        tripType: searchParams.get('tripType') || 'one-way',
        departure: searchParams.get('departure'),
        arrival: searchParams.get('arrival'),
        departureDate: searchParams.get('departureDate'),
        returnDate: searchParams.get('returnDate'),
        passengers: parseInt(searchParams.get('passengers') || '1', 10),
        pets: searchParams.get('pets') === 'true',
        smoking: searchParams.get('smoking') === 'true',
    }), [searchParams]);

    const searchResults = useMemo(() => {
        if (!jetFleet.length) return [];
        return jetFleet.filter(jet => {
            const passengerSpec = jet.specs.find(s => s.label.en.toLowerCase() === 'passengers');
            if (!passengerSpec || parseInt(passengerSpec.value, 10) < searchCriteria.passengers) {
                return false;
            }
            if (searchCriteria.pets && !jet.petsAllowed) {
                return false;
            }
            if (searchCriteria.smoking && !jet.smokingAllowed) {
                return false;
            }
            return true;
        });
    }, [searchCriteria, jetFleet]);

    const handleBook = (item: RentalItem) => {
        checkVerificationAndProceed(() => {
            navigate(`/book/jets/${item.id}`, {
                state: {
                    tripType: searchCriteria.tripType,
                    departurePoint: searchCriteria.departure,
                    arrivalPoint: searchCriteria.arrival,
                    departureDate: searchCriteria.departureDate,
                    returnDate: searchCriteria.returnDate,
                    passengers: searchCriteria.passengers,
                    petsAllowed: searchCriteria.pets,
                    smokingAllowed: searchCriteria.smoking,
                }
            });
        });
    };
    
    const getAirportName = (iata: string | null) => {
        if (!iata) return copy?.airport_fallback || 'N/A';
        const airport = airports.find(a => a.iata === iata);
        return airport ? `${airport.city} (${airport.iata})` : iata;
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="pt-32 pb-24 bg-black min-h-screen"
        >
            <div className="container mx-auto px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4"
                >
                    <div>
                        <h1 className="text-4xl md:text-5xl font-bold text-white">{tx('title_it', 'title_en', 'Search Results')}</h1>
                        <p className="text-gray-400 mt-1">
                            {getAirportName(searchCriteria.departure)} {tx('subtitle_connector_it', 'subtitle_connector_en', 'to')} {getAirportName(searchCriteria.arrival)} &middot; {searchCriteria.passengers} {tx('passengers_suffix_it', 'passengers_suffix_en', 'Passengers')}
                        </p>
                    </div>
                    <button
                        onClick={() => navigate('/jets')}
                        className="bg-gray-800 text-white px-6 py-2 font-semibold text-sm hover:bg-gray-700 transition-colors"
                    >
                        {tx('modify_search_cta_it', 'modify_search_cta_en', 'Modify Search')}
                    </button>
                </motion.div>

                {searchResults.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {searchResults.map(item => (
                            <RentalCard
                                key={item.id}
                                item={item}
                                onBook={handleBook}
                                jetSearchData={{
                                    departure: getAirportName(searchCriteria.departure),
                                    arrival: getAirportName(searchCriteria.arrival),
                                    departureDate: searchCriteria.departureDate || undefined,
                                    returnDate: searchCriteria.returnDate || undefined,
                                    passengers: searchCriteria.passengers,
                                    tripType: searchCriteria.tripType,
                                }}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 bg-gray-900/50 border border-gray-800 rounded-lg">
                        <h2 className="text-2xl font-bold text-white">{tx('empty_title_it', 'empty_title_en', 'No jets found')}</h2>
                        <p className="text-gray-400 mt-2">{tx('empty_body_it', 'empty_body_en', 'Try adjusting your search criteria.')}</p>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default JetSearchResultsPage;

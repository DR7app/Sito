import React, { useState, useMemo } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { motion } from 'framer-motion';
import {
    getPickupTimesForDateString,
    getReturnTimesForDateString,
    isPickupClosed,
    isReturnClosed,
} from '../../utils/noleggioHours';

export interface SearchFormData {
    pickupLocation: string;
    returnLocation: string;
    pickupDate: string;
    pickupTime: string;
    returnDate: string;
    returnTime: string;
    ageBracket: 'under26' | '26to69';
}

interface VehicleSearchFormProps {
    onSearch: (data: SearchFormData) => void;
    isSearching: boolean;
    category: string; // 'cars' | 'urban-cars' | 'corporate-fleet'
}

// Office hours come from Centralina Pro > Orari Noleggio (utils/noleggioHours).

const LOCATIONS = [
    'Cagliari Centro',
    'Aeroporto Cagliari Elmas',
    'Villasimius',
    'Costa Rei',
    'Pula',
    'Chia',
];

const VehicleSearchForm: React.FC<VehicleSearchFormProps> = ({ onSearch, isSearching, category }) => {
    const { t } = useTranslation();

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 2);

    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    const [formData, setFormData] = useState<SearchFormData>({
        pickupLocation: LOCATIONS[0],
        returnLocation: LOCATIONS[0],
        pickupDate: formatDate(tomorrow),
        pickupTime: '10:30',
        returnDate: formatDate(dayAfter),
        returnTime: '10:00',
        ageBracket: '26to69',
    });

    const [sameLocation, setSameLocation] = useState(true);

    const pickupTimesForDay = useMemo(
        () => getPickupTimesForDateString(formData.pickupDate),
        [formData.pickupDate],
    );

    const returnTimesForDay = useMemo(
        () => getReturnTimesForDateString(formData.returnDate),
        [formData.returnDate],
    );

    const pickupClosedFor = (dateStr: string) => {
        if (!dateStr) return false;
        const d = new Date(dateStr + 'T12:00:00');
        return !isNaN(d.getTime()) && isPickupClosed(d);
    };
    const returnClosedFor = (dateStr: string) => {
        if (!dateStr) return false;
        const d = new Date(dateStr + 'T12:00:00');
        return !isNaN(d.getTime()) && isReturnClosed(d);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSearch({
            ...formData,
            returnLocation: sameLocation ? formData.pickupLocation : formData.returnLocation,
        });
    };

    const update = (key: keyof SearchFormData, value: string) => {
        setFormData(prev => {
            const next = { ...prev, [key]: value };
            // Auto-adjust return date if pickup date changes to be after it
            if (key === 'pickupDate' && value >= prev.returnDate) {
                const nextDay = new Date(value + 'T12:00:00');
                nextDay.setDate(nextDay.getDate() + 1);
                next.returnDate = formatDate(nextDay);
            }
            return next;
        });
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-5xl mx-auto bg-gray-900/60 backdrop-blur-sm border border-gray-800 rounded-2xl p-5 md:p-8"
        >
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
                {t('Search_Available_Vehicles')}
            </h2>
            <p className="text-gray-400 text-sm mb-6">
                {t('Select_dates_and_verify')}
            </p>

            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Pickup Location */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-1.5">{t({ it: 'Luogo Ritiro', en: 'Pick-up location' })}</label>
                        <select
                            value={formData.pickupLocation}
                            onChange={e => update('pickupLocation', e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white text-sm focus:ring-2 focus:ring-white focus:border-white transition"
                        >
                            {LOCATIONS.map(loc => (
                                <option key={loc} value={loc}>{loc}</option>
                            ))}
                        </select>
                    </div>

                    {/* Pickup Date */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-1.5">{t({ it: 'Data Ritiro', en: 'Pick-up date' })}</label>
                        <input
                            type="date"
                            value={formData.pickupDate}
                            onChange={e => update('pickupDate', e.target.value)}
                            min={formatDate(tomorrow)}
                            className={`w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white text-sm focus:ring-2 focus:ring-white ${pickupClosedFor(formData.pickupDate) ? 'border-red-500' : ''}`}
                        />
                        {pickupClosedFor(formData.pickupDate) && (
                            <p className="text-xs text-red-400 mt-1">{t({ it: 'Chiuso in questa data', en: 'Closed on this date' })}</p>
                        )}
                    </div>

                    {/* Pickup Time */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-1.5">{t({ it: 'Ora Ritiro', en: 'Pick-up time' })}</label>
                        <select
                            value={formData.pickupTime}
                            onChange={e => update('pickupTime', e.target.value)}
                            disabled={pickupTimesForDay.length === 0}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white text-sm focus:ring-2 focus:ring-white focus:border-white transition disabled:opacity-50"
                        >
                            {pickupTimesForDay.length === 0 ? (
                                <option>{t({ it: 'Chiuso', en: 'Closed' })}</option>
                            ) : (
                                pickupTimesForDay.map(time => (
                                    <option key={time} value={time}>{time}</option>
                                ))
                            )}
                        </select>
                    </div>

                    {/* Age Bracket */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-1.5">{t({ it: 'Età Conducente', en: 'Driver age' })}</label>
                        <select
                            value={formData.ageBracket}
                            onChange={e => update('ageBracket', e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white text-sm focus:ring-2 focus:ring-white focus:border-white transition"
                        >
                            <option value="under26">{t({ it: '21-25 anni', en: '21-25 years' })}</option>
                            <option value="26to69">{t({ it: '26-69 anni', en: '26-69 years' })}</option>
                        </select>
                    </div>

                    {/* Return Location (if different) */}
                    {!sameLocation && (
                        <div>
                            <label className="block text-sm text-gray-400 mb-1.5">{t({ it: 'Luogo Riconsegna', en: 'Drop-off location' })}</label>
                            <select
                                value={formData.returnLocation}
                                onChange={e => update('returnLocation', e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white text-sm focus:ring-2 focus:ring-white focus:border-white transition"
                            >
                                {LOCATIONS.map(loc => (
                                    <option key={loc} value={loc}>{loc}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Return Date */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-1.5">{t({ it: 'Data Riconsegna', en: 'Drop-off date' })}</label>
                        <input
                            type="date"
                            value={formData.returnDate}
                            onChange={e => update('returnDate', e.target.value)}
                            min={formData.pickupDate}
                            className={`w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white text-sm focus:ring-2 focus:ring-white ${returnClosedFor(formData.returnDate) ? 'border-red-500' : ''}`}
                        />
                        {returnClosedFor(formData.returnDate) && (
                            <p className="text-xs text-red-400 mt-1">{t({ it: 'Chiuso in questa data', en: 'Closed on this date' })}</p>
                        )}
                    </div>

                    {/* Return Time */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-1.5">{t({ it: 'Ora Riconsegna', en: 'Drop-off time' })}</label>
                        <select
                            value={formData.returnTime}
                            onChange={e => update('returnTime', e.target.value)}
                            disabled={returnTimesForDay.length === 0}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white text-sm focus:ring-2 focus:ring-white focus:border-white transition disabled:opacity-50"
                        >
                            {returnTimesForDay.length === 0 ? (
                                <option>{t({ it: 'Chiuso', en: 'Closed' })}</option>
                            ) : (
                                returnTimesForDay.map(time => (
                                    <option key={time} value={time}>{time}</option>
                                ))
                            )}
                        </select>
                    </div>
                </div>

                {/* Same location toggle */}
                <div className="mt-4">
                    <label className="flex items-center space-x-2 cursor-pointer text-sm text-gray-300">
                        <input
                            type="checkbox"
                            checked={sameLocation}
                            onChange={e => setSameLocation(e.target.checked)}
                            className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-white focus:ring-white"
                        />
                        <span>{t({ it: 'Stessa sede per ritiro e riconsegna', en: 'Same location for pick-up and drop-off' })}</span>
                    </label>
                </div>

                {/* Search button */}
                <div className="mt-6 flex justify-center">
                    <button
                        type="submit"
                        disabled={isSearching || pickupClosedFor(formData.pickupDate) || returnClosedFor(formData.returnDate)}
                        className="px-10 py-3.5 bg-white text-black font-bold rounded-full text-sm uppercase tracking-wider hover:bg-gray-200 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:transform-none flex items-center gap-2"
                    >
                        {isSearching ? (
                            <>
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                {t({ it: 'Verifica in corso...', en: 'Checking...' })}
                            </>
                        ) : (
                            t({ it: 'VERIFICA DISPONIBILITÀ', en: 'CHECK AVAILABILITY' })
                        )}
                    </button>
                </div>
            </form>
        </motion.div>
    );
};

export default VehicleSearchForm;

import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../../hooks/useTranslation';
import { useAuth } from '../../hooks/useAuth';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
} from '../../components/icons/Icons';
import type { RentalItem } from '../../types';
import { Button } from '../../components/ui/Button';
import { supabase } from '../../supabaseClient';

const StatusBadge: React.FC<{ status: 'unverified' | 'pending' | 'verified' }> = ({ status }) => {
    const { t } = useTranslation();
    const statusMap = {
        unverified: { text: t('Unverified'), color: 'bg-red-500/20 text-red-400' },
        pending: { text: t('Pending'), color: 'bg-yellow-500/20 text-yellow-400' },
        verified: { text: t('Verified'), color: 'bg-green-500/20 text-green-400' },
    };
    return <span className={`px-2.5 py-1 text-xs font-semibold ${statusMap[status].color}`}>{statusMap[status].text}</span>;
}


const PartnerDashboardPage: React.FC = () => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [myListings, setMyListings] = useState<RentalItem[]>([]);
    const [bookings, setBookings] = useState<any[]>([]);

    useEffect(() => {
        if (location.state?.newListing) {
            setMyListings(prev => [...prev, location.state.newListing]);
            // Clear location state to prevent re-adding on refresh
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, navigate]);



    // Load bookings from Supabase
    useEffect(() => {
        const fetchBookings = async () => {
            if (!user) return;

            try {
                const { data, error } = await supabase
                    .from('bookings')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('booked_at', { ascending: false })
                    .limit(5);

                if (error) throw error;
                setBookings(data || []);
            } catch (error) {
                console.error('Error fetching bookings:', error);
            }
        };

        fetchBookings();
    }, [user]);

    const FeatureCard: React.FC<{ icon: React.FC<{ className?: string }>, title: string, description: string }> = ({ icon: Icon, title, description }) => (
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 text-center relative overflow-hidden h-full">
            <div className="absolute -top-4 -right-4 w-20 h-20 bg-gray-700/20 rounded-full blur-2xl"></div>
            <div className="relative z-10">
                <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-700">

                </div>
                <h3 className="text-lg font-bold text-white">{t(title as any)}</h3>
                <p className="text-sm text-gray-400 mt-2">{t(description as any)}</p>
                <div className="mt-4">
                    <span className="text-xs font-semibold text-gray-500 bg-gray-800 px-2 py-1">{t('Coming_Soon')}</span>
                </div>
            </div>
        </div>
    );

    const verificationStatus = user?.businessVerification?.status || 'unverified';

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="pt-20 md:pt-32 pb-24 bg-black min-h-screen"
        >
            <div className="container mx-auto px-4 md:px-6">
                <div className="text-center mb-6 md:mb-12">
                    <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white mb-2">{t('Welcome_to_your_Partner_Dashboard')}</h1>
                    <p className="text-lg text-gray-400">Welcome, {user?.companyName || user?.fullName}</p>
                </div>

                <div className="max-w-5xl mx-auto">
                    {verificationStatus !== 'verified' && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-yellow-900/30 border border-yellow-400/40 rounded-lg p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
                            <div className="flex items-center gap-4">

                                <div>
                                    <h3 className="font-bold text-white">{t('Account_Status')}: <StatusBadge status={verificationStatus} /></h3>
                                    <p className="text-sm text-yellow-200/80">{t('Verification_Required_Partner')}</p>
                                </div>
                            </div>
                            <Button as={Link} to="/partner/verification" variant="outline" size="sm" className="bg-yellow-400/10 border-yellow-400/50 text-yellow-300 hover:bg-yellow-400/20 hover:border-yellow-400/80 shrink-0">
                                {t('Verify_Account')}
                            </Button>
                        </motion.div>
                    )}

                    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 md:p-8 mb-12">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                            <h2 className="text-2xl font-bold text-white">{t('Your_Listings')}</h2>
                            <Button as={Link} to="/partner/listings/new" size="sm" disabled={verificationStatus !== 'verified'} title={verificationStatus !== 'verified' ? t('Verification_Required_Partner') : ''}>

                                {t('Create_New_Listing')}
                            </Button>
                        </div>
                        {myListings.length === 0 ? (
                            <div className="text-center py-12 border-2 border-dashed border-gray-700 rounded-lg">

                                <h3 className="text-lg font-semibold text-white">{t('No_listings_yet')}</h3>
                                <p className="text-gray-400 mt-1">{t('Create_your_first_listing_to_get_started')}</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {myListings.map(item => (
                                    <motion.div key={item.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700">
                                        <img src={item.image} alt={item.name} className="w-full h-40 object-cover" />
                                        <div className="p-4">
                                            <h4 className="font-bold text-white truncate">{item.name}</h4>
                                            <p className="text-sm text-gray-300 mt-1">{item.pricePerDay?.eur.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })} / {t('day')}</p>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* My Bookings Section */}
                    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 md:p-8 mb-12">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                            <div className="flex items-center gap-3">

                                <h2 className="text-2xl font-bold text-white">{t('My_Bookings')}</h2>
                            </div>
                            <Button as={Link} to="/account/bookings" size="sm" variant="outline">
                                {t('View_All')}
                            </Button>
                        </div>
                        {bookings.length === 0 ? (
                            <div className="text-center py-12 border-2 border-dashed border-gray-700 rounded-lg">

                                <h3 className="text-lg font-semibold text-white">{t('No_bookings_yet')}</h3>
                                <p className="text-gray-400 mt-1">{t('Your_bookings_will_appear_here')}</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {bookings.map((booking) => (
                                    <div key={booking.id} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h4 className="font-bold text-white">
                                                    {booking.service_type === 'car_wash' ? '' : ''}
                                                    {booking.service_name}
                                                </h4>
                                                <p className="text-xs text-gray-400 mt-1">
                                                    DR7-{booking.id.substring(0, 8).toUpperCase()}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold text-white">
                                                    €{(booking.price_total / 100).toFixed(2)}
                                                </p>
                                                <span className={`text-xs px-2 py-0.5 ${booking.payment_status === 'paid' || booking.payment_status === 'succeeded' || booking.payment_status === 'completed'
                                                    ? 'bg-green-500/20 text-green-400'
                                                    : 'bg-yellow-500/20 text-yellow-400'
                                                    }`}>
                                                    {booking.payment_status === 'paid' || booking.payment_status === 'succeeded' || booking.payment_status === 'completed' ? 'Pagato' : 'In attesa'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <FeatureCard
                            icon={CalendarIcon}
                            title="View_Bookings"
                            description="Track_upcoming_and_past_bookings"
                        />
                        <FeatureCard
                            icon={ZapIcon}
                            title="Analytics"
                            description="Gain_insights_into_your_performance"
                        />
                        <FeatureCard
                            icon={FileTextIcon}
                            title="Manage_Listings"
                            description="Add_edit_and_organize_your_assets"
                        />
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default PartnerDashboardPage;
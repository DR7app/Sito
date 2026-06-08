/**
 * Manual script to send notifications for a missing car wash booking
 * 
 * Usage:
 * 1. Find the booking ID using find_missing_carwash_booking.sql
 * 2. Replace BOOKING_ID_HERE with the actual booking ID
 * 3. Run this script in the browser console on dr7.app
 * 
 * This will manually trigger the email and WhatsApp notifications
 */

const BOOKING_ID = 'BOOKING_ID_HERE'; // Replace with actual booking ID

async function sendMissingBookingNotifications() {
    try {
        console.log('🔍 Fetching booking from database...');

        // Fetch the booking from Supabase
        const { createClient } = window.supabase || {};
        if (!createClient) {
            console.error('❌ Supabase client not available. Please run this on dr7.app');
            return;
        }

        const supabase = createClient(
            'YOUR_SUPABASE_URL', // Get from .env
            'YOUR_SUPABASE_ANON_KEY' // Get from .env
        );

        const { data: booking, error } = await supabase
            .from('bookings')
            .select('*')
            .eq('id', BOOKING_ID)
            .single();

        if (error || !booking) {
            console.error('❌ Could not find booking:', error);
            return;
        }

        console.log('✅ Found booking:', {
            id: booking.id,
            customer: booking.customer_name,
            email: booking.customer_email,
            service: booking.service_name,
            date: booking.appointment_date
        });

        // Send confirmation email
        console.log('📧 Sending confirmation email...');
        const emailResponse = await fetch('/.netlify/functions/send-booking-confirmation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking })
        });

        if (emailResponse.ok) {
            console.log('✅ Confirmation email sent successfully!');
        } else {
            const errorText = await emailResponse.text();
            console.error('❌ Email failed:', emailResponse.status, errorText);
        }

        // Send WhatsApp notification
        console.log('📱 Sending WhatsApp notification...');
        const whatsappResponse = await fetch('/.netlify/functions/send-whatsapp-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ booking })
        });

        if (whatsappResponse.ok) {
            console.log('✅ WhatsApp notification sent successfully!');
        } else {
            console.error('❌ WhatsApp notification failed:', whatsappResponse.status);
        }

        console.log('✅ All notifications sent!');

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

// Run the function
sendMissingBookingNotifications();

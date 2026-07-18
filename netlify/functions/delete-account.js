const { createClient } = require('@supabase/supabase-js');
const { getCorsOrigin } = require('./utils/cors');

exports.handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': getCorsOrigin(event.headers['origin']),
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '{}' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };
    }

    try {
        const { userId, token } = JSON.parse(event.body || '{}');

        if (!userId) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'User ID required' }) };
        }

        // Verify the requesting user owns this account
        const authHeader = event.headers['authorization'] || (token ? `Bearer ${token}` : '');
        if (!authHeader) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) };
        }

        const { createClient: createAnonClient } = require('@supabase/supabase-js');
        const anonClient = createAnonClient(
            process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
        );
        const jwt = authHeader.replace('Bearer ', '');
        const { data: { user: authUser }, error: authError } = await anonClient.auth.getUser(jwt);

        if (authError || !authUser || authUser.id !== userId) {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'You can only delete your own account' }) };
        }

        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!serviceKey) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error' }) };
        }

        const admin = createClient(process.env.SUPABASE_URL, serviceKey);

        // Delete ALL user data from all tables
        try { await admin.from('bookings').delete().eq('user_id', userId); } catch(e) { console.error('Error deleting from bookings:', e?.message); }
        try { await admin.from('credit_transactions').delete().eq('user_id', userId); } catch(e) { console.error('Error deleting from credit_transactions:', e?.message); }
        try { await admin.from('membership_purchases').delete().eq('user_id', userId); } catch(e) { console.error('Error deleting from membership_purchases:', e?.message); }
        try { await admin.from('customers_extended').delete().eq('user_id', userId); } catch(e) { console.error('Error deleting from customers_extended:', e?.message); }
        try { await admin.from('user_credit_balance').delete().eq('user_id', userId); } catch(e) { console.error('Error deleting from user_credit_balance:', e?.message); }
        try { await admin.from('user_documents').delete().eq('user_id', userId); } catch(e) { console.error('Error deleting from user_documents:', e?.message); }
        try { await admin.from('aviation_quotes').delete().eq('user_id', userId); } catch(e) { console.error('Error deleting from aviation_quotes:', e?.message); }
        try { await admin.from('credit_wallet_purchases').delete().eq('user_id', userId); } catch(e) { console.error('Error deleting from credit_wallet_purchases:', e?.message); }

        // Delete user files from storage
        try {
            await admin.storage.from('driver-licenses').remove([`${userId}`]);
            await admin.storage.from('carta-identita').remove([`${userId}`]);
        } catch(e) { console.error('Error deleting from storage:', e?.message); }

        // Delete user account
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
        }

        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };

    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
};

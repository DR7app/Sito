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

        // Cancella i dati collegati all'utente in TUTTE le tabelle che referenziano
        // auth.users. Se ne manca una, la deleteUser hard fallirebbe per vincolo
        // FK ("Database error deleting user"): per questo sotto c'e' il fallback
        // soft-delete. Best-effort: un errore su una tabella non blocca il resto.
        const userTables = [
            'bookings', 'credit_transactions', 'membership_purchases',
            'customers_extended', 'user_credit_balance', 'user_documents',
            'aviation_quotes', 'credit_wallet_purchases',
            'commercial_operation_tickets', 'user_consents',
            'dr7_club_subscriptions', 'lottery_tickets',
        ];
        for (const t of userTables) {
            try { await admin.from(t).delete().eq('user_id', userId); }
            catch (e) { console.error(`Error deleting from ${t}:`, e?.message); }
        }

        // Delete user files from storage
        try {
            await admin.storage.from('driver-licenses').remove([`${userId}`]);
            await admin.storage.from('carta-identita').remove([`${userId}`]);
        } catch(e) { console.error('Error deleting from storage:', e?.message); }

        // Elimina l'account (hard delete). Se un vincolo FK residuo lo blocca,
        // ripiega su soft-delete: l'utente viene disattivato e non puo' piu'
        // accedere — la cancellazione riesce comunque dal suo punto di vista.
        const { error: hardErr } = await admin.auth.admin.deleteUser(userId);
        if (hardErr) {
            console.error('[delete-account] hard delete failed, trying soft:', hardErr?.message);
            const { error: softErr } = await admin.auth.admin.deleteUser(userId, true);
            if (softErr) {
                console.error('[delete-account] soft delete failed:', softErr?.message);
                return { statusCode: 500, headers, body: JSON.stringify({ error: 'Impossibile eliminare l\'account in questo momento. Riprova piu\' tardi o contatta l\'assistenza.' }) };
            }
        }

        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };

    } catch (e) {
        console.error('[delete-account] error:', e?.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Errore durante l\'eliminazione dell\'account. Riprova piu\' tardi.' }) };
    }
};

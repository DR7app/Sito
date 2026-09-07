const { createClient } = require('@supabase/supabase-js');
const { getCorsOrigin } = require('./utils/cors');

// Cancellazione definitiva del DR7 Club, chiesta dal cliente dal suo profilo.
//
// Due cose, in quest'ordine di importanza:
//   1. l'abbonamento va chiuso (e' un diritto del cliente, non deve poter
//      fallire per colpa nostra);
//   2. va lasciata una traccia che impedisce una nuova iscrizione, anche da
//      un altro account con gli stessi dati (e' cio' che il popup promette).
//
// Il passo 2 richiede la tabella dr7_club_cancellazioni (migrazione
// 20260907_dr7_club_cancellazione_definitiva.sql). Se manca, l'abbonamento
// viene comunque chiuso e la risposta lo dichiara: meglio un blocco da
// registrare a mano che un cliente prigioniero del Club.
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': getCorsOrigin(event.headers['origin']),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '{}' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };
  }

  try {
    const { userId, token } = JSON.parse(event.body || '{}');
    if (!userId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'User ID required' }) };
    }

    const authHeader = event.headers['authorization'] || (token ? `Bearer ${token}` : '');
    if (!authHeader) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) };
    }

    const anonClient = createClient(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
    );
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await anonClient.auth.getUser(jwt);
    if (authError || !authUser || authUser.id !== userId) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Puoi cancellare solo il tuo abbonamento' }) };
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error' }) };
    }
    const admin = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, serviceKey);

    // Abbonamenti da chiudere: attivi e anche i pending (un pagamento avviato
    // e mai concluso non deve tornare attivo dopo la cancellazione).
    const { data: subs, error: subsErr } = await admin
      .from('dr7_club_subscriptions')
      .select('id, plan, status')
      .eq('user_id', userId)
      .in('status', ['active', 'pending']);
    if (subsErr) throw new Error(subsErr.message);

    if (subs && subs.length > 0) {
      const { error: updErr } = await admin
        .from('dr7_club_subscriptions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .in('id', subs.map(s => s.id));
      if (updErr) throw new Error(updErr.message);
    }

    // Identita' su cui vale il blocco. La patente sta nel metadata JSONB del
    // profilo esteso; il codice fiscale nella colonna dedicata.
    let email = (authUser.email || '').toLowerCase() || null;
    let codiceFiscale = null;
    let numeroPatente = null;
    try {
      const { data: ext } = await admin
        .from('customers_extended')
        .select('codice_fiscale, metadata, email')
        .eq('user_id', userId)
        .maybeSingle();
      if (ext) {
        codiceFiscale = (ext.codice_fiscale || '').trim().toUpperCase() || null;
        numeroPatente = ((ext.metadata && ext.metadata.numero_patente) || '').trim().toUpperCase() || null;
        if (!email) email = (ext.email || '').toLowerCase() || null;
      }
    } catch (e) {
      console.error('[cancel-dr7-club] profilo esteso non letto:', e && e.message);
    }

    let bloccoRegistrato = true;
    try {
      const righe = (subs && subs.length > 0 ? subs : [null]).map(s => ({
        user_id: userId,
        email,
        codice_fiscale: codiceFiscale,
        numero_patente: numeroPatente,
        subscription_id: s ? s.id : null,
        plan: s ? s.plan : null,
      }));
      const { error: banErr } = await admin.from('dr7_club_cancellazioni').insert(righe);
      if (banErr) throw new Error(banErr.message);
    } catch (e) {
      bloccoRegistrato = false;
      console.error('[cancel-dr7-club] BLOCCO NON REGISTRATO per', userId, e && e.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        abbonamentiCancellati: subs ? subs.length : 0,
        bloccoRegistrato,
      }),
    };
  } catch (err) {
    console.error('[cancel-dr7-club]', err && err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Errore durante la cancellazione' }) };
  }
};

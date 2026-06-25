const { createClient } = require('@supabase/supabase-js');
const { getClubCashbackPct } = require('./utils/dr7ClubCashback');

// Applica il cashback DR7 Club su una ricarica wallet pagata con carta.
// IDEMPOTENTE: salta se un cashback (card_bonus / cashback_3_percent) esiste già
// per questa ricarica. Chiamato sia da PaymentSuccessPage (client, SEMPRE
// raggiunta dal cliente) sia dal webhook nexi-callback, così il cashback dei
// membri DR7 Club non si perde quando il webhook non scatta/non completa.
exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Service role not configured' }) };

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const { purchaseId } = JSON.parse(event.body || '{}');
    if (!purchaseId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'purchaseId required' }) };

    const { data: purchase } = await supabase.from('credit_wallet_purchases').select('*').eq('id', purchaseId).single();
    if (!purchase) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Purchase not found' }) };

    const paid = ['succeeded', 'completed', 'paid'].includes(String(purchase.payment_status || '').toLowerCase());
    if (!paid) return { statusCode: 200, headers, body: JSON.stringify({ skipped: true, reason: 'not paid' }) };
    if (!purchase.user_id || !(parseFloat(purchase.recharge_amount || 0) > 0)) {
      return { statusCode: 200, headers, body: JSON.stringify({ skipped: true, reason: 'no user / amount' }) };
    }

    // Idempotenza: cashback già applicato?
    const { data: existing } = await supabase
      .from('credit_transactions')
      .select('id')
      .eq('user_id', purchase.user_id)
      .eq('reference_id', purchase.id)
      .in('reference_type', ['card_bonus', 'cashback_3_percent'])
      .limit(1);
    if (existing && existing.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ skipped: true, reason: 'already applied' }) };
    }

    const cashbackPct = await getClubCashbackPct(supabase, purchase.user_id);
    if (cashbackPct == null) {
      return { statusCode: 200, headers, body: JSON.stringify({ skipped: true, reason: 'no active DR7 Club / no tier' }) };
    }

    const paidEur = parseFloat(purchase.recharge_amount);
    const cashbackAmount = Math.floor(paidEur * cashbackPct) / 100;
    if (!(cashbackAmount >= 0.01)) {
      return { statusCode: 200, headers, body: JSON.stringify({ skipped: true, reason: 'amount < 0.01' }) };
    }

    const { data: balanceRow } = await supabase.from('user_credit_balance').select('balance').eq('user_id', purchase.user_id).single();
    const currentBalance = balanceRow?.balance ? parseFloat(balanceRow.balance) : 0;
    const newBalance = Math.round((currentBalance + cashbackAmount) * 100) / 100;

    await supabase.from('user_credit_balance').upsert(
      { user_id: purchase.user_id, balance: newBalance, last_updated: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
    await supabase.from('credit_transactions').insert({
      user_id: purchase.user_id,
      transaction_type: 'credit',
      amount: cashbackAmount,
      balance_after: newBalance,
      description: `Cashback DR7 Club ${cashbackPct}% su ricarica wallet (€${paidEur.toFixed(2)} pagati con carta)`,
      reference_id: purchase.id,
      reference_type: 'card_bonus',
    });

    console.log(`[award-wallet-cashback] €${cashbackAmount.toFixed(2)} (${cashbackPct}%) accreditato a ${purchase.user_id} per ricarica ${purchase.id}`);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, cashback: cashbackAmount, pct: cashbackPct }) };
  } catch (e) {
    console.error('[award-wallet-cashback] error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};

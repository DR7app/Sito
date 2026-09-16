import { supabase } from '../supabaseClient';

export interface CreditTransaction {
  id: string;
  user_id: string;
  transaction_type: 'credit' | 'debit';
  amount: number;
  balance_after: number;
  description: string;
  reference_id?: string;
  reference_type?: string;
  created_at: string;
}

export interface UserCreditBalance {
  user_id: string;
  balance: number;
  last_updated: string;
}

/**
 * Get user's current credit balance
 */
export async function getUserCreditBalance(userId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('user_credit_balance')
      .select('balance')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching credit balance:', error);
      return 0;
    }

    return data?.balance ? parseFloat(data.balance) : 0;
  } catch (error) {
    console.error('Error fetching credit balance:', error);
    return 0;
  }
}

/**
 * Add credits to user's balance
 */
export async function addCredits(
  userId: string,
  amount: number,
  description: string,
  referenceId?: string,
  referenceType?: string
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  const { data, error } = await supabase.rpc('add_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_description: description,
    p_reference_id: referenceId || null,
    p_reference_type: referenceType || 'purchase'
  });

  if (error) {
    console.error('Error in addCredits RPC:', error);
    // Fallback: direct insert if RPC fails (e.g. overload ambiguity)
    try {
      const { data: balanceRow } = await supabase
        .from('user_credit_balance')
        .select('balance')
        .eq('user_id', userId)
        .single();

      const currentBalance = balanceRow?.balance ? parseFloat(balanceRow.balance) : 0;
      const newBalance = currentBalance + amount;

      await supabase
        .from('user_credit_balance')
        .upsert({
          user_id: userId,
          balance: newBalance,
          last_updated: new Date().toISOString()
        }, { onConflict: 'user_id' });

      await supabase
        .from('credit_transactions')
        .insert({
          user_id: userId,
          transaction_type: 'credit',
          amount: amount,
          balance_after: newBalance,
          description: description,
          reference_id: referenceId || null,
          reference_type: referenceType || 'purchase'
        });

      console.log(`Credits added via fallback: €${amount} (new balance: €${newBalance})`);
      return { success: true, newBalance };
    } catch (fallbackErr: any) {
      console.error('Fallback credit insert also failed:', fallbackErr);
      return { success: false, newBalance: 0, error: fallbackErr.message };
    }
  }

  const result = data?.[0] || data;
  return {
    success: result?.success ?? false,
    newBalance: result?.new_balance ?? 0,
    error: result?.error_message || undefined
  };
}

/**
 * Deduct credits from user's balance (atomic via RPC to prevent double-spending)
 */
export async function deductCredits(
  userId: string,
  amount: number,
  description: string,
  referenceId?: string,
  transactionType: string = 'booking_payment'
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  const { data, error } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_description: description,
    p_reference_id: referenceId || null,
    p_transaction_type: transactionType
  });

  if (error) {
    console.error('Error in deductCredits RPC:', error);
    return { success: false, newBalance: 0, error: error.message };
  }

  const result = data?.[0] || data;
  return {
    success: result?.success ?? false,
    newBalance: result?.new_balance ?? 0,
    error: result?.error_message || undefined
  };
}

/**
 * Get user's credit transaction history
 */
export async function getCreditTransactions(
  userId: string,
  limit: number = 50
): Promise<CreditTransaction[]> {
  try {
    const { data, error } = await supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error fetching credit transactions:', error);
    return [];
  }
}

/**
 * Credito VINCOLATO (16/09/2026): vale solo su certi servizi e solo fino a
 * una data. Non sta nel saldo — vive nei suoi lotti — e si spende PRIMA del
 * saldo, a partire da quello che scade per primo. Le regole stanno nel
 * database (dr7_wallet_*): qui si legge soltanto.
 */
export interface CreditoVincolato {
  id: string;
  importo: number;
  residuo: number;
  scadenza: string | null;   // ultimo giorno valido; null = non scade
  servizi: string[] | null;  // null = vale su tutto
  descrizione: string | null;
  created_at: string;
}

/** I lotti ancora spendibili: residuo > 0 e non scaduti. */
export async function getCreditiVincolati(userId: string): Promise<CreditoVincolato[]> {
  try {
    const oggi = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('wallet_crediti_vincolati')
      .select('id, importo, residuo, scadenza, servizi, descrizione, created_at')
      .eq('user_id', userId)
      .gt('residuo', 0)
      .or(`scadenza.is.null,scadenza.gte.${oggi}`)
      .order('scadenza', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('Errore lettura crediti vincolati:', error);
      return [];
    }
    return (data || []).map(r => ({
      ...r,
      importo: Number(r.importo) || 0,
      residuo: Number(r.residuo) || 0,
    })) as CreditoVincolato[];
  } catch (error) {
    console.error('Errore lettura crediti vincolati:', error);
    return [];
  }
}

/**
 * Quanto credito vincolato si puo' spendere su un servizio. La normalizzazione
 * del servizio e' la stessa del database (dr7_wallet_business): Terra copre
 * rental/car_rental/vuoto, la meccanica sta col lavaggio.
 */
export function businessDelServizio(servizio: string | null | undefined): string {
  const v = String(servizio || '').trim().toLowerCase();
  if (!v || v === 'rental' || v === 'car_rental') return 'rental';
  if (v === 'mechanical' || v === 'mechanical_service' || v === 'car_wash') return 'car_wash';
  if (v === 'boat_rental' || v === 'heli_rental' || v === 'stay_rental') return v;
  return 'rental';
}

export function vincolatoSpendibileSu(lotti: CreditoVincolato[], servizio: string | null | undefined): number {
  const business = businessDelServizio(servizio);
  return lotti
    .filter(l => !l.servizi || l.servizi.length === 0 || l.servizi.some(s => businessDelServizio(s) === business))
    .reduce((somma, l) => somma + l.residuo, 0);
}

/**
 * Check if user has sufficient balance for a purchase
 *
 * 16/09/2026: il credito vincolato valido per quel servizio conta. Senza,
 * il sito diceva "credito insufficiente" a chi il credito ce l'aveva.
 */
export async function hasSufficientBalance(
  userId: string,
  requiredAmount: number,
  servizio?: string | null
): Promise<boolean> {
  const [balance, lotti] = await Promise.all([
    getUserCreditBalance(userId),
    getCreditiVincolati(userId),
  ]);
  return balance + vincolatoSpendibileSu(lotti, servizio) >= requiredAmount;
}

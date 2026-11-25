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

// 29/09/2026: addCredits non esiste piu' nel sito. Accreditare credito dal
// browser voleva dire poterlo fare da chiunque (la RPC add_credits era
// aperta): ora accredita solo il server — ricariche
// (wallet-ricarica-finalizza), rimborsi (annulla-prenotazione-cliente),
// bonus DR7 Club (wallet-bonus-club). Il database rifiuta add_credits dal
// browser.

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

/**
 * 25/11/2026: un lotto puo' valere solo per certe CATEGORIE di veicoli di
 * Centralina Pro, scritte 'cat:<id>' come nei codici sconto (es. 'cat:urban'
 * = Hypercar). Vale solo sul noleggio Terra. I nomi si leggono dalla
 * Centralina, cosi' il cliente vede "Hypercar" e non l'id interno.
 */
let nomiCategorie: Record<string, string> = {};
async function caricaNomiCategorie(): Promise<void> {
  if (Object.keys(nomiCategorie).length > 0) return;
  try {
    const { data } = await supabase.from('centralina_pro_config').select('config').eq('id', 'main').maybeSingle();
    const lista = ((data?.config as { categories?: { id?: string; label?: string }[] } | null)?.categories) || [];
    const nuovi: Record<string, string> = {};
    for (const c of lista) if (c && c.id) nuovi[String(c.id).toLowerCase()] = String(c.label || c.id);
    if (Object.keys(nuovi).length > 0) nomiCategorie = nuovi;
  } catch { /* restano gli id */ }
}

const stessaCategoria = (a: string, b: string) => {
  const alias = (x: string) => (x === 'exotic' ? 'supercars' : x);
  return !!a && !!b && alias(a) === alias(b);
};

/** Il lotto vale qui? Stessa regola di dr7_wallet_lotto_vale nel database. */
function lottoValeQui(l: CreditoVincolato, servizio: string | null | undefined, categoria?: string | null): boolean {
  if (!l.servizi || l.servizi.length === 0) return true;
  const business = businessDelServizio(servizio);
  const voci = l.servizi.map(x => String(x || '').trim().toLowerCase());
  if (voci.some(x => !x.startsWith('cat:') && businessDelServizio(x) === business)) return true;
  const cat = String(categoria || '').trim().toLowerCase();
  return business === 'rental' && !!cat && voci.some(x => x.startsWith('cat:') && stessaCategoria(x.slice(4), cat));
}

/** I lotti ancora spendibili: residuo > 0 e non scaduti. */
export async function getCreditiVincolati(userId: string): Promise<CreditoVincolato[]> {
  try {
    await caricaNomiCategorie();
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

export function vincolatoSpendibileSu(lotti: CreditoVincolato[], servizio: string | null | undefined, categoria?: string | null): number {
  return lotti
    .filter(l => lottoValeQui(l, servizio, categoria))
    .reduce((somma, l) => somma + l.residuo, 0);
}

/**
 * Quanto il cliente puo' spendere su un servizio: saldo libero piu' il
 * vincolato valido li'. 27/10/2026: le schermate di pagamento leggevano solo
 * il saldo libero, e chi aveva ricevuto un bonus vincolato vedeva 50 EUR in
 * meno di quelli che il gestionale gli mostrava.
 */
export async function getSaldoSpendibile(userId: string, servizio?: string | null, categoria?: string | null): Promise<number> {
  const [balance, lotti] = await Promise.all([
    getUserCreditBalance(userId),
    getCreditiVincolati(userId),
  ]);
  return balance + vincolatoSpendibileSu(lotti, servizio, categoria);
}

/** Nome del servizio di un lotto, come lo legge il cliente. */
export function nomeServizioWallet(servizio: string, lingua: 'it' | 'en' = 'it'): string {
  const nomi: Record<string, [string, string]> = {
    rental: ['Noleggio Terra', 'Car rental'],
    boat_rental: ['Noleggio Mare', 'Boat rental'],
    heli_rental: ['Noleggio Aria', 'Helicopter'],
    stay_rental: ['Soggiorni', 'Stays'],
    car_wash: ['Lavaggio & Meccanica', 'Wash & mechanics'],
  };
  const v = String(servizio || '').trim().toLowerCase();
  if (v.startsWith('cat:')) return nomiCategorie[v.slice(4)] || v.slice(4);
  const n = nomi[businessDelServizio(servizio)];
  return n ? n[lingua === 'en' ? 1 : 0] : servizio;
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
  servizio?: string | null,
  categoria?: string | null
): Promise<boolean> {
  const [balance, lotti] = await Promise.all([
    getUserCreditBalance(userId),
    getCreditiVincolati(userId),
  ]);
  return balance + vincolatoSpendibileSu(lotti, servizio, categoria) >= requiredAmount;
}

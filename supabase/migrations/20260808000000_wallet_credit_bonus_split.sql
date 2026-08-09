-- ============================================================================
-- Ricariche, credito, bonus e cashback — correzione strutturale (2026-08-08)
--
-- Contesto: il saldo wallet di un cliente e' composto da CREDITO REALE (soldi
-- incassati da DR7) e BONUS (denaro regalato). La natura si legge da
-- credit_transactions.reference_type. Tre difetti la falsavano:
--
--   1. Ogni credito inserito da un operatore in admin scriveva 'admin_manual',
--      classificato come BONUS -> una ricarica reale registrata a mano finiva
--      nel bonus del cliente (caso Runchina: 1.000 di ricarica mostrati come
--      bonus, 290 di bonus pacchetto mostrati come credito reale).
--   2. add_credits non era idempotente, nonostante i commenti nel codice: due
--      percorsi (webhook Nexi + pagina di conferma) potevano accreditare due
--      volte la stessa ricarica.
--   3. Le ricariche registrate in doppio erano escluse dal calcolo del livello
--      DR7 Club solo lato frontend, non lato backend -> il cliente vedeva Black
--      (3%) ma il sistema versava Signature (4%).
--
-- Da applicare sul progetto Supabase condiviso da dr7.app e platform.dr7ai.com.
-- ============================================================================

-- ── 1. Marcatura permanente delle ricariche registrate in doppio ────────────
-- Prima l'elenco viveva solo in Sito/utils/dr7club.ts (frontend). Ora e' un
-- dato, leggibile da tutti e tre i calcoli della spesa annua.
ALTER TABLE credit_wallet_purchases
  ADD COLUMN IF NOT EXISTS excluded_from_tier BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN credit_wallet_purchases.excluded_from_tier IS
  'true = riga da NON contare nella spesa annua DR7 Club (ricarica registrata due volte, pagata una sola volta dal cliente). Esclusa da tier e cashback.';

-- Doppioni noti (Massimo Runchina): stesso pagamento registrato due volte.
-- L''altra riga della coppia resta contata.
UPDATE credit_wallet_purchases
   SET excluded_from_tier = true
 WHERE id IN (
   '39a4c9cd-5670-465c-977d-cce805514c38',  -- 26/02 EUR 1.000 — doppione
   '4e6364d9-8707-4f12-897d-e02d63e0682d'   -- 05/05 EUR 2.000 — doppione
 );

-- ── 2. add_credits idempotente ──────────────────────────────────────────────
-- Quando la chiamata porta un reference_id + reference_type, un secondo
-- tentativo con gli stessi valori NON accredita di nuovo: restituisce il saldo
-- corrente. Protegge dalla race webhook Nexi / pagina di conferma e dai retry.
-- Senza reference_id (crediti manuali una tantum) il comportamento non cambia.
CREATE OR REPLACE FUNCTION add_credits(
  p_user_id UUID,
  p_amount NUMERIC,
  p_description TEXT,
  p_reference_id TEXT DEFAULT NULL,
  p_reference_type TEXT DEFAULT 'purchase'
)
RETURNS TABLE(success BOOLEAN, new_balance NUMERIC, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance NUMERIC;
  v_new_balance NUMERIC;
  v_existing_id UUID;
BEGIN
  -- Lock row to prevent race conditions
  SELECT balance INTO v_current_balance
  FROM user_credit_balance
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- IDEMPOTENZA: stessa (user, reference_id, reference_type) gia' accreditata?
  IF p_reference_id IS NOT NULL AND p_reference_type IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM credit_transactions
    WHERE user_id = p_user_id
      AND transaction_type = 'credit'
      AND reference_id::text = p_reference_id
      AND reference_type = p_reference_type
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RETURN QUERY SELECT true, COALESCE(v_current_balance, 0::NUMERIC), NULL::TEXT;
      RETURN;
    END IF;
  END IF;

  IF v_current_balance IS NULL THEN
    v_new_balance := p_amount;
    INSERT INTO user_credit_balance (user_id, balance, last_updated)
    VALUES (p_user_id, v_new_balance, NOW());
  ELSE
    v_new_balance := v_current_balance + p_amount;
    UPDATE user_credit_balance
    SET balance = v_new_balance, last_updated = NOW()
    WHERE user_id = p_user_id;
  END IF;

  INSERT INTO credit_transactions (user_id, transaction_type, amount, balance_after, description, reference_id, reference_type, created_at)
  VALUES (p_user_id, 'credit', p_amount, v_new_balance, p_description, p_reference_id, p_reference_type, NOW());

  RETURN QUERY SELECT true, v_new_balance, NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 0::NUMERIC, SQLERRM::TEXT;
END;
$$;

-- ── 3. Bonus referral: riconoscere i nuovi reference_type ───────────────────
-- 'admin_topup'  = incasso reale registrato da un operatore -> attiva referral
-- 'admin_bonus'  = omaggio                                  -> NON attiva
-- 'admin_manual' = legacy (righe scritte prima del 2026-08-08) -> resta attivo
CREATE OR REPLACE FUNCTION trigger_referral_bonus_on_wallet_credit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Solo ricariche vere: acquisti wallet dal sito + incassi registrati in admin.
  -- Esclude esplicitamente bonus di benvenuto, cashback, bonus pacchetto
  -- ricarica, bonus iscrizione club, il referral stesso, gli omaggi admin e i
  -- pagamenti di prenotazioni.
  IF NEW.transaction_type = 'credit'
     AND NEW.amount >= 100
     AND NEW.reference_type IN ('wallet_purchase', 'admin_topup', 'admin_manual')
  THEN
    PERFORM grant_referral_bonus(
      NEW.user_id,
      CASE WHEN NEW.reference_type = 'wallet_purchase' THEN NEW.reference_id ELSE NULL END,
      NEW.amount
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referral_bonus_on_wallet_credit ON credit_transactions;
CREATE TRIGGER trg_referral_bonus_on_wallet_credit
  AFTER INSERT ON credit_transactions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_referral_bonus_on_wallet_credit();

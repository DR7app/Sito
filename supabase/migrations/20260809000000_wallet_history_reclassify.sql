-- ============================================================================
-- Correzione DATI STORICI wallet — credito reale vs bonus (2026-08-09)
--
-- Prerequisito: 20260808000000_wallet_credit_bonus_split.sql
--
-- NESSUN saldo cambia. Questa migrazione riclassifica soltanto la NATURA delle
-- righe gia' esistenti: sposta il bonus pacchetto fuori dal credito reale e
-- riporta gli incassi registrati a mano dentro il credito reale.
--
--   A) Ricariche accreditate "in blocco": fino al 2026-08-08 la pagina di
--      conferma pagamento accreditava l'INTERO received_amount (ricarica +
--      bonus pacchetto) come una sola riga 'wallet_purchase' = credito reale.
--      Il bonus del pacchetto risultava quindi denaro pagato dal cliente e
--      maturava pure gli interessi DR7 Club.
--      Caso Runchina: 6 ricariche, 9.070 EUR accreditati di cui 7.000 pagati
--      con carta e 2.070 di bonus pacchetto, tutti contati come credito reale.
--      -> la riga 'wallet_purchase' viene riportata a recharge_amount e la
--         differenza diventa una riga 'wallet_package_bonus'.
--
--   B) Crediti inseriti da un operatore in admin: scrivevano 'admin_manual',
--      classificato come BONUS. Per la direzione un credito inserito a mano e'
--      sempre denaro incassato (gli omaggi ricorrenti passano dal cron con
--      'wallet_auto_recharge'), quindi va nel credito reale.
--      -> 'admin_manual' / 'admin_credit' (solo CREDITI) diventano 'admin_topup'.
--
-- NOTA su balance_after: resta quello della riga originale anche sulla nuova
-- riga bonus, perche' le due righe rappresentano lo stesso istante contabile.
-- E' un campo informativo, il saldo autorevole e' user_credit_balance.balance.
--
-- Reversibile: vedere il blocco ROLLBACK in fondo (commentato).
-- ============================================================================

BEGIN;

-- ── A. Scorporo del bonus pacchetto dalle ricariche accreditate in blocco ───
-- Riguarda solo le righe dove l'importo accreditato coincide esattamente con
-- received_amount ED e' maggiore di recharge_amount: la firma inequivocabile
-- del vecchio comportamento. Le ricariche gia' accreditate con lo split
-- (importo = recharge_amount) non vengono toccate.
WITH da_scorporare AS (
  SELECT t.id            AS tx_id,
         t.user_id,
         t.balance_after,
         t.created_at,
         p.id            AS purchase_id,
         p.package_name,
         p.recharge_amount,
         p.received_amount,
         p.bonus_percentage,
         (p.received_amount - p.recharge_amount) AS bonus_eur
  FROM credit_transactions t
  JOIN credit_wallet_purchases p ON p.id = t.reference_id
  WHERE t.transaction_type = 'credit'
    AND t.reference_type   = 'wallet_purchase'
    AND p.received_amount  > p.recharge_amount
    AND t.amount           = p.received_amount
),
-- La CTE che modifica dati viene eseguita comunque, una sola volta e fino in
-- fondo, anche se la query principale non ne legge l'output (garanzia Postgres).
riduci AS (
  UPDATE credit_transactions t
     SET amount      = d.recharge_amount,
         description = 'Ricarica ' || d.package_name || ' (€' || to_char(d.recharge_amount, 'FM999999990.00') || ')'
    FROM da_scorporare d
   WHERE t.id = d.tx_id
  RETURNING t.id
)
INSERT INTO credit_transactions
  (user_id, transaction_type, amount, balance_after, description, reference_id, reference_type, created_at)
SELECT d.user_id,
       'credit',
       d.bonus_eur,
       d.balance_after,
       'Bonus ricarica ' || to_char(COALESCE(d.bonus_percentage, 0), 'FM999990') || '% (€' || to_char(d.bonus_eur, 'FM999999990.00') || ')',
       d.purchase_id,
       'wallet_package_bonus',
       d.created_at
FROM da_scorporare d
WHERE NOT EXISTS (                          -- idempotenza: non duplicare
    SELECT 1 FROM credit_transactions x
     WHERE x.reference_id   = d.purchase_id
       AND x.reference_type = 'wallet_package_bonus'
  );

-- ── B. Crediti admin storici -> credito reale ───────────────────────────────
UPDATE credit_transactions
   SET reference_type = 'admin_topup'
 WHERE transaction_type = 'credit'
   AND reference_type IN ('admin_manual', 'admin_credit');

COMMIT;


-- ── VERIFICA (eseguire dopo il COMMIT) ──────────────────────────────────────
-- Il saldo NON deve essere cambiato: crediti - debiti = user_credit_balance.
--
-- SELECT b.user_id, b.balance AS saldo_ufficiale,
--        SUM(CASE WHEN t.transaction_type='credit' THEN t.amount ELSE -t.amount END) AS saldo_ricalcolato
-- FROM user_credit_balance b
-- JOIN credit_transactions t ON t.user_id = b.user_id
-- WHERE b.user_id = '3b896d05-3d65-4819-a46a-ea9894343935'
-- GROUP BY b.user_id, b.balance;


-- ── ROLLBACK (se serve tornare indietro) ────────────────────────────────────
-- ATTENZIONE: valido SOLO subito dopo l'esecuzione. Passato del tempo, la
-- DELETE cancellerebbe anche le righe 'wallet_package_bonus' scritte
-- correttamente dalle NUOVE ricariche: in quel caso limitarla agli id noti.
-- BEGIN;
--   UPDATE credit_transactions t
--      SET amount = p.received_amount
--     FROM credit_wallet_purchases p
--    WHERE p.id = t.reference_id
--      AND t.reference_type = 'wallet_purchase'
--      AND t.amount = p.recharge_amount
--      AND p.received_amount > p.recharge_amount;
--   DELETE FROM credit_transactions WHERE reference_type = 'wallet_package_bonus';
--   UPDATE credit_transactions SET reference_type = 'admin_manual'
--    WHERE transaction_type = 'credit' AND reference_type = 'admin_topup';
-- COMMIT;

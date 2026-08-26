-- =====================================================================
-- 26/08/2026 — Accredita i 10€ di benvenuto a chi non li ha mai ricevuti
-- =====================================================================
-- Perche' mancano: fino al 26/08 il bonus veniva accreditato DOPO il
-- salvataggio della scheda cliente. Se la scrittura della scheda falliva
-- (bastava un campo rifiutato dal database), la function usciva in errore
-- prima di arrivare al bonus: account creato, scheda a meta', 10€ mai
-- accreditati. Sono le stesse persone che nell'elenco iscritti risultano
-- senza nome.
--
-- `grant_welcome_bonus` e' idempotente (marca la riga con
-- reference_type = 'welcome_bonus'): rieseguire questo file non accredita
-- mai due volte lo stesso bonus.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASSO 1 — Quanti sono, prima di scrivere
-- ---------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM auth.users) AS account_totali,
  count(*) AS senza_bonus,
  count(*) * 10 AS euro_da_accreditare
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM credit_transactions ct
  WHERE ct.user_id = u.id AND ct.reference_type = 'welcome_bonus'
);

-- ---------------------------------------------------------------------
-- PASSO 2 — Elenco di chi verra' accreditato (controllo prima di scrivere)
-- ---------------------------------------------------------------------
SELECT u.email, u.created_at
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM credit_transactions ct
  WHERE ct.user_id = u.id AND ct.reference_type = 'welcome_bonus'
)
ORDER BY u.created_at DESC;

-- ---------------------------------------------------------------------
-- PASSO 3 — Accredito. Una riga di esito per persona.
-- ---------------------------------------------------------------------
SELECT u.email, g.success, g.already_granted, g.new_balance, g.error_message
FROM auth.users u
CROSS JOIN LATERAL grant_welcome_bonus(u.id) g
WHERE NOT EXISTS (
  SELECT 1 FROM credit_transactions ct
  WHERE ct.user_id = u.id AND ct.reference_type = 'welcome_bonus'
)
ORDER BY u.created_at DESC;

-- ---------------------------------------------------------------------
-- PASSO 4 — Verifica: deve tornare 0
-- ---------------------------------------------------------------------
SELECT count(*) AS ancora_senza_bonus
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM credit_transactions ct
  WHERE ct.user_id = u.id AND ct.reference_type = 'welcome_bonus'
);

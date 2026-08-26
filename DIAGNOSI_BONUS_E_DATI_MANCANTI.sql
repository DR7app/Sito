-- ============================================================
-- Chi non ha ricevuto i 10€ e chi ha la scheda incompleta (26/08/2026)
--
-- Causa (corretta in netlify/functions/register-customer.js):
-- un solo valore rifiutato dal database faceva fallire l'INTERA scrittura
-- del profilo; il fallback INSERT non poteva riuscire (la riga esisteva
-- gia', creata dal trigger) e la function usciva con un 500 PRIMA di
-- accreditare il bonus e PRIMA del messaggio di benvenuto.
-- Risultato: account creato, scheda a meta', 10€ mai accreditati.
--
-- Queste query servono a vedere CHI e' rimasto indietro. Non scrivono nulla.
-- Il recupero si fa con la function `grant-welcome-bonus-existing` (idempotente).
-- ============================================================

-- 1) Account senza bonus benvenuto (i 10€ mancanti)
SELECT u.id, u.email, u.created_at
FROM auth.users u
LEFT JOIN credit_transactions ct
       ON ct.user_id = u.id
      AND ct.reference_type = 'welcome_bonus'
WHERE ct.id IS NULL
ORDER BY u.created_at DESC;

-- 2) Account SENZA scheda cliente (registrazione uscita in errore)
SELECT u.id, u.email, u.created_at
FROM auth.users u
LEFT JOIN customers_extended c ON c.user_id = u.id
WHERE c.id IS NULL
ORDER BY u.created_at DESC;

-- 3) Schede create dal sito ma con i dati obbligatori vuoti
SELECT c.id, c.user_id, c.email, c.created_at,
       c.tipo_cliente, c.nome, c.cognome, c.telefono, c.codice_fiscale,
       c.indirizzo, c.citta_residenza, c.codice_postale
FROM customers_extended c
WHERE c.source IN ('website', 'website_registration')
  AND (
       COALESCE(c.telefono, '')       = ''
    OR COALESCE(c.codice_fiscale, '') = ''
    OR (c.tipo_cliente = 'persona_fisica'
        AND (COALESCE(c.nome, '') = '' OR COALESCE(c.cognome, '') = ''))
    OR (c.tipo_cliente = 'azienda'
        AND (COALESCE(c.denominazione, '') = '' OR COALESCE(c.partita_iva, '') = ''))
  )
ORDER BY c.created_at DESC;

-- 4) Le due cose insieme: chi ha SIA la scheda incompleta SIA nessun bonus
--    (la firma tipica del difetto descritto sopra)
SELECT u.email, u.created_at, c.nome, c.cognome, c.telefono, c.codice_fiscale
FROM auth.users u
LEFT JOIN customers_extended c ON c.user_id = u.id
LEFT JOIN credit_transactions ct
       ON ct.user_id = u.id AND ct.reference_type = 'welcome_bonus'
WHERE ct.id IS NULL
  AND (c.id IS NULL OR COALESCE(c.telefono, '') = '' OR COALESCE(c.codice_fiscale, '') = '')
ORDER BY u.created_at DESC;

-- 5) Quanti sono, in totale
SELECT
  (SELECT COUNT(*) FROM auth.users) AS account_totali,
  (SELECT COUNT(*) FROM auth.users u
     LEFT JOIN credit_transactions ct
            ON ct.user_id = u.id AND ct.reference_type = 'welcome_bonus'
    WHERE ct.id IS NULL) AS senza_bonus,
  (SELECT COUNT(*) FROM auth.users u
     LEFT JOIN customers_extended c ON c.user_id = u.id
    WHERE c.id IS NULL) AS senza_scheda;

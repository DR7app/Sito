-- ============================================================================
-- add_credits: eliminare la surcharge NON idempotente (2026-08-09)
--
-- In produzione esistono DUE funzioni add_credits nello schema public, con gli
-- stessi nomi di parametro e un solo tipo diverso:
--
--   add_credits(uuid, numeric, text, text, text)  -> idempotente (mig. 20260808000000)
--   add_credits(uuid, numeric, text, uuid, text)  -> NON idempotente  <-- questa
--
-- La seconda non nasce da una migrazione di questo repo (creata a mano).
-- Postgres, per una stringa non tipata, preferisce `text`, quindi le chiamate
-- PostgREST finiscono quasi sempre sulla variante giusta — ma "quasi sempre"
-- non e' una garanzia, e due surcharge che differiscono per un solo tipo sono
-- una trappola permanente: basta un cast esplicito a uuid da qualche parte per
-- ritrovarsi senza protezione contro il doppio accredito.
--
-- Scelta: NON si elimina la variante uuid (qualcuno potrebbe chiamarla), la si
-- trasforma in un passa-plat verso quella idempotente. Una sola logica, due
-- porte d'ingresso. Il cast esplicito `::text` risolve senza ambiguita' sulla
-- variante text, quindi nessuna ricorsione.
--
-- Nessun altro oggetto in DB chiama add_credits (verificato: nessuna funzione
-- o trigger la referenzia). I chiamanti sono solo lato codice, via PostgREST:
--   Sito/utils/creditWallet.ts, netlify/functions/nexi-callback.js,
--   netlify/functions/book-tour.ts
--
-- Testato con PGlite: prima del fix due chiamate identiche accreditano 200,
-- dopo il fix 100, con una sola riga in credit_transactions.
-- ============================================================================

DROP FUNCTION IF EXISTS public.add_credits(uuid, numeric, text, uuid, text);

CREATE FUNCTION public.add_credits(
  p_user_id        UUID,
  p_amount         NUMERIC,
  p_description    TEXT,
  p_reference_id   UUID DEFAULT NULL,
  p_reference_type TEXT DEFAULT 'purchase'
)
RETURNS TABLE(success BOOLEAN, new_balance NUMERIC, error_message TEXT)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM public.add_credits(
    p_user_id, p_amount, p_description, p_reference_id::text, p_reference_type
  );
$$;

COMMENT ON FUNCTION public.add_credits(uuid, numeric, text, uuid, text) IS
  'Passa-plat verso add_credits(uuid,numeric,text,text,text). Esiste solo per compatibilita'' con chiamanti che passano reference_id gia'' tipizzato uuid: tutta la logica (e l''idempotenza) sta nella variante text.';

-- ── VERIFICA ────────────────────────────────────────────────────────────────
-- Attese due righe, entrambe "protette":
--   (uuid,numeric,text,text,text) -> idempotenza nel corpo
--   (uuid,numeric,text,uuid,text) -> delega alla precedente
SELECT p.oid::regprocedure AS firma,
       (p.prosrc LIKE '%IDEMPOTENZA%' OR p.prosrc LIKE '%p_reference_id::text%') AS protetta
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE p.proname = 'add_credits' AND n.nspname = 'public'
 ORDER BY 1;

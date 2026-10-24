-- ============================================================================
-- add_credits: una sola firma (2026-10-25)
--
-- In produzione convivevano add_credits(uuid,numeric,text,TEXT,text) e il
-- passa-plat add_credits(uuid,numeric,text,UUID,text) (mig. 20260809010000),
-- con gli stessi nomi di parametro. PostgREST chiama per NOME e non sa
-- scegliere: ogni rpc('add_credits') rispondeva PGRST203 "Could not choose
-- the best candidate function". Nessuna ricarica wallet pagata con carta e'
-- stata accreditata dopo il 13/09 (Casula e Pintori 24/10, pagati su Nexi):
-- l'errore restava nei log e la riga in 'pending'.
--
-- Il passa-plat non serve a nessuno: nessuna funzione o trigger del database
-- chiama add_credits (verificato in 20260809010000), i chiamanti sono solo
-- codice via PostgREST, che manda stringhe e finisce sulla variante text.
-- ============================================================================

DROP FUNCTION IF EXISTS public.add_credits(uuid, numeric, text, uuid, text);

NOTIFY pgrst, 'reload schema';

-- ── VERIFICA ────────────────────────────────────────────────────────────────
-- Attesa UNA riga: add_credits(uuid,numeric,text,text,text)
SELECT p.oid::regprocedure AS firma
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE p.proname = 'add_credits' AND n.nspname = 'public';

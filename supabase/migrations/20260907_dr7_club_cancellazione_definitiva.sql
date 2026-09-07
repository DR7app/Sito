-- Cancellazione definitiva del DR7 Club (07/09/2026).
--
-- Il popup di conferma sul sito promette una cosa precisa: chi lascia il Club
-- non puo' piu' rientrare, nemmeno aprendo un altro account con gli stessi
-- dati e documenti. Perche' la promessa sia vera serve una traccia che
-- sopravvive alla cancellazione dell'abbonamento E alla cancellazione
-- dell'account: da qui questa tabella, volutamente SENZA foreign key su
-- auth.users (una FK con ON DELETE CASCADE cancellerebbe il blocco insieme
-- all'utente, che e' esattamente il buco da chiudere).
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.dr7_club_cancellazioni (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,                 -- nessuna FK: il blocco deve sopravvivere all'account
  email text,
  codice_fiscale text,
  numero_patente text,
  subscription_id uuid,
  plan text,
  cancelled_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dr7_club_cancellazioni IS
  'Chi ha lasciato volontariamente il DR7 Club. Serve a impedire una nuova iscrizione: il match e'' per user_id, email, codice fiscale o numero patente.';

CREATE INDEX IF NOT EXISTS idx_dr7_club_canc_user ON public.dr7_club_cancellazioni (user_id);
CREATE INDEX IF NOT EXISTS idx_dr7_club_canc_email ON public.dr7_club_cancellazioni (lower(email));
CREATE INDEX IF NOT EXISTS idx_dr7_club_canc_cf ON public.dr7_club_cancellazioni (upper(codice_fiscale));
CREATE INDEX IF NOT EXISTS idx_dr7_club_canc_patente ON public.dr7_club_cancellazioni (upper(numero_patente));

ALTER TABLE public.dr7_club_cancellazioni ENABLE ROW LEVEL SECURITY;

-- Nessuna policy per authenticated/anon: la lista non si legge dal sito.
-- Il service role (netlify functions, gestionale) bypassa la RLS.
DROP POLICY IF EXISTS "Service role full access dr7_club_cancellazioni" ON public.dr7_club_cancellazioni;
CREATE POLICY "Service role full access dr7_club_cancellazioni"
  ON public.dr7_club_cancellazioni FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Il sito deve sapere SOLO se l'utente collegato e' bloccato, mai chi altro
-- lo e': la funzione non accetta parametri e ricava identita' e documenti
-- dall'utente autenticato, cosi' non si puo' usarla per sondare terzi.
CREATE OR REPLACE FUNCTION public.dr7_club_bloccato()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_cf text;
  v_patente text;
  v_bloccato boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = v_uid;

  SELECT upper(nullif(btrim(c.codice_fiscale), '')),
         upper(nullif(btrim(c.metadata->>'numero_patente'), ''))
    INTO v_cf, v_patente
    FROM public.customers_extended c
   WHERE c.user_id = v_uid
   LIMIT 1;

  SELECT EXISTS (
    SELECT 1 FROM public.dr7_club_cancellazioni x
     WHERE x.user_id = v_uid
        OR (v_email IS NOT NULL AND lower(x.email) = v_email)
        OR (v_cf IS NOT NULL AND upper(x.codice_fiscale) = v_cf)
        OR (v_patente IS NOT NULL AND upper(x.numero_patente) = v_patente)
  ) INTO v_bloccato;

  RETURN v_bloccato;
END;
$$;

REVOKE ALL ON FUNCTION public.dr7_club_bloccato() FROM public;
GRANT EXECUTE ON FUNCTION public.dr7_club_bloccato() TO authenticated;

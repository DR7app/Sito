-- Status cliente sul sito in tempo reale.
--
-- Il sito (pages/account/ProfileSettings.tsx) si mette in ascolto degli UPDATE
-- della PROPRIA riga customers_extended per aggiornare il badge status appena
-- l'admin lo cambia. Senza la tabella nella pubblicazione realtime la
-- sottoscrizione non riceve nulla e il badge resta quello letto all'apertura
-- della pagina (resta il refresh al rientro sulla scheda, ma non e' immediato).
--
-- La pubblicazione non aggira le RLS: ogni cliente riceve solo gli eventi
-- delle righe che gia' puo' leggere.
--
-- Idempotente: se la tabella e' gia' pubblicata non fa nulla.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'customers_extended'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.customers_extended';
  END IF;
END $$;

-- Realtime invia solo le colonne modificate se la REPLICA IDENTITY e' di
-- default: al sito serve poter filtrare per user_id, quindi la riga intera.
ALTER TABLE public.customers_extended REPLICA IDENTITY FULL;

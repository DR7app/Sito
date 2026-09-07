-- Le domande nuove del modulo preventivo Aviation (07/09/2026).
--
-- Il modulo del sito chiedeva otto cose e il resto lo ricostruiva l'ufficio al
-- telefono. Ora chiede anche orario di partenza e di ritorno, tappe, bagagli,
-- budget, tipologia di aeromobile e — la domanda che nel charter privato
-- cambia di piu' la proposta — se date e orari sono flessibili.
--
-- Quasi tutte le risposte avevano gia' una colonna (return_time,
-- intermediate_stops, direct_flight, flight_flexibility): erano solo riempite
-- con valori finti dal server. Qui si aggiungono le cinque che mancavano.
--
-- La data di partenza in particolare non esisteva: finiva dentro le note,
-- cioe' non si poteva ne' ordinare ne' filtrare per data del volo.
--
-- Idempotente.
ALTER TABLE public.aviation_quotes
  ADD COLUMN IF NOT EXISTS departure_date date,
  ADD COLUMN IF NOT EXISTS departure_time time,
  ADD COLUMN IF NOT EXISTS luggage_details text,
  ADD COLUMN IF NOT EXISTS budget_indicative text,
  ADD COLUMN IF NOT EXISTS aircraft_category character varying;

-- jet / helicopter / any (= "valuta la soluzione migliore per me").
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'aviation_quotes_aircraft_category_check'
  ) THEN
    ALTER TABLE public.aviation_quotes
      ADD CONSTRAINT aviation_quotes_aircraft_category_check
      CHECK (aircraft_category IS NULL OR aircraft_category IN ('jet', 'helicopter', 'any'));
  END IF;
END $$;

COMMENT ON COLUMN public.aviation_quotes.budget_indicative IS
  'Budget indicativo scritto dal cliente: testo libero, quasi sempre una forbice.';
COMMENT ON COLUMN public.aviation_quotes.departure_date IS
  'Data del volo di andata. Prima finiva nelle note.';

-- Ordinare i preventivi per data del volo, non solo per data della richiesta.
CREATE INDEX IF NOT EXISTS idx_aviation_quotes_departure_date
  ON public.aviation_quotes(departure_date);

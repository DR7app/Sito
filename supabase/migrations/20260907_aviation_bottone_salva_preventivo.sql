-- Il bottone finale del modulo preventivo Aviation: "Salva preventivo".
--
-- Il testo salvato in Centralina vince sui default del codice, quindi non
-- basta cambiarlo nel file: va riscritto anche qui.
UPDATE public.centralina_pro_config
SET config = jsonb_set(
  config,
  '{site_copy,aviationQuote}',
  COALESCE(config->'site_copy'->'aviationQuote', '{}'::jsonb)
    || '{"submit_idle_it": "SALVA PREVENTIVO", "submit_idle_en": "SAVE QUOTE"}'::jsonb,
  true
)
WHERE id = 'main';

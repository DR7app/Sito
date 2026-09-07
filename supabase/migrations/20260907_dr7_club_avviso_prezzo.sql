-- Avviso di cambio prezzo DR7 Club (07/09/2026).
--
-- Il rinnovo addebita il listino di oggi e non piu' il prezzo congelato al
-- momento dell'iscrizione. Chi paghera' di piu' deve saperlo PRIMA: queste due
-- colonne tengono traccia dell'avviso gia' mandato, cosi' parte una volta sola
-- per ogni nuovo prezzo invece di ripetersi a ogni giro del cron.
--
-- Idempotente.
ALTER TABLE public.dr7_club_subscriptions
  ADD COLUMN IF NOT EXISTS price_change_notified_eur numeric(10, 2),
  ADD COLUMN IF NOT EXISTS price_change_notified_at timestamp with time zone;

COMMENT ON COLUMN public.dr7_club_subscriptions.price_change_notified_eur IS
  'Prezzo per cui l''abbonato e'' gia'' stato avvisato. Diverso dal prezzo di listino = avviso da mandare.';

-- Avviso WhatsApp della ricarica Credit Wallet: segna quando e' partito.
--
-- Serve solo a non mandarlo due volte: la ricarica viene completata dal
-- browser (pagina di pagamento riuscito) O dal webhook Nexi, e adesso
-- entrambi chiamano avvisa-ricarica-wallet. Chi aggiorna questa colonna per
-- primo manda; l'altro trova la riga gia' presa e non fa nulla.
--
-- Senza questa colonna la function manda comunque (con il rischio di un raro
-- doppione): il codice non dipende dalla migrazione per funzionare.
ALTER TABLE credit_wallet_purchases
  ADD COLUMN IF NOT EXISTS avviso_inviato_at timestamptz;

COMMENT ON COLUMN credit_wallet_purchases.avviso_inviato_at IS
  'Quando e'' partito l''avviso WhatsApp al cliente per questa ricarica. NULL = non ancora inviato.';

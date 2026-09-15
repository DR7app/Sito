import { useEffect, useState } from 'react';
import { getCarWashCopy, type CarWashCopy } from '../utils/siteCopy';
import { useTranslation } from './useTranslation';

/**
 * I testi del carrello, scelti dal gestionale.
 *
 * 15/09/2026 — le caselle esistevano gia' (Sito > Lavaggio > Carrello) ma
 * nessuna pagina le leggeva: si scriveva, si salvava, e sul sito restava il
 * testo di prima. Il pulsante "Aggiungi al carrello" era poi ripetuto a mano
 * in otto punti, quindi cambiarlo voleva dire otto modifiche.
 *
 * Qui si legge una volta sola: il carrello e' uno, i suoi testi sono uno.
 * Parte dai testi di ripiego e non aspetta la rete, cosi' un pulsante non
 * resta mai vuoto.
 */
export function useTestiCarrello() {
  const { t, lang } = useTranslation();
  const [copy, setCopy] = useState<CarWashCopy | null>(null);

  useEffect(() => {
    let annullato = false;
    getCarWashCopy()
      .then((c) => { if (!annullato) setCopy(c); })
      .catch(() => { /* restano i testi di ripiego */ });
    return () => { annullato = true; };
  }, []);

  const leggi = (it: keyof CarWashCopy, en: keyof CarWashCopy, ripiego: string): string =>
    (copy ? String(copy[lang === 'it' ? it : en] || '').trim() : '') || ripiego;

  return {
    /** Pulsante "Aggiungi al carrello", uguale su ogni servizio. */
    aggiungi: leggi('add_to_cart_it', 'add_to_cart_en', t({ it: 'Aggiungi al carrello', en: 'Add to cart' })),
    /** Titolo del pannello che si apre da destra. */
    titolo: leggi('cart_title_it', 'cart_title_en', t({ it: 'Carrello', en: 'Cart' })),
    /** Riga mostrata quando non c'e' niente dentro. */
    vuoto: leggi('cart_empty_it', 'cart_empty_en', t({ it: 'Il carrello è vuoto.', en: 'Your cart is empty.' })),
    /** Pulsante che porta al pagamento. */
    checkout: leggi('cart_checkout_it', 'cart_checkout_en', t({ it: 'Vai al checkout', en: 'Go to checkout' })),
    /** Rimanda al carrello dopo aver aggiunto qualcosa. */
    rivedi: leggi('upsell_review_cart_it', 'upsell_review_cart_en', t({ it: 'Rivedi carrello', en: 'Review cart' })),
  };
}

export default useTestiCarrello;

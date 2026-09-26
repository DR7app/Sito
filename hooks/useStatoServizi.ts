// useStatoServizi — prenotazioni e pagamenti aperti per questo business?
// Parte "aperto" e si aggiorna quando arriva la risposta: il sito non
// resta mai bloccato per colpa di questa lettura.
import { useEffect, useState } from 'react';
import { leggiStatoServizi, STATO_APERTO, type BusinessSito, type StatoServizi } from '../utils/statoServizi';

export function useStatoServizi(business: BusinessSito): StatoServizi {
  const [stato, setStato] = useState<StatoServizi>(STATO_APERTO);
  useEffect(() => {
    let annullato = false;
    leggiStatoServizi(business).then(s => { if (!annullato) setStato(s); });
    return () => { annullato = true; };
  }, [business]);
  return stato;
}

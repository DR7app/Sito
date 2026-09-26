// Avviso mostrato quando il System Control ha sospeso prenotazioni o
// pagamenti online: il cliente lo legge PRIMA di compilare tutto, invece di
// trovare un errore all'ultimo passo.
import { useContactInfo } from '../../hooks/useContactInfo';

export default function AvvisoServizioSospeso({ messaggio }: { messaggio: string }) {
  const contatti = useContactInfo();
  return (
    <div role="status" className="mb-6 p-4 bg-amber-500/10 border border-amber-500/50 rounded-lg">
      <p className="text-sm font-semibold text-amber-300">Prenotazioni online momentaneamente sospese</p>
      <p className="text-sm text-gray-300 mt-1">{messaggio}</p>
      <p className="text-xs text-gray-400 mt-2">
        Per prenotare adesso contattaci su{' '}
        <a href={contatti.whatsapp_url} target="_blank" rel="noopener noreferrer" className="underline text-white">WhatsApp</a>
        {' '}o al {contatti.phone_display}.
      </p>
    </div>
  );
}

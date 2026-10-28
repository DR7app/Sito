import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { linkWhatsApp, WHATSAPP_URL_DI_FABBRICA } from '../../utils/whatsapp';
import { tapFeedback } from './appPush';

type Msg = { id: string; me: boolean; text: string };

/**
 * Concierge: la stessa DR7 AI del sito (netlify/functions/dr7-ai), a tutta
 * pagina, piu' l'accesso diretto a una persona via WhatsApp o telefono.
 */
const AppConcierge: React.FC = () => {
  const { t } = useTranslation();
  const welcome = t({
    it: "Benvenuto in DR7.\nCome posso assisterLa?\n\nQuesto assistente è un'intelligenza artificiale: prezzi e informazioni sono indicativi. Fa fede solo il prezzo della pagina di prenotazione.",
    en: 'Welcome to DR7.\nHow may I assist you?\n\nThis assistant is an AI: prices and information are indicative. Only the price on the booking page is binding.',
  });
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 'w', me: false, text: welcome }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement | null>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy]);

  const SUGG = [
    t({ it: 'Che auto avete libere questo weekend?', en: 'Which cars are free this weekend?' }),
    t({ it: 'Quanto costa la consegna a domicilio?', en: 'How much is home delivery?' }),
    t({ it: 'Vorrei un elicottero per Porto Cervo', en: 'I need a helicopter to Porto Cervo' }),
    t({ it: 'Come funziona il DR7 Club?', en: 'How does DR7 Club work?' }),
  ];

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    tapFeedback();
    const history = msgs.filter((m) => m.id !== 'w').map((m) => ({ role: m.me ? 'user' as const : 'assistant' as const, content: m.text }));
    setMsgs((p) => [...p, { id: String(Date.now()), me: true, text: q }]);
    setInput('');
    setBusy(true);
    try {
      const r = await fetch('/.netlify/functions/dr7-ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, conversationHistory: history }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      setMsgs((p) => [...p, { id: String(Date.now() + 1), me: false, text: String(data.response || '') }]);
    } catch {
      setMsgs((p) => [...p, { id: String(Date.now() + 1), me: false, text: t({ it: 'Mi dispiace, si è verificato un errore. Riprova tra poco oppure scrivici su WhatsApp.', en: 'Sorry, something went wrong. Please try again shortly or message us on WhatsApp.' }) }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-gutter pt-6" style={{ paddingBottom: '5.5rem' }}>
      <span className="t-eyebrow block">{t({ it: 'DR7 Club · Concierge dedicato', en: 'DR7 Club · Dedicated concierge' })}</span>
      <h1 className="t-display mt-4">Concierge</h1>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <a className="btn btn-secondary btn-sm" href={linkWhatsApp(WHATSAPP_URL_DI_FABBRICA, t({ it: 'Buongiorno DR7, vi scrivo dall\'app.', en: 'Hello DR7, I am writing from the app.' }))}>WhatsApp</a>
        <a className="btn btn-secondary btn-sm" href="tel:+393457905205">{t({ it: 'Chiama', en: 'Call' })}</a>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {msgs.map((m) => <div key={m.id} className={`app-msg ${m.me ? 'me' : 'dr7'}`}>{m.text}</div>)}
        {busy && <div className="app-msg dr7" aria-live="polite">…</div>}
      </div>

      {msgs.length <= 1 && (
        <div className="mt-6">
          {SUGG.map((s) => (
            <button key={s} className="app-row t-small" onClick={() => send(s)}>
              <span className="grow" style={{ color: 'var(--c-ivory-dim)' }}>{s}</span><span style={{ color: 'var(--fg-dim)' }}>→</span>
            </button>
          ))}
        </div>
      )}
      <div ref={end} />

      <form className="app-compose" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
        <label htmlFor="concierge-input" className="sr-only">{t({ it: 'Messaggio', en: 'Message' })}</label>
        <input id="concierge-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder={t({ it: 'Scrivi un messaggio...', en: 'Type a message...' })} enterKeyHint="send" autoComplete="off" />
        <button type="submit" className="btn btn-primary btn-sm" disabled={!input.trim() || busy}>{t({ it: 'Invia', en: 'Send' })}</button>
      </form>
    </div>
  );
};

export default AppConcierge;

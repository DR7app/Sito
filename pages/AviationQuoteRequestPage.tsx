import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from '../hooks/useTranslation';
import { getAviationQuoteCopy, getAviationQuoteTemplate, type AviationQuoteCopy } from '../utils/siteCopy';

const AviationQuoteRequestPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { lang } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [inviata, setInviata] = useState(false);
  const [copy, setCopy] = useState<AviationQuoteCopy | null>(null);
  const [template, setTemplate] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAviationQuoteCopy(), getAviationQuoteTemplate()]).then(([c, t]) => {
      if (cancelled) return;
      setCopy(c);
      setTemplate(t);
    });
    return () => { cancelled = true; };
  }, []);

  const isHelicopter = location.pathname.includes('helicopter');

  // Il mezzo scelto a catalogo, quando si arriva dalla scheda di /noleggio-aria.
  // Viaggia in chiaro nell'indirizzo perche' deve sopravvivere all'accesso:
  // chi non e' loggato passa da /signin e torna qui.
  const mezzoScelto = new URLSearchParams(location.search).get('aircraft') || '';

  const [formData, setFormData] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    departure_location: '',
    arrival_location: '',
    departure_date: '',
    return_date: '',
    passenger_count: 1,
    notes: ''
  });

  const tx = (it: keyof AviationQuoteCopy, en: keyof AviationQuoteCopy, fallback = ''): string => {
    if (!copy) return fallback;
    const key = lang === 'it' ? it : en;
    return (copy as Record<string, string>)[key as string] || fallback;
  };

  const serviceType = copy
    ? (isHelicopter ? copy.service_label_helicopter : copy.service_label_jet)
    : (isHelicopter ? 'Elicottero' : 'Jet Privato');

  // Apply all WhatsApp template placeholders. Supports tokens + the
  // optional inline rows {return_line} / {notes_line} which collapse to
  // empty when the corresponding form field is blank (so no awkward empty
  // lines in the message).
  function applyVars(s: string): string {
    const returnLine = formData.return_date
      ? (lang === 'it' ? `Data ritorno: ${formData.return_date}\n` : `Return date: ${formData.return_date}\n`)
      : '';
    const notesLine = formData.notes
      ? (lang === 'it' ? `\nNote: ${formData.notes}\n` : `\nNotes: ${formData.notes}\n`)
      : '';
    const vars: Record<string, string> = {
      '{service}': serviceType,
      '{nome}': formData.customer_name,
      '{email}': formData.customer_email,
      '{telefono}': formData.customer_phone,
      '{partenza}': formData.departure_location,
      '{arrivo}': formData.arrival_location,
      '{data_partenza}': formData.departure_date,
      '{data_ritorno}': formData.return_date || '',
      '{passeggeri}': String(formData.passenger_count),
      '{note}': formData.notes || '',
      // Optional whole-line tokens (collapse to empty when field blank).
      '{return_line}': returnLine,
      '{notes_line}': notesLine,
    };
    let out = s;
    for (const [k, v] of Object.entries(vars)) out = out.split(k).join(v);
    return out;
  }

  /**
   * L'invio.
   *
   * 06/09/2026 — prima questo modulo apriva WhatsApp sul telefono del
   * cliente con il messaggio gia' scritto: se non premeva "invia", DR7 non
   * sapeva nemmeno che qualcuno avesse chiesto un preventivo, e la
   * richiesta non restava scritta da nessuna parte.
   *
   * Ora il modulo si manda a DR7: il server lo salva fra i Preventivi
   * Aviation del gestionale e avvisa su WhatsApp. WhatsApp resta solo come
   * rete di sicurezza, per quando il server non risponde: meglio far
   * partire un messaggio dal telefono del cliente che perdere la richiesta.
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!copy) return;
    const isIt = lang === 'it';
    setSubmitting(true);
    try {
      const res = await fetch('/.netlify/functions/send-aviation-quote-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: serviceType,
          preferred_aircraft: mezzoScelto,
          lang,
          ...formData,
        }),
      });
      if (!res.ok) throw new Error(`server ${res.status}`);
      setInviata(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error('Richiesta preventivo non inviata al server, ripiego su WhatsApp:', error);
      const msg = applyVars(template);
      window.open(`https://wa.me/${copy.whatsapp_phone}?text=${encodeURIComponent(msg)}`, '_blank');
      alert(isIt ? copy.alert_success_it : copy.alert_success_en);
      navigate('/');
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || !copy) {
    return (
      <div className="min-h-screen bg-black py-20 px-4">
        <div className="max-w-2xl mx-auto flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-white text-lg">{tx('loading_it', 'loading_en', lang === 'it' ? 'Caricamento...' : 'Loading...')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-black py-20 px-4">
        <div className="max-w-2xl mx-auto pt-20">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-8 text-center">
            <div className="mb-6">
              <svg className="w-20 h-20 mx-auto text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">
              {tx('auth_title_it', 'auth_title_en')}
            </h2>
            <p className="text-gray-400 mb-8">
              {tx('auth_body_it', 'auth_body_en')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => navigate('/signin', { state: { from: location.pathname } })}
                className="px-8 py-3 bg-white text-black font-bold hover:bg-gray-200 transition-colors"
              >
                {tx('auth_login_cta_it', 'auth_login_cta_en')}
              </button>
              <button
                onClick={() => navigate('/signup', { state: { from: location.pathname } })}
                className="px-8 py-3 bg-gray-700 text-white font-bold hover:bg-gray-600 transition-colors"
              >
                {tx('auth_signup_cta_it', 'auth_signup_cta_en')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const headerTitle = applyVars(lang === 'it' ? copy.header_title_template_it : copy.header_title_template_en);

  // Richiesta partita: la persona ha finito, non le si rimette davanti il
  // modulo pieno dei suoi dati.
  if (inviata) {
    return (
      <div className="min-h-screen bg-black py-20 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-xl mx-auto pt-20 text-center"
        >
          <div className="border border-gray-800 bg-gray-900 rounded-2xl p-10">
            <h1 className="text-3xl font-bold text-white mb-4">
              {lang === 'it' ? 'Richiesta inviata' : 'Request sent'}
            </h1>
            <p className="text-gray-400 mb-2">
              {lang === 'it' ? copy.alert_success_it : copy.alert_success_en}
            </p>
            <p className="text-gray-500 text-sm mb-8">
              {lang === 'it'
                ? `Abbiamo registrato la richiesta per ${serviceType.toLowerCase()}${mezzoScelto ? ` — ${mezzoScelto}` : ''}. Ti rispondiamo ai contatti che ci hai lasciato.`
                : `We have logged your ${serviceType.toLowerCase()} request${mezzoScelto ? ` — ${mezzoScelto}` : ''}. We will reply using the contacts you left us.`}
            </p>
            <button
              onClick={() => navigate('/')}
              className="px-8 py-3 bg-white text-black font-bold hover:bg-gray-200 transition-colors"
            >
              {lang === 'it' ? 'Torna alla pagina iniziale' : 'Back to home'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black py-20 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto pt-12"
      >
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            {headerTitle}
          </h1>
          <p className="text-gray-400">
            {tx('header_subtitle_it', 'header_subtitle_en')}
          </p>
          {mezzoScelto && (
            <p className="mt-4 inline-block border border-gray-700 px-4 py-2 text-sm text-white">
              {lang === 'it' ? 'Mezzo scelto:' : 'Selected aircraft:'} <span className="font-semibold">{mezzoScelto}</span>
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl p-6 md:p-8 border border-gray-800 space-y-6">
          {/* Customer Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">{tx('section_customer_it', 'section_customer_en')}</h3>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {tx('field_name_label_it', 'field_name_label_en')}
              </label>
              <input
                type="text"
                required
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:border-white focus:ring-1 focus:ring-white"
                placeholder={tx('field_name_placeholder_it', 'field_name_placeholder_en')}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {tx('field_email_label_it', 'field_email_label_en')}
                </label>
                <input
                  type="email"
                  required
                  value={formData.customer_email}
                  onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })}
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:border-white focus:ring-1 focus:ring-white"
                  placeholder={tx('field_email_placeholder_it', 'field_email_placeholder_en')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {tx('field_phone_label_it', 'field_phone_label_en')}
                </label>
                <input
                  type="tel"
                  required
                  value={formData.customer_phone}
                  onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:border-white focus:ring-1 focus:ring-white"
                  placeholder={tx('field_phone_placeholder_it', 'field_phone_placeholder_en')}
                />
              </div>
            </div>
          </div>

          {/* Flight Details */}
          <div className="space-y-4 pt-4 border-t border-gray-800">
            <h3 className="text-lg font-semibold text-white">{tx('section_flight_it', 'section_flight_en')}</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {tx('field_departure_label_it', 'field_departure_label_en')}
                </label>
                <input
                  type="text"
                  required
                  value={formData.departure_location}
                  onChange={(e) => setFormData({ ...formData, departure_location: e.target.value })}
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:border-white focus:ring-1 focus:ring-white"
                  placeholder={tx('field_departure_placeholder_it', 'field_departure_placeholder_en')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {tx('field_arrival_label_it', 'field_arrival_label_en')}
                </label>
                <input
                  type="text"
                  required
                  value={formData.arrival_location}
                  onChange={(e) => setFormData({ ...formData, arrival_location: e.target.value })}
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:border-white focus:ring-1 focus:ring-white"
                  placeholder={tx('field_arrival_placeholder_it', 'field_arrival_placeholder_en')}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {tx('field_departure_date_label_it', 'field_departure_date_label_en')}
                </label>
                <input
                  type="date"
                  required
                  value={formData.departure_date}
                  onChange={(e) => setFormData({ ...formData, departure_date: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:border-white focus:ring-1 focus:ring-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {tx('field_return_date_label_it', 'field_return_date_label_en')}
                </label>
                <input
                  type="date"
                  value={formData.return_date}
                  onChange={(e) => setFormData({ ...formData, return_date: e.target.value })}
                  min={formData.departure_date || new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:border-white focus:ring-1 focus:ring-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {tx('field_passengers_label_it', 'field_passengers_label_en')}
              </label>
              <input
                type="number"
                min="1"
                max="20"
                required
                value={formData.passenger_count}
                onChange={(e) => setFormData({ ...formData, passenger_count: parseInt(e.target.value) })}
                className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:border-white focus:ring-1 focus:ring-white"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="pt-4 border-t border-gray-800">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              {tx('field_notes_label_it', 'field_notes_label_en')}
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:border-white focus:ring-1 focus:ring-white"
              placeholder={tx('field_notes_placeholder_it', 'field_notes_placeholder_en')}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-white text-black font-bold py-4 px-6 hover:bg-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg"
          >
            {submitting
              ? tx('submit_submitting_it', 'submit_submitting_en')
              : tx('submit_idle_it', 'submit_idle_en')}
          </button>

          <p className="text-xs text-center text-gray-500">
            {tx('disclaimer_it', 'disclaimer_en')}
          </p>
        </form>
      </motion.div>
    </div>
  );
};

export default AviationQuoteRequestPage;

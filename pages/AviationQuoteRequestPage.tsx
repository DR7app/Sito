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
  const { lang, t } = useTranslation();
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

  // 07/09/2026 — il modulo chiedeva otto cose e il resto lo indovinava
  // l'ufficio al telefono. Nel charter privato orari, tappe, bagagli, budget
  // e soprattutto la FLESSIBILITA' su date e orari cambiano il preventivo:
  // se non si chiedono qui, si chiedono dopo, e nel frattempo la proposta e'
  // gia' partita sbagliata.
  //
  // Le colonne su `aviation_quotes` esistevano gia' quasi tutte (il
  // gestionale le mostra da sempre nella scheda del preventivo): erano solo
  // riempite con valori finti dal server. Ora arrivano dal cliente.
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    departure_location: '',
    arrival_location: '',
    departure_date: '',
    departure_time: '',
    wants_return: false,
    return_date: '',
    return_time: '',
    is_flexible: false,
    passenger_count: 1,
    has_stops: false,
    intermediate_stops: '',
    // Bagagli: due tendine. Prima era un campo libero e il cliente doveva
    // scrivere tutto a mano ("2 trolley + 2 valigie grandi"), con il
    // risultato che meta' delle richieste arrivava senza peso.
    luggage_count: 0,
    luggage_weight: '',
    budget_indicative: '',
    aircraft_category: (isHelicopter ? 'helicopter' : 'jet') as 'jet' | 'helicopter' | 'any',
    notes: ''
  });

  // Un solo aspetto per tutti i campi del modulo: scritto una volta, cosi'
  // aggiungere una domanda non vuol dire ricopiare dieci classi.
  const campoCls = 'w-full px-4 py-3 bg-black border border-gray-700 rounded-lg text-white focus:border-white focus:ring-1 focus:ring-white';

  const tx = (it: keyof AviationQuoteCopy, en: keyof AviationQuoteCopy, fallback = ''): string => {
    if (!copy) return fallback;
    const key = lang === 'it' ? it : en;
    return (copy as Record<string, string>)[key as string] || fallback;
  };

  const serviceType = copy
    ? (isHelicopter ? copy.service_label_helicopter : copy.service_label_jet)
    : (isHelicopter ? 'Elicottero' : 'Jet Privato');

  /** Le voci del peso: una riga di Centralina, separata da virgole. */
  function pesiBagaglio(): string[] {
    return tx('field_luggage_weight_options_it', 'field_luggage_weight_options_en')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }

  /** Bagagli in una riga sola, per il messaggio e per la scheda. */
  function bagagliTesto(): string {
    const n = Number(formData.luggage_count) || 0;
    if (n <= 0) return t({ it: 'Nessun bagaglio', en: 'No luggage' });
    const quanti = n > 10
      ? tx('field_luggage_count_max_option_it', 'field_luggage_count_max_option_en')
      : String(n);
    const parola = lang === 'it' ? (n === 1 ? 'bagaglio' : 'bagagli') : (n === 1 ? 'bag' : 'bags');
    return formData.luggage_weight
      ? `${quanti} ${parola} · ${formData.luggage_weight}`
      : `${quanti} ${parola}`;
  }

  /** Il nome della tipologia scelta, con le parole della Centralina. */
  function tipoAeromobileLabel(): string {
    if (formData.aircraft_category === 'helicopter') return tx('field_aircraft_option_helicopter_it', 'field_aircraft_option_helicopter_en');
    if (formData.aircraft_category === 'any') return tx('field_aircraft_option_any_it', 'field_aircraft_option_any_en');
    return tx('field_aircraft_option_jet_it', 'field_aircraft_option_jet_en');
  }

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
    const isIt = lang === 'it';
    const si = isIt ? 'Sì' : 'Yes';
    const no = isIt ? 'No' : 'No';
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
      '{orario_partenza}': formData.departure_time || '',
      '{orario_ritorno}': formData.return_time || '',
      '{flessibile}': formData.is_flexible ? si : no,
      '{tappe}': formData.has_stops ? (formData.intermediate_stops || si) : no,
      '{bagagli}': bagagliTesto(),
      '{budget}': formData.budget_indicative || '',
      '{aeromobile}': tipoAeromobileLabel(),
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
          // La riga leggibile la costruisce il modulo, cosi' messaggio e
          // scheda del gestionale dicono la stessa cosa.
          luggage_details: bagagliTesto(),
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
              {t({ it: 'Richiesta inviata', en: 'Request sent' })}
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
              {t({ it: 'Torna alla pagina iniziale', en: 'Back to home' })}
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
              {t({ it: 'Mezzo scelto:', en: 'Selected aircraft:' })} <span className="font-semibold">{mezzoScelto}</span>
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
                  className={campoCls}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {tx('field_departure_time_label_it', 'field_departure_time_label_en')}
                </label>
                <input
                  type="time"
                  value={formData.departure_time}
                  onChange={(e) => setFormData({ ...formData, departure_time: e.target.value })}
                  className={campoCls}
                />
              </div>
            </div>

            {/* Volo di ritorno: le due date si chiedono solo a chi risponde di si'. */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {tx('field_return_flight_label_it', 'field_return_flight_label_en')}
              </label>
              <select
                value={formData.wants_return ? 'si' : 'no'}
                onChange={(e) => {
                  const vuole = e.target.value === 'si';
                  // Chi torna sul "No" non lascia dietro una data di ritorno
                  // che finirebbe comunque nel preventivo.
                  setFormData({ ...formData, wants_return: vuole, return_date: vuole ? formData.return_date : '', return_time: vuole ? formData.return_time : '' });
                }}
                className={campoCls}
              >
                <option value="si">{tx('option_yes_it', 'option_yes_en')}</option>
                <option value="no">{tx('option_no_it', 'option_no_en')}</option>
              </select>
            </div>

            {formData.wants_return && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    {tx('field_return_date_label_it', 'field_return_date_label_en')}
                  </label>
                  <input
                    type="date"
                    value={formData.return_date}
                    onChange={(e) => setFormData({ ...formData, return_date: e.target.value })}
                    min={formData.departure_date || new Date().toISOString().split('T')[0]}
                    className={campoCls}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    {tx('field_return_time_label_it', 'field_return_time_label_en')}
                  </label>
                  <input
                    type="time"
                    value={formData.return_time}
                    onChange={(e) => setFormData({ ...formData, return_time: e.target.value })}
                    className={campoCls}
                  />
                </div>
              </div>
            )}

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
                className={campoCls}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {tx('field_stops_label_it', 'field_stops_label_en')}
              </label>
              <select
                value={formData.has_stops ? 'si' : 'no'}
                onChange={(e) => {
                  const tappe = e.target.value === 'si';
                  setFormData({ ...formData, has_stops: tappe, intermediate_stops: tappe ? formData.intermediate_stops : '' });
                }}
                className={campoCls}
              >
                <option value="si">{tx('option_yes_it', 'option_yes_en')}</option>
                <option value="no">{tx('option_no_it', 'option_no_en')}</option>
              </select>
            </div>

            {formData.has_stops && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {tx('field_stops_detail_label_it', 'field_stops_detail_label_en')}
                </label>
                <input
                  type="text"
                  value={formData.intermediate_stops}
                  onChange={(e) => setFormData({ ...formData, intermediate_stops: e.target.value })}
                  className={campoCls}
                  placeholder={tx('field_stops_detail_placeholder_it', 'field_stops_detail_placeholder_en')}
                />
              </div>
            )}

            {/* Bagagli: si scelgono, non si scrivono. Numero e peso sono due
                tendine; il testo per il messaggio lo compone bagagliTesto(). */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {tx('field_luggage_count_label_it', 'field_luggage_count_label_en')}
                </label>
                <select
                  value={formData.luggage_count}
                  onChange={(e) => setFormData({ ...formData, luggage_count: parseInt(e.target.value, 10) })}
                  className={campoCls}
                >
                  {Array.from({ length: 11 }, (_, i) => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                  <option value={11}>{tx('field_luggage_count_max_option_it', 'field_luggage_count_max_option_en')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  {tx('field_luggage_weight_label_it', 'field_luggage_weight_label_en')}
                </label>
                <select
                  value={formData.luggage_weight}
                  onChange={(e) => setFormData({ ...formData, luggage_weight: e.target.value })}
                  disabled={Number(formData.luggage_count) <= 0}
                  className={`${campoCls} disabled:opacity-40`}
                >
                  <option value="">{tx('field_luggage_weight_placeholder_it', 'field_luggage_weight_placeholder_en')}</option>
                  {pesiBagaglio().map((peso) => (
                    <option key={peso} value={peso}>{peso}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Budget: campo di testo, non numerico. Qui si scrive una
                forbice ("8.000 - 10.000"), non una cifra secca. */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {tx('field_budget_label_it', 'field_budget_label_en')}
              </label>
              <input
                type="text"
                inputMode="text"
                value={formData.budget_indicative}
                onChange={(e) => setFormData({ ...formData, budget_indicative: e.target.value })}
                className={campoCls}
                placeholder={tx('field_budget_placeholder_it', 'field_budget_placeholder_en')}
              />
              {tx('field_budget_hint_it', 'field_budget_hint_en') && (
                <p className="mt-2 text-xs text-gray-500">{tx('field_budget_hint_it', 'field_budget_hint_en')}</p>
              )}
            </div>

            {/* Il mezzo: precompilato dalla pagina da cui si arriva, ma chi
                non ha ancora deciso puo' farselo consigliare. */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {tx('field_aircraft_label_it', 'field_aircraft_label_en')}
              </label>
              <select
                value={formData.aircraft_category}
                onChange={(e) => setFormData({ ...formData, aircraft_category: e.target.value as 'jet' | 'helicopter' | 'any' })}
                className={campoCls}
              >
                <option value="jet">{tx('field_aircraft_option_jet_it', 'field_aircraft_option_jet_en')}</option>
                <option value="helicopter">{tx('field_aircraft_option_helicopter_it', 'field_aircraft_option_helicopter_en')}</option>
                <option value="any">{tx('field_aircraft_option_any_it', 'field_aircraft_option_any_en')}</option>
              </select>
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
              className={campoCls}
              placeholder={tx('field_notes_placeholder_it', 'field_notes_placeholder_en')}
            />
          </div>

          {/* Flessibilita' su date e orari: ultima domanda prima dell'invio.
              Nel charter privato e' spesso quella che permette di proporre
              una soluzione migliore. */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              {tx('field_flexibility_label_it', 'field_flexibility_label_en')}
            </label>
            <select
              value={formData.is_flexible ? 'si' : 'no'}
              onChange={(e) => setFormData({ ...formData, is_flexible: e.target.value === 'si' })}
              className={campoCls}
            >
              <option value="si">{tx('option_yes_it', 'option_yes_en')}</option>
              <option value="no">{tx('option_no_it', 'option_no_en')}</option>
            </select>
            {tx('field_flexibility_hint_it', 'field_flexibility_hint_en') && (
              <p className="mt-2 text-xs text-gray-500">{tx('field_flexibility_hint_it', 'field_flexibility_hint_en')}</p>
            )}
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

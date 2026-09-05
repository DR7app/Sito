import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useContactInfo } from "../../hooks/useContactInfo";
import { useTranslation } from "../../hooks/useTranslation";

const HelicopterBookingForm: React.FC = () => {
  const navigate = useNavigate();
  const contact = useContactInfo();
  const { t } = useTranslation();

  const [formData, setFormData] = useState({
    // Customer info
    firstName: "",
    lastName: "",
    email: "",
    phone: "",

    // 1. Flight Details
    departureLocation: "",
    arrivalLocation: "",
    tripType: "one_way", // one_way, round_trip
    flightDate: "",
    flightTime: "",
    returnDate: "",
    returnTime: "",
    directFlight: "yes",
    intermediateStops: "",
    hasFlexibility: "no",
    flexibilityDetails: "",
    dayNightFlight: "day",

    // 2. Passengers
    passengerCount: "",
    hasChildren: "no",
    childrenDetails: "",
    hasPets: "no",
    petDetails: "",
    needsHostess: "no",
    isVIP: "no",
    vipDetails: "",

    // 3. Luggage
    luggageCount: "",
    luggageDimensions: "",
    hasSpecialEquipment: "no",
    specialEquipmentDetails: "",
    needsBulkySpace: "no",

    // 4. Flight Type & Preferences
    flightPurpose: "",
    mainPriority: "",
    preferredModel: "",
    needsLogo: "no",
    logoDetails: "",
    needsWifi: "no",
    needsCatering: "no",
    cateringDetails: "",
    needsGroundTransfer: "no",
    transferDetails: "",

    // 5. Technical & Logistics
    knowsAirport: "yes",
    airportDetails: "",
    needsRooftopLanding: "no",
    landingLocationDetails: "",
    needsLuggageAssistance: "no",

    // 6. Economic & Administrative
    billingType: "individual",
    vatNumber: "",
    fiscalCode: "",
    paymentMethod: "",
    vatIncluded: "yes",
    needsContract: "no",

    // 7. Optional Services
    needsInsurance: "no",
    needsSecurity: "no",
    needsCrewAccommodation: "no",
    needsNDA: "no",

    // General notes
    notes: "",
    terms: false,
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      const checkbox = e.target as HTMLInputElement;
      setFormData((prev) => ({ ...prev, [name]: checkbox.checked }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const validate = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.firstName.trim()) newErrors.firstName = t({ it: "Inserisci il tuo nome", en: "Enter your first name" });
    if (!formData.lastName.trim()) newErrors.lastName = t({ it: "Inserisci il tuo cognome", en: "Enter your last name" });
    if (!formData.email.trim()) newErrors.email = t({ it: "Inserisci la tua email", en: "Enter your email" });
    if (!formData.phone.trim()) newErrors.phone = t({ it: "Inserisci il tuo numero WhatsApp", en: "Enter your WhatsApp number" });
    if (!formData.departureLocation.trim()) newErrors.departureLocation = t({ it: "Inserisci il luogo di partenza", en: "Enter the departure location" });
    if (!formData.arrivalLocation.trim()) newErrors.arrivalLocation = t({ it: "Inserisci il luogo di arrivo", en: "Enter the arrival location" });
    if (!formData.flightDate.trim()) newErrors.flightDate = t({ it: "Seleziona la data del volo", en: "Select the flight date" });
    if (!formData.passengerCount.trim()) newErrors.passengerCount = t({ it: "Inserisci il numero di passeggeri", en: "Enter the number of passengers" });
    if (!formData.terms) newErrors.terms = t({ it: "Devi accettare i termini e le condizioni", en: "You must accept the terms and conditions" });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    // Build comprehensive WhatsApp message
    let msg = `Ciao DR7\nVorrei prenotare un volo in elicottero.\n\n`;

    msg += `DATI CLIENTE\n`;
    msg += `Nome: ${formData.firstName} ${formData.lastName}\n`;
    msg += `Email: ${formData.email}\n`;
    msg += `Telefono / WhatsApp: ${formData.phone}\n\n`;

    msg += `1. DETTAGLI DEL VOLO\n`;
    msg += `• Da: ${formData.departureLocation}\n`;
    msg += `• A: ${formData.arrivalLocation}\n`;
    msg += `• Tipo: ${formData.tripType === 'round_trip' ? 'Andata e Ritorno' : 'Solo Andata'}\n`;
    msg += `• Data partenza: ${formData.flightDate}${formData.flightTime ? ' alle ' + formData.flightTime : ''}\n`;
    if (formData.tripType === 'round_trip' && formData.returnDate) {
      msg += `• Data ritorno: ${formData.returnDate}${formData.returnTime ? ' alle ' + formData.returnTime : ''}\n`;
    }
    msg += `• Volo diretto: ${formData.directFlight === 'yes' ? 'Sì' : 'No'}\n`;
    if (formData.directFlight === 'no' && formData.intermediateStops) {
      msg += `• Tappe intermedie: ${formData.intermediateStops}\n`;
    }
    msg += `• Flessibilità orario/giorno: ${formData.hasFlexibility === 'yes' ? 'Sì' : 'No'}\n`;
    if (formData.hasFlexibility === 'yes' && formData.flexibilityDetails) {
      msg += `• Dettagli flessibilità: ${formData.flexibilityDetails}\n`;
    }
    msg += `• Volo: ${formData.dayNightFlight === 'day' ? 'Diurno' : 'Notturno'}\n\n`;

    msg += `2. PASSEGGERI\n`;
    msg += `• Numero passeggeri: ${formData.passengerCount}\n`;
    msg += `• Bambini/neonati: ${formData.hasChildren === 'yes' ? 'Sì - ' + formData.childrenDetails : 'No'}\n`;
    msg += `• Animali: ${formData.hasPets === 'yes' ? 'Sì - ' + formData.petDetails : 'No'}\n`;
    msg += `• Assistente/hostess: ${formData.needsHostess === 'yes' ? 'Sì' : 'No'}\n`;
    msg += `• Ospite VIP: ${formData.isVIP === 'yes' ? 'Sì - ' + (formData.vipDetails || 'richiede riservatezza') : 'No'}\n\n`;

    msg += `3. BAGAGLI\n`;
    msg += `• Numero bagagli: ${formData.luggageCount || 'Non specificato'}\n`;
    if (formData.luggageDimensions) {
      msg += `• Dimensioni/peso: ${formData.luggageDimensions}\n`;
    }
    msg += `• Attrezzature speciali: ${formData.hasSpecialEquipment === 'yes' ? 'Sì - ' + formData.specialEquipmentDetails : 'No'}\n`;
    msg += `• Bagagli ingombranti: ${formData.needsBulkySpace === 'yes' ? 'Sì' : 'No'}\n\n`;

    msg += `4. TIPOLOGIA VOLO E PREFERENZE\n`;
    if (formData.flightPurpose) {
      msg += `• Scopo volo: ${formData.flightPurpose}\n`;
    }
    if (formData.mainPriority) {
      msg += `• Priorità principale: ${formData.mainPriority}\n`;
    }
    if (formData.preferredModel) {
      msg += `• Modello preferito: ${formData.preferredModel}\n`;
    }
    msg += `• Logo aziendale: ${formData.needsLogo === 'yes' ? 'Sì - ' + formData.logoDetails : 'No'}\n`;
    msg += `• Wi-Fi: ${formData.needsWifi === 'yes' ? 'Sì' : 'No'}\n`;
    msg += `• Catering: ${formData.needsCatering === 'yes' ? 'Sì' + (formData.cateringDetails ? ' - ' + formData.cateringDetails : '') : 'No'}\n`;
    msg += `• Transfer a terra: ${formData.needsGroundTransfer === 'yes' ? 'Sì' + (formData.transferDetails ? ' - ' + formData.transferDetails : '') : 'No'}\n\n`;

    msg += `5. DETTAGLI TECNICI E LOGISTICI\n`;
    msg += `• Aeroporto/eliporto noto: ${formData.knowsAirport === 'yes' ? 'Sì' : 'No'}\n`;
    if (formData.airportDetails) {
      msg += `• Dettagli: ${formData.airportDetails}\n`;
    }
    msg += `• Atterraggio su rooftop/terreno privato: ${formData.needsRooftopLanding === 'yes' ? 'Sì' : 'No'}\n`;
    if (formData.landingLocationDetails) {
      msg += `• Località atterraggio: ${formData.landingLocationDetails}\n`;
    }
    msg += `• Assistenza bagagli: ${formData.needsLuggageAssistance === 'yes' ? 'Sì' : 'No'}\n\n`;

    msg += `6. CONDIZIONI ECONOMICHE E AMMINISTRATIVE\n`;
    msg += `• Tipo fatturazione: ${formData.billingType === 'company' ? 'Società' : 'Persona fisica'}\n`;
    if (formData.vatNumber) {
      msg += `• P.IVA: ${formData.vatNumber}\n`;
    }
    if (formData.fiscalCode) {
      msg += `• Codice fiscale: ${formData.fiscalCode}\n`;
    }
    if (formData.paymentMethod) {
      msg += `• Metodo pagamento: ${formData.paymentMethod}\n`;
    }
    msg += `• IVA: ${formData.vatIncluded === 'yes' ? 'Inclusa' : 'Esclusa'}\n`;
    msg += `• Contratto sub-noleggio: ${formData.needsContract === 'yes' ? 'Sì' : 'No'}\n\n`;

    msg += `7. SERVIZI OPZIONALI O PREMIUM\n`;
    msg += `• Assicurazione full risk: ${formData.needsInsurance === 'yes' ? 'Sì' : 'No'}\n`;
    msg += `• Sicurezza privata: ${formData.needsSecurity === 'yes' ? 'Sì' : 'No'}\n`;
    msg += `• Pernottamento equipaggio: ${formData.needsCrewAccommodation === 'yes' ? 'Sì' : 'No'}\n`;
    msg += `• NDA richiesto: ${formData.needsNDA === 'yes' ? 'Sì' : 'No'}\n`;

    if (formData.notes) {
      msg += `\nNOTE AGGIUNTIVE\n${formData.notes}\n`;
    }

    msg += `\nPotete confermare disponibilità e prezzo? Grazie`;

    const encoded = encodeURIComponent(msg);
    const url = `${contact.whatsapp_url}?text=${encoded}`;
    window.open(url, "_blank");
  };

  return (
    <div className="max-w-5xl mx-auto bg-black/60 border border-zinc-800 rounded-xl p-6 md:p-8 text-white">
      <button
        onClick={() => navigate('/helicopters')}
        className="mb-4 text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        {t({ it: "Indietro", en: "Back" })}
      </button>

      <h2 className="text-2xl md:text-3xl font-semibold mb-4">{t({ it: "Prenota il Tuo Volo in Elicottero", en: "Book Your Helicopter Flight" })}</h2>
      <p className="text-sm mb-6 text-zinc-300">
        {t({ it: 'Compila il modulo qui sotto e verrai reindirizzato su WhatsApp con la tua richiesta precompilata. I voli sono soggetti a disponibilità e condizioni meteorologiche.', en: 'Fill in the form below and you will be redirected to WhatsApp with your request pre-filled. Flights are subject to availability and weather conditions.' })}
      </p>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Customer Info Section */}
        <div className="bg-zinc-900/50 p-6 rounded-lg border border-zinc-800">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            {t({ it: "Dati Cliente", en: "Customer Details" })}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Nome *", en: "First name *" })}</label>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                placeholder={t({ it: "es. Marco", en: "e.g. Marco" })}
              />
              {errors.firstName && <p className="text-red-400 text-xs mt-1">{errors.firstName}</p>}
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Cognome *", en: "Last name *" })}</label>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                placeholder={t({ it: "es. Rossi", en: "e.g. Rossi" })}
              />
              {errors.lastName && <p className="text-red-400 text-xs mt-1">{errors.lastName}</p>}
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Email *", en: "Email *" })}</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                placeholder={t({ it: "tuaemail@mail.com", en: "youremail@mail.com" })}
              />
              {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
            </div>
            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Telefono / WhatsApp *", en: "Phone / WhatsApp *" })}</label>
              <input
                type="text"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                placeholder="+39 ..."
              />
              {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone}</p>}
            </div>
          </div>
        </div>

        {/* 1. Flight Details */}
        <div className="bg-zinc-900/50 p-6 rounded-lg border border-zinc-800">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            {t({ it: "1. Dettagli del Volo", en: "1. Flight Details" })}
          </h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block mb-1 text-sm font-medium">{t({ it: "Da dove (partenza) *", en: "From (departure) *" })}</label>
                <input
                  type="text"
                  name="departureLocation"
                  value={formData.departureLocation}
                  onChange={handleChange}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                  placeholder={t({ it: "es. Olbia aeroporto", en: "e.g. Olbia airport" })}
                />
                {errors.departureLocation && <p className="text-red-400 text-xs mt-1">{errors.departureLocation}</p>}
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">{t({ it: "A dove (arrivo) *", en: "To (arrival) *" })}</label>
                <input
                  type="text"
                  name="arrivalLocation"
                  value={formData.arrivalLocation}
                  onChange={handleChange}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                  placeholder={t({ it: "es. Porto Cervo", en: "e.g. Porto Cervo" })}
                />
                {errors.arrivalLocation && <p className="text-red-400 text-xs mt-1">{errors.arrivalLocation}</p>}
              </div>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Tipo di viaggio", en: "Trip type" })}</label>
              <select
                name="tripType"
                value={formData.tripType}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="one_way">{t({ it: "Solo Andata", en: "One way" })}</option>
                <option value="round_trip">{t({ it: "Andata e Ritorno", en: "Round trip" })}</option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block mb-1 text-sm font-medium">{t({ it: "Data partenza *", en: "Departure date *" })}</label>
                <input
                  type="date"
                  name="flightDate"
                  value={formData.flightDate}
                  onChange={handleChange}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                />
                {errors.flightDate && <p className="text-red-400 text-xs mt-1">{errors.flightDate}</p>}
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium">{t({ it: "Orario partenza", en: "Departure time" })}</label>
                <input
                  type="time"
                  name="flightTime"
                  value={formData.flightTime}
                  onChange={handleChange}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                />
              </div>
            </div>

            {formData.tripType === 'round_trip' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1 text-sm font-medium">{t({ it: "Data ritorno", en: "Return date" })}</label>
                  <input
                    type="date"
                    name="returnDate"
                    value={formData.returnDate}
                    onChange={handleChange}
                    min={formData.flightDate}
                    disabled={!formData.flightDate}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-sm font-medium">{t({ it: "Orario ritorno", en: "Return time" })}</label>
                  <input
                    type="time"
                    name="returnTime"
                    value={formData.returnTime}
                    onChange={handleChange}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Preferisce un volo diretto?", en: "Do you prefer a direct flight?" })}</label>
              <select
                name="directFlight"
                value={formData.directFlight}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="yes">{t({ it: "Sì, volo diretto", en: "Yes, direct flight" })}</option>
                <option value="no">{t({ it: "No, con tappe intermedie", en: "No, with intermediate stops" })}</option>
              </select>
            </div>

            {formData.directFlight === 'no' && (
              <div>
                <label className="block mb-1 text-sm font-medium">{t({ it: "Specificare tappe intermedie", en: "Specify intermediate stops" })}</label>
                <input
                  type="text"
                  name="intermediateStops"
                  value={formData.intermediateStops}
                  onChange={handleChange}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                  placeholder={t({ it: "es. Tappa a Cagliari", en: "e.g. Stop in Cagliari" })}
                />
              </div>
            )}

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Esiste flessibilità di orario o giorno?", en: "Any flexibility on time or date?" })}</label>
              <select
                name="hasFlexibility"
                value={formData.hasFlexibility}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="no">{t({ it: "No, data fissa", en: "No, fixed date" })}</option>
                <option value="yes">{t({ it: "Sì, flessibile", en: "Yes, flexible" })}</option>
              </select>
            </div>

            {formData.hasFlexibility === 'yes' && (
              <div>
                <label className="block mb-1 text-sm font-medium">{t({ it: "Dettagli flessibilità", en: "Flexibility details" })}</label>
                <input
                  type="text"
                  name="flexibilityDetails"
                  value={formData.flexibilityDetails}
                  onChange={handleChange}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                  placeholder={t({ it: "es. Disponibile anche 2-3 giorni prima/dopo", en: "e.g. Also available 2-3 days before/after" })}
                />
              </div>
            )}

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Volo diurno o notturno?", en: "Day or night flight?" })}</label>
              <select
                name="dayNightFlight"
                value={formData.dayNightFlight}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="day">{t({ it: "Diurno", en: "Daytime" })}</option>
                <option value="night">{t({ it: "Notturno", en: "Night" })}</option>
              </select>
            </div>
          </div>
        </div>

        {/* 2. Passengers */}
        <div className="bg-zinc-900/50 p-6 rounded-lg border border-zinc-800">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            {t({ it: "2. Passeggeri", en: "2. Passengers" })}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Quante persone viaggeranno? *", en: "How many people will travel? *" })}</label>
              <input
                type="number"
                name="passengerCount"
                min={1}
                value={formData.passengerCount}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                placeholder={t({ it: "es. 2", en: "e.g. 2" })}
              />
              {errors.passengerCount && <p className="text-red-400 text-xs mt-1">{errors.passengerCount}</p>}
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "È previsto un bambino o un neonato?", en: "Any children or infants travelling?" })}</label>
              <select
                name="hasChildren"
                value={formData.hasChildren}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="no">No</option>
                <option value="yes">{t({ it: "Sì", en: "Yes" })}</option>
              </select>
            </div>

            {formData.hasChildren === 'yes' && (
              <div>
                <label className="block mb-1 text-sm font-medium">{t({ it: "Dettagli bambini (età, numero)", en: "Children details (age, number)" })}</label>
                <input
                  type="text"
                  name="childrenDetails"
                  value={formData.childrenDetails}
                  onChange={handleChange}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                  placeholder={t({ it: "es. 1 bambino di 3 anni", en: "e.g. 1 child aged 3" })}
                />
              </div>
            )}

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Ci sono animali a bordo?", en: "Any pets on board?" })}</label>
              <select
                name="hasPets"
                value={formData.hasPets}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="no">No</option>
                <option value="yes">{t({ it: "Sì", en: "Yes" })}</option>
              </select>
            </div>

            {formData.hasPets === 'yes' && (
              <div>
                <label className="block mb-1 text-sm font-medium">{t({ it: "Dettagli animali (razza, dimensione, peso)", en: "Pet details (breed, size, weight)" })}</label>
                <input
                  type="text"
                  name="petDetails"
                  value={formData.petDetails}
                  onChange={handleChange}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                  placeholder={t({ it: "es. Labrador, 30 kg", en: "e.g. Labrador, 30 kg" })}
                />
              </div>
            )}

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "È necessario un assistente personale / hostess?", en: "Do you need a personal assistant / hostess?" })}</label>
              <select
                name="needsHostess"
                value={formData.needsHostess}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="no">No</option>
                <option value="yes">{t({ it: "Sì", en: "Yes" })}</option>
              </select>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Ospite VIP o figura pubblica?", en: "VIP guest or public figure?" })}</label>
              <select
                name="isVIP"
                value={formData.isVIP}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="no">No</option>
                <option value="yes">{t({ it: "Sì", en: "Yes" })}</option>
              </select>
            </div>

            {formData.isVIP === 'yes' && (
              <div>
                <label className="block mb-1 text-sm font-medium">{t({ it: "Dettagli VIP (misure di riservatezza o sicurezza)", en: "VIP details (privacy or security measures)" })}</label>
                <input
                  type="text"
                  name="vipDetails"
                  value={formData.vipDetails}
                  onChange={handleChange}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                  placeholder={t({ it: "es. Richiesta massima discrezione", en: "e.g. Maximum discretion required" })}
                />
              </div>
            )}
          </div>
        </div>

        {/* 3. Luggage */}
        <div className="bg-zinc-900/50 p-6 rounded-lg border border-zinc-800">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            {t({ it: "3. Bagagli", en: "3. Luggage" })}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Quanti bagagli avete in totale?", en: "How many bags in total?" })}</label>
              <input
                type="number"
                name="luggageCount"
                min={0}
                value={formData.luggageCount}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                placeholder={t({ it: "es. 3", en: "e.g. 3" })}
              />
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Dimensione e peso approssimativo", en: "Approximate size and weight" })}</label>
              <input
                type="text"
                name="luggageDimensions"
                value={formData.luggageDimensions}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                placeholder={t({ it: "es. 2 valigie medie (20kg ciascuna), 1 zaino", en: "e.g. 2 medium suitcases (20kg each), 1 backpack" })}
              />
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Avete attrezzature speciali?", en: "Any special equipment?" })}</label>
              <select
                name="hasSpecialEquipment"
                value={formData.hasSpecialEquipment}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="no">No</option>
                <option value="yes">{t({ it: "Sì", en: "Yes" })}</option>
              </select>
            </div>

            {formData.hasSpecialEquipment === 'yes' && (
              <div>
                <label className="block mb-1 text-sm font-medium">{t({ it: "Dettagli attrezzature speciali", en: "Special equipment details" })}</label>
                <input
                  type="text"
                  name="specialEquipmentDetails"
                  value={formData.specialEquipmentDetails}
                  onChange={handleChange}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                  placeholder={t({ it: "es. Mazze da golf, strumenti musicali", en: "e.g. Golf clubs, musical instruments" })}
                />
              </div>
            )}

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Serve spazio per bagagli ingombranti?", en: "Do you need space for oversized luggage?" })}</label>
              <select
                name="needsBulkySpace"
                value={formData.needsBulkySpace}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="no">No</option>
                <option value="yes">{t({ it: "Sì", en: "Yes" })}</option>
              </select>
            </div>
          </div>
        </div>

        {/* 4. Flight Type & Preferences */}
        <div className="bg-zinc-900/50 p-6 rounded-lg border border-zinc-800">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            {t({ it: "4. Tipologia di Volo e Preferenze", en: "4. Flight Type and Preferences" })}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Tipo di volo", en: "Flight type" })}</label>
              <input
                type="text"
                name="flightPurpose"
                value={formData.flightPurpose}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                placeholder={t({ it: "es. Business, turistico, evento speciale, transfer rapido", en: "e.g. Business, leisure, special event, fast transfer" })}
              />
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Priorità principale", en: "Main priority" })}</label>
              <input
                type="text"
                name="mainPriority"
                value={formData.mainPriority}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                placeholder={t({ it: "es. Velocità, lusso, risparmio", en: "e.g. Speed, luxury, value" })}
              />
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Modello di velivolo preferito (opzionale)", en: "Preferred aircraft model (optional)" })}</label>
              <input
                type="text"
                name="preferredModel"
                value={formData.preferredModel}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                placeholder={t({ it: "es. AW109, Airbus H145", en: "e.g. AW109, Airbus H145" })}
              />
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Serve un logo aziendale a bordo?", en: "Do you need a company logo on board?" })}</label>
              <select
                name="needsLogo"
                value={formData.needsLogo}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="no">No</option>
                <option value="yes">{t({ it: "Sì", en: "Yes" })}</option>
              </select>
            </div>

            {formData.needsLogo === 'yes' && (
              <div>
                <label className="block mb-1 text-sm font-medium">{t({ it: "Dettagli logo", en: "Logo details" })}</label>
                <input
                  type="text"
                  name="logoDetails"
                  value={formData.logoDetails}
                  onChange={handleChange}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                  placeholder={t({ it: "Nome azienda / brand", en: "Company / brand name" })}
                />
              </div>
            )}

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Wi-Fi a bordo", en: "Wi-Fi on board" })}</label>
              <select
                name="needsWifi"
                value={formData.needsWifi}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="no">{t({ it: "Non necessario", en: "Not needed" })}</option>
                <option value="yes">{t({ it: "Sì, richiesto", en: "Yes, required" })}</option>
              </select>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Catering di bordo", en: "On-board catering" })}</label>
              <select
                name="needsCatering"
                value={formData.needsCatering}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="no">{t({ it: "Non necessario", en: "Not needed" })}</option>
                <option value="yes">{t({ it: "Sì, richiesto", en: "Yes, required" })}</option>
              </select>
            </div>

            {formData.needsCatering === 'yes' && (
              <div>
                <label className="block mb-1 text-sm font-medium">{t({ it: "Dettagli catering", en: "Catering details" })}</label>
                <input
                  type="text"
                  name="cateringDetails"
                  value={formData.cateringDetails}
                  onChange={handleChange}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                  placeholder={t({ it: "es. Champagne, snack, pasto completo", en: "e.g. Champagne, snacks, full meal" })}
                />
              </div>
            )}

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Transfer a terra (auto di lusso)", en: "Ground transfer (luxury car)" })}</label>
              <select
                name="needsGroundTransfer"
                value={formData.needsGroundTransfer}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="no">{t({ it: "Non necessario", en: "Not needed" })}</option>
                <option value="yes">{t({ it: "Sì, richiesto", en: "Yes, required" })}</option>
              </select>
            </div>

            {formData.needsGroundTransfer === 'yes' && (
              <div>
                <label className="block mb-1 text-sm font-medium">{t({ it: "Dettagli transfer", en: "Transfer details" })}</label>
                <input
                  type="text"
                  name="transferDetails"
                  value={formData.transferDetails}
                  onChange={handleChange}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                  placeholder={t({ it: "es. Da aeroporto a hotel", en: "e.g. From airport to hotel" })}
                />
              </div>
            )}
          </div>
        </div>

        {/* 5. Technical & Logistics */}
        <div className="bg-zinc-900/50 p-6 rounded-lg border border-zinc-800">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            {t({ it: "5. Dettagli Tecnici e Logistici", en: "5. Technical and Logistics Details" })}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Conoscete già l'eliporto di arrivo?", en: "Do you already know the arrival helipad?" })}</label>
              <select
                name="knowsAirport"
                value={formData.knowsAirport}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="yes">{t({ it: "Sì", en: "Yes" })}</option>
                <option value="no">{t({ it: "No, serve individuare quello più vicino", en: "No, we need help finding the closest one" })}</option>
              </select>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Dettagli eliporto / aeroporto", en: "Helipad / airport details" })}</label>
              <input
                type="text"
                name="airportDetails"
                value={formData.airportDetails}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                placeholder={t({ it: "Nome eliporto o aeroporto, codice ICAO/IATA", en: "Helipad or airport name, ICAO/IATA code" })}
              />
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Serve atterraggio su rooftop / terreno privato?", en: "Do you need a rooftop / private land landing?" })}</label>
              <select
                name="needsRooftopLanding"
                value={formData.needsRooftopLanding}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="no">No</option>
                <option value="yes">{t({ it: "Sì", en: "Yes" })}</option>
              </select>
            </div>

            {formData.needsRooftopLanding === 'yes' && (
              <div>
                <label className="block mb-1 text-sm font-medium">{t({ it: "Dettagli località atterraggio", en: "Landing location details" })}</label>
                <input
                  type="text"
                  name="landingLocationDetails"
                  value={formData.landingLocationDetails}
                  onChange={handleChange}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                  placeholder={t({ it: "es. Villa privata, hotel, zona urbana", en: "e.g. Private villa, hotel, urban area" })}
                />
              </div>
            )}

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Serve assistenza bagagli / sicurezza all'imbarco?", en: "Do you need luggage assistance / security at boarding?" })}</label>
              <select
                name="needsLuggageAssistance"
                value={formData.needsLuggageAssistance}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="no">No</option>
                <option value="yes">{t({ it: "Sì", en: "Yes" })}</option>
              </select>
            </div>
          </div>
        </div>

        {/* 6. Economic & Administrative */}
        <div className="bg-zinc-900/50 p-6 rounded-lg border border-zinc-800">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            {t({ it: "6. Condizioni Economiche e Amministrative", en: "6. Financial and Administrative Terms" })}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Preventivo intestato a", en: "Quote issued to" })}</label>
              <select
                name="billingType"
                value={formData.billingType}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="individual">{t({ it: "Persona fisica", en: "Individual" })}</option>
                <option value="company">{t({ it: "Società", en: "Company" })}</option>
              </select>
            </div>

            {formData.billingType === 'company' && (
              <div>
                <label className="block mb-1 text-sm font-medium">{t({ it: "Partita IVA", en: "VAT number" })}</label>
                <input
                  type="text"
                  name="vatNumber"
                  value={formData.vatNumber}
                  onChange={handleChange}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
                  placeholder="IT..."
                />
              </div>
            )}

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Codice fiscale (opzionale)", en: "Tax code (optional)" })}</label>
              <input
                type="text"
                name="fiscalCode"
                value={formData.fiscalCode}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              />
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Metodo di pagamento preferito", en: "Preferred payment method" })}</label>
              <select
                name="paymentMethod"
                value={formData.paymentMethod}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="">{t({ it: "Seleziona", en: "Select" })}</option>
                <option value="Carta">{t({ it: "Carta", en: "Card" })}</option>
                <option value="Bonifico">{t({ it: "Bonifico", en: "Bank transfer" })}</option>
                <option value="Contanti">{t({ it: "Contanti", en: "Cash" })}</option>
              </select>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Preventivo IVA", en: "VAT on quote" })}</label>
              <select
                name="vatIncluded"
                value={formData.vatIncluded}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="yes">{t({ it: "Inclusa", en: "Included" })}</option>
                <option value="no">{t({ it: "Esclusa", en: "Excluded" })}</option>
              </select>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Serve contratto di sub-noleggio?", en: "Do you need a sub-charter contract?" })}</label>
              <select
                name="needsContract"
                value={formData.needsContract}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="no">No</option>
                <option value="yes">{t({ it: "Sì", en: "Yes" })}</option>
              </select>
            </div>
          </div>
        </div>

        {/* 7. Optional Services */}
        <div className="bg-zinc-900/50 p-6 rounded-lg border border-zinc-800">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            {t({ it: "7. Servizi Opzionali o Premium", en: "7. Optional or Premium Services" })}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Assicurazione full risk", en: "Full-risk insurance" })}</label>
              <select
                name="needsInsurance"
                value={formData.needsInsurance}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="no">{t({ it: "Non necessario", en: "Not needed" })}</option>
                <option value="yes">{t({ it: "Sì, richiesto", en: "Yes, required" })}</option>
              </select>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Sicurezza privata o scorta a terra", en: "Private security or ground escort" })}</label>
              <select
                name="needsSecurity"
                value={formData.needsSecurity}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="no">{t({ it: "Non necessario", en: "Not needed" })}</option>
                <option value="yes">{t({ it: "Sì, richiesto", en: "Yes, required" })}</option>
              </select>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Pernottamento equipaggio (rientro posticipato)", en: "Crew overnight stay (delayed return)" })}</label>
              <select
                name="needsCrewAccommodation"
                value={formData.needsCrewAccommodation}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="no">{t({ it: "Non necessario", en: "Not needed" })}</option>
                <option value="yes">{t({ it: "Sì, necessario", en: "Yes, needed" })}</option>
              </select>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium">{t({ it: "Richiesta NDA (Non Disclosure Agreement)", en: "NDA request (Non Disclosure Agreement)" })}</label>
              <select
                name="needsNDA"
                value={formData.needsNDA}
                onChange={handleChange}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
              >
                <option value="no">{t({ it: "Non necessario", en: "Not needed" })}</option>
                <option value="yes">{t({ it: "Sì, richiesto", en: "Yes, required" })}</option>
              </select>
            </div>
          </div>
        </div>

        {/* General Notes */}
        <div className="bg-zinc-900/50 p-6 rounded-lg border border-zinc-800">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            {t({ it: "Note Aggiuntive", en: "Additional Notes" })}
          </h3>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            rows={4}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-3 py-2 focus:outline-none focus:border-white"
            placeholder={t({ it: "Eventuali altre richieste, dettagli o informazioni...", en: "Any other requests, details or information..." })}
          />
        </div>

        {/* Terms */}
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            name="terms"
            checked={formData.terms}
            onChange={handleChange}
            className="mt-1"
          />
          <p className="text-sm text-zinc-200">
            {t({ it: 'Accetto i termini e le condizioni del servizio e comprendo che questa richiesta è soggetta a disponibilità.', en: 'I accept the terms and conditions of the service and understand that this request is subject to availability.' })}
          </p>
        </div>
        {errors.terms && <p className="text-red-400 text-xs mt-1">{errors.terms}</p>}

        {/* Submit */}
        <button
          type="submit"
          className="w-full bg-white hover:bg-gray-200 text-black font-semibold py-3 transition text-lg"
        >
          {t({ it: "Invia Richiesta via WhatsApp", en: "Send Request via WhatsApp" })}
        </button>

        <p className="text-xs text-center text-zinc-400">
          {t({ it: 'Verrai reindirizzato su WhatsApp con tutti i dettagli precompilati. Ti contatteremo entro 24 ore con un preventivo personalizzato.', en: 'You will be redirected to WhatsApp with all details pre-filled. We will contact you within 24 hours with a personalised quote.' })}
        </p>
      </form>
    </div>
  );
};

export default HelicopterBookingForm;

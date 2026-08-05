import { useState } from 'react'
import CalcolaCFButton from './ui/CalcolaCFButton'
import AddressAutocomplete from './ui/AddressAutocomplete'
import { useTranslation } from '../hooks/useTranslation'

interface CustomerFormData {
  tipoCliente: 'azienda' | 'persona_fisica' | 'pubblica_amministrazione' | ''
  // Azienda fields
  nazione: string
  denominazione: string
  partitaIVA: string
  codiceFiscale: string
  indirizzo: string
  // Persona Fisica fields
  nome: string
  cognome: string
  sesso: string
  dataNascita: string
  luogoNascita: string
  provinciaNascita: string
  telefono: string
  email: string
  pec: string
  // Pubblica Amministrazione fields
  codiceUnivoco: string
  enteUfficio: string
  citta: string
}

interface DynamicCustomerFormProps {
  onSubmit: (data: CustomerFormData) => void
  isAdminMode?: boolean
}

export default function DynamicCustomerForm({ onSubmit, isAdminMode = false }: DynamicCustomerFormProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState<CustomerFormData>({
    tipoCliente: '',
    nazione: 'Italia',
    denominazione: '',
    partitaIVA: '',
    codiceFiscale: '',
    indirizzo: '',
    nome: '',
    cognome: '',
    sesso: '',
    dataNascita: '',
    luogoNascita: '',
    provinciaNascita: '',
    telefono: '',
    email: '',
    pec: '',
    codiceUnivoco: '',
    enteUfficio: '',
    citta: ''
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  // Search/Lookup functions (to be implemented with actual API calls)
  const cercaPerDenominazione = async () => {
    console.log('Searching for:', formData.denominazione)
    // TODO: Implement actual search logic
    alert(t({ it: 'Funzione di ricerca per denominazione - da implementare', en: 'Search by company name - to be implemented' }))
  }

  const cercaPerPartitaIVA = async () => {
    console.log('Searching for Partita IVA:', formData.partitaIVA)
    // TODO: Implement actual search logic
    alert(t({ it: 'Funzione di ricerca per Partita IVA - da implementare', en: 'Search by VAT number - to be implemented' }))
  }

  const cercaPerCodiceUnivoco = async () => {
    console.log('Searching for Codice Univoco:', formData.codiceUnivoco)
    // TODO: Implement actual search logic
    alert(t({ it: 'Funzione di ricerca per Codice Univoco - da implementare', en: 'Search by recipient code - to be implemented' }))
  }

  const cercaPerCodiceFiscale = async () => {
    console.log('Searching for Codice Fiscale:', formData.codiceFiscale)
    // TODO: Implement actual search logic
    alert(t({ it: 'Funzione di ricerca per Codice Fiscale - da implementare', en: 'Search by tax code - to be implemented' }))
  }

  const cercaPerEnteUfficio = async () => {
    console.log('Searching for Ente/Ufficio:', formData.enteUfficio)
    // TODO: Implement actual search logic
    alert(t({ it: 'Funzione di ricerca per Ente o Ufficio - da implementare', en: 'Search by body or office - to be implemented' }))
  }

  const cercaPerCitta = async () => {
    console.log('Searching for Città:', formData.citta)
    // TODO: Implement actual search logic
    alert(t({ it: 'Funzione di ricerca per Città - da implementare', en: 'Search by city - to be implemented' }))
  }

  return (
    <div className="dynamic-customer-form-container">
      <style>{`
        .dynamic-customer-form-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem;
          background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .form-title {
          color: #f4c430;
          font-size: 2rem;
          font-weight: bold;
          margin-bottom: 2rem;
          text-align: center;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }

        .form-group {
          margin-bottom: 1.5rem;
        }

        .form-label {
          display: block;
          color: #fff;
          font-weight: 600;
          margin-bottom: 0.5rem;
          font-size: 0.95rem;
        }

        .form-label.required::after {
          content: ' *';
          color: #ff4444;
        }

        .form-input,
        .form-select {
          width: 100%;
          padding: 0.75rem 1rem;
          background: rgba(255, 255, 255, 0.1);
          border: 2px solid rgba(244, 196, 48, 0.3);
          border-radius: 8px;
          color: #fff;
          font-size: 1rem;
          transition: all 0.3s ease;
        }

        .form-input:focus,
        .form-select:focus {
          outline: none;
          border-color: #f4c430;
          background: rgba(255, 255, 255, 0.15);
          box-shadow: 0 0 0 3px rgba(244, 196, 48, 0.1);
        }

        .form-input::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }

        .input-with-button {
          display: flex;
          gap: 0.75rem;
        }

        .input-with-button .form-input {
          flex: 1;
        }

        .btn-search {
          padding: 0.75rem 1.5rem;
          background: linear-gradient(135deg, #f4c430 0%, #d4a420 100%);
          color: #000;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          white-space: nowrap;
          font-size: 0.9rem;
        }

        .btn-search:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(244, 196, 48, 0.4);
        }

        .btn-search:active {
          transform: translateY(0);
        }

        .btn-submit {
          width: 100%;
          padding: 1rem 2rem;
          background: linear-gradient(135deg, #f4c430 0%, #d4a420 100%);
          color: #000;
          border: none;
          border-radius: 8px;
          font-weight: 700;
          font-size: 1.1rem;
          cursor: pointer;
          transition: all 0.3s ease;
          margin-top: 2rem;
        }

        .btn-submit:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(244, 196, 48, 0.5);
        }

        .btn-submit:active {
          transform: translateY(0);
        }

        .section-divider {
          height: 2px;
          background: linear-gradient(90deg, transparent 0%, #f4c430 50%, transparent 100%);
          margin: 2rem 0;
        }

        .optional-section {
          margin-top: 2rem;
          padding: 1.5rem;
          background: rgba(244, 196, 48, 0.05);
          border: 1px dashed rgba(244, 196, 48, 0.3);
          border-radius: 8px;
        }

        .optional-section-title {
          color: #f4c430;
          font-size: 1.1rem;
          font-weight: 600;
          margin-bottom: 1rem;
        }

        .form-section {
          animation: fadeIn 0.3s ease-in-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 768px) {
          .dynamic-customer-form-container {
            padding: 1.5rem;
          }

          .form-title {
            font-size: 1.5rem;
          }

          .input-with-button {
            flex-direction: column;
          }

          .btn-search {
            width: 100%;
          }
        }

        /* Dark theme adjustments for admin panel */
        ${isAdminMode ? `
          .dynamic-customer-form-container {
            background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
          }
        ` : ''}
      `}</style>

      <h2 className="form-title">
        {isAdminMode ? t({ it: "Crea Nuovo Cliente", en: "Create New Customer" }) : t({ it: "Registrazione Cliente", en: "Customer Registration" })}
      </h2>

      <form onSubmit={handleSubmit}>
        {/* Client Type Selection */}
        <div className="form-group">
          <label className="form-label required" htmlFor="tipoCliente">
            {t({ it: "Tipo Cliente", en: "Customer Type" })}
          </label>
          <select
            id="tipoCliente"
            name="tipoCliente"
            className="form-select"
            value={formData.tipoCliente}
            onChange={handleChange}
            required
          >
            <option value="">{t({ it: "Seleziona tipo cliente...", en: "Select customer type..." })}</option>
            <option value="azienda">{t({ it: "Azienda", en: "Company" })}</option>
            <option value="persona_fisica">{t({ it: "Persona Fisica", en: "Individual" })}</option>
            <option value="pubblica_amministrazione">{t({ it: "Pubblica Amministrazione", en: "Public Administration" })}</option>
          </select>
        </div>

        {/* AZIENDA CONFIGURATION */}
        {formData.tipoCliente === 'azienda' && (
          <div className="form-section">
            <div className="section-divider"></div>

            {/* Nazione */}
            <div className="form-group">
              <label className="form-label required" htmlFor="nazione">
                {t({ it: "Nazione", en: "Country" })}
              </label>
              <input
                type="text"
                id="nazione"
                name="nazione"
                className="form-input"
                value={formData.nazione}
                onChange={handleChange}
                required
              />
            </div>

            {/* Denominazione */}
            <div className="form-group">
              <label className="form-label required" htmlFor="denominazione">
                {t({ it: "Denominazione", en: "Company Name" })}
              </label>
              <div className="input-with-button">
                <input
                  type="text"
                  id="denominazione"
                  name="denominazione"
                  className="form-input"
                  value={formData.denominazione}
                  onChange={handleChange}
                  placeholder={t({ it: "Nome azienda", en: "Company name" })}
                  required
                />
                <button
                  type="button"
                  className="btn-search"
                  onClick={cercaPerDenominazione}
                >
                  {t({ it: "Cerca", en: "Search" })}
                </button>
              </div>
            </div>

            {/* Partita IVA */}
            <div className="form-group">
              <label className="form-label required" htmlFor="partitaIVA">
                {t({ it: "Partita IVA", en: "VAT Number" })}
              </label>
              <div className="input-with-button">
                <input
                  type="text"
                  id="partitaIVA"
                  name="partitaIVA"
                  className="form-input"
                  value={formData.partitaIVA}
                  onChange={handleChange}
                  placeholder="IT12345678901"
                  required
                />
                <button
                  type="button"
                  className="btn-search"
                  onClick={cercaPerPartitaIVA}
                >
                  {t({ it: "Cerca", en: "Search" })}
                </button>
              </div>
            </div>

            {/* Codice Fiscale */}
            <div className="form-group">
              <label className="form-label required" htmlFor="codiceFiscale">
                {t({ it: "Codice Fiscale", en: "Tax Code" })}
              </label>
              <input
                type="text"
                id="codiceFiscale"
                name="codiceFiscale"
                className="form-input"
                value={formData.codiceFiscale}
                onChange={handleChange}
                placeholder="00000000000"
                required
              />
            </div>

            {/* Indirizzo */}
            <div className="form-group">
              <label className="form-label required" htmlFor="indirizzo">
                {t({ it: "Indirizzo", en: "Address" })}
              </label>
              <AddressAutocomplete
                id="indirizzo"
                name="indirizzo"
                className="form-input"
                value={formData.indirizzo}
                onChange={(val) => setFormData(prev => ({ ...prev, indirizzo: val }))}
                placeholder={t({ it: "Via, Numero Civico, CAP, Città", en: "Street, number, postcode, city" })}
                required
              />
            </div>

            {/* Optional Fields Section */}
            <div className="optional-section">
              <h3 className="optional-section-title">{t({ it: "Campi Facoltativi", en: "Optional Fields" })}</h3>
              <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
                {t({ it: "Sezione riservata per campi aggiuntivi futuri", en: "Section reserved for future additional fields" })}
              </p>
            </div>
          </div>
        )}

        {/* PERSONA FISICA CONFIGURATION */}
        {formData.tipoCliente === 'persona_fisica' && (
          <div className="form-section">
            <div className="section-divider"></div>

            {/* Nazione */}
            <div className="form-group">
              <label className="form-label required" htmlFor="nazione">
                {t({ it: "Nazione", en: "Country" })}
              </label>
              <input
                type="text"
                id="nazione"
                name="nazione"
                className="form-input"
                value={formData.nazione}
                onChange={handleChange}
                required
              />
            </div>

            {/* Nome */}
            <div className="form-group">
              <label className="form-label required" htmlFor="nome">
                {t({ it: "Nome", en: "First name" })}
              </label>
              <input
                type="text"
                id="nome"
                name="nome"
                className="form-input"
                value={formData.nome}
                onChange={handleChange}
                placeholder="Mario"
                required
              />
            </div>

            {/* Cognome */}
            <div className="form-group">
              <label className="form-label required" htmlFor="cognome">
                {t({ it: "Cognome", en: "Last name" })}
              </label>
              <input
                type="text"
                id="cognome"
                name="cognome"
                className="form-input"
                value={formData.cognome}
                onChange={handleChange}
                placeholder="Rossi"
                required
              />
            </div>

            {/* Codice Fiscale */}
            <div className="form-group">
              <label className="form-label required" htmlFor="codiceFiscale">
                {t({ it: "Codice Fiscale", en: "Tax Code" })}
              </label>
              <div className="input-with-button">
                <input
                  type="text"
                  id="codiceFiscale"
                  name="codiceFiscale"
                  className="form-input"
                  value={formData.codiceFiscale}
                  onChange={(e) => setFormData(p => ({ ...p, codiceFiscale: e.target.value.toUpperCase() }))}
                  placeholder="RSSMRA80A01H501U"
                  maxLength={16}
                  required
                  style={{ textTransform: 'uppercase' }}
                />
                <CalcolaCFButton
                  className="btn-search"
                  config={{
                    getCognome: () => formData.cognome,
                    getNome: () => formData.nome,
                    getDataNascita: () => formData.dataNascita,
                    getSesso: () => formData.sesso,
                    getLuogoNascita: () => formData.luogoNascita,
                    getCodiceFiscale: () => formData.codiceFiscale,
                    setCodiceFiscale: (v) => setFormData(p => ({ ...p, codiceFiscale: v })),
                    setSesso: (v) => setFormData(p => ({ ...p, sesso: v })),
                    setDataNascita: (v) => setFormData(p => ({ ...p, dataNascita: v })),
                    setLuogoNascita: (v) => setFormData(p => ({ ...p, luogoNascita: v })),
                    setProvinciaNascita: (v) => setFormData(p => ({ ...p, provinciaNascita: v })),
                  }}
                />
              </div>
            </div>

            {/* Sesso */}
            <div className="form-group">
              <label className="form-label" htmlFor="sesso">{t({ it: "Sesso", en: "Gender" })}</label>
              <select id="sesso" name="sesso" className="form-select" value={formData.sesso} onChange={handleChange}>
                <option value="">{t({ it: "Seleziona...", en: "Select..." })}</option>
                <option value="M">{t({ it: "Maschio", en: "Male" })}</option>
                <option value="F">{t({ it: "Femmina", en: "Female" })}</option>
              </select>
            </div>

            {/* Data di Nascita */}
            <div className="form-group">
              <label className="form-label" htmlFor="dataNascita">{t({ it: "Data di Nascita", en: "Date of Birth" })}</label>
              <input type="date" id="dataNascita" name="dataNascita" className="form-input" value={formData.dataNascita} onChange={handleChange} />
            </div>

            {/* Luogo di Nascita */}
            <div className="form-group">
              <label className="form-label" htmlFor="luogoNascita">{t({ it: "Luogo di Nascita", en: "Place of Birth" })}</label>
              <input type="text" id="luogoNascita" name="luogoNascita" className="form-input" value={formData.luogoNascita} onChange={handleChange} placeholder={t({ it: "es. Cagliari", en: "e.g. Cagliari" })} />
            </div>

            {/* Provincia di Nascita */}
            <div className="form-group">
              <label className="form-label" htmlFor="provinciaNascita">{t({ it: "Provincia di Nascita", en: "Province of Birth" })}</label>
              <input type="text" id="provinciaNascita" name="provinciaNascita" className="form-input" value={formData.provinciaNascita} onChange={(e) => setFormData(p => ({ ...p, provinciaNascita: e.target.value.toUpperCase() }))} placeholder={t({ it: "es. CA", en: "e.g. CA" })} maxLength={2} style={{ textTransform: 'uppercase' }} />
            </div>

            {/* Indirizzo */}
            <div className="form-group">
              <label className="form-label required" htmlFor="indirizzo">
                {t({ it: "Indirizzo", en: "Address" })}
              </label>
              <AddressAutocomplete
                id="indirizzo"
                name="indirizzo"
                className="form-input"
                value={formData.indirizzo}
                onChange={(val) => setFormData(prev => ({ ...prev, indirizzo: val }))}
                placeholder={t({ it: "Via, Numero Civico, CAP, Città", en: "Street, number, postcode, city" })}
                required
              />
            </div>

            {/* Optional Fields Section */}
            <div className="optional-section">
              <h3 className="optional-section-title">{t({ it: "Campi Facoltativi", en: "Optional Fields" })}</h3>

              {/* Telefono */}
              <div className="form-group">
                <label className="form-label" htmlFor="telefono">
                  {t({ it: "Telefono", en: "Phone" })}
                </label>
                <input
                  type="tel"
                  id="telefono"
                  name="telefono"
                  className="form-input"
                  value={formData.telefono}
                  onChange={handleChange}
                  placeholder="+39 123 456 7890"
                />
              </div>

              {/* Email */}
              <div className="form-group">
                <label className="form-label" htmlFor="email">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  className="form-input"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder={t({ it: "email@esempio.it", en: "email@example.com" })}
                />
              </div>

              {/* PEC */}
              <div className="form-group">
                <label className="form-label" htmlFor="pec">
                  PEC
                </label>
                <input
                  type="email"
                  id="pec"
                  name="pec"
                  className="form-input"
                  value={formData.pec}
                  onChange={handleChange}
                  placeholder="pec@pec.it"
                />
              </div>
            </div>
          </div>
        )}

        {/* PUBBLICA AMMINISTRAZIONE CONFIGURATION */}
        {formData.tipoCliente === 'pubblica_amministrazione' && (
          <div className="form-section">
            <div className="section-divider"></div>

            {/* Codice Univoco */}
            <div className="form-group">
              <label className="form-label required" htmlFor="codiceUnivoco">
                {t({ it: "Codice Univoco", en: "Recipient Code" })}
              </label>
              <div className="input-with-button">
                <input
                  type="text"
                  id="codiceUnivoco"
                  name="codiceUnivoco"
                  className="form-input"
                  value={formData.codiceUnivoco}
                  onChange={handleChange}
                  placeholder="XXXXXX"
                  required
                />
                <button
                  type="button"
                  className="btn-search"
                  onClick={cercaPerCodiceUnivoco}
                >
                  {t({ it: "Cerca", en: "Search" })}
                </button>
              </div>
            </div>

            {/* Codice Fiscale */}
            <div className="form-group">
              <label className="form-label required" htmlFor="codiceFiscale">
                {t({ it: "Codice Fiscale", en: "Tax Code" })}
              </label>
              <div className="input-with-button">
                <input
                  type="text"
                  id="codiceFiscale"
                  name="codiceFiscale"
                  className="form-input"
                  value={formData.codiceFiscale}
                  onChange={handleChange}
                  placeholder="00000000000"
                  required
                />
                <button
                  type="button"
                  className="btn-search"
                  onClick={cercaPerCodiceFiscale}
                >
                  {t({ it: "Cerca", en: "Search" })}
                </button>
              </div>
            </div>

            {/* Ente o Ufficio */}
            <div className="form-group">
              <label className="form-label required" htmlFor="enteUfficio">
                {t({ it: "Ente o Ufficio", en: "Body or Office" })}
              </label>
              <div className="input-with-button">
                <input
                  type="text"
                  id="enteUfficio"
                  name="enteUfficio"
                  className="form-input"
                  value={formData.enteUfficio}
                  onChange={handleChange}
                  placeholder={t({ it: "Nome dell'ente o ufficio", en: "Name of the body or office" })}
                  required
                />
                <button
                  type="button"
                  className="btn-search"
                  onClick={cercaPerEnteUfficio}
                >
                  {t({ it: "Cerca", en: "Search" })}
                </button>
              </div>
            </div>

            {/* Città */}
            <div className="form-group">
              <label className="form-label required" htmlFor="citta">
                {t({ it: "Città", en: "City" })}
              </label>
              <div className="input-with-button">
                <input
                  type="text"
                  id="citta"
                  name="citta"
                  className="form-input"
                  value={formData.citta}
                  onChange={handleChange}
                  placeholder="Cagliari"
                  required
                />
                <button
                  type="button"
                  className="btn-search"
                  onClick={cercaPerCitta}
                >
                  {t({ it: "Cerca", en: "Search" })}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        {formData.tipoCliente && (
          <button type="submit" className="btn-submit">
            {isAdminMode ? t({ it: "Crea Cliente", en: "Create Customer" }) : t({ it: "Registrati", en: "Sign up" })}
          </button>
        )}
      </form>
    </div>
  )
}

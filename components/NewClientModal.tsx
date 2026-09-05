import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { countries } from '../utils/countries'
import { AppleStyleSelect } from './ui/AppleStyleSelect'
import CalcolaCFButton from './ui/CalcolaCFButton'
import AddressAutocomplete from './ui/AddressAutocomplete'
import { useTranslation } from '../hooks/useTranslation'

interface NewClientModalProps {
  isOpen: boolean
  onClose: () => void
  onClientCreated?: (clientId: string, customerData: any) => void
}

type ClientType = 'persona_fisica' | 'azienda' | 'pubblica_amministrazione'

interface ClientFormData {
  tipo_cliente: ClientType
  // Global fields
  nazione: string
  telefono: string
  email: string

  // Persona Fisica
  nome: string
  cognome: string
  codice_fiscale: string
  indirizzo: string
  cap: string
  citta_residenza: string
  provincia_residenza: string

  sesso: string
  data_nascita: string
  citta_nascita: string
  provincia_nascita: string
  pec_persona: string

  // Azienda
  denominazione: string
  partita_iva: string
  codice_destinatario: string
  indirizzo_azienda: string
  sede_operativa: string
  cf_azienda: string
  indirizzo_ddt: string
  pec_azienda: string
  contatti_cliente: string
  rappresentante_nome: string
  rappresentante_cognome: string
  rappresentante_cf: string
  rappresentante_ruolo: string
  documento_tipo: string
  documento_numero: string
  documento_data_rilascio: string
  documento_luogo_rilascio: string

  // Pubblica Amministrazione
  codice_univoco: string
  cf_pa: string
  ente_ufficio: string
  citta: string
  partita_iva_pa: string
  pec_pa: string
}

export default function NewClientModal({ isOpen, onClose, onClientCreated }: NewClientModalProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState<ClientFormData>({
    tipo_cliente: 'persona_fisica',
    nazione: 'Italia',
    telefono: '',
    email: '',
    nome: '',
    cognome: '',
    codice_fiscale: '',
    indirizzo: '',
    cap: '',
    citta_residenza: '',
    provincia_residenza: '',
    sesso: '',
    data_nascita: '',
    citta_nascita: '',
    provincia_nascita: '',

    pec_persona: '',
    denominazione: '',
    partita_iva: '',
    codice_destinatario: '',
    indirizzo_azienda: '',
    sede_operativa: '',
    cf_azienda: '',
    indirizzo_ddt: '',
    pec_azienda: '',
    contatti_cliente: '',
    rappresentante_nome: '',
    rappresentante_cognome: '',
    rappresentante_cf: '',
    rappresentante_ruolo: '',
    documento_tipo: '',
    documento_numero: '',
    documento_data_rilascio: '',
    documento_luogo_rilascio: '',
    codice_univoco: '',
    cf_pa: '',
    ente_ufficio: '',
    citta: '',
    partita_iva_pa: '',
    pec_pa: ''
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)

  // Validation functions
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const validateItalianPhone = (phone: string): boolean => {
    // Italian phone: +39 or 0039 or direct, 9-13 digits
    const phoneRegex = /^(\+39|0039)?[\s]?[0-9]{9,13}$/
    return phoneRegex.test(phone.replace(/\s/g, ''))
  }

  const validateCodiceFiscale = (cf: string): boolean => {
    // Italian CF: 16 alphanumeric characters
    const cfRegex = /^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$/i
    return cf.length === 16 && cfRegex.test(cf.toUpperCase())
  }

  const validatePartitaIVA = (piva: string): boolean => {
    // Italian P.IVA: 11 digits
    const pivaRegex = /^[0-9]{11}$/
    return pivaRegex.test(piva)
  }

  const validateCodiceUnivoco = (codice: string): boolean => {
    // Codice Univoco: 6-7 alphanumeric characters
    return codice.length >= 6 && codice.length <= 7 && /^[A-Z0-9]+$/i.test(codice)
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    // Global validations
    if (!formData.email) {
      newErrors.email = t({ it: "Email obbligatoria", en: "Email is required" })
    } else if (!validateEmail(formData.email)) {
      newErrors.email = t({ it: "Formato email non valido", en: "Invalid email format" })
    }

    if (!formData.telefono) {
      newErrors.telefono = t({ it: "Telefono obbligatorio", en: "Phone number is required" })
    } else if (!validateItalianPhone(formData.telefono)) {
      newErrors.telefono = t({ it: "Formato telefono non valido", en: "Invalid phone format" })
    }

    if (!formData.nazione) {
      newErrors.nazione = t({ it: "Nazione obbligatoria", en: "Country is required" })
    }

    // Type-specific validations
    if (formData.tipo_cliente === 'persona_fisica') {
      // Personal info
      if (!formData.nome) newErrors.nome = t({ it: "Nome obbligatorio", en: "First name is required" })
      if (!formData.cognome) newErrors.cognome = t({ it: "Cognome obbligatorio", en: "Last name is required" })

      // Codice Fiscale is mandatory only for Italian clients
      if (formData.nazione === 'Italia') {
        if (!formData.codice_fiscale) {
          newErrors.codice_fiscale = t({ it: "Codice Fiscale obbligatorio per clienti italiani", en: "Tax code is required for Italian customers" })
        } else if (!validateCodiceFiscale(formData.codice_fiscale)) {
          newErrors.codice_fiscale = t({ it: "Codice Fiscale non valido (16 caratteri)", en: "Invalid tax code (16 characters)" })
        }
      } else if (formData.codice_fiscale && !validateCodiceFiscale(formData.codice_fiscale)) {
        // Optional validation if CF is provided for non-Italian clients
        newErrors.codice_fiscale = t({ it: "Codice Fiscale non valido (16 caratteri)", en: "Invalid tax code (16 characters)" })
      }

      // Address
      if (!formData.indirizzo) newErrors.indirizzo = t({ it: "Indirizzo obbligatorio", en: "Address is required" })
      if (!formData.cap) newErrors.cap = t({ it: "CAP obbligatorio", en: "Postcode is required" })
      if (!formData.citta_residenza) newErrors.citta_residenza = t({ it: "Città obbligatoria", en: "City is required" })
      if (!formData.provincia_residenza) newErrors.provincia_residenza = t({ it: "Provincia obbligatoria", en: "Province is required" })

      // Personal details
      if (!formData.sesso) newErrors.sesso = t({ it: "Sesso obbligatorio", en: "Gender is required" })
      if (!formData.data_nascita) newErrors.data_nascita = t({ it: "Data di nascita obbligatoria", en: "Date of birth is required" })
      if (!formData.citta_nascita) newErrors.citta_nascita = t({ it: "Città di nascita obbligatoria", en: "Place of birth is required" })
      if (!formData.provincia_nascita) newErrors.provincia_nascita = t({ it: "Provincia di nascita obbligatoria", en: "Province of birth is required" })
    }

    if (formData.tipo_cliente === 'azienda') {
      if (!formData.denominazione) newErrors.denominazione = t({ it: "Denominazione obbligatoria", en: "Company name is required" })
      if (!formData.partita_iva) {
        newErrors.partita_iva = t({ it: "Partita IVA obbligatoria", en: "VAT number is required" })
      } else if (!validatePartitaIVA(formData.partita_iva)) {
        newErrors.partita_iva = t({ it: "Partita IVA non valida (11 cifre)", en: "Invalid VAT number (11 digits)" })
      }
      if (!formData.indirizzo_azienda) newErrors.indirizzo_azienda = t({ it: "Indirizzo obbligatorio", en: "Address is required" })

      // Optional CF validation if provided
      if (formData.cf_azienda && !validateCodiceFiscale(formData.cf_azienda)) {
        newErrors.cf_azienda = t({ it: "Codice Fiscale non valido (16 caratteri)", en: "Invalid tax code (16 characters)" })
      }
    }

    if (formData.tipo_cliente === 'pubblica_amministrazione') {
      if (!formData.codice_univoco) {
        newErrors.codice_univoco = t({ it: "Codice Univoco obbligatorio", en: "Recipient code is required" })
      } else if (!validateCodiceUnivoco(formData.codice_univoco)) {
        newErrors.codice_univoco = t({ it: "Codice Univoco non valido (6-7 caratteri)", en: "Invalid recipient code (6-7 characters)" })
      }
      if (!formData.cf_pa) {
        newErrors.cf_pa = t({ it: "Codice Fiscale obbligatorio", en: "Tax code is required" })
      } else if (!validateCodiceFiscale(formData.cf_pa)) {
        newErrors.cf_pa = t({ it: "Codice Fiscale non valido (16 caratteri)", en: "Invalid tax code (16 characters)" })
      }
      if (!formData.ente_ufficio) newErrors.ente_ufficio = t({ it: "Ente o Ufficio obbligatorio", en: "Body or office is required" })
      if (!formData.citta) newErrors.citta = t({ it: "Città obbligatoria", en: "City is required" })
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!validateForm()) return

    setIsSaving(true)
    try {
      const customerData: any = {
        tipo_cliente: formData.tipo_cliente,
        email: formData.email,
        telefono: formData.telefono,
        nazione: formData.nazione,
        source: 'website',
        created_at: new Date().toISOString()
      }

      // Add type-specific fields
      if (formData.tipo_cliente === 'persona_fisica') {
        customerData.nome = formData.nome
        customerData.cognome = formData.cognome
        customerData.codice_fiscale = formData.codice_fiscale.toUpperCase()
        customerData.indirizzo = formData.indirizzo
        customerData.cap = formData.cap
        customerData.citta = formData.citta_residenza
        customerData.provincia = formData.provincia_residenza.toUpperCase()
        customerData.sesso = formData.sesso
        customerData.data_nascita = formData.data_nascita
        customerData.citta_nascita = formData.citta_nascita
        customerData.provincia_nascita = formData.provincia_nascita.toUpperCase()
        if (formData.pec_persona) customerData.pec = formData.pec_persona
      } else if (formData.tipo_cliente === 'azienda') {
        customerData.denominazione = formData.denominazione
        customerData.ragione_sociale = formData.denominazione
        customerData.partita_iva = formData.partita_iva
        customerData.sede_legale = formData.indirizzo_azienda
        customerData.indirizzo = formData.indirizzo_azienda
        if (formData.sede_operativa) customerData.sede_operativa = formData.sede_operativa
        if (formData.codice_destinatario) customerData.codice_destinatario = formData.codice_destinatario
        if (formData.cf_azienda) customerData.codice_fiscale = formData.cf_azienda.toUpperCase()
        if (formData.pec_azienda) customerData.pec = formData.pec_azienda

        // Legal representative info
        if (formData.rappresentante_nome) customerData.rappresentante_nome = formData.rappresentante_nome
        if (formData.rappresentante_cognome) customerData.rappresentante_cognome = formData.rappresentante_cognome
        if (formData.rappresentante_cf) customerData.rappresentante_cf = formData.rappresentante_cf.toUpperCase()
        if (formData.rappresentante_ruolo) customerData.rappresentante_ruolo = formData.rappresentante_ruolo

        // Document info and other details in metadata
        customerData.metadata = {
          indirizzo_ddt: formData.indirizzo_ddt || '',
          contatti_cliente: formData.contatti_cliente || '',
          documento_tipo: formData.documento_tipo || '',
          documento_numero: formData.documento_numero || '',
          documento_data_rilascio: formData.documento_data_rilascio || '',
          documento_luogo_rilascio: formData.documento_luogo_rilascio || ''
        }
      } else if (formData.tipo_cliente === 'pubblica_amministrazione') {
        customerData.denominazione = formData.ente_ufficio
        customerData.codice_univoco = formData.codice_univoco.toUpperCase()
        customerData.codice_fiscale = formData.cf_pa.toUpperCase()
        customerData.indirizzo = formData.citta
        if (formData.partita_iva_pa) customerData.partita_iva = formData.partita_iva_pa
        if (formData.pec_pa) customerData.pec = formData.pec_pa
      }

      let clientCreatedId: string | null = null;

      try {
        const { data: newClient, error } = await supabase
          .from('customers_extended')
          .insert([customerData])
          .select()
          .single()

        if (error) {
          console.warn('Supabase save failed (will proceed anyway):', error)
          // Don't throw - proceed to payment even if Supabase fails
          // Data will be collected via payment form
        } else if (newClient) {
          clientCreatedId = newClient.id;
          console.log('Customer saved successfully:', clientCreatedId)
        }
      } catch (dbError: any) {
        console.warn('Database error (proceeding anyway):', dbError)
        // Continue to payment even if database save fails
      }

      // Always proceed to payment, regardless of database save result
      // Pass both clientId and the complete customerData
      if (onClientCreated) {
        onClientCreated(clientCreatedId || 'temp-id', customerData)
      }

      handleClose()
    } catch (error: any) {
      console.error('Form validation error:', error)

      // Only show error if it's a validation error, not a network error
      if (!error.message?.includes('database') && !error.message?.includes('Connessione')) {
        alert(`${t({ it: 'Errore:', en: 'Error:' })} ${error.message || t({ it: 'Errore sconosciuto', en: 'Unknown error' })}`)
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleClose = () => {
    setFormData({
      tipo_cliente: 'persona_fisica',
      nazione: 'Italia',
      telefono: '',
      email: '',
      nome: '',
      cognome: '',
      codice_fiscale: '',
      indirizzo: '',
      cap: '',
      citta_residenza: '',
      provincia_residenza: '',
      sesso: '',
      data_nascita: '',
      citta_nascita: '',
      provincia_nascita: '',

      pec_persona: '',
      denominazione: '',
      partita_iva: '',
      codice_destinatario: '',
      indirizzo_azienda: '',
      sede_operativa: '',
      cf_azienda: '',
      indirizzo_ddt: '',
      pec_azienda: '',
      contatti_cliente: '',
      rappresentante_nome: '',
      rappresentante_cognome: '',
      rappresentante_cf: '',
      rappresentante_ruolo: '',
      documento_tipo: '',
      documento_numero: '',
      documento_data_rilascio: '',
      documento_luogo_rilascio: '',
      codice_univoco: '',
      cf_pa: '',
      ente_ufficio: '',
      citta: '',
      partita_iva_pa: '',
      pec_pa: ''
    })
    setErrors({})
    onClose()
  }

  const isSaveDisabled = () => {
    // Check global fields
    if (!formData.email || !formData.telefono || !formData.nazione) return true
    if (!validateEmail(formData.email) || !validateItalianPhone(formData.telefono)) return true

    // Check type-specific fields
    if (formData.tipo_cliente === 'persona_fisica') {
      return !formData.nome || !formData.cognome || !formData.codice_fiscale || !formData.indirizzo
    }
    if (formData.tipo_cliente === 'azienda') {
      return !formData.denominazione || !formData.partita_iva || !formData.indirizzo_azienda
    }
    if (formData.tipo_cliente === 'pubblica_amministrazione') {
      return !formData.codice_univoco || !formData.cf_pa || !formData.ente_ufficio || !formData.citta
    }

    return false
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[110] p-4 overflow-y-auto">
      <div className="bg-black border-2 border-white/30 rounded-xl max-w-2xl w-full my-8 shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-white/20">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-white">{t({ it: "Modulo Cliente - Dati Completi", en: "Customer Form - Full Details" })}</h2>
            <button
              onClick={handleClose}
              className="text-white/70 hover:text-white transition-colors text-3xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Client Type Selection */}
          <div>
            <label className="block text-sm font-semibold text-white mb-3">
              {t({ it: "Tipo Cliente *", en: "Customer Type *" })}
            </label>
            <div className="flex gap-4">
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="tipo_cliente"
                  value="persona_fisica"
                  checked={formData.tipo_cliente === 'persona_fisica'}
                  onChange={(e) => setFormData({ ...formData, tipo_cliente: e.target.value as ClientType })}
                  className="mr-2 w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-white">{t({ it: "Persona Fisica", en: "Individual" })}</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="tipo_cliente"
                  value="azienda"
                  checked={formData.tipo_cliente === 'azienda'}
                  onChange={(e) => setFormData({ ...formData, tipo_cliente: e.target.value as ClientType })}
                  className="mr-2 w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-white">{t({ it: "Azienda", en: "Company" })}</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="tipo_cliente"
                  value="pubblica_amministrazione"
                  checked={formData.tipo_cliente === 'pubblica_amministrazione'}
                  onChange={(e) => setFormData({ ...formData, tipo_cliente: e.target.value as ClientType })}
                  className="mr-2 w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-white">{t({ it: "Pubblica Amministrazione", en: "Public Administration" })}</span>
              </label>
            </div>
          </div>

          {/* PERSONA FISICA FIELDS */}
          {formData.tipo_cliente === 'persona_fisica' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-1">
                    {t({ it: "Nome *", en: "First name *" })}
                  </label>
                  <input
                    type="text"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                  />
                  {errors.nome && <p className="text-red-500 text-xs mt-1">{errors.nome}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1">
                    {t({ it: "Cognome *", en: "Last name *" })}
                  </label>
                  <input
                    type="text"
                    value={formData.cognome}
                    onChange={(e) => setFormData({ ...formData, cognome: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                  />
                  {errors.cognome && <p className="text-red-500 text-xs mt-1">{errors.cognome}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  {t({ it: 'Codice Fiscale', en: 'Tax Code' })} {formData.nazione === 'Italia' ? '*' : t({ it: '(opzionale)', en: '(optional)' })}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.codice_fiscale}
                    onChange={(e) => setFormData({ ...formData, codice_fiscale: e.target.value.toUpperCase() })}
                    maxLength={16}
                    className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white uppercase text-white"
                    placeholder="RSSMRA80A01H501U"
                  />
                  <CalcolaCFButton
                    className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium whitespace-nowrap transition-colors"
                    config={{
                      getCognome: () => formData.cognome,
                      getNome: () => formData.nome,
                      getDataNascita: () => formData.data_nascita,
                      getSesso: () => formData.sesso,
                      getLuogoNascita: () => formData.citta_nascita,
                      getCodiceFiscale: () => formData.codice_fiscale,
                      setCodiceFiscale: (v) => setFormData(p => ({ ...p, codice_fiscale: v })),
                      setSesso: (v) => setFormData(p => ({ ...p, sesso: v })),
                      setDataNascita: (v) => setFormData(p => ({ ...p, data_nascita: v })),
                      setLuogoNascita: (v) => setFormData(p => ({ ...p, citta_nascita: v })),
                      setProvinciaNascita: (v) => setFormData(p => ({ ...p, provincia_nascita: v })),
                    }}
                  />
                </div>
                {errors.codice_fiscale && <p className="text-red-500 text-xs mt-1">{errors.codice_fiscale}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  {t({ it: "Indirizzo di Residenza *", en: "Residential Address *" })}
                </label>
                <AddressAutocomplete
                  value={formData.indirizzo}
                  onChange={(val) => setFormData({ ...formData, indirizzo: val })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                  placeholder={t({ it: "Via Roma, 10, 09100 Cagliari", en: "Via Roma 10, 09100 Cagliari" })}
                />
                {errors.indirizzo && <p className="text-red-500 text-xs mt-1">{errors.indirizzo}</p>}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-white mb-1">
                    {t({ it: "Città di Residenza *", en: "City of Residence *" })}
                  </label>
                  <input
                    type="text"
                    value={formData.citta_residenza}
                    onChange={(e) => setFormData({ ...formData, citta_residenza: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                    placeholder="Milano"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1">
                    {t({ it: "CAP *", en: "Postcode *" })}
                  </label>
                  <input
                    type="text"
                    value={formData.cap}
                    onChange={(e) => setFormData({ ...formData, cap: e.target.value })}
                    maxLength={5}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                    placeholder="20100"
                  />
                  {errors.cap && <p className="text-red-500 text-xs mt-1">{errors.cap}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  {t({ it: "Provincia di Residenza *", en: "Province of Residence *" })}
                </label>
                <input
                  type="text"
                  value={formData.provincia_residenza}
                  onChange={(e) => setFormData({ ...formData, provincia_residenza: e.target.value.toUpperCase() })}
                  maxLength={2}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white uppercase text-white"
                  placeholder="MI"
                />
                {errors.provincia_residenza && <p className="text-red-500 text-xs mt-1">{errors.provincia_residenza}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <AppleStyleSelect
                  label={t({ it: "Sesso", en: "Gender" })}
                  value={formData.sesso === 'M' ? 'Maschio' : formData.sesso === 'F' ? 'Femmina' : ''}
                  onChange={(e) => {
                    const displayValue = e.target.value;
                    const dbValue = displayValue === 'Maschio' ? 'M' : displayValue === 'Femmina' ? 'F' : '';
                    setFormData({ ...formData, sesso: dbValue });
                  }}
                  options={['Maschio', 'Femmina']}
                  error={errors.sesso}
                />
                <div>
                  <label className="block text-sm font-medium text-white mb-1">
                    {t({ it: "Data di Nascita *", en: "Date of Birth *" })}
                  </label>
                  <input
                    type="date"
                    value={formData.data_nascita}
                    onChange={(e) => setFormData({ ...formData, data_nascita: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                  />
                  {errors.data_nascita && <p className="text-red-500 text-xs mt-1">{errors.data_nascita}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-1">
                    {t({ it: "Città di Nascita *", en: "Place of Birth *" })}
                  </label>
                  <input
                    type="text"
                    value={formData.citta_nascita}
                    onChange={(e) => setFormData({ ...formData, citta_nascita: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                    placeholder="Roma"
                  />
                  {errors.citta_nascita && <p className="text-red-500 text-xs mt-1">{errors.citta_nascita}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1">
                    {t({ it: "Provincia di Nascita *", en: "Province of Birth *" })}
                  </label>
                  <input
                    type="text"
                    value={formData.provincia_nascita}
                    onChange={(e) => setFormData({ ...formData, provincia_nascita: e.target.value.toUpperCase() })}
                    maxLength={2}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white uppercase text-white"
                    placeholder="RM"
                  />
                  {errors.provincia_nascita && <p className="text-red-500 text-xs mt-1">{errors.provincia_nascita}</p>}
                </div>
              </div>



              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  {t({ it: "PEC", en: "PEC (certified email)" })}
                </label>
                <input
                  type="email"
                  value={formData.pec_persona}
                  onChange={(e) => setFormData({ ...formData, pec_persona: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                />
              </div>
            </div>
          )}

          {/* AZIENDA FIELDS */}
          {formData.tipo_cliente === 'azienda' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  {t({ it: "Denominazione (Ragione Sociale) *", en: "Company Name *" })}
                </label>
                <input
                  type="text"
                  value={formData.denominazione}
                  onChange={(e) => setFormData({ ...formData, denominazione: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                />
                {errors.denominazione && <p className="text-red-500 text-xs mt-1">{errors.denominazione}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-1">
                    {t({ it: "Partita IVA *", en: "VAT Number *" })}
                  </label>
                  <input
                    type="text"
                    value={formData.partita_iva}
                    onChange={(e) => setFormData({ ...formData, partita_iva: e.target.value })}
                    maxLength={11}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                    placeholder="12345678901"
                  />
                  {errors.partita_iva && <p className="text-red-500 text-xs mt-1">{errors.partita_iva}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1">
                    {t({ it: "Codice Fiscale", en: "Tax Code" })}
                  </label>
                  <input
                    type="text"
                    value={formData.cf_azienda}
                    onChange={(e) => setFormData({ ...formData, cf_azienda: e.target.value.toUpperCase() })}
                    maxLength={16}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white uppercase text-white"
                  />
                  {errors.cf_azienda && <p className="text-red-500 text-xs mt-1">{errors.cf_azienda}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  {t({ it: "Codice Destinatario / SDI", en: "Recipient Code / SDI" })}
                </label>
                <input
                  type="text"
                  value={formData.codice_destinatario}
                  onChange={(e) => setFormData({ ...formData, codice_destinatario: e.target.value.toUpperCase() })}
                  maxLength={7}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white uppercase text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  {t({ it: "Sede Legale *", en: "Registered Office *" })}
                </label>
                <AddressAutocomplete
                  value={formData.indirizzo_azienda}
                  onChange={(val) => setFormData({ ...formData, indirizzo_azienda: val })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                  placeholder={t({ it: "Via Roma, 10 - 20100 Milano (MI)", en: "Via Roma 10 - 20100 Milano (MI)" })}
                />
                {errors.indirizzo_azienda && <p className="text-red-500 text-xs mt-1">{errors.indirizzo_azienda}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  {t({ it: "Sede Operativa (se diversa)", en: "Operating Office (if different)" })}
                </label>
                <AddressAutocomplete
                  value={formData.sede_operativa}
                  onChange={(val) => setFormData({ ...formData, sede_operativa: val })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                  placeholder={t({ it: "Via Torino, 20 - 20100 Milano (MI)", en: "Via Torino 20 - 20100 Milano (MI)" })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  {t({ it: "PEC per Fatturazione Elettronica *", en: "PEC for Electronic Invoicing *" })}
                </label>
                <input
                  type="email"
                  value={formData.pec_azienda}
                  onChange={(e) => setFormData({ ...formData, pec_azienda: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                  placeholder={t({ it: "fatture@pec.azienda.it", en: "invoices@pec.company.it" })}
                />
              </div>

              {/* Legal Representative Section */}
              <div className="pt-4 border-t border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-3">{t({ it: "Rappresentante Legale", en: "Legal Representative" })}</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-1">
                      {t({ it: "Nome *", en: "First name *" })}
                    </label>
                    <input
                      type="text"
                      value={formData.rappresentante_nome}
                      onChange={(e) => setFormData({ ...formData, rappresentante_nome: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                      placeholder="Mario"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-1">
                      {t({ it: "Cognome *", en: "Last name *" })}
                    </label>
                    <input
                      type="text"
                      value={formData.rappresentante_cognome}
                      onChange={(e) => setFormData({ ...formData, rappresentante_cognome: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                      placeholder="Rossi"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-1">
                      {t({ it: "Codice Fiscale *", en: "Tax Code *" })}
                    </label>
                    <input
                      type="text"
                      value={formData.rappresentante_cf}
                      onChange={(e) => setFormData({ ...formData, rappresentante_cf: e.target.value.toUpperCase() })}
                      maxLength={16}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white uppercase text-white"
                      placeholder="RSSMRA80A01H501U"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-1">
                      {t({ it: "Ruolo in Azienda *", en: "Role in the Company *" })}
                    </label>
                    <input
                      type="text"
                      value={formData.rappresentante_ruolo}
                      onChange={(e) => setFormData({ ...formData, rappresentante_ruolo: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                      placeholder={t({ it: "Amministratore Unico", en: "Sole Director" })}
                    />
                  </div>
                </div>
              </div>

              {/* Document Section */}
              <div className="pt-4 border-t border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-3">{t({ it: "Documento d'Identità del Rappresentante", en: "Representative's ID Document" })}</h3>
                <div className="grid grid-cols-2 gap-4">
                  <AppleStyleSelect
                    label={t({ it: "Tipo Documento", en: "Document Type" })}
                    value={formData.documento_tipo}
                    onChange={(e) => setFormData({ ...formData, documento_tipo: e.target.value })}
                    options={["Carta d'Identità", "Passaporto", "Patente"]}
                  />
                  <div>
                    <label className="block text-sm font-medium text-white mb-1">
                      {t({ it: "Numero Documento *", en: "Document Number *" })}
                    </label>
                    <input
                      type="text"
                      value={formData.documento_numero}
                      onChange={(e) => setFormData({ ...formData, documento_numero: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white uppercase text-white"
                      placeholder="AB1234567"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-1">
                      {t({ it: "Data Rilascio *", en: "Issue Date *" })}
                    </label>
                    <input
                      type="date"
                      value={formData.documento_data_rilascio}
                      onChange={(e) => setFormData({ ...formData, documento_data_rilascio: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-1">
                      {t({ it: "Luogo Rilascio *", en: "Place of Issue *" })}
                    </label>
                    <input
                      type="text"
                      value={formData.documento_luogo_rilascio}
                      onChange={(e) => setFormData({ ...formData, documento_luogo_rilascio: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                      placeholder={t({ it: "Comune di Milano", en: "Municipality of Milan" })}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  {t({ it: "Indirizzo per DDT", en: "Delivery-note Address" })}
                </label>
                <AddressAutocomplete
                  value={formData.indirizzo_ddt}
                  onChange={(val) => setFormData({ ...formData, indirizzo_ddt: val })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                  placeholder={t({ it: "Indirizzo DDT", en: "Delivery-note address" })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  {t({ it: "Contatti Cliente", en: "Customer Contacts" })}
                </label>
                <textarea
                  value={formData.contatti_cliente}
                  onChange={(e) => setFormData({ ...formData, contatti_cliente: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                />
              </div>
            </div>
          )}

          {/* PUBBLICA AMMINISTRAZIONE FIELDS */}
          {formData.tipo_cliente === 'pubblica_amministrazione' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  {t({ it: "Ente o Ufficio *", en: "Body or Office *" })}
                </label>
                <input
                  type="text"
                  value={formData.ente_ufficio}
                  onChange={(e) => setFormData({ ...formData, ente_ufficio: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                  placeholder={t({ it: "Es: Comune di Roma", en: "e.g. Municipality of Rome" })}
                />
                {errors.ente_ufficio && <p className="text-red-500 text-xs mt-1">{errors.ente_ufficio}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-1">
                    {t({ it: "Codice Univoco *", en: "Recipient Code *" })}
                  </label>
                  <input
                    type="text"
                    value={formData.codice_univoco}
                    onChange={(e) => setFormData({ ...formData, codice_univoco: e.target.value.toUpperCase() })}
                    maxLength={7}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white uppercase text-white"
                    placeholder="ABC1234"
                  />
                  {errors.codice_univoco && <p className="text-red-500 text-xs mt-1">{errors.codice_univoco}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1">
                    {t({ it: "Codice Fiscale *", en: "Tax Code *" })}
                  </label>
                  <input
                    type="text"
                    value={formData.cf_pa}
                    onChange={(e) => setFormData({ ...formData, cf_pa: e.target.value.toUpperCase() })}
                    maxLength={16}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white uppercase text-white"
                  />
                  {errors.cf_pa && <p className="text-red-500 text-xs mt-1">{errors.cf_pa}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  {t({ it: "Città *", en: "City *" })}
                </label>
                <input
                  type="text"
                  value={formData.citta}
                  onChange={(e) => setFormData({ ...formData, citta: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                />
                {errors.citta && <p className="text-red-500 text-xs mt-1">{errors.citta}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  {t({ it: "Partita IVA", en: "VAT Number" })}
                </label>
                <input
                  type="text"
                  value={formData.partita_iva_pa}
                  onChange={(e) => setFormData({ ...formData, partita_iva_pa: e.target.value })}
                  maxLength={11}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  {t({ it: "PEC", en: "PEC (certified email)" })}
                </label>
                <input
                  type="email"
                  value={formData.pec_pa}
                  onChange={(e) => setFormData({ ...formData, pec_pa: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                />
              </div>
            </div>
          )}

          {/* GLOBAL FIELDS - Always visible */}
          <div className="space-y-4 pt-4 border-t border-white/20">
            <h3 className="font-semibold text-white">{t({ it: "Informazioni di Contatto", en: "Contact Information" })}</h3>

            <div>
              <AppleStyleSelect
                label={t({ it: "Paese", en: "Country" })}
                value={formData.nazione}
                onChange={(e) => setFormData({ ...formData, nazione: e.target.value })}
                options={countries}
                className="text-black"
                error={errors.nazione}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  {t({ it: "Telefono *", en: "Phone *" })}
                </label>
                <input
                  type="tel"
                  value={formData.telefono}
                  onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                  placeholder="+39 320 1234567"
                />
                {errors.telefono && <p className="text-red-500 text-xs mt-1">{errors.telefono}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1">
                  {t({ it: "Email *", en: "Email *" })}
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-white focus:border-white text-white"
                  placeholder="cliente@example.com"
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/20 bg-black rounded-b-xl">
          <div className="flex justify-end gap-3">
            <button
              onClick={handleClose}
              className="px-6 py-2 border border-white/30 text-white hover:bg-white/10 transition-colors font-medium"
            >
              {t({ it: "Annulla", en: "Cancel" })}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaveDisabled() || isSaving}
              className={`px-6 py-2 font-medium transition-colors ${isSaveDisabled() || isSaving
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-white text-black hover:bg-gray-200'
                }`}
            >
              {isSaving ? t({ it: "Salvataggio...", en: "Saving..." }) : t({ it: "Salva", en: "Save" })}
            </button>
          </div>
        </div>
      </div>
    </div >
  )
}

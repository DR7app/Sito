import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../supabaseClient';
import DocumentUploadModal from '../components/ui/DocumentUploadModal';
import MarketingConsentModal from '../components/ui/MarketingConsentModal';
import { countries } from '../utils/countries';
import { AppleStyleSelect } from '../components/ui/AppleStyleSelect';
import CalcolaCFButton from '../components/ui/CalcolaCFButton';
import PhoneInput from '../components/ui/PhoneInput';
import { getSignUpCopy, type SignUpCopy } from '../utils/siteCopy';

const PasswordStrengthMeter: React.FC<{ password?: string }> = ({ password = '' }) => {
  const { t } = useTranslation();
  const getStrength = () => {
    let score = 0;
    if (password.length > 7) score++;
    if (password.match(/[a-z]/)) score++;
    if (password.match(/[A-Z]/)) score++;
    if (password.match(/[0-9]/)) score++;
    if (password.match(/[^a-zA-Z0-9]/)) score++;
    return score;
  };

  const strength = getStrength();
  const strengthText = [t('Password_is_too_weak'), t('Password_Strength_Weak'), t('Password_Strength_Medium'), t('Password_Strength_Good'), t('Password_Strength_Strong')];
  const strengthColor = ['bg-red-500', 'bg-red-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'];

  return (
    <div className="flex items-center mt-2">
      <div className="w-full bg-gray-700 rounded-full h-2 mr-3">
        <div className={`h-2 rounded-full ${strengthColor[strength]}`} style={{ width: `${(strength / 5) * 100}%` }}></div>
      </div>
      <span className="text-xs text-gray-400">{strengthText[strength]}</span>
    </div>
  );
};

const SignUpPage: React.FC = () => {
  const { t, lang } = useTranslation();
  const { signup, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [copy, setCopy] = useState<SignUpCopy | null>(null);
  useEffect(() => {
    let cancelled = false;
    getSignUpCopy().then(c => { if (!cancelled) setCopy(c); });
    return () => { cancelled = true; };
  }, []);
  const s = <K extends keyof SignUpCopy>(it: K, en: K): string =>
    copy ? (copy[lang === 'it' ? it : en] as string) : '';

  const [referralCode, setReferralCode] = useState<string>('');

  useEffect(() => {
    const fromUrl = searchParams.get('ref');
    if (fromUrl) {
      const clean = fromUrl.trim().toUpperCase();
      try { localStorage.setItem('dr7_referral_code', clean); } catch {}
      setReferralCode(clean);
    } else {
      try {
        const stored = localStorage.getItem('dr7_referral_code');
        if (stored) setReferralCode(stored);
      } catch {}
    }
  }, [searchParams]);

  const [tipoCliente, setTipoCliente] = useState<'azienda' | 'persona_fisica' | 'pubblica_amministrazione' | ''>('persona_fisica');
  const [formData, setFormData] = useState({
    // Common fields
    nazione: 'Italia',
    codiceFiscale: '',
    indirizzo: '',
    // Azienda fields
    denominazione: '',
    partitaIVA: '',
    sedeOperativa: '',
    codiceSDI: '',
    rappresentanteNome: '',
    rappresentanteCognome: '',
    rappresentanteCF: '',
    rappresentanteRuolo: '',
    documentoTipo: '',
    documentoNumero: '',
    documentoDataRilascio: '',
    documentoLuogoRilascio: '',
    // Persona Fisica fields
    nome: '',
    cognome: '',
    telefono: '',
    email: '',
    pec: '',
    sesso: '',
    dataNascita: '',
    cittaNascita: '',
    provinciaNascita: '',
    luogoNascita: '', // keeping for backward compat if needed, but cittaNascita is preferred
    numeroCivico: '',
    codicePostale: '',
    cittaResidenza: '',
    provinciaResidenza: '',

    // Pubblica Amministrazione fields
    codiceUnivoco: '',
    enteUfficio: '',
    citta: '',
    // Authentication fields
    password: '',
    confirmPassword: ''
  });

  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState('');
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [showMarketingModal, setShowMarketingModal] = useState(false);
  const [newUserId, setNewUserId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      navigate(user.role === 'business' ? '/partner/dashboard' : '/account');
    }
  }, [user, navigate]);

  const validateCodiceFiscale = (cf: string): boolean => {
    const cfRegex = /^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$/i;
    return cf.length === 16 && cfRegex.test(cf.toUpperCase());
  };

  const validatePhone = (phone: string): boolean => {
    const clean = phone.replace(/[\s\-\(\)]/g, '');
    // Accept any international number: + followed by 6-15 digits
    return /^\+?[0-9]{6,15}$/.test(clean);
  };

  const validatePartitaIVA = (piva: string): boolean => {
    const pivaRegex = /^[0-9]{11}$/;
    return pivaRegex.test(piva);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let newValue = value;

    // Auto-uppercase for specific fields
    if (name === 'codiceFiscale' || name === 'provinciaResidenza') {
      newValue = value.toUpperCase();
    }

    setFormData(prev => ({ ...prev, [name]: newValue }));
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    // Validate based on client type
    if (!tipoCliente) {
      newErrors.tipoCliente = s('err_select_client_type_it', 'err_select_client_type_en');
    } else {
      // Common validations
      if (!formData.nazione) newErrors.nazione = s('err_country_required_it', 'err_country_required_en');
      if (!formData.email) {
        newErrors.email = s('err_email_required_it', 'err_email_required_en');
      } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
        newErrors.email = t('Please_enter_a_valid_email_address');
      }

      // Azienda specific
      if (tipoCliente === 'azienda') {
        if (!formData.denominazione) newErrors.denominazione = s('err_denominazione_required_it', 'err_denominazione_required_en');
        if (!formData.partitaIVA) {
          newErrors.partitaIVA = s('err_piva_required_it', 'err_piva_required_en');
        } else if (!validatePartitaIVA(formData.partitaIVA)) {
          newErrors.partitaIVA = s('err_piva_invalid_it', 'err_piva_invalid_en');
        }
        if (!formData.indirizzo) newErrors.indirizzo = s('err_address_required_it', 'err_address_required_en');
        if (!formData.telefono) {
          newErrors.telefono = s('err_phone_required_it', 'err_phone_required_en');
        } else if (!validatePhone(formData.telefono)) {
          newErrors.telefono = s('err_phone_invalid_it', 'err_phone_invalid_en');
        }

        // Legal Representative Validations
        if (!formData.rappresentanteNome) newErrors.rappresentanteNome = s('err_rep_nome_it', 'err_rep_nome_en');
        if (!formData.rappresentanteCognome) newErrors.rappresentanteCognome = s('err_rep_cognome_it', 'err_rep_cognome_en');
        if (!formData.rappresentanteCF) newErrors.rappresentanteCF = s('err_rep_cf_it', 'err_rep_cf_en');
        if (!formData.rappresentanteRuolo) newErrors.rappresentanteRuolo = s('err_rep_ruolo_it', 'err_rep_ruolo_en');

        // Document Validations
        if (!formData.documentoTipo) newErrors.documentoTipo = s('err_doc_type_it', 'err_doc_type_en');
        if (!formData.documentoNumero) newErrors.documentoNumero = s('err_doc_numero_it', 'err_doc_numero_en');
        if (!formData.documentoDataRilascio) newErrors.documentoDataRilascio = s('err_doc_data_it', 'err_doc_data_en');
        if (!formData.documentoLuogoRilascio) newErrors.documentoLuogoRilascio = s('err_doc_luogo_it', 'err_doc_luogo_en');
      }

      // Persona Fisica specific
      if (tipoCliente === 'persona_fisica') {
        if (!formData.nome) newErrors.nome = s('err_nome_required_it', 'err_nome_required_en');
        if (!formData.cognome) newErrors.cognome = s('err_cognome_required_it', 'err_cognome_required_en');
        if (!formData.telefono) {
          newErrors.telefono = s('err_phone_required_it', 'err_phone_required_en');
        } else if (!validatePhone(formData.telefono)) {
          newErrors.telefono = s('err_phone_invalid_it', 'err_phone_invalid_en');
        }
        if (formData.codiceFiscale && !validateCodiceFiscale(formData.codiceFiscale)) {
          newErrors.codiceFiscale = s('err_cf_invalid_it', 'err_cf_invalid_en');
        }
        if (!formData.indirizzo) newErrors.indirizzo = s('err_residenza_required_it', 'err_residenza_required_en');
        // Email is already validated in common validations above
      }

      // Pubblica Amministrazione specific
      if (tipoCliente === 'pubblica_amministrazione') {
        if (!formData.codiceUnivoco) newErrors.codiceUnivoco = s('err_codice_univoco_required_it', 'err_codice_univoco_required_en');
        if (!formData.enteUfficio) newErrors.enteUfficio = s('err_ente_required_it', 'err_ente_required_en');
        if (!formData.citta) newErrors.citta = s('err_city_required_it', 'err_city_required_en');
        if (!formData.indirizzo) newErrors.indirizzo = s('err_pa_address_required_it', 'err_pa_address_required_en');
      }
    }

    // Password validation
    if (!formData.password) newErrors.password = t('Password_is_required');
    else if (formData.password.length < 8) newErrors.password = t('Password_is_too_weak');
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = t('Passwords_do_not_match');
    }

    // Terms validation
    if (!agreedToTerms) newErrors.terms = t('You_must_agree_to_the_terms');


    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError('');
    if (!validate()) return;
    setIsSubmitting(true);

    try {
      // Prepare customer data payload
      const customerData: any = {
        tipo_cliente: tipoCliente,
        nazione: formData.nazione,
        codice_fiscale: formData.codiceFiscale,
        indirizzo: formData.indirizzo,
        source: 'website'
      };

      // Add type-specific fields
      if (tipoCliente === 'azienda') {
        customerData.denominazione = formData.denominazione;
        customerData.partita_iva = formData.partitaIVA;
        customerData.email = formData.email;
        customerData.telefono = formData.telefono;
        if (formData.sedeOperativa) customerData.sede_operativa = formData.sedeOperativa;
        if (formData.codiceSDI) customerData.codice_destinatario = formData.codiceSDI;

        // Legal Rep & Doc Metadata
        customerData.rappresentante_nome = formData.rappresentanteNome;
        customerData.rappresentante_cognome = formData.rappresentanteCognome;
        customerData.rappresentante_cf = formData.rappresentanteCF;
        customerData.rappresentante_ruolo = formData.rappresentanteRuolo;

        customerData.metadata = {
          documento_tipo: formData.documentoTipo,
          documento_numero: formData.documentoNumero,
          documento_data_rilascio: formData.documentoDataRilascio,
          documento_luogo_rilascio: formData.documentoLuogoRilascio
        };

      } else if (tipoCliente === 'persona_fisica') {
        customerData.nome = formData.nome;
        customerData.cognome = formData.cognome;
        customerData.telefono = formData.telefono;
        customerData.email = formData.email;
        if (formData.pec) customerData.pec = formData.pec;

        customerData.sesso = formData.sesso;
        customerData.data_nascita = formData.dataNascita;
        customerData.citta_nascita = formData.cittaNascita;
        if (formData.provinciaNascita) customerData.provincia_nascita = formData.provinciaNascita;

        if (formData.numeroCivico) customerData.numero_civico = formData.numeroCivico;
        customerData.codice_postale = formData.codicePostale;
        customerData.citta_residenza = formData.cittaResidenza;
        customerData.provincia_residenza = formData.provinciaResidenza;

      } else if (tipoCliente === 'pubblica_amministrazione') {
        customerData.codice_univoco = formData.codiceUnivoco;
        customerData.ente_ufficio = formData.enteUfficio;
        customerData.citta = formData.citta;
        customerData.email = formData.email;
        customerData.telefono = formData.telefono;
      }

      // Call the backend function to handle registration securely
      const response = await fetch('/.netlify/functions/register-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          customerData,
          referralCode: referralCode || undefined
        })
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('Registration failed:', result);
        console.error('Error details:', {
          error: result.error,
          code: result.code,
          details: result.details,
          hint: result.hint,
          dbDetails: result.dbDetails
        });

        // Build a detailed error message
        let errorMessage = result.error || t('Something_went_wrong');
        if (result.code) errorMessage += ` (Code: ${result.code})`;
        if (result.hint) errorMessage += `\n${result.hint}`;
        if (result.dbDetails) errorMessage += `\nDetails: ${result.dbDetails}`;

        throw new Error(errorMessage);
      }

      // Success - now handle post-signup flow
      // Since we created the user via admin API, we might need to sign them in automatically?
      // Or just prompt to check email (if using email confirm)
      // The `signup` hook usually handles auto-login if email confirm is off.
      // But here we used backend. We should manual login?
      // Actually, let's try to sign them in immediately if we can, or just navigate.

      try { localStorage.removeItem('dr7_referral_code'); } catch {}

      // 26/08/2026: la registrazione puo' riuscire con la scheda incompleta
      // (un dato accessorio rifiutato dal database). Prima il caso finiva in
      // un errore che nascondeva l'account gia' creato; adesso l'account c'e',
      // il bonus e' accreditato, e all'utente si dice cosa manca invece di
      // lasciarlo con una scheda a meta' senza saperlo.
      if (result?.profiloCompleto === false) {
        console.warn('[SignUp] profilo incompleto:', result.profileError);
        setGeneralError(
          'Account creato e credito di benvenuto accreditato, ma alcuni dati non sono stati salvati. ' +
          'Completali dalla tua area personale (Il mio account) o scrivici: info@dr7.app'
        );
      }

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password
      });

      if (signInError) {
        // Presumably email not confirmed yet
        navigate('/check-email');
      } else if (signInData.user) {
        // Logged in successfully
        if (result.user?.id) {
          setNewUserId(result.user.id);
          setShowDocumentModal(true);
        } else {
          navigate('/account');
        }
      }

    } catch (err: any) {
      setGeneralError(err.message || t('Something_went_wrong'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
      <div className="min-h-screen flex items-center justify-center pt-24 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-2xl space-y-8">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg shadow-2xl shadow-black/50 p-8 space-y-6"
          >
            <div className="text-center">
              <h2 className="text-3xl font-bold text-white">{t('Create_Your_Account')}</h2>
              <p className="mt-2 text-sm text-gray-400">{s('subtitle_it', 'subtitle_en')}</p>
            </div>

            {generalError && (
              <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded p-3">
                {generalError}
              </p>
            )}

            <form className="space-y-6" onSubmit={handleSignUp} noValidate>
              {/* Client Type Selection */}
              <AppleStyleSelect
                label={s('client_type_label_it', 'client_type_label_en')}
                name="tipoCliente"
                value={
                  tipoCliente === 'azienda' ? s('client_type_azienda_it', 'client_type_azienda_en') :
                    tipoCliente === 'persona_fisica' ? s('client_type_persona_it', 'client_type_persona_en') :
                      tipoCliente === 'pubblica_amministrazione' ? s('client_type_pa_it', 'client_type_pa_en') :
                        ''
                }
                onChange={(e) => {
                  const displayValue = e.target.value;
                  const dbValue =
                    displayValue === s('client_type_azienda_it', 'client_type_azienda_en') ? 'azienda' :
                      displayValue === s('client_type_persona_it', 'client_type_persona_en') ? 'persona_fisica' :
                        displayValue === s('client_type_pa_it', 'client_type_pa_en') ? 'pubblica_amministrazione' :
                          '';
                  setTipoCliente(dbValue as any);
                }}
                options={[
                  s('client_type_azienda_it', 'client_type_azienda_en'),
                  s('client_type_persona_it', 'client_type_persona_en'),
                  s('client_type_pa_it', 'client_type_pa_en'),
                ]}
                required
                error={errors.tipoCliente}
              />

              {/* AZIENDA FIELDS */}
              {tipoCliente === 'azienda' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="border-t border-gray-700 pt-4"></div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {s('field_country_it', 'field_country_en')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="nazione"
                      value={formData.nazione}
                      onChange={handleChange}
                      className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white"
                      required
                    />
                    {errors.nazione && <p className="text-xs text-red-400 mt-1">{errors.nazione}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {s('field_denominazione_it', 'field_denominazione_en')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="denominazione"
                      value={formData.denominazione}
                      onChange={handleChange}
                      placeholder={s('field_denominazione_placeholder_it', 'field_denominazione_placeholder_en')}
                      className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white"
                      required
                    />
                    {errors.denominazione && <p className="text-xs text-red-400 mt-1">{errors.denominazione}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {s('field_piva_it', 'field_piva_en')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="partitaIVA"
                      value={formData.partitaIVA}
                      onChange={handleChange}
                      placeholder={copy?.field_piva_placeholder || ''}
                      className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white"
                      required
                    />
                    {errors.partitaIVA && <p className="text-xs text-red-400 mt-1">{errors.partitaIVA}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {s('field_codice_fiscale_it', 'field_codice_fiscale_en')}
                    </label>
                    <input
                      type="text"
                      name="codiceFiscale"
                      value={formData.codiceFiscale}
                      onChange={handleChange}
                      placeholder={copy?.field_cf_placeholder || ''}
                      className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white"
                      required
                    />
                    {errors.codiceFiscale && <p className="text-xs text-red-400 mt-1">{errors.codiceFiscale}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {s('field_sede_legale_it', 'field_sede_legale_en')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="indirizzo"
                      value={formData.indirizzo}
                      onChange={handleChange}
                      placeholder={s('field_sede_legale_placeholder_it', 'field_sede_legale_placeholder_en')}
                      className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white"
                      required
                    />
                    {errors.indirizzo && <p className="text-xs text-red-400 mt-1">{errors.indirizzo}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {s('field_sede_operativa_it', 'field_sede_operativa_en')}
                    </label>
                    <input
                      type="text"
                      name="sedeOperativa"
                      value={formData.sedeOperativa}
                      onChange={handleChange}
                      placeholder={s('field_sede_operativa_placeholder_it', 'field_sede_operativa_placeholder_en')}
                      className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {s('field_sdi_it', 'field_sdi_en')}
                    </label>
                    <input
                      type="text"
                      name="codiceSDI"
                      value={formData.codiceSDI}
                      onChange={handleChange}
                      placeholder={copy?.field_sdi_placeholder || ''}
                      maxLength={7}
                      className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white uppercase"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {s('field_email_aziendale_it', 'field_email_aziendale_en')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder={copy?.field_email_aziendale_placeholder || ''}
                      className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white"
                      required
                    />
                    {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {s('field_phone_aziendale_it', 'field_phone_aziendale_en')} <span className="text-red-500">*</span>
                    </label>
                    <PhoneInput
                      value={formData.telefono}
                      onChange={(val) => setFormData(prev => ({ ...prev, telefono: val }))}
                      required
                    />
                    {errors.telefono && <p className="text-xs text-red-400 mt-1">{errors.telefono}</p>}
                  </div>

                  {/* Rappresentante Legale */}
                  <div className="border-t border-gray-700 pt-4 mt-4">
                    <h3 className="text-lg font-semibold text-white mb-3">{s('section_legal_rep_it', 'section_legal_rep_en')}</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">{s('field_nome_it', 'field_nome_en')} <span className="text-red-500">*</span></label>
                        <input type="text" name="rappresentanteNome" value={formData.rappresentanteNome} onChange={handleChange} className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white" required />
                        {errors.rappresentanteNome && <p className="text-xs text-red-400 mt-1">{errors.rappresentanteNome}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">{s('field_cognome_it', 'field_cognome_en')} <span className="text-red-500">*</span></label>
                        <input type="text" name="rappresentanteCognome" value={formData.rappresentanteCognome} onChange={handleChange} className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white" required />
                        {errors.rappresentanteCognome && <p className="text-xs text-red-400 mt-1">{errors.rappresentanteCognome}</p>}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">{s('field_codice_fiscale_it', 'field_codice_fiscale_en')}</label>
                        <input type="text" name="rappresentanteCF" value={formData.rappresentanteCF} onChange={handleChange} className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white uppercase" maxLength={16} required />
                        {errors.rappresentanteCF && <p className="text-xs text-red-400 mt-1">{errors.rappresentanteCF}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">{s('field_ruolo_it', 'field_ruolo_en')} <span className="text-red-500">*</span></label>
                        <input type="text" name="rappresentanteRuolo" value={formData.rappresentanteRuolo} onChange={handleChange} className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white" placeholder={s('field_ruolo_placeholder_it', 'field_ruolo_placeholder_en')} required />
                        {errors.rappresentanteRuolo && <p className="text-xs text-red-400 mt-1">{errors.rappresentanteRuolo}</p>}
                      </div>
                    </div>

                    {/* Documento Rappresentante */}
                    <h4 className="text-md font-medium text-gray-300 mt-4 mb-2">{s('section_id_doc_it', 'section_id_doc_en')}</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <AppleStyleSelect
                        label={s('field_doc_type_it', 'field_doc_type_en')}
                        name="documentoTipo"
                        value={formData.documentoTipo}
                        onChange={handleChange}
                        options={[
                          s('field_doc_type_carta_it', 'field_doc_type_carta_en'),
                          s('field_doc_type_passaporto_it', 'field_doc_type_passaporto_en'),
                          s('field_doc_type_patente_it', 'field_doc_type_patente_en'),
                        ]}
                        required
                        error={errors.documentoTipo}
                      />
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">{s('field_doc_numero_it', 'field_doc_numero_en')} <span className="text-red-500">*</span></label>
                        <input type="text" name="documentoNumero" value={formData.documentoNumero} onChange={handleChange} className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white" required />
                        {errors.documentoNumero && <p className="text-xs text-red-400 mt-1">{errors.documentoNumero}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">{s('field_doc_data_it', 'field_doc_data_en')} <span className="text-red-500">*</span></label>
                        <input type="date" name="documentoDataRilascio" value={formData.documentoDataRilascio} onChange={handleChange} className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white" required />
                        {errors.documentoDataRilascio && <p className="text-xs text-red-400 mt-1">{errors.documentoDataRilascio}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">{s('field_doc_luogo_it', 'field_doc_luogo_en')} <span className="text-red-500">*</span></label>
                        <input type="text" name="documentoLuogoRilascio" value={formData.documentoLuogoRilascio} onChange={handleChange} className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white" required />
                        {errors.documentoLuogoRilascio && <p className="text-xs text-red-400 mt-1">{errors.documentoLuogoRilascio}</p>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* PERSONA FISICA FIELDS */}
              {tipoCliente === 'persona_fisica' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="border-t border-gray-700 pt-4"></div>

                  <div>
                    <AppleStyleSelect
                      label={s('field_country_it', 'field_country_en')}
                      name="nazione"
                      value={formData.nazione}
                      onChange={handleChange}
                      options={countries}
                      required
                      error={errors.nazione}
                      className="text-black"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        {s('field_nome_it', 'field_nome_en')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="nome"
                        value={formData.nome}
                        onChange={handleChange}
                        placeholder={s('field_nome_placeholder_it', 'field_nome_placeholder_en')}
                        className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white"
                        required
                      />
                      {errors.nome && <p className="text-xs text-red-400 mt-1">{errors.nome}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        {s('field_cognome_it', 'field_cognome_en')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="cognome"
                        value={formData.cognome}
                        onChange={handleChange}
                        placeholder={s('field_cognome_placeholder_it', 'field_cognome_placeholder_en')}
                        className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white"
                        required
                      />
                      {errors.cognome && <p className="text-xs text-red-400 mt-1">{errors.cognome}</p>}
                    </div>
                  </div>


                  {formData.nazione === 'Italia' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        {s('field_codice_fiscale_it', 'field_codice_fiscale_en')}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          name="codiceFiscale"
                          value={formData.codiceFiscale}
                          onChange={handleChange}
                          placeholder={copy?.field_cf_pf_placeholder || ''}
                          maxLength={16}
                          required
                          className="flex-1 bg-gray-800 border border-gray-700 rounded-md p-3 text-white uppercase"
                        />
                        <CalcolaCFButton
                          className="px-4 py-3 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-md whitespace-nowrap transition-colors"
                          config={{
                            getCognome: () => formData.cognome,
                            getNome: () => formData.nome,
                            getDataNascita: () => formData.dataNascita,
                            getSesso: () => formData.sesso,
                            getLuogoNascita: () => formData.cittaNascita,
                            getCodiceFiscale: () => formData.codiceFiscale,
                            setCodiceFiscale: (v) => setFormData(p => ({ ...p, codiceFiscale: v })),
                            setSesso: (v) => setFormData(p => ({ ...p, sesso: v })),
                            setDataNascita: (v) => setFormData(p => ({ ...p, dataNascita: v })),
                            setLuogoNascita: (v) => setFormData(p => ({ ...p, cittaNascita: v })),
                            setProvinciaNascita: (v) => setFormData(p => ({ ...p, provinciaNascita: v })),
                          }}
                        />
                      </div>
                      {errors.codiceFiscale && <p className="text-xs text-red-400 mt-1">{errors.codiceFiscale}</p>}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <AppleStyleSelect
                      label={s('field_sesso_it', 'field_sesso_en')}
                      name="sesso"
                      value={formData.sesso === 'M' ? s('field_sesso_m_it', 'field_sesso_m_en') : formData.sesso === 'F' ? s('field_sesso_f_it', 'field_sesso_f_en') : ''}
                      onChange={(e) => {
                        const displayValue = e.target.value;
                        const dbValue = displayValue === s('field_sesso_m_it', 'field_sesso_m_en') ? 'M' : displayValue === s('field_sesso_f_it', 'field_sesso_f_en') ? 'F' : '';
                        handleChange({ target: { name: 'sesso', value: dbValue } } as any);
                      }}
                      options={[s('field_sesso_m_it', 'field_sesso_m_en'), s('field_sesso_f_it', 'field_sesso_f_en')]}
                      error={errors.sesso}
                    />
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        {s('field_birth_date_it', 'field_birth_date_en')}
                      </label>
                      <input
                        type="date"
                        name="dataNascita"
                        value={formData.dataNascita}
                        onChange={handleChange}
                        className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white"
                      />
                      {errors.dataNascita && <p className="text-xs text-red-400 mt-1">{errors.dataNascita}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        {s('field_birth_city_it', 'field_birth_city_en')}
                      </label>
                      <input
                        type="text"
                        name="cittaNascita"
                        value={formData.cittaNascita}
                        onChange={handleChange}
                        className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white"
                      />
                      {errors.cittaNascita && <p className="text-xs text-red-400 mt-1">{errors.cittaNascita}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        {s('field_birth_province_it', 'field_birth_province_en')}
                      </label>
                      <input
                        type="text"
                        name="provinciaNascita"
                        value={formData.provinciaNascita}
                        onChange={handleChange}
                        maxLength={2}
                        className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white uppercase"
                      />
                      {errors.provinciaNascita && <p className="text-xs text-red-400 mt-1">{errors.provinciaNascita}</p>}
                    </div>
                  </div>

                  {/* Residency zone removed from signup — determined at booking time via usage zone */}

                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        {s('field_address_it', 'field_address_en')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="indirizzo"
                        value={formData.indirizzo}
                        onChange={handleChange}
                        placeholder={s('field_address_placeholder_it', 'field_address_placeholder_en')}
                        required
                        className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white"
                      />
                      {errors.indirizzo && <p className="text-xs text-red-400 mt-1">{errors.indirizzo}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        {s('field_civico_it', 'field_civico_en')}
                      </label>
                      <input
                        type="text"
                        name="numeroCivico"
                        value={formData.numeroCivico}
                        onChange={handleChange}
                        placeholder={copy?.field_civico_placeholder || ''}
                        className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white"
                      />
                      {errors.numeroCivico && <p className="text-xs text-red-400 mt-1">{errors.numeroCivico}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        {s('field_city_it', 'field_city_en')}
                      </label>
                      <input
                        type="text"
                        name="cittaResidenza"
                        value={formData.cittaResidenza}
                        onChange={handleChange}
                        placeholder={s('field_city_placeholder_it', 'field_city_placeholder_en')}
                        className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white"
                      />
                      {errors.cittaResidenza && <p className="text-xs text-red-400 mt-1">{errors.cittaResidenza}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        {s('field_cap_it', 'field_cap_en')}
                      </label>
                      <input
                        type="text"
                        name="codicePostale"
                        value={formData.codicePostale}
                        onChange={handleChange}
                        placeholder={copy?.field_cap_placeholder || ''}
                        maxLength={5}
                        className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white"
                      />
                      {errors.codicePostale && <p className="text-xs text-red-400 mt-1">{errors.codicePostale}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        {s('field_province_it', 'field_province_en')}
                      </label>
                        <input
                          type="text"
                          name="provinciaResidenza"
                          value={formData.provinciaResidenza}
                          onChange={handleChange}
                          placeholder={copy?.field_province_placeholder || ''}
                          maxLength={2}
                          className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white uppercase"
                          required
                        />
                      {errors.provinciaResidenza && <p className="text-xs text-red-400 mt-1">{errors.provinciaResidenza}</p>}
                    </div>
                  </div>



                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        {s('field_email_it', 'field_email_en')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder={copy?.field_email_placeholder || ''}
                        className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white"
                        required
                      />
                      {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        {s('field_phone_it', 'field_phone_en')} <span className="text-red-500">*</span>
                      </label>
                      <PhoneInput
                        value={formData.telefono}
                        onChange={(val) => setFormData(prev => ({ ...prev, telefono: val }))}
                        required
                      />
                      {errors.telefono && <p className="text-xs text-red-400 mt-1">{errors.telefono}</p>}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {s('field_pec_it', 'field_pec_en')}
                    </label>
                    <input
                      type="email"
                      name="pec"
                      value={formData.pec}
                      onChange={handleChange}
                      placeholder={copy?.field_pec_placeholder || ''}
                      className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white"
                    />
                  </div>
                </div>
              )}

              {/* PUBBLICA AMMINISTRAZIONE FIELDS */}
              {tipoCliente === 'pubblica_amministrazione' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="border-t border-gray-700 pt-4"></div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {s('field_codice_univoco_it', 'field_codice_univoco_en')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="codiceUnivoco"
                      value={formData.codiceUnivoco}
                      onChange={handleChange}
                      placeholder={copy?.field_codice_univoco_placeholder || ''}
                      className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white"
                      required
                    />
                    {errors.codiceUnivoco && <p className="text-xs text-red-400 mt-1">{errors.codiceUnivoco}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {s('field_codice_fiscale_it', 'field_codice_fiscale_en')}
                    </label>
                    <input
                      type="text"
                      name="codiceFiscale"
                      value={formData.codiceFiscale}
                      onChange={handleChange}
                      placeholder={copy?.field_cf_placeholder || ''}
                      className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white"
                      required
                    />
                    {errors.codiceFiscale && <p className="text-xs text-red-400 mt-1">{errors.codiceFiscale}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {s('field_ente_it', 'field_ente_en')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="enteUfficio"
                      value={formData.enteUfficio}
                      onChange={handleChange}
                      placeholder={s('field_ente_placeholder_it', 'field_ente_placeholder_en')}
                      className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white"
                      required
                    />
                    {errors.enteUfficio && <p className="text-xs text-red-400 mt-1">{errors.enteUfficio}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {s('field_city_it', 'field_city_en')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="citta"
                      value={formData.citta}
                      onChange={handleChange}
                      placeholder={s('field_pa_city_placeholder_it', 'field_pa_city_placeholder_en')}
                      className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white"
                      required
                    />
                    {errors.citta && <p className="text-xs text-red-400 mt-1">{errors.citta}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {s('field_address_it', 'field_address_en')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="indirizzo"
                      value={formData.indirizzo}
                      onChange={handleChange}
                      placeholder={s('field_sede_legale_placeholder_it', 'field_sede_legale_placeholder_en')}
                      className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white"
                      required
                    />
                    {errors.indirizzo && <p className="text-xs text-red-400 mt-1">{errors.indirizzo}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {s('field_email_it', 'field_email_en')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder={copy?.field_pa_email_placeholder || ''}
                      className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white"
                      required
                    />
                    {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
                  </div>
                </div>
              )}

              {/* PASSWORD FIELDS (shown after client type is selected) */}
              {tipoCliente && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="border-t border-gray-700 pt-4"></div>
                  <h3 className="text-lg font-semibold text-white">{s('section_credentials_it', 'section_credentials_en')}</h3>

                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {s('field_password_it', 'field_password_en')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      placeholder={t('Password')}
                      className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white pr-12"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-white transition-colors"
                      style={{ top: '32px' }}
                    >
                      {showPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      )}
                    </button>
                  </div>
                  {errors.password ? (
                    <p className="text-xs text-red-400">{errors.password}</p>
                  ) : (
                    <PasswordStrengthMeter password={formData.password} />
                  )}

                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {s('field_confirm_password_it', 'field_confirm_password_en')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      placeholder={t('Confirm_Password')}
                      className="w-full bg-gray-800 border border-gray-700 rounded-md p-3 text-white pr-12"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-white transition-colors"
                      style={{ top: '32px' }}
                    >
                      {showPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      )}
                    </button>
                    {errors.confirmPassword && <p className="text-xs text-red-400 mt-1">{errors.confirmPassword}</p>}
                  </div>

                  <div className="flex items-start">
                    <input
                      id="terms"
                      name="terms"
                      type="checkbox"
                      checked={agreedToTerms}
                      onChange={e => setAgreedToTerms(e.target.checked)}
                      className="h-4 w-4 mt-0.5 text-white bg-gray-700 border-gray-600 rounded focus:ring-white"
                    />
                    <label htmlFor="terms" className="ml-2 block text-sm text-gray-400">
                      {s('marketing_consent_it', 'marketing_consent_en')}{' '}
                      <Link to="/privacy-policy" className="font-medium text-white hover:underline">
                        {s('privacy_policy_link_it', 'privacy_policy_link_en')}
                      </Link>
                    </label>
                  </div>
                  {errors.terms && <p className="text-xs text-red-400">{errors.terms}</p>}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 px-4 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-colors disabled:opacity-60"
                  >
                    {isSubmitting ? t('Please_wait') : t('Create_Account')}
                  </button>
                </div>
              )}
            </form>

            <div className="text-sm text-center">
              <p className="text-gray-400">
                {t('Already_have_an_account')}{' '}
                <Link to="/signin" className="font-medium text-white hover:text-gray-300">
                  {t('Sign_In')}
                </Link>
              </p>
            </div>
          </motion.div>
        </div>
      </div>

      <style>{`
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

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-in-out;
        }
      `}</style>

      {/* Document Upload Modal */}
      {
        showDocumentModal && newUserId && (
          <DocumentUploadModal
            isOpen={showDocumentModal}
            onClose={() => {
              setShowDocumentModal(false);
              // Open marketing modal after document modal closes (whether uploaded or skipped)
              setShowMarketingModal(true);
            }}
            userId={newUserId || ''}
          />
        )
      }

      {/* Marketing Consent Modal */}
      {
        showMarketingModal && newUserId && (
          <MarketingConsentModal
            isOpen={showMarketingModal}
            userId={newUserId}
            onClose={() => {
              setShowMarketingModal(false);
              navigate('/check-email');
            }}
            onConfirm={async () => {
              try {
                // Update customers_extended for backward compatibility
                if (newUserId) {
                  const { error } = await supabase
                    .from('customers_extended')
                    .update({
                      notifications: {
                        bookingConfirmations: true,
                        specialOffers: true,
                        newsletter: true,
                        marketingConsent: true
                      }
                    })
                    .eq('id', newUserId);

                  if (error) console.error('Error updating customers_extended:', error);
                }
              } catch (err) {
                console.error('Error in consent update:', err);
              } finally {
                setShowMarketingModal(false);
                navigate('/check-email');
              }
            }}
          />
        )
      }
    </motion.div >
  );
};

export default SignUpPage;

import { useEffect, useMemo, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import CalcolaCFButton from '../components/ui/CalcolaCFButton'
import { useTranslation } from '../hooks/useTranslation'
import { getRegistrazioneClienteCopy, type RegistrazioneClienteCopy } from '../utils/siteCopy'

// Mirror del NewClientModal admin (Persona Fisica / Azienda / Pubblica Amm.)
// reso pubblico: il cliente arriva qui da un link inviato dall'operatore,
// compila i dati anagrafici + carica i documenti, atterra in customers_extended
// con source='self_registration' e source_invite_id collegato al token.

type ClientType = 'persona_fisica' | 'azienda' | 'pubblica_amministrazione'

interface InviteState {
    valid: boolean | null
    expired?: boolean
    used?: boolean
    revoked?: boolean
    expiresAt?: string
    error?: string
}

interface FormState {
    tipo_cliente: ClientType
    // Contatti (comuni)
    telefono: string
    email: string
    // Persona Fisica
    nome: string
    cognome: string
    sesso: string
    codice_fiscale: string
    data_nascita: string
    luogo_nascita: string
    provincia_nascita: string
    // Residenza
    indirizzo: string
    numero_civico: string
    citta: string
    cap: string
    provincia: string
    nazione: string
    // Azienda
    ragione_sociale: string
    partita_iva: string
    pec: string
    codice_destinatario: string
    // Pubblica Amministrazione
    ente_ufficio: string
    codice_univoco: string
}

const initialForm: FormState = {
    tipo_cliente: 'persona_fisica',
    telefono: '', email: '',
    nome: '', cognome: '', sesso: '',
    codice_fiscale: '', data_nascita: '', luogo_nascita: '', provincia_nascita: '',
    indirizzo: '', numero_civico: '', citta: '', cap: '', provincia: '', nazione: 'IT',
    ragione_sociale: '', partita_iva: '', pec: '', codice_destinatario: '',
    ente_ufficio: '', codice_univoco: '',
}

type DocKind = 'identity_document' | 'drivers_license' | 'codice_fiscale'

interface DocItem {
    kind: DocKind
    file: File
    uploaded?: boolean
    uploading?: boolean
    error?: string
}

export default function RegistrazioneClientePage() {
    const { token } = useParams<{ token: string }>()
    const { lang } = useTranslation()
    const [copy, setCopy] = useState<RegistrazioneClienteCopy | null>(null)
    const copyRef = useRef<RegistrazioneClienteCopy | null>(null)
    useEffect(() => {
      let cancelled = false
      getRegistrazioneClienteCopy().then(c => { if (cancelled) return; copyRef.current = c; setCopy(c) })
      return () => { cancelled = true }
    }, [])
    const r = (it: keyof RegistrazioneClienteCopy, en: keyof RegistrazioneClienteCopy): string => {
      const cur = copyRef.current
      if (!cur) return ''
      return cur[lang === 'it' ? it : en] as string
    }
    const TIPO_LABELS: Record<ClientType, string> = {
      persona_fisica: r('tipo_persona_fisica_it', 'tipo_persona_fisica_en'),
      azienda: r('tipo_azienda_it', 'tipo_azienda_en'),
      pubblica_amministrazione: r('tipo_pa_it', 'tipo_pa_en'),
    }
    const [invite, setInvite] = useState<InviteState>({ valid: null })
    const [step, setStep] = useState<'form' | 'documents' | 'done'>('form')
    const [form, setForm] = useState<FormState>(initialForm)
    const [submitting, setSubmitting] = useState(false)
    const [submitErr, setSubmitErr] = useState<string | null>(null)
    const [cfMsg, setCfMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    const [customerId, setCustomerId] = useState<string | null>(null)
    const [docs, setDocs] = useState<DocItem[]>([])

    useEffect(() => {
        if (!token) {
            setInvite({ valid: false, error: r('invalid_reason_incomplete_it', 'invalid_reason_incomplete_en') })
            return
        }
        ;(async () => {
            try {
                const res = await fetch(`/.netlify/functions/validate-customer-invite?token=${encodeURIComponent(token)}`)
                const json = await res.json()
                setInvite(json)
            } catch (e) {
                setInvite({ valid: false, error: e instanceof Error ? e.message : r('invalid_reason_validation_it', 'invalid_reason_validation_en') })
            }
        })()
    }, [token])

    function update<K extends keyof FormState>(k: K, v: FormState[K]) {
        setForm(prev => ({ ...prev, [k]: v }))
    }

    // Codice Fiscale Calcola — riusa il pattern bidirezionale del sito (calcola
    // CF dai dati / estrae dati dal CF / verifica consistenza). Mostra messaggi
    // inline invece di alert() cosi' l'esperienza mobile rimane fluida.
    const cfConfig = useMemo(() => ({
        getCognome: () => form.cognome,
        getNome: () => form.nome,
        getDataNascita: () => form.data_nascita,
        getSesso: () => form.sesso,
        getLuogoNascita: () => form.luogo_nascita,
        getCodiceFiscale: () => form.codice_fiscale,
        setCodiceFiscale: (v: string) => update('codice_fiscale', v),
        setSesso: (v: string) => update('sesso', v),
        setDataNascita: (v: string) => update('data_nascita', v),
        setLuogoNascita: (v: string) => update('luogo_nascita', v),
        setProvinciaNascita: (v: string) => update('provincia_nascita', v),
        onSuccess: (text: string) => setCfMsg({ type: 'success', text }),
        onError: (text: string) => setCfMsg({ type: 'error', text }),
    }), [form.nome, form.cognome, form.sesso, form.data_nascita, form.luogo_nascita, form.codice_fiscale])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setSubmitErr(null)

        const missing: string[] = []
        // Comuni
        if (!form.telefono.trim()) missing.push('Telefono')
        if (!form.email.trim()) missing.push('Email')
        if (!form.indirizzo.trim()) missing.push('Indirizzo')
        if (!form.citta.trim()) missing.push('Città')
        if (!form.cap.trim()) missing.push('CAP')
        if (!form.provincia.trim()) missing.push('Provincia')

        if (form.tipo_cliente === 'azienda') {
            if (!form.ragione_sociale.trim()) missing.push('Ragione sociale')
            if (!form.partita_iva.trim()) missing.push('P.IVA')
            if (!form.pec.trim() && !form.codice_destinatario.trim()) {
                missing.push('PEC o Codice Destinatario SDI')
            }
        } else if (form.tipo_cliente === 'pubblica_amministrazione') {
            if (!form.ente_ufficio.trim()) missing.push('Ente / Ufficio')
            if (!form.codice_univoco.trim()) missing.push('Codice Univoco IPA')
        } else {
            // persona_fisica
            if (!form.nome.trim()) missing.push('Nome')
            if (!form.cognome.trim()) missing.push('Cognome')
            if (!form.codice_fiscale.trim()) missing.push('Codice Fiscale')
            if (!form.data_nascita) missing.push('Data di nascita')
            if (!form.luogo_nascita.trim()) missing.push('Luogo di nascita')
        }

        if (missing.length > 0) return setSubmitErr(r('err_missing_prefix_it', 'err_missing_prefix_en').split('{list}').join(missing.join(', ')))

        if (form.telefono.replace(/\D/g, '').length < 8) return setSubmitErr(r('err_phone_invalid_it', 'err_phone_invalid_en'))
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setSubmitErr(r('err_email_invalid_it', 'err_email_invalid_en'))
        if (form.tipo_cliente === 'persona_fisica' && form.codice_fiscale.length !== 16) {
            return setSubmitErr(r('err_cf_length_it', 'err_cf_length_en'))
        }
        if (form.tipo_cliente === 'azienda' && !/^\d{11}$/.test(form.partita_iva)) {
            return setSubmitErr(r('err_piva_length_it', 'err_piva_length_en'))
        }

        setSubmitting(true)
        try {
            // Mappiamo i nostri campi a quelli che submit-customer-invite si aspetta.
            // tipo_cliente del backend era 'privato' | 'azienda'; lo manteniamo
            // backwards compatible mappando persona_fisica -> 'privato' e
            // pubblica_amministrazione -> 'azienda' (entrambi richiedono SDI),
            // ma passiamo anche il valore originale come ente_ufficio/codice_ipa.
            const payloadCustomer: Record<string, string> = {
                // I 3 valori esatti accettati dal CHECK constraint su
                // customers_extended.tipo_cliente (persona_fisica / azienda /
                // pubblica_amministrazione) — niente piu' alias 'privato'.
                tipo_cliente: form.tipo_cliente,
                telefono: form.telefono.trim(),
                email: form.email.trim(),
                indirizzo: form.indirizzo.trim(),
                numero_civico: form.numero_civico.trim(),
                citta: form.citta.trim(),
                cap: form.cap.trim(),
                provincia: form.provincia.trim().toUpperCase(),
                nazione: form.nazione.trim().toUpperCase() || 'IT',
            }

            if (form.tipo_cliente === 'persona_fisica') {
                payloadCustomer.nome = form.nome.trim()
                payloadCustomer.cognome = form.cognome.trim()
                payloadCustomer.sesso = form.sesso.trim()
                payloadCustomer.codice_fiscale = form.codice_fiscale.trim().toUpperCase()
                payloadCustomer.data_nascita = form.data_nascita
                payloadCustomer.luogo_nascita = form.luogo_nascita.trim()
                payloadCustomer.provincia_nascita = form.provincia_nascita.trim().toUpperCase()
            } else if (form.tipo_cliente === 'azienda') {
                payloadCustomer.ragione_sociale = form.ragione_sociale.trim()
                payloadCustomer.denominazione = form.ragione_sociale.trim()
                payloadCustomer.partita_iva = form.partita_iva.trim()
                payloadCustomer.pec = form.pec.trim()
                payloadCustomer.codice_destinatario = form.codice_destinatario.trim().toUpperCase()
                if (form.codice_fiscale.trim()) payloadCustomer.codice_fiscale = form.codice_fiscale.trim().toUpperCase()
            } else {
                // pubblica_amministrazione
                payloadCustomer.ente_ufficio = form.ente_ufficio.trim()
                payloadCustomer.ragione_sociale = form.ente_ufficio.trim()
                payloadCustomer.codice_univoco = form.codice_univoco.trim().toUpperCase()
                payloadCustomer.codice_ipa = form.codice_univoco.trim().toUpperCase()
                if (form.partita_iva.trim()) payloadCustomer.partita_iva = form.partita_iva.trim()
                if (form.pec.trim()) payloadCustomer.pec = form.pec.trim()
                if (form.codice_fiscale.trim()) payloadCustomer.codice_fiscale = form.codice_fiscale.trim().toUpperCase()
            }

            const res = await fetch('/.netlify/functions/submit-customer-invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, customer: payloadCustomer }),
            })
            const json: { success?: boolean; customerId?: string; error?: string } = await res.json()
            if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`)
            setCustomerId(json.customerId || null)
            setStep('documents')
        } catch (err) {
            setSubmitErr(err instanceof Error ? err.message : String(err))
        } finally {
            setSubmitting(false)
        }
    }

    function addDoc(kind: DocKind, file: File) {
        setDocs(prev => [...prev, { kind, file }])
    }

    function removeDoc(idx: number) {
        setDocs(prev => prev.filter((_, i) => i !== idx))
    }

    async function uploadDocs() {
        if (!customerId || !token) return
        for (let i = 0; i < docs.length; i++) {
            const item = docs[i]
            if (item.uploaded) continue
            setDocs(prev => prev.map((d, j) => j === i ? { ...d, uploading: true, error: undefined } : d))
            try {
                const fileBuf = await item.file.arrayBuffer()
                const b64 = btoa(String.fromCharCode(...new Uint8Array(fileBuf)))
                const res = await fetch('/.netlify/functions/upload-customer-invite-document', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        token,
                        customerId,
                        docKind: item.kind,
                        fileName: item.file.name,
                        contentType: item.file.type,
                        fileBase64: b64,
                    }),
                })
                const json = await res.json()
                if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`)
                setDocs(prev => prev.map((d, j) => j === i ? { ...d, uploading: false, uploaded: true } : d))
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                setDocs(prev => prev.map((d, j) => j === i ? { ...d, uploading: false, error: msg } : d))
            }
        }
    }

    // ─── Render gates ────────────────────────────────────────────────────
    if (invite.valid === null) return <Centered><p className="text-white/80">{r('verifica_link_it', 'verifica_link_en')}</p></Centered>
    if (!invite.valid) {
        const reason = invite.expired ? r('invalid_reason_expired_it', 'invalid_reason_expired_en') :
            invite.used ? r('invalid_reason_used_it', 'invalid_reason_used_en') :
            invite.revoked ? r('invalid_reason_revoked_it', 'invalid_reason_revoked_en') :
            invite.error || r('invalid_reason_fallback_it', 'invalid_reason_fallback_en')
        return <Centered>
            <h1 className="text-2xl font-bold text-white mb-2">{r('invalid_title_it', 'invalid_title_en')}</h1>
            <p className="text-white/80">{reason}</p>
            <p className="text-sm text-white/50 mt-4">{r('invalid_help_it', 'invalid_help_en')}</p>
        </Centered>
    }

    if (step === 'done') {
        return <Centered>
            <h1 className="text-3xl font-bold text-white mb-2">{r('done_title_it', 'done_title_en')}</h1>
            <p className="text-white/80">{r('done_body_it', 'done_body_en')}</p>
        </Centered>
    }

    return (
        <div className="py-10 px-4 sm:px-6">
            <div className="max-w-3xl mx-auto">
                <PageIntro
                    title={r('intro_title_it', 'intro_title_en')}
                    subtitle={r('intro_subtitle_it', 'intro_subtitle_en')}
                />

                {step === 'form' && (
                    <form onSubmit={handleSubmit} className="bg-black rounded-2xl shadow-2xl border border-white/30 p-6 sm:p-8 space-y-7">
                        {/* 1. Tipo Cliente */}
                        <section>
                            <SectionTitle index="1" title={r('section_1_tipo_it', 'section_1_tipo_en').replace(/^1\.\s*/, '')} />
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                {(['persona_fisica', 'azienda', 'pubblica_amministrazione'] as const).map(t => {
                                    const active = form.tipo_cliente === t
                                    return (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => update('tipo_cliente', t)}
                                            className={`px-4 py-3 border text-sm font-semibold transition-all ${
                                                active
                                                    ? 'border-white bg-white text-black'
                                                    : 'border-white/30 bg-black text-white/80 hover:border-white hover:bg-white/5'
                                            }`}
                                        >
                                            {TIPO_LABELS[t]}
                                        </button>
                                    )
                                })}
                            </div>
                        </section>

                        {/* 2. Dati anagrafici / azienda / PA */}
                        {form.tipo_cliente === 'persona_fisica' && (
                            <section>
                                <SectionTitle index="2" title={r('section_2_anagrafica_it', 'section_2_anagrafica_en').replace(/^2\.\s*/, '')} />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Field label={r('field_nome_it', 'field_nome_en')} value={form.nome} onChange={v => update('nome', v)} required />
                                    <Field label={r('field_cognome_it', 'field_cognome_en')} value={form.cognome} onChange={v => update('cognome', v)} required />
                                    <div className="md:col-span-2">
                                        <label className="block">
                                            <span className="text-xs font-semibold text-white/80 tracking-wide">{r('field_cf_label_it', 'field_cf_label_en')}</span>
                                            <div className="mt-2 flex flex-col sm:flex-row gap-2">
                                                <input
                                                    value={form.codice_fiscale}
                                                    onChange={e => update('codice_fiscale', e.target.value.toUpperCase())}
                                                    required
                                                    maxLength={16}
                                                    minLength={16}
                                                    placeholder={copy?.field_cf_placeholder || ''}
                                                    className={INPUT_CLASS + ' uppercase tracking-wider'}
                                                />
                                                <CalcolaCFButton
                                                    config={cfConfig}
                                                    className="px-4 py-2.5 bg-white text-black text-sm font-bold hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-50 whitespace-nowrap"
                                                />
                                            </div>
                                            {cfMsg && (
                                                <p className={`mt-2 text-xs ${cfMsg.type === 'success' ? 'text-white' : 'text-white/70'}`}>{cfMsg.text}</p>
                                            )}
                                        </label>
                                    </div>
                                    <SelectField label={r('field_sesso_label_it', 'field_sesso_label_en')} value={form.sesso} onChange={v => update('sesso', v)} options={[
                                        { value: '', label: r('field_sesso_default_it', 'field_sesso_default_en') },
                                        { value: 'M', label: r('field_sesso_m_it', 'field_sesso_m_en') },
                                        { value: 'F', label: r('field_sesso_f_it', 'field_sesso_f_en') },
                                    ]} />
                                    <Field label={r('field_birth_date_it', 'field_birth_date_en')} type="date" value={form.data_nascita} onChange={v => update('data_nascita', v)} required />
                                    <Field label={r('field_birth_city_it', 'field_birth_city_en')} value={form.luogo_nascita} onChange={v => update('luogo_nascita', v)} required placeholder={r('field_birth_city_placeholder_it', 'field_birth_city_placeholder_en')} />
                                    <Field label={r('field_birth_province_it', 'field_birth_province_en')} value={form.provincia_nascita} onChange={v => update('provincia_nascita', v.toUpperCase())} maxLength={2} placeholder={r('field_birth_province_placeholder_it', 'field_birth_province_placeholder_en')} />
                                </div>
                            </section>
                        )}

                        {form.tipo_cliente === 'azienda' && (
                            <section>
                                <SectionTitle index="2" title={r('section_2_azienda_it', 'section_2_azienda_en').replace(/^2\.\s*/, '')} />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Field label={r('field_ragione_sociale_it', 'field_ragione_sociale_en')} value={form.ragione_sociale} onChange={v => update('ragione_sociale', v)} required />
                                    <Field label={r('field_piva_it', 'field_piva_en')} value={form.partita_iva} onChange={v => update('partita_iva', v.replace(/\D/g, ''))} required maxLength={11} minLength={11} placeholder={r('field_piva_placeholder_it', 'field_piva_placeholder_en')} />
                                    <Field label={r('field_pec_no_sdi_it', 'field_pec_no_sdi_en')} type="email" value={form.pec} onChange={v => update('pec', v)} placeholder={copy?.field_pec_placeholder || ''} />
                                    <Field label={r('field_sdi_no_pec_it', 'field_sdi_no_pec_en')} value={form.codice_destinatario} onChange={v => update('codice_destinatario', v.toUpperCase())} maxLength={7} placeholder={r('field_sdi_placeholder_it', 'field_sdi_placeholder_en')} />
                                    <Field label={r('field_cf_rappresentante_it', 'field_cf_rappresentante_en')} value={form.codice_fiscale} onChange={v => update('codice_fiscale', v.toUpperCase())} maxLength={16} />
                                </div>
                            </section>
                        )}

                        {form.tipo_cliente === 'pubblica_amministrazione' && (
                            <section>
                                <SectionTitle index="2" title={r('section_2_pa_it', 'section_2_pa_en').replace(/^2\.\s*/, '')} />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Field label={r('field_ente_ufficio_it', 'field_ente_ufficio_en')} value={form.ente_ufficio} onChange={v => update('ente_ufficio', v)} required />
                                    <Field label={r('field_codice_univoco_it', 'field_codice_univoco_en')} value={form.codice_univoco} onChange={v => update('codice_univoco', v.toUpperCase())} required maxLength={6} placeholder={r('field_codice_univoco_placeholder_it', 'field_codice_univoco_placeholder_en')} />
                                    <Field label={r('field_piva_it', 'field_piva_en')} value={form.partita_iva} onChange={v => update('partita_iva', v.replace(/\D/g, ''))} maxLength={11} />
                                    <Field label={r('field_cf_ente_it', 'field_cf_ente_en')} value={form.codice_fiscale} onChange={v => update('codice_fiscale', v.toUpperCase())} maxLength={16} />
                                    <Field label={r('field_pec_simple_it', 'field_pec_simple_en')} type="email" value={form.pec} onChange={v => update('pec', v)} />
                                </div>
                            </section>
                        )}

                        {/* 3. Residenza / Sede */}
                        <section>
                            <SectionTitle index="3" title={(form.tipo_cliente === 'persona_fisica'
                                ? r('section_3_residenza_it', 'section_3_residenza_en')
                                : r('section_3_sede_it', 'section_3_sede_en')).replace(/^3\.\s*/, '')} />
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="md:col-span-2">
                                    <Field label={r('field_indirizzo_it', 'field_indirizzo_en')} value={form.indirizzo} onChange={v => update('indirizzo', v)} required placeholder={r('field_indirizzo_placeholder_it', 'field_indirizzo_placeholder_en')} />
                                </div>
                                <Field label={r('field_civico_it', 'field_civico_en')} value={form.numero_civico} onChange={v => update('numero_civico', v)} maxLength={10} placeholder={r('field_civico_placeholder_it', 'field_civico_placeholder_en')} />
                                <Field label={r('field_citta_it', 'field_citta_en')} value={form.citta} onChange={v => update('citta', v)} required placeholder={r('field_citta_placeholder_it', 'field_citta_placeholder_en')} />
                                <Field label={r('field_provincia_it', 'field_provincia_en')} value={form.provincia} onChange={v => update('provincia', v.toUpperCase())} maxLength={2} minLength={2} required placeholder={r('field_provincia_placeholder_it', 'field_provincia_placeholder_en')} />
                                <Field label={r('field_cap_it', 'field_cap_en')} value={form.cap} onChange={v => update('cap', v.replace(/\D/g, ''))} maxLength={5} minLength={5} required placeholder={r('field_cap_placeholder_it', 'field_cap_placeholder_en')} />
                                <Field label={r('field_nazione_it', 'field_nazione_en')} value={form.nazione} onChange={v => update('nazione', v.toUpperCase())} maxLength={2} placeholder={copy?.field_nazione_placeholder || ''} />
                            </div>
                        </section>

                        {/* 4. Contatti */}
                        <section>
                            <SectionTitle index="4" title={r('section_4_contatti_it', 'section_4_contatti_en').replace(/^4\.\s*/, '')} />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label={r('field_telefono_it', 'field_telefono_en')} type="tel" value={form.telefono} onChange={v => update('telefono', v)} required placeholder={copy?.field_telefono_placeholder || ''} />
                                <Field label={r('field_email_it', 'field_email_en')} type="email" value={form.email} onChange={v => update('email', v)} required placeholder={copy?.field_email_placeholder || ''} />
                            </div>
                        </section>

                        <p className="text-xs text-white/50 pt-1">{r('required_hint_it', 'required_hint_en')}</p>

                        {submitErr && (
                            <p className="text-sm text-white bg-white/5 border border-white/40 rounded-xl px-4 py-3">{submitErr}</p>
                        )}

                        <div className="pt-5 border-t border-white/20 flex flex-col sm:flex-row sm:justify-end gap-2">
                            <button
                                type="submit"
                                disabled={submitting}
                                className="px-8 py-3 bg-white text-black font-bold hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                                {submitting ? r('cta_submitting_it', 'cta_submitting_en') : r('cta_submit_it', 'cta_submit_en')}
                            </button>
                        </div>
                    </form>
                )}

                {step === 'documents' && customerId && (
                    <div className="bg-black rounded-2xl shadow-2xl border border-white/30 p-6 sm:p-8 space-y-5">
                        <div>
                            <SectionTitle index="✓" title={r('section_docs_it', 'section_docs_en').replace(/^✓\s*/, '')} />
                            <p className="text-sm text-white/70">
                                {r('docs_intro_it', 'docs_intro_en')}
                            </p>
                        </div>

                        <div className="space-y-3">
                            <DocPicker label={r('docs_label_identity_it', 'docs_label_identity_en')} kind="identity_document" onAdd={addDoc} />
                            <DocPicker label={r('docs_label_license_it', 'docs_label_license_en')} kind="drivers_license" onAdd={addDoc} />
                            <DocPicker label={r('docs_label_codice_fiscale_it', 'docs_label_codice_fiscale_en')} kind="codice_fiscale" onAdd={addDoc} />
                        </div>

                        {docs.length > 0 && (
                            <ul className="border border-white/30 rounded-xl divide-y divide-white/20 overflow-hidden">
                                {docs.map((d, i) => (
                                    <li key={i} className="px-4 py-3 flex items-center gap-3 text-sm bg-black">
                                        <span className="font-mono text-[10px] px-2 py-0.5 border border-white/30 text-white/80">{d.kind.replace('_', ' ')}</span>
                                        <span className="flex-1 truncate text-white">{d.file.name}</span>
                                        {d.uploaded ? <span className="text-white text-xs font-semibold">{r('docs_chip_uploaded_it', 'docs_chip_uploaded_en')}</span>
                                            : d.uploading ? <span className="text-white/70 text-xs">{r('docs_chip_uploading_it', 'docs_chip_uploading_en')}</span>
                                                : d.error ? <span className="text-white text-xs">{d.error}</span>
                                                    : <button type="button" onClick={() => removeDoc(i)} className="text-white/70 text-xs hover:text-white underline">{r('docs_chip_remove_it', 'docs_chip_remove_en')}</button>}
                                    </li>
                                ))}
                            </ul>
                        )}

                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pt-5 border-t border-white/20">
                            <button type="button" onClick={() => setStep('done')}
                                className="text-sm text-white/70 underline self-start hover:text-white">{r('cta_skip_docs_it', 'cta_skip_docs_en')}</button>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <button type="button" onClick={uploadDocs}
                                    disabled={docs.length === 0 || docs.every(d => d.uploaded)}
                                    className="px-5 py-2.5 bg-black text-white border border-white/40 font-semibold hover:bg-white/5 hover:border-white active:scale-[0.98] transition-all disabled:opacity-40">
                                    {r('cta_upload_selected_it', 'cta_upload_selected_en')}
                                </button>
                                <button type="button" onClick={() => setStep('done')}
                                    disabled={docs.some(d => !d.uploaded && !d.error)}
                                    className="px-5 py-2.5 bg-white text-black font-bold hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-40">
                                    {r('cta_finish_it', 'cta_finish_en')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── Style tokens ───────────────────────────────────────────────────────
// Centralizzate qui cosi' tutti gli input hanno la STESSA visibilita' su
// dark theme (placeholder leggibile, bordo sempre presente, focus chiaro).
const INPUT_CLASS =
    'w-full px-4 py-2.5 rounded-xl bg-black border border-white/40 text-white ' +
    'placeholder:text-white/40 placeholder:font-normal ' +
    'focus:outline-none focus:border-white focus:ring-2 focus:ring-white/40 ' +
    'transition-colors'

function PageIntro({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{title}</h1>
            <p className="text-sm text-white/70 mt-2">{subtitle}</p>
        </div>
    )
}

function Centered({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-[60vh] flex items-center justify-center px-4 py-10">
            <div className="bg-black border border-white/30 rounded-2xl shadow-2xl p-8 max-w-md text-center">
                {children}
            </div>
        </div>
    )
}

function SectionTitle({ index, title }: { index: string; title: string }) {
    return (
        <h3 className="flex items-center gap-2 text-sm font-bold text-white uppercase tracking-wider mb-4">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white text-black text-[11px] font-bold">{index}</span>
            {title}
        </h3>
    )
}

function Field({ label, value, onChange, type = 'text', required, maxLength, minLength, placeholder }: {
    label: string
    value: string
    onChange: (v: string) => void
    type?: string
    required?: boolean
    maxLength?: number
    minLength?: number
    placeholder?: string
}) {
    return (
        <label className="block">
            <span className="text-xs font-semibold text-white/80 tracking-wide uppercase">{label}{required ? ' *' : ''}</span>
            <input
                type={type}
                value={value}
                onChange={e => onChange(e.target.value)}
                required={required}
                maxLength={maxLength}
                minLength={minLength}
                placeholder={placeholder}
                className={`mt-2 ${INPUT_CLASS}`}
            />
        </label>
    )
}

function SelectField({ label, value, onChange, options }: {
    label: string
    value: string
    onChange: (v: string) => void
    options: { value: string; label: string }[]
}) {
    return (
        <label className="block">
            <span className="text-xs font-semibold text-white/80 tracking-wide uppercase">{label}</span>
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className={`mt-2 ${INPUT_CLASS} appearance-none pr-8 bg-no-repeat bg-right`}
                style={{ backgroundImage: 'url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%23a1a1aa\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'%3E%3C/path%3E%3C/svg%3E")', backgroundSize: '18px', backgroundPosition: 'right 12px center' }}
            >
                {options.map(o => <option key={o.value} value={o.value} className="bg-black text-white">{o.label}</option>)}
            </select>
        </label>
    )
}

function DocPicker({ label, kind, onAdd }: {
    label: string
    kind: DocKind
    onAdd: (kind: DocKind, f: File) => void
}) {
    return (
        <label className="border border-white/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 cursor-pointer bg-black hover:border-white transition-colors">
            <span className="text-sm font-medium text-white flex-1">{label}</span>
            <input
                type="file"
                accept="image/*,application/pdf"
                onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) onAdd(kind, f)
                    e.currentTarget.value = ''
                }}
                className="text-xs text-white/70 file:mr-3 file:py-1.5 file:px-3 file:border file:border-white/40 file:bg-black file:text-white file:font-semibold file:text-xs hover:file:bg-white/10 file:cursor-pointer"
            />
        </label>
    )
}

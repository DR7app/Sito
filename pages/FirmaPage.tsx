import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from '../hooks/useTranslation'
import { getFirmaCopy, type FirmaCopy } from '../utils/siteCopy'

function applyTokens(tpl: string, tokens: Record<string, string>): string {
  return Object.entries(tokens).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(v), tpl)
}

type SigningStatus = 'loading' | 'viewing' | 'otp_sending' | 'otp_sent' | 'otp_verifying' | 'signing' | 'signed' | 'expired' | 'error'

interface ContractInfo {
    contractNumber: string
    pdfUrl: string
    customerName: string
    vehicleName: string
    rentalStartDate: string
    rentalEndDate: string
}

export default function FirmaPage() {
    const { token } = useParams<{ token: string }>()
    const { lang } = useTranslation()
    const [status, setStatus] = useState<SigningStatus>('loading')
    const [signerName, setSignerName] = useState('')
    const [signerEmail, setSignerEmail] = useState('')
    const [contract, setContract] = useState<ContractInfo | null>(null)
    const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null)
    const [signedAt, setSignedAt] = useState<string | null>(null)
    const [otp, setOtp] = useState(['', '', '', '', '', ''])
    const [error, setError] = useState('')
    const [remainingAttempts, setRemainingAttempts] = useState(5)
    const [acceptedTerms, setAcceptedTerms] = useState(false)
    const otpRefs = useRef<(HTMLInputElement | null)[]>([])
    const [pdfPages, setPdfPages] = useState<string[]>([])
    const [pdfLoading, setPdfLoading] = useState(false)
    const [copy, setCopy] = useState<FirmaCopy | null>(null)
    const copyRef = useRef<FirmaCopy | null>(null)
    useEffect(() => {
      let cancelled = false
      getFirmaCopy().then(c => { if (cancelled) return; copyRef.current = c; setCopy(c) })
      return () => { cancelled = true }
    }, [])
    const f = (it: keyof FirmaCopy, en: keyof FirmaCopy): string => {
      const cur = copyRef.current
      if (!cur) return ''
      return cur[lang === 'it' ? it : en] as string
    }

    useEffect(() => {
        if (token) loadSigningData()
    }, [token])

    // Render PDF pages as images using canvas for full multi-page display
    useEffect(() => {
        if (contract?.pdfUrl && status !== 'signed') {
            renderPdfPages(contract.pdfUrl)
        }
    }, [contract?.pdfUrl, status])

    async function renderPdfPages(url: string) {
        setPdfLoading(true)
        try {
            // Use pdf.js via CDN to render pages as images
            const pdfjsLib = await loadPdfJs()
            const pdf = await pdfjsLib.getDocument(url).promise
            const pages: string[] = []

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i)
                const scale = 2 // High-res rendering
                const viewport = page.getViewport({ scale })

                const canvas = document.createElement('canvas')
                canvas.width = viewport.width
                canvas.height = viewport.height
                const ctx = canvas.getContext('2d')!

                await page.render({ canvasContext: ctx, viewport }).promise
                pages.push(canvas.toDataURL('image/png'))
            }

            setPdfPages(pages)
        } catch (err) {
            console.error('Error rendering PDF:', err)
            // Fallback: will use iframe
            setPdfPages([])
        } finally {
            setPdfLoading(false)
        }
    }

    async function loadPdfJs(): Promise<any> {
        // Check if already loaded
        if ((window as any).pdfjsLib) return (window as any).pdfjsLib

        return new Promise((resolve, reject) => {
            const script = document.createElement('script')
            script.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'
            script.onload = () => {
                const lib = (window as any).pdfjsLib
                lib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
                resolve(lib)
            }
            script.onerror = reject
            document.head.appendChild(script)
        })
    }

    async function loadSigningData() {
        try {
            const res = await fetch('/.netlify/functions/signature-get', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            })

            if (res.status === 410) {
                setStatus('expired')
                return
            }

            if (!res.ok) {
                const err = await res.json()
                setError(err.error || f('err_load_fallback_it', 'err_load_fallback_en'))
                setStatus('error')
                return
            }

            const data = await res.json()
            setSignerName(data.signerName)
            setSignerEmail(data.signerEmail)
            setContract(data.contract)

            if (data.status === 'signed') {
                setSignedPdfUrl(data.signedPdfUrl)
                setSignedAt(data.signedAt)
                setStatus('signed')
            } else {
                setStatus('viewing')
            }
        } catch {
            setError(f('err_load_contract_it', 'err_load_contract_en'))
            setStatus('error')
        }
    }

    async function handleRequestOtp() {
        setStatus('otp_sending')
        setError('')
        try {
            const res = await fetch('/.netlify/functions/signature-send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            })

            if (!res.ok) {
                const err = await res.json()
                setError(err.error)
                setStatus('viewing')
                return
            }

            setStatus('otp_sent')
            setOtp(['', '', '', '', '', ''])
            setTimeout(() => otpRefs.current[0]?.focus(), 100)
        } catch {
            setError(f('err_send_otp_it', 'err_send_otp_en'))
            setStatus('viewing')
        }
    }

    async function handleVerifyOtp() {
        const otpCode = otp.join('')
        if (otpCode.length !== 6) {
            setError(f('err_incomplete_code_it', 'err_incomplete_code_en'))
            return
        }

        setStatus('otp_verifying')
        setError('')
        try {
            const res = await fetch('/.netlify/functions/signature-verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, otp: otpCode })
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error)
                if (data.remainingAttempts !== undefined) {
                    setRemainingAttempts(data.remainingAttempts)
                }
                setStatus('otp_sent')
                return
            }

            setStatus('signing')
        } catch {
            setError(f('err_verify_otp_it', 'err_verify_otp_en'))
            setStatus('otp_sent')
        }
    }

    async function handleSign() {
        if (!acceptedTerms) {
            setError(f('err_terms_required_it', 'err_terms_required_en'))
            return
        }

        setError('')
        try {
            const res = await fetch('/.netlify/functions/signature-complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            })

            if (!res.ok) {
                const err = await res.json()
                setError(err.error)
                return
            }

            const data = await res.json()
            setSignedPdfUrl(data.signedPdfUrl)
            setSignedAt(data.signedAt)
            setStatus('signed')
        } catch {
            setError(f('err_signing_it', 'err_signing_en'))
        }
    }

    function handleOtpChange(index: number, value: string) {
        if (!/^\d*$/.test(value)) return
        const newOtp = [...otp]
        newOtp[index] = value.slice(-1)
        setOtp(newOtp)
        if (value && index < 5) {
            otpRefs.current[index + 1]?.focus()
        }
    }

    function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            otpRefs.current[index - 1]?.focus()
        }
    }

    function handleOtpPaste(e: React.ClipboardEvent) {
        e.preventDefault()
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
        const newOtp = [...otp]
        for (let i = 0; i < pasted.length; i++) {
            newOtp[i] = pasted[i]
        }
        setOtp(newOtp)
        const nextEmpty = newOtp.findIndex(d => !d)
        otpRefs.current[nextEmpty === -1 ? 5 : nextEmpty]?.focus()
    }

    if (status === 'loading') {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">{f('contract_loading_it', 'contract_loading_en')}</p>
                </div>
            </div>
        )
    }

    if (status === 'expired') {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
                    <div className="text-5xl mb-4">&#8987;</div>
                    <h1 className="text-2xl font-bold text-gray-800 mb-2">{f('expired_title_it', 'expired_title_en')}</h1>
                    <p className="text-gray-600">{f('expired_body_it', 'expired_body_en')}</p>
                </div>
            </div>
        )
    }

    if (status === 'error') {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
                    <div className="text-5xl mb-4">&#9888;&#65039;</div>
                    <h1 className="text-2xl font-bold text-gray-800 mb-2">{f('error_title_it', 'error_title_en')}</h1>
                    <p className="text-gray-600">{error}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            {/* Nero pieno dichiarato: questa fascia sta su una pagina CHIARA, non sul
                marmo. Con `bg-black` la regola globale la renderebbe trasparente e il
                logo bianco finirebbe su fondo bianco. */}
            <div className="bg-dr7-obsidian text-white py-4 px-6 flex items-center justify-between">
                <img src="https://dr7.app/DR7logo1.png" alt="DR7" className="h-10" />
                <span className="text-sm text-gray-400">{f('header_pill_it', 'header_pill_en')}</span>
            </div>

            <div className="max-w-3xl mx-auto p-4 sm:p-6">
                {/* Contract Info Card */}
                {contract && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                        <h1 className="text-xl font-bold text-gray-800 mb-1">
                            {f('contract_number_prefix_it', 'contract_number_prefix_en')} {contract.contractNumber}
                        </h1>
                        <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                            <div>
                                <span className="text-gray-500 block">{f('label_cliente_it', 'label_cliente_en')}</span>
                                <span className="font-semibold">{signerName}</span>
                            </div>
                            <div>
                                <span className="text-gray-500 block">{f('label_veicolo_it', 'label_veicolo_en')}</span>
                                <span className="font-semibold">{contract.vehicleName}</span>
                            </div>
                            <div>
                                <span className="text-gray-500 block">{f('label_ritiro_it', 'label_ritiro_en')}</span>
                                <span className="font-semibold">
                                    {contract.rentalStartDate ? new Date(contract.rentalStartDate).toLocaleDateString(lang === 'it' ? 'it-IT' : 'en-GB') : f('na_fallback_it', 'na_fallback_en')}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-500 block">{f('label_riconsegna_it', 'label_riconsegna_en')}</span>
                                <span className="font-semibold">
                                    {contract.rentalEndDate ? new Date(contract.rentalEndDate).toLocaleDateString(lang === 'it' ? 'it-IT' : 'en-GB') : f('na_fallback_it', 'na_fallback_en')}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* PDF Viewer - Full multi-page display */}
                {contract?.pdfUrl && status !== 'signed' && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
                        <div className="bg-gray-100 px-4 py-2 text-sm text-gray-600 font-medium border-b flex items-center justify-between">
                            <span>{f('pdf_section_title_it', 'pdf_section_title_en')}</span>
                            {pdfPages.length > 0 && (
                                <span className="text-xs text-gray-400">{pdfPages.length} {f('pdf_pages_suffix_it', 'pdf_pages_suffix_en')}</span>
                            )}
                        </div>

                        {pdfLoading && (
                            <div className="flex items-center justify-center py-16">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-600 mr-3"></div>
                                <span className="text-gray-500">{f('pdf_loading_it', 'pdf_loading_en')}</span>
                            </div>
                        )}

                        {pdfPages.length > 0 ? (
                            <div className="p-4 space-y-4 bg-gray-200">
                                {pdfPages.map((pageDataUrl, index) => (
                                    <div key={index} className="relative">
                                        <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                                            {applyTokens(f('pdf_page_overlay_template_it', 'pdf_page_overlay_template_en'), { i: String(index + 1), n: String(pdfPages.length) })}
                                        </div>
                                        <img
                                            src={pageDataUrl}
                                            alt={applyTokens(f('pdf_page_alt_template_it', 'pdf_page_alt_template_en'), { i: String(index + 1) })}
                                            className="w-full shadow-lg rounded"
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : !pdfLoading ? (
                            /* Fallback: iframe with larger height */
                            <iframe
                                src={contract.pdfUrl}
                                className="w-full border-0"
                                style={{ height: '80vh', minHeight: '600px' }}
                                title={f('pdf_iframe_title_it', 'pdf_iframe_title_en')}
                            />
                        ) : null}
                    </div>
                )}

                {/* Error message */}
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-6 text-sm">
                        {error}
                    </div>
                )}

                {/* Step 1: Request OTP */}
                {status === 'viewing' && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
                        <h2 className="text-lg font-bold text-gray-800 mb-2">{f('otp_step1_title_it', 'otp_step1_title_en')}</h2>
                        <p className="text-gray-600 text-sm mb-6">
                            {f('otp_step1_body_template_it', 'otp_step1_body_template_en').split('{email}').map((part, i, arr) => (
                                <span key={i}>{part}{i < arr.length - 1 && <strong>{signerEmail}</strong>}</span>
                            ))}
                        </p>
                        <button
                            onClick={handleRequestOtp}
                            className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-8 transition-colors text-lg"
                        >
                            {f('otp_step1_cta_it', 'otp_step1_cta_en')}
                        </button>
                    </div>
                )}

                {status === 'otp_sending' && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-600 mx-auto mb-4"></div>
                        <p className="text-gray-600">{f('otp_sending_it', 'otp_sending_en')}</p>
                    </div>
                )}

                {/* Step 2: Enter OTP */}
                {(status === 'otp_sent' || status === 'otp_verifying') && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h2 className="text-lg font-bold text-gray-800 mb-2 text-center">{f('otp_step2_title_it', 'otp_step2_title_en')}</h2>
                        <p className="text-gray-600 text-sm mb-6 text-center">
                            {f('otp_step2_body_template_it', 'otp_step2_body_template_en').split('{email}').map((part, i, arr) => (
                                <span key={i}>{part}{i < arr.length - 1 && <strong>{signerEmail}</strong>}</span>
                            ))}
                        </p>

                        <div className="flex justify-center gap-2 mb-6" onPaste={handleOtpPaste}>
                            {otp.map((digit, i) => (
                                <input
                                    key={i}
                                    ref={el => { otpRefs.current[i] = el }}
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={1}
                                    value={digit}
                                    onChange={e => handleOtpChange(i, e.target.value)}
                                    onKeyDown={e => handleOtpKeyDown(i, e)}
                                    className="w-12 h-14 text-center text-2xl font-bold border-2 border-gray-300 rounded-lg focus:border-yellow-500 focus:outline-none transition-colors"
                                    disabled={status === 'otp_verifying'}
                                />
                            ))}
                        </div>

                        {remainingAttempts < 5 && (
                            <p className="text-center text-sm text-orange-600 mb-4">
                                {applyTokens(f('otp_attempts_template_it', 'otp_attempts_template_en'), { attempts: String(remainingAttempts) })}
                            </p>
                        )}

                        <div className="flex flex-col gap-3 items-center">
                            <button
                                onClick={handleVerifyOtp}
                                disabled={otp.join('').length !== 6 || status === 'otp_verifying'}
                                className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-300 text-white font-bold py-3 px-8 transition-colors w-full max-w-xs"
                            >
                                {status === 'otp_verifying' ? f('otp_verifying_it', 'otp_verifying_en') : f('otp_verify_cta_it', 'otp_verify_cta_en')}
                            </button>
                            <button
                                onClick={handleRequestOtp}
                                disabled={status === 'otp_verifying'}
                                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                            >
                                {f('otp_resend_it', 'otp_resend_en')}
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Confirm and Sign */}
                {status === 'signing' && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h2 className="text-lg font-bold text-gray-800 mb-4 text-center">{f('signing_step_title_it', 'signing_step_title_en')}</h2>

                        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-6 text-sm text-green-700 text-center">
                            {f('signing_identity_verified_it', 'signing_identity_verified_en')}
                        </div>

                        <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm text-gray-700">
                            <p className="mb-2">
                                {applyTokens(f('signing_ack_template_1_it', 'signing_ack_template_1_en'), {
                                    name: signerName,
                                    num: contract?.contractNumber || '',
                                })}
                            </p>
                            <p>
                                {applyTokens(f('signing_ack_template_2_it', 'signing_ack_template_2_en'), { email: signerEmail })}
                            </p>
                        </div>

                        <label className="flex items-start gap-3 mb-6 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={acceptedTerms}
                                onChange={e => setAcceptedTerms(e.target.checked)}
                                className="mt-1 h-5 w-5 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
                            />
                            <span className="text-sm text-gray-700">
                                {f('signing_terms_checkbox_it', 'signing_terms_checkbox_en')}
                            </span>
                        </label>

                        <button
                            onClick={handleSign}
                            disabled={!acceptedTerms}
                            className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-300 text-white font-bold py-4 transition-colors text-lg"
                        >
                            {f('signing_submit_cta_it', 'signing_submit_cta_en')}
                        </button>
                    </div>
                )}

                {/* Step 4: Signed */}
                {status === 'signed' && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
                        <div className="text-5xl mb-4">&#9989;</div>
                        <h2 className="text-2xl font-bold text-green-700 mb-2">{f('signed_title_it', 'signed_title_en')}</h2>
                        <p className="text-gray-600 mb-2">
                            {applyTokens(f('signed_body_template_it', 'signed_body_template_en'), {
                                date: signedAt
                                    ? new Date(signedAt).toLocaleString(lang === 'it' ? 'it-IT' : 'en-GB', { timeZone: 'Europe/Rome' })
                                    : '',
                            })}
                        </p>
                        <p className="text-gray-500 text-sm mb-6">
                            {f('signed_email_note_it', 'signed_email_note_en')}
                        </p>
                        {signedPdfUrl && (
                            <a
                                href={signedPdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-8 transition-colors"
                            >
                                {f('signed_download_cta_it', 'signed_download_cta_en')}
                            </a>
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="text-center py-6 text-xs text-gray-400">
                Dubai rent 7.0 S.p.A. - Via del Fangario 25, 09122 Cagliari (CA) - P.IVA 04104640927
            </div>
        </div>
    )
}

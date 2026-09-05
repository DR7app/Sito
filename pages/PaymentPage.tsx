import React, { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from '../hooks/useTranslation'
import { getPaymentCopy, type PaymentCopy } from '../utils/siteCopy'

type PayState = 'loading' | 'ready' | 'checking' | 'blocked' | 'confirming' | 'success' | 'error' | 'cancelled'

// 2026-06-06: admin functions sono su platform.dr7ai.com (dr7ai.com e' la
// landing CRM SPA che risponde 200 a tutto → silent fail sulle chiamate admin).
const ADMIN_BASE = 'https://platform.dr7ai.com'

export default function PaymentPage() {
  const { lang } = useTranslation()
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('sessionId')
  const securityToken = searchParams.get('securityToken')
  const orderId = searchParams.get('orderId')

  const [state, setState] = useState<PayState>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [copy, setCopy] = useState<PaymentCopy | null>(null)
  const sdkLoaded = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const copyRef = useRef<PaymentCopy | null>(null)

  // Stable accessor so SDK callbacks (closure-captured) always see latest copy.
  const c = (it: keyof PaymentCopy, en: keyof PaymentCopy): string => {
    const cur = copyRef.current
    if (!cur) return ''
    return cur[lang === 'it' ? it : en] as string
  }

  useEffect(() => {
    let cancelled = false
    getPaymentCopy().then(p => {
      if (cancelled) return
      copyRef.current = p
      setCopy(p)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!copy) return
    if (!sessionId || !securityToken || !orderId) {
      setState('error')
      setErrorMsg(c('error_invalid_link_it', 'error_invalid_link_en'))
      return
    }

    if (sdkLoaded.current) return
    sdkLoaded.current = true

    const script = document.createElement('script')
    script.src = 'https://xpay.nexigroup.com/build/runtime/main-build.js'
    script.async = true
    script.onload = () => {
      initNexiSdk()
    }
    script.onerror = () => {
      setState('error')
      setErrorMsg(c('error_sdk_load_it', 'error_sdk_load_en'))
    }
    document.head.appendChild(script)
  }, [sessionId, securityToken, orderId, copy])

  function initNexiSdk() {
    const XPay = (window as any).XPay
    if (!XPay) {
      setState('error')
      setErrorMsg(c('error_sdk_unavailable_it', 'error_sdk_unavailable_en'))
      return
    }

    try {
      XPay.init({
        baseConfig: {
          apiKey: sessionId!,
          environment: 'PROD',
        },
        paymentParams: {
          securityToken: securityToken!,
        },
        customConfig: {
          targetElement: '#nexi-payment-container',
          showCloseButton: false,
          language: 'ita',
        },
        onPaymentStarted: () => {
          console.log('[PaymentPage] Payment started')
          setState('checking')
        },
        onPaymentComplete: async (result: any) => {
          console.log('[PaymentPage] Payment complete:', result)
          try {
            setState('checking')
            const res = await fetch(`${ADMIN_BASE}/.netlify/functions/nexi-check-card`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, orderId }),
            })
            const data = await res.json()

            if (!data.allowed) {
              setState('blocked')
              setErrorMsg(data.message || c('blocked_default_message_it', 'blocked_default_message_en'))
              return
            }

            setState('success')
            setTimeout(() => {
              window.location.href = `/payment-success?order=${orderId}`
            }, 2000)
          } catch (e: any) {
            console.error('[PaymentPage] Check card error:', e)
            setState('error')
            setErrorMsg(c('error_check_card_it', 'error_check_card_en'))
          }
        },
        onPaymentError: (error: any) => {
          console.error('[PaymentPage] Payment error:', error)
          setState('error')
          setErrorMsg(c('error_payment_failed_it', 'error_payment_failed_en'))
        },
        onPaymentCancelled: () => {
          setState('cancelled')
        },
      })

      setState('ready')
    } catch (e: any) {
      console.error('[PaymentPage] SDK init error:', e)
      setState('error')
      setErrorMsg(c('error_sdk_init_it', 'error_sdk_init_en'))
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a1a] flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <img src="/DR7logo1.png" alt="DR7" className="h-12 mx-auto mb-2" />
        <p className="text-gray-400 text-sm">{c('subtitle_it', 'subtitle_en')}</p>
      </div>

      <div className="bg-[#1a1a2e] rounded-2xl max-w-lg w-full p-6 border border-gray-700 shadow-2xl">

        {state === 'loading' && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-gray-400">{c('loading_it', 'loading_en')}</p>
          </div>
        )}

        {state === 'ready' && (
          <>
            <h2 className="text-xl font-bold text-white mb-4 text-center">{c('ready_title_it', 'ready_title_en')}</h2>
            <p className="text-gray-400 text-sm text-center mb-6">{c('ready_subtitle_it', 'ready_subtitle_en')}</p>
            <p className="text-red-400 text-xs text-center mb-4">{c('ready_prepaid_warning_it', 'ready_prepaid_warning_en')}</p>
            <div id="nexi-payment-container" ref={containerRef} className="min-h-[300px]"></div>
          </>
        )}

        {state === 'checking' && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-white font-semibold">{c('checking_title_it', 'checking_title_en')}</p>
            <p className="text-gray-400 text-sm mt-2">{c('checking_subtitle_it', 'checking_subtitle_en')}</p>
          </div>
        )}

        {state === 'blocked' && (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-red-400 mb-2">{c('blocked_title_it', 'blocked_title_en')}</h3>
            <p className="text-gray-300 text-sm mb-4">{errorMsg}</p>
            <p className="text-gray-400 text-xs">{c('blocked_help_it', 'blocked_help_en')}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 px-6 py-3 bg-white text-black font-semibold text-sm hover:bg-gray-200 transition-colors"
            >
              {c('blocked_retry_cta_it', 'blocked_retry_cta_en')}
            </button>
          </div>
        )}

        {state === 'success' && (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-green-400 mb-2">{c('success_title_it', 'success_title_en')}</h3>
            <p className="text-gray-400 text-sm">{c('success_redirect_it', 'success_redirect_en')}</p>
          </div>
        )}

        {state === 'cancelled' && (
          <div className="text-center py-12">
            <h3 className="text-xl font-bold text-gray-400 mb-2">{c('cancelled_title_it', 'cancelled_title_en')}</h3>
            <p className="text-gray-500 text-sm mb-4">{c('cancelled_subtitle_it', 'cancelled_subtitle_en')}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-white text-black font-semibold text-sm hover:bg-gray-200 transition-colors"
            >
              {c('cancelled_retry_cta_it', 'cancelled_retry_cta_en')}
            </button>
          </div>
        )}

        {state === 'error' && (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-red-400 mb-2">{c('error_title_it', 'error_title_en')}</h3>
            <p className="text-gray-400 text-sm">{errorMsg}</p>
          </div>
        )}
      </div>

      <p className="text-gray-600 text-xs mt-6 text-center">
        {c('footer_secure_note_it', 'footer_secure_note_en')}
      </p>
    </div>
  )
}

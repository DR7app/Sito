import React from 'react';
import { getContactCopy } from '../../utils/siteCopy';
import { useTranslation } from '../../hooks/useTranslation';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  whatsappUrl: string;
}

// Module-level cache so the boundary (a class component) can pick up the
// admin-edited WhatsApp URL without needing hooks. Loaded once on first
// import; the fallback is the historical hardcoded URL.
let cachedWhatsappUrl = 'https://wa.me/393457905205';
void (async () => {
  try {
    const cp = await getContactCopy();
    if (cp.whatsapp_url) cachedWhatsappUrl = cp.whatsapp_url;
  } catch { /* keep fallback */ }
})();

/**
 * BookingErrorBoundary — local error boundary for the CarBookingWizard.
 * Catches any runtime error in the booking flow and shows a safe fallback UI
 * instead of a blank screen. Design is consistent with DR7 dark theme.
 */
class BookingErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, whatsappUrl: cachedWhatsappUrl };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[BookingErrorBoundary] Errore nel wizard di prenotazione:', error, info.componentStack);
    // Refresh from cache in case it loaded after construction.
    if (cachedWhatsappUrl !== this.state.whatsappUrl) {
      this.setState({ whatsappUrl: cachedWhatsappUrl });
    }
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return <BookingErrorFallback whatsappUrl={this.state.whatsappUrl} onRetry={this.handleReload} />;
    }

    return this.props.children;
  }
}

/**
 * Fallback UI. Split out of the class so it can use the translation hook —
 * class components cannot call hooks.
 */
const BookingErrorFallback: React.FC<{ whatsappUrl: string; onRetry: () => void }> = ({ whatsappUrl, onRetry }) => {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-md w-full text-center">
        <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">{t({ it: 'Errore temporaneo', en: 'Temporary error' })}</h2>
        <p className="text-gray-400 text-sm mb-6">
          {t({ it: 'Si è verificato un problema nel modulo di prenotazione. Riprova o contattaci via WhatsApp.', en: 'Something went wrong in the booking form. Please try again or contact us on WhatsApp.' })}
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={onRetry}
            className="w-full py-3 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-colors text-sm"
          >
            {t({ it: 'Riprova', en: 'Try again' })}
          </button>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 bg-gray-700 text-white font-bold rounded-full hover:bg-gray-600 transition-colors text-sm"
          >
            {t({ it: 'Contattaci su WhatsApp', en: 'Contact us on WhatsApp' })}
          </a>
          <button
            onClick={() => window.location.href = '/'}
            className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
          >
            {t({ it: 'Torna alla home', en: 'Back to home' })}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookingErrorBoundary;

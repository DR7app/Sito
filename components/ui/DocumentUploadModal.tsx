import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XIcon } from '../icons/Icons';
import { supabase } from '../../supabaseClient';
import { useTranslation } from '../../hooks/useTranslation';

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

const FUNCTIONS_BASE =
  import.meta.env.VITE_FUNCTIONS_BASE ??
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:8888'
    : window.location.origin);

const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({ isOpen, onClose, userId }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<'welcome' | 'upload' | 'confirm-skip'>('welcome');
  const [patenteFront, setPatenteFront] = useState<File | null>(null);
  const [patenteBack, setPatenteBack] = useState<File | null>(null);
  const [cartaIdentitaFront, setCartaIdentitaFront] = useState<File | null>(null);
  const [cartaIdentitaBack, setCartaIdentitaBack] = useState<File | null>(null);
  const [codiceFiscale, setCodiceFiscale] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const uploadFile = async (file: File, bucket: string, prefix: string): Promise<boolean> => {
    try {
      // Get auth token + identity for authenticated upload
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const meta = session?.user?.user_metadata || {};
      const fullName =
        meta.full_name ||
        meta.fullName ||
        meta.name ||
        [meta.nome, meta.cognome].filter(Boolean).join(' ').trim();

      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', bucket);
      formData.append('userId', userId);
      formData.append('prefix', prefix);
      if (session?.user?.email) formData.append('userEmail', session.user.email);
      if (fullName) formData.append('userFullName', fullName);

      const response = await fetch(`${FUNCTIONS_BASE}/.netlify/functions/upload-file`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Upload error:', errorData);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Upload error:', error);
      return false;
    }
  };

  const handleSubmit = async () => {
    if (!patenteFront || !patenteBack || !cartaIdentitaFront || !cartaIdentitaBack || !codiceFiscale) {
      alert(t({ it: "Per favore carica tutti i documenti richiesti", en: "Please upload all the required documents" }));
      return;
    }

    setUploading(true);

    try {
      const uploads = [
        uploadFile(patenteFront, 'driver-licenses', 'patenteFront'),
        uploadFile(patenteBack, 'driver-licenses', 'patenteBack'),
        uploadFile(cartaIdentitaFront, 'carta-identita', 'cartaIdentitaFront'),
        uploadFile(cartaIdentitaBack, 'carta-identita', 'cartaIdentitaBack'),
        uploadFile(codiceFiscale, 'codice-fiscale', 'codiceFiscaleFront'),
      ];

      const results = await Promise.all(uploads);
      const allSuccess = results.every(r => r === true);

      if (allSuccess) {
        alert(t({ it: "Documenti caricati con successo! Il nostro team li verificherà a breve.", en: "Documents uploaded successfully! Our team will review them shortly." }));
        onClose();
      } else {
        alert(t({ it: "Errore nel caricamento di alcuni documenti. Riprova.", en: "Error uploading some documents. Please try again." }));
      }
    } catch (error) {
      console.error('Error uploading documents:', error);
      alert(t({ it: "Errore nel caricamento dei documenti", en: "Error uploading the documents" }));
    } finally {
      setUploading(false);
    }
  };

  const handleSkip = () => {
    setStep('confirm-skip');
  };

  const handleConfirmSkip = () => {
    onClose();
  };

  const handleCancelSkip = () => {
    setStep('welcome');
  };

  // Welcome step
  if (step === 'welcome') {
    return (
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-gray-900 border-2 border-yellow-500 rounded-t-xl sm:rounded-xl shadow-2xl max-w-2xl w-full max-h-[90dvh] overflow-y-auto overscroll-contain"
            >
              <div className="p-6 md:p-8">
                <div className="text-center mb-6">
                  <div className="inline-block bg-yellow-500 text-black px-4 py-2 font-bold text-lg mb-4">
                    {t({ it: 'FINO A 60€ DI VANTAGGI', en: 'UP TO €60 IN BENEFITS' })}
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
                    {t({ it: 'Grazie per esserti iscritto al sito ufficiale DR7 S.p.A.', en: 'Thank you for signing up on the official DR7 S.p.A. website.' })}
                  </h2>
                </div>

                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6 text-left">
                  <p className="text-white mb-4">
                    {t({ it: "Per completare il tuo profilo ed accedere ai vantaggi esclusivi riservati ai membri registrati, ti chiediamo di caricare i tuoi documenti nell'area personale:", en: 'To complete your profile and access the exclusive benefits reserved for registered members, please upload your documents in your personal area:' })}
                  </p>

                  <div className="mb-4">
                    <p className="font-semibold text-white mb-2">{t({ it: "Documenti necessari (fronte e retro):", en: "Required documents (front and back):" })}</p>
                    <ul className="list-disc list-inside text-gray-300 space-y-1">
                      <li>{t({ it: "Carta d'Identità", en: "ID card" })}</li>
                      <li>{t({ it: "Codice Fiscale", en: "Tax code" })}</li>
                      <li>{t({ it: "Patente di guida", en: "Driving licence" })}</li>
                    </ul>
                  </div>

                  <div className="bg-yellow-500/10 border border-yellow-500 rounded-lg p-4 mb-4">
                    <p className="text-white font-semibold mb-2">{t({ it: "Una volta caricati i documenti, riceverai:", en: "Once your documents are uploaded, you will receive:" })}</p>
                    <ul className="text-gray-300 space-y-1">
                      <li>✓ <span className="text-yellow-500 font-bold">10€</span> {t({ it: "sui lavaggi", en: "on car washes" })}</li>
                      <li>✓ {t({ it: "fino a", en: "up to" })} <span className="text-yellow-500 font-bold">50€</span> {t({ it: "sui noleggi", en: "on rentals" })}</li>
                    </ul>
                  </div>

                  <div className="text-gray-300 text-sm">
                    <p className="mb-2"><strong>{t({ it: "Inoltre:", en: "Also:" })}</strong></p>
                    <p>{t({ it: '7 giorni prima del tuo compleanno riceverai un nostro messaggio dedicato con un', en: '7 days before your birthday you will receive a dedicated message from us with a' })} <strong className="text-yellow-500">{t({ it: 'Buono Auguri DR7', en: 'DR7 Birthday Voucher' })}</strong>{t({ it: ', utilizzabile su qualunque servizio.', en: ', usable on any service.' })}</p>
                  </div>
                </div>

                <p className="text-center text-gray-400 mb-6 italic">
                  {t({ it: 'Grazie per aver scelto DR7 S.p.A.', en: 'Thank you for choosing DR7 S.p.A.' })}<br />
                  {t({ it: 'La nuova esperienza della mobilità di lusso in Italia.', en: 'The new luxury mobility experience in Italy.' })}
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={handleSkip}
                    className="flex-1 px-6 py-3 bg-gray-700 text-white font-semibold hover:bg-gray-600 transition-colors"
                  >
                    {t({ it: 'Salto', en: 'Skip' })}
                  </button>
                  <button
                    onClick={() => setStep('upload')}
                    className="flex-1 px-6 py-3 bg-yellow-500 text-black font-bold hover:bg-yellow-600 transition-colors"
                  >
                    {t({ it: 'Carica Documenti', en: 'Upload Documents' })}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  }

  // Confirm skip step
  if (step === 'confirm-skip') {
    return (
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-gray-900 border-2 border-red-500 rounded-t-xl sm:rounded-xl shadow-2xl max-w-lg w-full max-h-[90dvh] overflow-y-auto overscroll-contain"
            >
              <div className="p-6 md:p-8">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-red-500">
                    <span className="text-4xl text-red-500 font-bold">!</span>
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-4">
                    {t({ it: 'Sei sicuro di voler continuare senza caricare i tuoi documenti?', en: 'Are you sure you want to continue without uploading your documents?' })}
                  </h2>
                  <div className="bg-yellow-500/10 border border-yellow-500 rounded-lg p-4 mb-4 text-left">
                    <p className="text-white mb-3">
                      {t({ it: 'Caricandoli ora', en: 'Uploading them now' })} <strong>{t({ it: '(CI, CF, Patente)', en: '(ID, tax code, licence)' })}</strong> {t({ it: 'attivi subito', en: 'instantly unlocks' })} <strong className="text-yellow-500">{t({ it: '10€ sui lavaggi e fino a 50€ sui noleggi', en: '€10 on car washes and up to €50 on rentals' })}</strong> {t({ it: 'e ottieni l\'accesso completo ai nostri servizi premium.', en: 'and gives you full access to our premium services.' })}
                    </p>
                    <p className="text-red-400 font-semibold">
                      {t({ it: 'Non perdere il tuo vantaggio esclusivo.', en: 'Do not miss out on your exclusive benefit.' })}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleConfirmSkip}
                    className="flex-1 px-6 py-3 bg-gray-700 text-white font-semibold hover:bg-gray-600 transition-colors"
                  >
                    {t({ it: 'Continua Senza Caricare', en: 'Continue Without Uploading' })}
                  </button>
                  <button
                    onClick={handleCancelSkip}
                    className="flex-1 px-6 py-3 bg-yellow-500 text-black font-bold hover:bg-yellow-600 transition-colors"
                  >
                    {t({ it: 'Torna Indietro', en: 'Go Back' })}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  }

  // Upload step
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative bg-gray-900 border-2 border-yellow-500 rounded-t-xl sm:rounded-xl shadow-2xl max-w-2xl w-full max-h-[90dvh] overflow-y-auto overscroll-contain"
          >
            <button
              onClick={handleSkip}
              className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors z-10"
              aria-label={t({ it: "Chiudi", en: "Close" })}
            >
              <XIcon className="w-6 h-6" />
            </button>

            <div className="p-6 md:p-8">
              <div className="text-center mb-6">
                <div className="inline-block bg-yellow-500 text-black px-4 py-2 font-bold text-lg mb-4">
                  {t({ it: 'FINO A 60€ DI VANTAGGI', en: 'UP TO €60 IN BENEFITS' })}
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
                  {t({ it: 'Carica i Tuoi Documenti', en: 'Upload Your Documents' })}
                </h2>
                <p className="text-gray-300">
                  {t({ it: 'Carica i tuoi documenti ora e ricevi 10€ sui lavaggi e fino a 50€ sui noleggi!', en: 'Upload your documents now and get €10 on car washes and up to €50 on rentals!' })}
                </p>
              </div>

              <div className="space-y-4">
                {/* Patente Front */}
                <div>
                  <label className="block text-sm font-semibold text-white mb-2">
                    {t({ it: 'Patente (Fronte)', en: 'Licence (Front)' })} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="file"
                    onChange={(e) => setPatenteFront(e.target.files?.[0] || null)}
                    accept="image/*,.pdf"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm
                      file:mr-4 file:py-2 file:px-4 file:border-0
                      file:text-sm file:font-semibold file:bg-yellow-500 file:text-black
                      hover:file:bg-yellow-600 file:cursor-pointer"
                  />
                  {patenteFront && (
                    <p className="text-xs text-green-400 mt-1">✓ {patenteFront.name}</p>
                  )}
                </div>

                {/* Patente Back */}
                <div>
                  <label className="block text-sm font-semibold text-white mb-2">
                    {t({ it: 'Patente (Retro)', en: 'Licence (Back)' })} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="file"
                    onChange={(e) => setPatenteBack(e.target.files?.[0] || null)}
                    accept="image/*,.pdf"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm
                      file:mr-4 file:py-2 file:px-4 file:border-0
                      file:text-sm file:font-semibold file:bg-yellow-500 file:text-black
                      hover:file:bg-yellow-600 file:cursor-pointer"
                  />
                  {patenteBack && (
                    <p className="text-xs text-green-400 mt-1">✓ {patenteBack.name}</p>
                  )}
                </div>

                {/* Carta Identità Front */}
                <div>
                  <label className="block text-sm font-semibold text-white mb-2">
                    {t({ it: "Carta d'Identità (Fronte)", en: 'ID card (Front)' })} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="file"
                    onChange={(e) => setCartaIdentitaFront(e.target.files?.[0] || null)}
                    accept="image/*,.pdf"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm
                      file:mr-4 file:py-2 file:px-4 file:border-0
                      file:text-sm file:font-semibold file:bg-yellow-500 file:text-black
                      hover:file:bg-yellow-600 file:cursor-pointer"
                  />
                  {cartaIdentitaFront && (
                    <p className="text-xs text-green-400 mt-1">✓ {cartaIdentitaFront.name}</p>
                  )}
                </div>

                {/* Carta Identità Back */}
                <div>
                  <label className="block text-sm font-semibold text-white mb-2">
                    {t({ it: "Carta d'Identità (Retro)", en: 'ID card (Back)' })} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="file"
                    onChange={(e) => setCartaIdentitaBack(e.target.files?.[0] || null)}
                    accept="image/*,.pdf"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm
                      file:mr-4 file:py-2 file:px-4 file:border-0
                      file:text-sm file:font-semibold file:bg-yellow-500 file:text-black
                      hover:file:bg-yellow-600 file:cursor-pointer"
                  />
                  {cartaIdentitaBack && (
                    <p className="text-xs text-green-400 mt-1">✓ {cartaIdentitaBack.name}</p>
                  )}
                </div>

                {/* Codice Fiscale */}
                <div>
                  <label className="block text-sm font-semibold text-white mb-2">
                    {t({ it: 'Codice Fiscale', en: 'Tax code' })} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="file"
                    onChange={(e) => setCodiceFiscale(e.target.files?.[0] || null)}
                    accept="image/*,.pdf"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white text-sm
                      file:mr-4 file:py-2 file:px-4 file:border-0
                      file:text-sm file:font-semibold file:bg-yellow-500 file:text-black
                      hover:file:bg-yellow-600 file:cursor-pointer"
                  />
                  {codiceFiscale && (
                    <p className="text-xs text-green-400 mt-1">✓ {codiceFiscale.name}</p>
                  )}
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleSkip}
                  className="flex-1 px-6 py-3 bg-gray-700 text-white font-semibold hover:bg-gray-600 transition-colors"
                >
                  {t({ it: 'Salta', en: 'Skip' })}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={uploading || !patenteFront || !patenteBack || !cartaIdentitaFront || !cartaIdentitaBack || !codiceFiscale}
                  className="flex-1 px-6 py-3 bg-yellow-500 text-black font-bold hover:bg-yellow-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? t({ it: "Caricamento...", en: "Uploading..." }) : t({ it: "Carica Documenti", en: "Upload Documents" })}
                </button>
              </div>

              <p className="text-xs text-gray-400 text-center mt-4">
                Formati supportati: JPG, PNG, PDF • Max 5MB per file
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default DocumentUploadModal;

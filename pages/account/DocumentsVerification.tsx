import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import { preparaFileDocumento } from '../../utils/immagineDocumento';
import { supabase } from '../../supabaseClient';

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const statusMap: Record<string, { text: string; color: string }> = {
        pending_verification: { text: 'In Revisione', color: 'bg-yellow-500/20 text-yellow-400' },
        pending: { text: 'In Revisione', color: 'bg-yellow-500/20 text-yellow-400' },
        verified: { text: 'Verificato', color: 'bg-green-500/20 text-green-400' },
        rejected: { text: 'Rifiutato', color: 'bg-red-500/20 text-red-400' },
    };
    // Uno stato sconosciuto non deve far sparire la riga: vale come in revisione.
    const v = statusMap[status] || statusMap.pending_verification;
    return <span className={`px-2 py-1 text-xs font-medium ${v.color}`}>{v.text}</span>;
}

const DocumentsVerification = () => {
    const { user } = useAuth();
    const { t } = useTranslation();

    const [uploadedDocuments, setUploadedDocuments] = useState<any[]>([]);
    const [loadingDocuments, setLoadingDocuments] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [uploadedSteps, setUploadedSteps] = useState<Set<number>>(new Set());
    const [files, setFiles] = useState<{ [key: number]: File | null }>({});

    // Define upload steps
    const uploadSteps = [
        { key: 'cartaIdentitaFront', label: t({ it: "Carta d'Identità (Fronte)", en: 'ID card (Front)' }), bucket: 'carta-identita', required: true },
        { key: 'cartaIdentitaBack', label: t({ it: "Carta d'Identità (Retro)", en: 'ID card (Back)' }), bucket: 'carta-identita', required: true },
        { key: 'codiceFiscaleFront', label: t({ it: 'Codice Fiscale (Fronte)', en: 'Tax code (Front)' }), bucket: 'codice-fiscale', required: true },
        { key: 'codiceFiscaleBack', label: t({ it: 'Codice Fiscale (Retro)', en: 'Tax code (Back)' }), bucket: 'codice-fiscale', required: true },
        { key: 'patenteFront', label: t({ it: 'Patente (Fronte) - Opzionale', en: 'Licence (Front) - Optional' }), bucket: 'driver-licenses', required: false },
        { key: 'patenteBack', label: t({ it: 'Patente (Retro) - Opzionale', en: 'Licence (Back) - Optional' }), bucket: 'driver-licenses', required: false }
    ];

    // Refresh user session on component mount
    useEffect(() => {
        const refreshSession = async () => {
            const { data: { session }, error } = await supabase.auth.refreshSession();
            if (error) {
                console.error('Failed to refresh session:', error);
            }
        };

        refreshSession();
    }, []);

    // Fetch uploaded documents from storage buckets
    useEffect(() => {
        const fetchDocuments = async () => {
            if (!user?.id) {
                setLoadingDocuments(false);
                return;
            }

            setLoadingDocuments(true);
            try {
                const buckets = ['carta-identita', 'codice-fiscale', 'driver-licenses'];
                const allDocs: any[] = [];

                // Lo stato vero sta in user_documents: prima la pagina
                // scriveva "Verificato" su tutto quello che trovava in
                // archivio, mentre in "Verifica Documenti" il documento era
                // ancora in attesa.
                const statoPerPercorso = new Map<string, string>();
                const { data: righe } = await supabase
                    .from('user_documents')
                    .select('file_path, document_type, status, upload_date')
                    .eq('user_id', user.id);
                (righe || []).forEach(r => {
                    if (r.file_path) statoPerPercorso.set(r.file_path, r.status || 'pending_verification');
                });

                for (const bucket of buckets) {
                    const { data: files, error } = await supabase.storage
                        .from(bucket)
                        .list(user.id);

                    if (!error && files) {
                        // Filter out placeholder files and add to documents list
                        const validFiles = files.filter(f => f.name !== '.emptyFolderPlaceholder');
                        validFiles.forEach(file => {
                            const percorso = `${user.id}/${file.name}`;
                            allDocs.push({
                                id: `${bucket}-${file.name}`,
                                document_type: file.name.split('_')[0] || 'document',
                                bucket: bucket,
                                file_path: percorso,
                                upload_date: file.created_at || new Date().toISOString(),
                                // Finche' l'ufficio non lo verifica resta in
                                // revisione, esattamente come nel gestionale.
                                status: statoPerPercorso.get(percorso) || 'pending_verification',
                            });
                        });
                    }
                }

                setUploadedDocuments(allDocs);

                // Mark steps as uploaded based on found documents
                const newUploadedSteps = new Set<number>();
                allDocs.forEach(doc => {
                    const stepIndex = uploadSteps.findIndex(step =>
                        doc.file_path.includes(step.key) || doc.document_type === step.key
                    );
                    if (stepIndex !== -1) {
                        newUploadedSteps.add(stepIndex);
                    }
                });
                setUploadedSteps(newUploadedSteps);
            } catch (error) {
                console.error('Error fetching documents:', error);
            } finally {
                setLoadingDocuments(false);
            }
        };

        fetchDocuments();
    }, [user?.id]);

    const handleFileChange = (stepIndex: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setFiles(prev => ({ ...prev, [stepIndex]: file }));
        }
    };

    const handleUploadStep = async (stepIndex: number) => {
        if (!user || !files[stepIndex]) return;

        const step = uploadSteps[stepIndex];
        setUploading(true);

        try {
            console.log(`Uploading ${step.key} to ${step.bucket} via Netlify function`);

            const pronto = await preparaFileDocumento(files[stepIndex]!);
            const formData = new FormData();
            formData.append('file', pronto);
            formData.append('bucket', step.bucket);
            formData.append('userId', user.id);
            formData.append('prefix', step.key);
            formData.append('userEmail', user.email || '');
            formData.append('userFullName', user.fullName || '');

            const response = await fetch('/.netlify/functions/upload-file', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Caricamento non riuscito' }));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const result = await response.json();

            if (result.ok) {
                console.log(`Successfully uploaded ${step.key} to ${result.path}`);

                // Mark step as uploaded
                setUploadedSteps(prev => new Set(prev).add(stepIndex));

                // Clear file
                setFiles(prev => ({ ...prev, [stepIndex]: null }));

                // Il documento appena caricato riempie i campi ancora vuoti
                // della scheda: prima si caricavano le foto e "Dettagli
                // Profilo" restava comunque a meta'.
                void completaSchedaDalDocumento(pronto);

                alert(`${step.label} — ${t({ it: 'caricato con successo!', en: 'uploaded successfully!' })}`);
            } else {
                throw new Error(t({ it: "Caricamento non riuscito", en: "Upload failed" }));
            }
        } catch (error: any) {
            console.error(`Exception uploading ${step.key}:`, error);
            alert(`${t({ it: 'Errore nel caricamento:', en: 'Upload error:' })} ${error.message || t({ it: 'Caricamento non riuscito', en: 'Upload failed' })}`);
        } finally {
            setUploading(false);
        }
    };

    /**
     * Legge il documento appena caricato e scrive nella scheda cliente solo
     * i campi ancora vuoti. Niente sovrascritture: quello che la persona ha
     * gia' messo resta.
     */
    const completaSchedaDalDocumento = async (file: File) => {
        if (!user?.id) return;
        try {
            const base64 = await new Promise<string>((risolvi, rifiuta) => {
                const lettore = new FileReader();
                lettore.onload = () => {
                    const testo = String(lettore.result || '');
                    risolvi(testo.includes(',') ? testo.split(',')[1] : testo);
                };
                lettore.onerror = () => rifiuta(new Error('lettura file non riuscita'));
                lettore.readAsDataURL(file);
            });

            const res = await fetch('/.netlify/functions/extract-document-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: base64 }),
            });
            if (!res.ok) return;
            const json = await res.json();
            const dati = json.data || json.extractedData;
            if (!dati) return;

            const { data: scheda } = await supabase
                .from('customers_extended')
                .select('*')
                .eq('user_id', user.id)
                .maybeSingle();
            if (!scheda) return;

            const aggiornamento: Record<string, any> = {};
            const scriviSeVuoto = (colonna: string, valore?: string) => {
                if (valore && !String(scheda[colonna] ?? '').trim()) aggiornamento[colonna] = valore;
            };
            scriviSeVuoto('nome', dati.nome);
            scriviSeVuoto('cognome', dati.cognome);
            scriviSeVuoto('sesso', dati.sesso);
            scriviSeVuoto('data_nascita', dati.data_nascita);
            scriviSeVuoto('citta_nascita', dati.luogo_nascita);
            scriviSeVuoto('provincia_nascita', dati.provincia_nascita?.toUpperCase());
            scriviSeVuoto('codice_fiscale', dati.codice_fiscale?.toUpperCase());
            scriviSeVuoto('indirizzo', dati.indirizzo);
            scriviSeVuoto('numero_civico', dati.numero_civico);
            scriviSeVuoto('codice_postale', dati.codice_postale);
            scriviSeVuoto('citta_residenza', dati.citta_residenza);
            scriviSeVuoto('provincia_residenza', dati.provincia_residenza?.toUpperCase());

            const meta = { ...(scheda.metadata || {}) };
            const metaSeVuoto = (chiave: string, valore?: string) => {
                if (valore && !String(meta[chiave] ?? '').trim()) meta[chiave] = valore;
            };
            metaSeVuoto('tipo_patente', dati.patente_tipo);
            metaSeVuoto('numero_patente', dati.patente_numero);
            metaSeVuoto('patente_emessa_da', dati.patente_ente);
            // La data vera di conseguimento sta sul retro (categoria B).
            metaSeVuoto('patente_data_rilascio', dati.patente_conseguimento || dati.patente_rilascio);
            metaSeVuoto('patente_scadenza', dati.patente_scadenza);
            if (JSON.stringify(meta) !== JSON.stringify(scheda.metadata || {})) {
                aggiornamento.metadata = meta;
            }

            if (Object.keys(aggiornamento).length === 0) return;
            const { error } = await supabase
                .from('customers_extended')
                .update(aggiornamento)
                .eq('id', scheda.id);
            if (error) console.error('Scheda non aggiornata dal documento:', error);
        } catch (err) {
            console.warn('Lettura documento per la scheda non riuscita:', err);
        }
    };

    const getDocumentUrl = async (doc: any) => {
        try {
            console.log(`Requesting signed URL for bucket: ${doc.bucket}, path: ${doc.file_path}`);
            const { data, error } = await supabase.storage
                .from(doc.bucket)
                .createSignedUrl(doc.file_path, 3600);

            if (error) throw error;
            if (!data || !data.signedUrl) throw new Error(t({ it: "URL del documento non disponibile", en: "Document URL not available" }));

            console.log('Opening document URL:', data.signedUrl);
            window.open(data.signedUrl, '_blank');
        } catch (error: any) {
            console.error('Error viewing document:', error);
            alert(`Impossibile visualizzare il documento. Riprova più tardi.\nErrore: ${error.message || 'Errore sconosciuto'}`);
        }
    };

    const getDocumentLabel = (docType: string) => {
        const labels: { [key: string]: string } = {
            cartaIdentitaFront: 'Carta d\'Identità (Fronte)',
            cartaIdentitaBack: 'Carta d\'Identità (Retro)',
            codiceFiscaleFront: 'Codice Fiscale (Fronte)',
            codiceFiscaleBack: 'Codice Fiscale (Retro)',
            patenteFront: 'Patente (Fronte)',
            patenteBack: 'Patente (Retro)'
        };
        return labels[docType] || docType;
    };

    if (!user) return null;

    const hasUploadedDocs = uploadedDocuments.length > 0;

    return (
        <div className="space-y-6">
            {/* Uploaded Documents Section */}
            {hasUploadedDocs && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-lg">
                    <div className="p-4 md:p-6 border-b border-gray-800">
                        <h2 className="text-xl font-bold text-white">{t({ it: "I Tuoi Documenti", en: "Your Documents" })}</h2>
                        <p className="text-sm text-gray-400 mt-1">{t({ it: "Documenti caricati e il loro stato di verifica", en: "Uploaded documents and their verification status" })}</p>
                    </div>

                    <div className="p-4 md:p-6">
                        {loadingDocuments ? (
                            <div className="text-center py-8">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                                <p className="text-gray-400">{t({ it: "Caricamento documenti...", en: "Loading documents..." })}</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {uploadedDocuments.map((doc) => (
                                    <div key={doc.id} className="flex items-center justify-between bg-gray-800/50 p-4 rounded-lg">
                                        <div className="flex-1">
                                            <p className="text-white font-medium">{getDocumentLabel(doc.document_type)}</p>
                                            <p className="text-xs text-gray-400 mt-1">
                                                Caricato il {new Date(doc.upload_date).toLocaleDateString('it-IT')}
                                            </p>
                                        </div>
                                        <div className="flex items-center space-x-3">
                                            <StatusBadge status={doc.status} />
                                            <button
                                                onClick={() => getDocumentUrl(doc)}
                                                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs transition-colors"
                                            >
                                                Visualizza
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (!confirm(`Elimina ${getDocumentLabel(doc.document_type)}? L'operazione e' definitiva.`)) return
                                                    try {
                                                        const { error } = await supabase.storage.from(doc.bucket).remove([doc.file_path])
                                                        if (error) {
                                                            alert(`Errore: ${error.message}`)
                                                            return
                                                        }
                                                        // Rimuovi dalla lista locale e ricalcola gli step caricati
                                                        const next = uploadedDocuments.filter(d => d.id !== doc.id)
                                                        setUploadedDocuments(next)
                                                        const newSteps = new Set<number>()
                                                        next.forEach(d => {
                                                            const idx = uploadSteps.findIndex(s => d.file_path.includes(s.key) || d.document_type === s.key)
                                                            if (idx !== -1) newSteps.add(idx)
                                                        })
                                                        setUploadedSteps(newSteps)
                                                    } catch (e) {
                                                        alert(`Errore eliminazione: ${e instanceof Error ? e.message : 'sconosciuto'}`)
                                                    }
                                                }}
                                                className="px-3 py-1 bg-red-600/80 hover:bg-red-600 text-white text-xs transition-colors"
                                            >
                                                Elimina
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Upload New Documents Section - All at Once */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg">
                <div className="p-4 md:p-6 border-b border-gray-800">
                    <h2 className="text-xl font-bold text-white">{t({ it: "Carica Documenti", en: "Upload Documents" })}</h2>
                    <p className="text-sm text-gray-400 mt-1">{t({ it: "Seleziona e carica i tuoi documenti per la verifica", en: "Select and upload your documents for verification" })}</p>
                </div>

                <div className="p-4 md:p-6 space-y-4">
                    {uploadSteps.map((step, index) => {
                        const isUploaded = uploadedSteps.has(index);
                        const hasFile = files[index] !== null && files[index] !== undefined;

                        return (
                            <div
                                key={index}
                                className={`bg-gray-800/50 border ${isUploaded ? 'border-green-500/50' : 'border-gray-700'} rounded-lg p-4`}
                            >
                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                            <h3 className="text-base font-semibold text-white">
                                                {step.label}
                                            </h3>
                                            {!step.required && (
                                                <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5">
                                                    Opzionale
                                                </span>
                                            )}
                                            {isUploaded && (
                                                <span className="text-xs text-green-400 flex items-center gap-1">
                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                    </svg>
                                                    Caricato
                                                </span>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <input
                                                type="file"
                                                accept="image/*,.pdf"
                                                onChange={handleFileChange(index)}
                                                disabled={isUploaded}
                                                className="w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:border-0 file:text-sm file:font-semibold file:bg-white file:text-black hover:file:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                            />
                                            {hasFile && !isUploaded && (
                                                <p className="text-xs text-gray-400">
                                                    Selezionato: {files[index]?.name}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleUploadStep(index)}
                                        disabled={uploading || !hasFile || isUploaded}
                                        className="w-full sm:w-auto px-6 py-2 min-h-[44px] bg-white text-black font-bold hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                                    >
                                        {isUploaded ? 'Caricato ✓' : uploading ? 'Caricamento...' : 'Carica'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    <div className="pt-4 border-t border-gray-700">
                        <p className="text-xs text-gray-400">
                            * Carica almeno Carta d'Identità e Codice Fiscale (fronte e retro). La Patente è opzionale.
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                            I documenti saranno verificati dal nostro team entro 24-48 ore.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DocumentsVerification;
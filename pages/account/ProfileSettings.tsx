import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import { getUserCreditBalance, getCreditTransactions } from '../../utils/creditWallet';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import type { CreditTransaction } from '../../utils/creditWallet';
import { splitWalletBalance } from '../../utils/walletCredit';
import CalcolaCFButton from '../../components/ui/CalcolaCFButton';

interface CustomerExtended {
    id: string;
    tipo_cliente: 'persona_fisica' | 'azienda' | 'pubblica_amministrazione';
    nome?: string;
    cognome?: string;
    denominazione?: string;
    codice_fiscale?: string;
    partita_iva?: string;
    indirizzo?: string;
    telefono?: string;
    email?: string;
    pec?: string;
    nazione?: string;
    // Persona Fisica
    sesso?: string;
    data_nascita?: string;
    citta_nascita?: string;
    provincia_nascita?: string;
    citta_residenza?: string;
    provincia_residenza?: string;
    codice_postale?: string;
    numero_civico?: string;
    // Azienda
    codice_destinatario?: string; // SDI
    rappresentante_nome?: string;
    rappresentante_cognome?: string;
    rappresentante_cf?: string;
    rappresentante_ruolo?: string;
    sede_operativa?: string;

    status_cliente?: 'standard' | 'member' | 'elite' | 'blacklist';
    metadata?: any;
    // Fidelity Card — accumulates points from car wash bookings.
    // 1 € spent = 1 punto. At 250 punti the system auto-issues a €25 voucher
    // and the line resets to 0/250 (overflow rolls forward).
    fidelity_points?: number;
    fidelity_lifetime_points?: number;
}

const sanitizeDate = (dateString: string | undefined | null): string | null => {
    if (!dateString) return null;
    const trimmed = dateString.trim();
    return trimmed === '' ? null : trimmed;
};

const ProfileSettings = () => {
    const { user, updateUser } = useAuth();
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        // Basic
        fullName: '',
        email: '',
        phone: '',
        // Persona Fisica
        firstName: '',
        lastName: '',
        sesso: '',
        dataNascita: '',
        cittaNascita: '',
        provinciaNascita: '',
        codiceFiscale: '',
        // Address
        indirizzo: '',
        numeroCivico: '',
        cittaResidenza: '',
        provinciaResidenza: '',
        codicePostale: '',
        // License
        tipoPatente: '',
        numeroPatente: '',
        patenteEmessaDa: '',
        patenteDataRilascio: '',
        patenteScadenza: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [successError, setSuccessError] = useState(false);
    const [creditBalance, setCreditBalance] = useState<number>(0);
    const [bonusTotal, setBonusTotal] = useState<number>(0);
    const [bonusBreakdown, setBonusBreakdown] = useState<Array<{ source: string; amount: number; count: number }>>([]);
    const [showBonusBreakdown, setShowBonusBreakdown] = useState(false);
    const [recentTransactions, setRecentTransactions] = useState<CreditTransaction[]>([]);
    const [allTransactions, setAllTransactions] = useState<CreditTransaction[] | null>(null);
    const [showAllTransactions, setShowAllTransactions] = useState(false);
    const [loadingAllTx, setLoadingAllTx] = useState(false);
    const [isLoadingCredits, setIsLoadingCredits] = useState(true);
    const [extendedProfile, setExtendedProfile] = useState<CustomerExtended | null>(null);
    const [isLoadingProfile, setIsLoadingProfile] = useState(true);

    type ClientStatus = 'Standard' | 'Member' | 'Fidelizzato' | 'Elite';
    const [clientStatus, setClientStatus] = useState<ClientStatus>('Standard');
    const [clubPlan, setClubPlan] = useState<string | null>(null);

    useEffect(() => {
        if (user) {
            setFormData(prev => ({
                ...prev,
                fullName: prev.fullName || user.fullName || '',
                email: prev.email || user.email || '',
                phone: prev.phone || user.phone || ''
            }));
        }
    }, [user]);

    // Fetch credit balance and profile data
    const loadData = async () => {
        if (user?.id) {
            setIsLoadingCredits(true);
            setIsLoadingProfile(true);
            try {
                // Fetch Credits
                const balance = await getUserCreditBalance(user.id);
                const transactions = await getCreditTransactions(user.id, 5);
                setCreditBalance(balance);
                setRecentTransactions(transactions);

                // 2026-08-08: la classificazione credito reale / bonus vive in
                // UN SOLO posto (utils/walletCredit.ts), mirrorato lato admin in
                // netlify/functions/utils/walletCredit.ts. Prima questa lista era
                // ricopiata qui a mano e non coincideva con quella del cron
                // interessi: mancava 'wallet_package_bonus' (il bonus pacchetto
                // finiva nel credito reale) mentre 'admin_manual' era sempre
                // bonus (una ricarica reale registrata a mano finiva nel bonus).
                // Da qui l'inversione ricarica/bonus vista sul profilo.
                const { data: allTxs } = await supabase
                    .from('credit_transactions')
                    .select('amount, transaction_type, reference_type, description')
                    .eq('user_id', user.id);
                const split = splitWalletBalance(balance, allTxs);
                setBonusTotal(split.bonusEur);
                setBonusBreakdown(split.bonusBreakdown.map(b => ({
                    source: b.label,
                    amount: b.amount,
                    count: b.count,
                })));

                // Fetch Extended Profile
                const { data, error } = await supabase
                    .from('customers_extended')
                    .select('*')
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (error) {
                    console.error('Error fetching extended profile:', error);
                }

                if (data) {
                    setExtendedProfile(data);
                    // Update form data from extended profile
                    const isAzienda = data.tipo_cliente === 'azienda';
                    setFormData(prev => ({
                        ...prev,
                        fullName: isAzienda ? data.denominazione : `${data.nome || ''} ${data.cognome || ''}`.trim() || user.fullName || '',
                        phone: data.telefono || user.phone || '',
                        email: data.email || user.email || '',
                        // Persona Fisica fields
                        firstName: data.nome || '',
                        lastName: data.cognome || '',
                        codiceFiscale: data.codice_fiscale || '',
                        sesso: data.sesso || '',
                        dataNascita: data.data_nascita || '',
                        cittaNascita: data.citta_nascita || '',
                        provinciaNascita: data.provincia_nascita || '',
                        // Address
                        indirizzo: data.indirizzo || '',
                        numeroCivico: data.numero_civico || '',
                        cittaResidenza: data.citta_residenza || '',
                        provinciaResidenza: data.provincia_residenza || '',
                        codicePostale: data.codice_postale || '',
                        // License (from metadata)
                        tipoPatente: data.metadata?.tipo_patente || '',
                        numeroPatente: data.metadata?.numero_patente || '',
                        patenteEmessaDa: data.metadata?.patente_emessa_da || '',
                        patenteDataRilascio: data.metadata?.patente_data_rilascio || '',
                        patenteScadenza: data.metadata?.patente_scadenza || ''
                    }));
                } else {
                    // No profile found - we set null to trigger the fallback UI
                    // But we don't set a dummy object anymore to ensure we know it's missing
                    setExtendedProfile(null);
                }

                // --- Client Status — only from admin-set status in customers_extended ---
                const adminStatus = data?.status || null;
                if (adminStatus === 'elite') {
                    setClientStatus('Elite');
                } else if (adminStatus === 'member') {
                    setClientStatus('Member');
                } else {
                    // No status or blacklist → New Entry
                    setClientStatus('Standard');
                }

                // 3. Check DR7 Club subscription
                const { data: clubSub } = await supabase
                    .from('dr7_club_subscriptions')
                    .select('plan, status')
                    .eq('user_id', user.id)
                    .eq('status', 'active')
                    .maybeSingle();
                if (clubSub) {
                    setClubPlan(clubSub.plan === 'annual' ? 'Annuale' : 'Mensile');
                }

            } catch (error) {
                console.error('Error fetching data:', error);
            } finally {
                setIsLoadingCredits(false);
                setIsLoadingProfile(false);
            }
        }
    };

    useEffect(() => {
        loadData();
    }, [user]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (successMessage) setSuccessMessage('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setSuccessMessage('');
        try {
            // Update or Create in customers_extended table
            const nameParts = formData.fullName.trim().split(' ');
            const lastName = nameParts.length > 1 ? nameParts.pop() : '';
            const firstName = nameParts.join(' ');

            const commonData = {
                telefono: formData.phone,
                // If creating new or fallback, these might be useful defaults
                email: formData.email,
            };

            if (extendedProfile && extendedProfile.id) {
                // Update existing profile
                const updateData: any = { ...commonData };

                // For persona_fisica, update personal fields
                if (extendedProfile.tipo_cliente === 'persona_fisica') {
                    updateData.nome = formData.firstName;
                    updateData.cognome = formData.lastName;
                    updateData.codice_fiscale = formData.codiceFiscale?.toUpperCase().trim() || null;
                    updateData.sesso = formData.sesso;
                    updateData.data_nascita = sanitizeDate(formData.dataNascita);
                    updateData.citta_nascita = formData.cittaNascita;
                    updateData.provincia_nascita = formData.provinciaNascita;
                    updateData.indirizzo = formData.indirizzo;
                    updateData.numero_civico = formData.numeroCivico;
                    updateData.citta_residenza = formData.cittaResidenza;
                    updateData.provincia_residenza = formData.provinciaResidenza;
                    updateData.codice_postale = formData.codicePostale;

                    // Update license metadata
                    updateData.metadata = {
                        ...extendedProfile.metadata,
                        tipo_patente: formData.tipoPatente,
                        numero_patente: formData.numeroPatente,
                        patente_emessa_da: formData.patenteEmessaDa,
                        patente_data_rilascio: sanitizeDate(formData.patenteDataRilascio),
                        patente_scadenza: sanitizeDate(formData.patenteScadenza)
                    };
                }

                const { error } = await supabase
                    .from('customers_extended')
                    .update(updateData)
                    .eq('user_id', user!.id);

                if (error) throw error;
            } else {
                // INSERT NEW PROFILE
                // We default to persona_fisica and parse the fullName from the basic form
                const insertData = {
                    user_id: user!.id,
                    tipo_cliente: 'persona_fisica',
                    nome: firstName,
                    cognome: lastName,
                    codice_fiscale: formData.codiceFiscale?.toUpperCase() || null,
                    email: formData.email,
                    telefono: formData.phone,
                    nazione: 'Italia', // Default
                    metadata: {}
                };

                const { error } = await supabase
                    .from('customers_extended')
                    .insert([insertData]);

                if (error) throw error;
            }

            // Reload data to reflect changes
            await loadData();

            // Also update auth user metadata for consistency
            try {
                await updateUser({
                    fullName: formData.fullName || `${formData.firstName} ${formData.lastName}`.trim(),
                    phone: formData.phone
                });
            } catch (authError) {
                console.error("Failed to update auth metadata:", authError);
            }

            setSuccessMessage('Modifiche salvate con successo!');
            setSuccessError(false);
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (error: any) {
            console.error("Failed to update profile", error);
            setSuccessMessage(error?.message || 'Errore nel salvare le modifiche');
            setSuccessError(true);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Credit Wallet Card */}
            <div className="bg-gradient-to-br from-gray-900 to-black border border-gray-800 rounded-lg overflow-hidden">
                <div className="p-4 md:p-6 border-b border-gray-800">
                    <h2 className="text-xl font-bold text-white">{t({ it: "DR7 Credit Wallet", en: "DR7 Credit Wallet" })}</h2>
                    <p className="text-sm text-gray-400 mt-1">{t({ it: "I tuoi crediti disponibili per i servizi DR7", en: "Your available credits for DR7 services" })}</p>
                </div>
                <div className="p-4 md:p-6">
                    {isLoadingCredits ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="w-8 h-8 border-2 border-t-white border-gray-600 rounded-full animate-spin"></div>
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                                <div className="space-y-2 w-full sm:w-auto">
                                    {/* Card-paid portion (earns 0,1%/giorno for DR7 CLUB PRIVILEGE) */}
                                    <div className="flex items-baseline gap-3">
                                        <p className="text-sm text-gray-400 w-40">Credit Wallet</p>
                                        <p className="text-xl font-semibold text-white">€{Math.max(0, creditBalance - bonusTotal).toFixed(2)}</p>
                                    </div>
                                    {/* Bonus — clickable to reveal where it came from */}
                                    <div>
                                        <button
                                            type="button"
                                            onClick={() => setShowBonusBreakdown(v => !v)}
                                            disabled={bonusBreakdown.length === 0}
                                            className="flex items-baseline gap-3 group disabled:cursor-default"
                                        >
                                            <span className="text-sm text-gray-400 w-40 text-left flex items-center gap-1">
                                                Bonus
                                                {bonusBreakdown.length > 0 && (
                                                    <span className={`text-yellow-400 transition-transform inline-block ${showBonusBreakdown ? 'rotate-90' : ''}`}>›</span>
                                                )}
                                            </span>
                                            <span className="text-xl font-semibold text-yellow-400 group-hover:text-yellow-300">€{bonusTotal.toFixed(2)}</span>
                                        </button>
                                        {showBonusBreakdown && bonusBreakdown.length > 0 && (
                                            <div className="ml-3 mt-2 pl-3 border-l-2 border-yellow-500/30 space-y-1.5">
                                                {bonusBreakdown.map(b => (
                                                    <div key={b.source} className="flex items-baseline justify-between gap-4 text-xs">
                                                        <span className="text-gray-400">
                                                            {b.source}
                                                            {b.count > 1 && <span className="text-gray-600 ml-1">× {b.count}</span>}
                                                        </span>
                                                        <span className="font-medium text-yellow-300">+€{b.amount.toFixed(2)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="border-t border-gray-700 pt-2 flex items-baseline gap-3">
                                        <p className="text-sm text-gray-400 w-40">{t({ it: "Saldo Disponibile", en: "Available Balance" })}</p>
                                        <p className="text-4xl font-bold text-white">€{creditBalance.toFixed(2)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {/* Client Status Badge */}
                                    <div className={`px-5 py-3 rounded-full font-bold text-sm flex items-center gap-2 ${
                                        clientStatus === 'Elite'
                                            ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-black'
                                            : clientStatus === 'Member'
                                                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                                                : clientStatus === 'Fidelizzato'
                                                    ? 'bg-gradient-to-r from-blue-400 to-blue-500 text-white'
                                                    : 'bg-gray-700 text-gray-300'
                                    }`}>
                                        {clientStatus === 'Elite' && (
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                            </svg>
                                        )}
                                        {(clientStatus === 'Member' || clientStatus === 'Fidelizzato') && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        )}
                                        {clientStatus === 'Standard' ? 'New Entry' : clientStatus}
                                    </div>
                                    {clubPlan && (
                                        <div className="px-4 py-3 rounded-full font-bold text-sm bg-gradient-to-r from-[#2d8a7e] to-[#247a6f] text-white flex items-center gap-2">
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                            </svg>
                                            DR7 Club {clubPlan}
                                        </div>
                                    )}
                                    {/* Ricarica Button */}
                                    <button
                                        onClick={() => navigate('/credit-wallet')}
                                        className="px-6 py-3 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-colors"
                                    >
                                        Ricarica
                                    </button>
                                </div>
                            </div>

                            {/* Transactions — show last 5 by default, "Mostra tutte" expands to full history */}
                            {recentTransactions.length > 0 && (() => {
                                const txList = (showAllTransactions && allTransactions) ? allTransactions : recentTransactions;
                                return (
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-sm font-semibold text-gray-300">
                                                {showAllTransactions ? 'Tutte le Transazioni' : 'Ultime Transazioni'}
                                                {showAllTransactions && allTransactions && (
                                                    <span className="text-gray-500 font-normal ml-2">({allTransactions.length})</span>
                                                )}
                                            </h3>
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    if (showAllTransactions) {
                                                        setShowAllTransactions(false);
                                                        return;
                                                    }
                                                    if (!allTransactions && user?.id) {
                                                        setLoadingAllTx(true);
                                                        try {
                                                            const all = await getCreditTransactions(user.id, 500);
                                                            setAllTransactions(all);
                                                        } finally {
                                                            setLoadingAllTx(false);
                                                        }
                                                    }
                                                    setShowAllTransactions(true);
                                                }}
                                                disabled={loadingAllTx}
                                                className="text-xs font-semibold text-white/70 hover:text-white transition-colors"
                                            >
                                                {loadingAllTx ? 'Caricamento…' : showAllTransactions ? 'Mostra solo ultime ▲' : 'Mostra tutte ▼'}
                                            </button>
                                        </div>
                                        <div className={`space-y-2 ${showAllTransactions ? 'max-h-96 overflow-y-auto pr-2' : ''}`}>
                                            {txList.map((transaction) => (
                                                <div
                                                    key={transaction.id}
                                                    className="flex items-center justify-between py-2 px-3 bg-gray-800/50 rounded-md"
                                                >
                                                    <div className="flex-1">
                                                        <p className="text-sm text-white">{transaction.description}</p>
                                                        <p className="text-xs text-gray-500">
                                                            {new Date(transaction.created_at).toLocaleDateString('it-IT', {
                                                                day: '2-digit',
                                                                month: '2-digit',
                                                                year: 'numeric',
                                                                hour: '2-digit',
                                                                minute: '2-digit'
                                                            })}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className={`text-sm font-bold ${transaction.transaction_type === 'credit'
                                                            ? 'text-green-400'
                                                            : 'text-red-400'
                                                            }`}>
                                                            {transaction.transaction_type === 'credit' ? '+' : '-'}€{transaction.amount.toFixed(2)}
                                                        </p>
                                                        <p className="text-xs text-gray-500">
                                                            Saldo: €{transaction.balance_after.toFixed(2)}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}
                        </>
                    )}
                </div>
            </div>

            {/* Fidelity Card — 1 € speso al lavaggio auto = 1 punto.
                A 250 punti scatta automaticamente un buono di €25 valido 15 giorni. */}
            {(() => {
                const FIDELITY_MAX = 250
                const points = Math.min(Number(extendedProfile?.fidelity_points || 0), FIDELITY_MAX)
                const lifetime = Number(extendedProfile?.fidelity_lifetime_points || 0)
                const pct = (points / FIDELITY_MAX) * 100
                return (
                    <div className="bg-gradient-to-br from-[#1a2332] to-black border border-[#2d8a7e]/40 rounded-lg overflow-hidden">
                        <div className="p-4 md:p-6 border-b border-gray-800 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <span className="px-3 py-1.5 text-xs font-bold rounded-full bg-gradient-to-r from-[#2d8a7e] to-[#247a6f] text-white">
                                    Fidelity Card
                                </span>
                                <div>
                                    <p className="text-white font-bold">{t({ it: "Programma Fedeltà Prime Wash", en: "Prime Wash Loyalty Programme" })}</p>
                                    <p className="text-gray-400 text-xs">{t({ it: "1 € speso al lavaggio = 1 punto · A 250 punti ricevi un buono di €25", en: "€1 spent on a wash = 1 point · At 250 points you get a €25 voucher" })}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-gray-400 text-xs">{t({ it: "Punti accumulati", en: "Points earned" })}</p>
                                <p className="text-white font-bold text-2xl tabular-nums">
                                    {points}<span className="text-gray-500 text-lg"> / {FIDELITY_MAX}</span>
                                </p>
                            </div>
                        </div>
                        <div className="p-4 md:p-6">
                            <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-[#2d8a7e] to-[#3aada0] transition-all duration-500"
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                            <div className="flex items-center justify-between mt-3 text-xs">
                                <span className="text-gray-400">
                                    Mancano <span className="text-white font-semibold">{Math.max(0, FIDELITY_MAX - points)}</span> punti al prossimo buono
                                </span>
                                {lifetime > 0 && (
                                    <span className="text-gray-500">
                                        Totale punti guadagnati: <span className="text-gray-300 font-semibold">{lifetime}</span>
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                )
            })()}

            {/* Profile Form */}
            <form onSubmit={handleSubmit} className="bg-gray-900/50 border border-gray-800 rounded-lg">
                <div className="p-4 md:p-6 border-b border-gray-800">
                    <h2 className="text-xl font-bold text-white">{t('Profile_Details')}</h2>
                    <p className="text-sm text-gray-400 mt-1">{t('Update_your_information')}</p>
                </div>
                <div className="p-4 md:p-6 space-y-6">

                    {isLoadingProfile ? (
                        <div className="text-center py-4 text-gray-400">{t({ it: "Caricamento dati profilo...", en: "Loading profile data..." })}</div>
                    ) : extendedProfile ? (
                        <>
                            {/* --- Status Badge (Member/Elite) --- */}
                            {extendedProfile.status_cliente && extendedProfile.status_cliente !== 'standard' && extendedProfile.status_cliente !== 'blacklist' && (
                                <div className="mb-4">
                                    <span className={`inline-block px-3 py-1.5 rounded-full text-sm font-bold border ${
                                        extendedProfile.status_cliente === 'elite'
                                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/50'
                                            : 'bg-blue-500/20 text-blue-400 border-blue-500/50'
                                    }`}>
                                        {extendedProfile.status_cliente === 'elite' ? 'DR7 Elite' : 'DR7 Member'}
                                    </span>
                                </div>
                            )}

                            {/* --- Basic Info Section --- */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400">{t({ it: "Tipo Cliente", en: "Customer Type" })}</label>
                                    <p className="mt-1 text-white font-semibold capitalize">{extendedProfile.tipo_cliente?.replace('_', ' ')}</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400">{t({ it: "Nazione", en: "Country" })}</label>
                                    <p className="mt-1 text-white">{extendedProfile.nazione || '-'}</p>
                                </div>
                            </div>

                            {/* --- Personal / Company Details --- */}
                            {extendedProfile.tipo_cliente === 'persona_fisica' && (
                                <div className="border-t border-gray-800 pt-4">
                                    <h3 className="text-lg font-semibold text-white mb-4">{t({ it: "Dati Personali", en: "Personal Details" })}</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div><label className="text-sm text-gray-400">{t({ it: "Nome", en: "First name" })}</label><input type="text" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md text-white p-2 min-h-[44px]" style={{ colorScheme: 'dark' }} /></div>
                                        <div><label className="text-sm text-gray-400">{t({ it: "Cognome", en: "Last name" })}</label><input type="text" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md text-white p-2 min-h-[44px]" style={{ colorScheme: 'dark' }} /></div>
                                        <div className="md:col-span-2"><label className="text-sm text-gray-400">{t({ it: "Codice Fiscale", en: "Tax Code" })}</label><div className="flex flex-col sm:flex-row gap-2 mt-1"><input type="text" value={formData.codiceFiscale} onChange={handleChange} name="codiceFiscale" className="flex-1 bg-gray-800 border-gray-700 rounded-md text-white p-2 font-mono uppercase min-h-[44px]" maxLength={16} /><CalcolaCFButton className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-md whitespace-nowrap transition-colors" config={{ getCognome: () => formData.lastName, getNome: () => formData.firstName, getDataNascita: () => formData.dataNascita, getSesso: () => formData.sesso, getLuogoNascita: () => formData.cittaNascita, getCodiceFiscale: () => formData.codiceFiscale, setCodiceFiscale: (v) => setFormData(p => ({ ...p, codiceFiscale: v })), setSesso: (v) => setFormData(p => ({ ...p, sesso: v })), setDataNascita: (v) => setFormData(p => ({ ...p, dataNascita: v })), setLuogoNascita: (v) => setFormData(p => ({ ...p, cittaNascita: v })), setProvinciaNascita: (v) => setFormData(p => ({ ...p, provinciaNascita: v })), }} /></div></div>
                                        <div><label className="text-sm text-gray-400">{t({ it: "Sesso", en: "Gender" })}</label><select value={formData.sesso} onChange={(e) => setFormData({ ...formData, sesso: e.target.value })} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md text-white p-2 min-h-[44px]"><option value="">{t({ it: "Seleziona...", en: "Select..." })}</option><option value="M">{t({ it: "Maschio", en: "Male" })}</option><option value="F">{t({ it: "Femmina", en: "Female" })}</option></select></div>
                                        <div><label className="text-sm text-gray-400">{t({ it: "Data di Nascita", en: "Date of Birth" })}</label><input type="date" value={formData.dataNascita} onChange={(e) => setFormData({ ...formData, dataNascita: e.target.value })} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md text-white p-2 min-h-[44px]" style={{ colorScheme: 'dark' }} /></div>
                                        <div><label className="text-sm text-gray-400">{t({ it: "Città di Nascita", en: "Place of Birth" })}</label><input type="text" value={formData.cittaNascita} onChange={(e) => setFormData({ ...formData, cittaNascita: e.target.value })} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md text-white p-2 min-h-[44px]" style={{ colorScheme: 'dark' }} /></div>
                                        <div><label className="text-sm text-gray-400">{t({ it: "Provincia di Nascita", en: "Province of Birth" })}</label><input type="text" value={formData.provinciaNascita} onChange={(e) => setFormData({ ...formData, provinciaNascita: e.target.value })} maxLength={2} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md text-white p-2 uppercase" /></div>
                                    </div>

                                    <h3 className="text-lg font-semibold text-white mt-6 mb-4">{t({ it: "Residenza", en: "Residence" })}</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div><label className="text-sm text-gray-400">{t({ it: "Indirizzo", en: "Address" })}</label><input type="text" value={formData.indirizzo} onChange={(e) => setFormData({ ...formData, indirizzo: e.target.value })} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md text-white p-2 min-h-[44px]" style={{ colorScheme: 'dark' }} /></div>
                                        <div><label className="text-sm text-gray-400">{t({ it: "Numero Civico", en: "Street number" })}</label><input type="text" value={formData.numeroCivico} onChange={(e) => setFormData({ ...formData, numeroCivico: e.target.value })} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md text-white p-2 min-h-[44px]" style={{ colorScheme: 'dark' }} /></div>
                                        <div><label className="text-sm text-gray-400">{t({ it: "Città", en: "City" })}</label><input type="text" value={formData.cittaResidenza} onChange={(e) => setFormData({ ...formData, cittaResidenza: e.target.value })} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md text-white p-2 min-h-[44px]" style={{ colorScheme: 'dark' }} /></div>
                                        <div><label className="text-sm text-gray-400">{t({ it: "Provincia", en: "Province" })}</label><input type="text" value={formData.provinciaResidenza} onChange={(e) => setFormData({ ...formData, provinciaResidenza: e.target.value })} maxLength={2} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md text-white p-2 uppercase" /></div>
                                        <div><label className="text-sm text-gray-400">{t({ it: "CAP", en: "Postcode" })}</label><input type="text" value={formData.codicePostale} onChange={(e) => setFormData({ ...formData, codicePostale: e.target.value })} maxLength={5} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md text-white p-2 min-h-[44px]" style={{ colorScheme: 'dark' }} /></div>
                                    </div>

                                    <h3 className="text-lg font-semibold text-white mt-6 mb-4">{t({ it: "Patente di Guida", en: "Driving Licence" })}</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div><label className="text-sm text-gray-400">{t({ it: "Tipo Patente", en: "Licence type" })}</label><input type="text" value={formData.tipoPatente} onChange={(e) => setFormData({ ...formData, tipoPatente: e.target.value })} placeholder={t({ it: "es. B", en: "e.g. B" })} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md text-white p-2 min-h-[44px]" style={{ colorScheme: 'dark' }} /></div>
                                        <div><label className="text-sm text-gray-400">{t({ it: "Numero", en: "Number" })}</label><input type="text" value={formData.numeroPatente} onChange={(e) => setFormData({ ...formData, numeroPatente: e.target.value })} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md text-white p-2 font-mono" /></div>
                                        <div><label className="text-sm text-gray-400">{t({ it: "Rilasciata da", en: "Issued by" })}</label><input type="text" value={formData.patenteEmessaDa} onChange={(e) => setFormData({ ...formData, patenteEmessaDa: e.target.value })} placeholder={t({ it: "es. MIT", en: "e.g. MIT" })} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md text-white p-2 min-h-[44px]" style={{ colorScheme: 'dark' }} /></div>
                                        <div><label className="text-sm text-gray-400">{t({ it: "Data Rilascio", en: "Issue date" })}</label><input type="date" value={formData.patenteDataRilascio} onChange={(e) => setFormData({ ...formData, patenteDataRilascio: e.target.value })} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md text-white p-2 min-h-[44px]" style={{ colorScheme: 'dark' }} /></div>
                                        <div><label className="text-sm text-gray-400">{t({ it: "Scadenza", en: "Expiry" })}</label><input type="date" value={formData.patenteScadenza} onChange={(e) => setFormData({ ...formData, patenteScadenza: e.target.value })} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md text-white p-2 min-h-[44px]" style={{ colorScheme: 'dark' }} /></div>
                                    </div>
                                </div>
                            )}

                            {extendedProfile.tipo_cliente === 'azienda' && (
                                <div className="border-t border-gray-800 pt-4">
                                    <h3 className="text-lg font-semibold text-white mb-4">{t({ it: "Dati Aziendali", en: "Company Details" })}</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="md:col-span-2"><label className="text-sm text-gray-400">{t({ it: "Ragione Sociale", en: "Company name" })}</label><p className="text-white">{extendedProfile.denominazione}</p></div>
                                        <div><label className="text-sm text-gray-400">{t({ it: "Partita IVA", en: "VAT number" })}</label><p className="text-white font-mono">{extendedProfile.partita_iva}</p></div>
                                        <div><label className="text-sm text-gray-400">{t({ it: "Codice Fiscale", en: "Tax Code" })}</label><p className="text-white font-mono">{extendedProfile.codice_fiscale}</p></div>
                                        <div><label className="text-sm text-gray-400">{t({ it: "Codice SDI", en: "SDI code" })}</label><p className="text-white font-mono">{extendedProfile.codice_destinatario}</p></div>
                                        <div><label className="text-sm text-gray-400">PEC</label><p className="text-white">{extendedProfile.pec || '-'}</p></div>
                                    </div>

                                    <h3 className="text-lg font-semibold text-white mt-6 mb-4">{t({ it: "Sede Legale & Operativa", en: "Registered & Operating Office" })}</h3>
                                    <div className="space-y-4">
                                        <div><label className="text-sm text-gray-400">{t({ it: "Sede Legale", en: "Registered office" })}</label><p className="text-white">{extendedProfile.indirizzo}</p></div>
                                        {extendedProfile.sede_operativa && <div><label className="text-sm text-gray-400">{t({ it: "Sede Operativa", en: "Operating office" })}</label><p className="text-white">{extendedProfile.sede_operativa}</p></div>}
                                    </div>

                                    <h3 className="text-lg font-semibold text-white mt-6 mb-4">{t({ it: "Rappresentante Legale", en: "Legal Representative" })}</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div><label className="text-sm text-gray-400">{t({ it: "Nome", en: "First name" })}</label><p className="text-white">{extendedProfile.rappresentante_nome} {extendedProfile.rappresentante_cognome}</p></div>
                                        <div><label className="text-sm text-gray-400">{t({ it: "Codice Fiscale", en: "Tax Code" })}</label><p className="text-white font-mono">{extendedProfile.rappresentante_cf}</p></div>
                                        <div><label className="text-sm text-gray-400">{t({ it: "Ruolo", en: "Role" })}</label><p className="text-white">{extendedProfile.rappresentante_ruolo}</p></div>
                                    </div>
                                </div>
                            )}

                            {/* --- Contact Info (Editable) --- */}
                            <div className="border-t border-gray-800 pt-6 mt-6">
                                <h3 className="text-lg font-semibold text-white mb-4">{t({ it: "Informazioni di Contatto (Modificabili)", en: "Contact Information (Editable)" })}</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label htmlFor="email" className="block text-sm font-medium text-gray-300">{t('Email_Address')}</label>
                                        <input type="email" name="email" id="email" value={formData.email} readOnly className="mt-1 block w-full bg-gray-800/50 border-gray-700 rounded-md shadow-sm text-gray-400 cursor-not-allowed" />
                                    </div>
                                    <div>
                                        <label htmlFor="phone" className="block text-sm font-medium text-gray-300">{t('Phone_Number')}</label>
                                        <input type="tel" name="phone" id="phone" value={formData.phone} onChange={handleChange} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md shadow-sm text-white focus:ring-white focus:border-white" />
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="space-y-4">
                            {/* Fallback to basic form if no extended profile found */}
                            <div>
                                <label htmlFor="fullName" className="block text-sm font-medium text-gray-300">{t('Full_Name')}</label>
                                <input type="text" name="fullName" id="fullName" value={formData.fullName} onChange={handleChange} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md shadow-sm text-white focus:ring-white focus:border-white" />
                            </div>
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-gray-300">{t('Email_Address')}</label>
                                <input type="email" name="email" id="email" value={formData.email} readOnly className="mt-1 block w-full bg-gray-800/50 border-gray-700 rounded-md shadow-sm text-gray-400 cursor-not-allowed" />
                            </div>
                            <div>
                                <label htmlFor="phone" className="block text-sm font-medium text-gray-300">{t('Phone_Number')}</label>
                                <input type="tel" name="phone" id="phone" value={formData.phone} onChange={handleChange} className="mt-1 block w-full bg-gray-800 border-gray-700 rounded-md shadow-sm text-white focus:ring-white focus:border-white" />
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-4 md:p-6 bg-gray-900 flex flex-col sm:flex-row items-center justify-end gap-3 rounded-b-lg">
                    {successMessage && <span className={`text-sm ${successError ? 'text-red-400' : 'text-green-400'}`}>{successMessage}</span>}
                    <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition-colors text-sm disabled:opacity-60">
                        {isSubmitting ? t('Please_wait') : t('Save_Changes')}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ProfileSettings;
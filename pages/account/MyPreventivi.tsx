import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../supabaseClient';
import { useCentralinaProOverlay } from '../../hooks/useCentralinaProConfig';
import { useTranslation } from '../../hooks/useTranslation';
import { dateLocale } from '../../utils/i18nDate';

interface Preventivo {
  id: string;
  vehicle_name: string;
  vehicle_plate: string;
  vehicle_category: string;
  pickup_date: string;
  dropoff_date: string;
  rental_days: number;
  pickup_location: string;
  dropoff_location: string;
  base_daily_rate: number;
  insurance_option: string;
  insurance_total: number;
  km_limit: number;
  unlimited_km: boolean;
  unlimited_km_total?: number;
  lavaggio_fee?: number;
  no_cauzione_total?: number;
  second_driver_total?: number;
  total_final: number;
  deposit_amount: number;
  driver_tier: string;
  status: 'bozza' | 'inviato' | 'accettato' | 'rifiutato' | 'scaduto';
  expires_at: string;
  created_at: string;
  booking_id?: string;
  source?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extras_detail?: Record<string, any> | null;
  events?: { event: string; ts: string; detail?: string }[];
}

/**
 * Richiesta di volo (elicottero o jet) mandata dal modulo del sito: vive in
 * `aviation_quotes`, non fra i preventivi di noleggio. Il cliente la deve
 * ritrovare qui, dove cerca tutti i suoi preventivi.
 */
interface RichiestaVolo {
  id: string;
  customer_name: string;
  departure_location: string;
  arrival_location: string;
  departure_date?: string | null;
  departure_time?: string | null;
  return_date?: string | null;
  return_time?: string | null;
  flight_type?: string;
  passenger_count?: number;
  luggage_details?: string;
  budget_indicative?: string;
  aircraft_category?: 'jet' | 'helicopter' | 'any' | null;
  preferred_aircraft?: string;
  quote_amount?: number;
  status: 'pending' | 'quoted' | 'accepted' | 'rejected';
  created_at: string;
}

const STATUS_VOLO: Record<string, { label: { it: string; en: string }; color: string }> = {
  pending: { label: { it: 'In attesa', en: 'Pending' }, color: 'bg-yellow-500/15 text-yellow-400' },
  quoted: { label: { it: 'Preventivato', en: 'Quoted' }, color: 'bg-blue-500/15 text-blue-400' },
  accepted: { label: { it: 'Accettato', en: 'Accepted' }, color: 'bg-green-500/15 text-green-400' },
  rejected: { label: { it: 'Rifiutato', en: 'Rejected' }, color: 'bg-red-500/15 text-red-400' },
};

const STATUS_LABELS: Record<string, { label: { it: string; en: string }; color: string }> = {
  bozza: { label: { it: 'In attesa', en: 'Pending' }, color: 'bg-yellow-500/15 text-yellow-400' },
  inviato: { label: { it: 'Inviato', en: 'Sent' }, color: 'bg-blue-500/15 text-blue-400' },
  accettato: { label: { it: 'Accettato', en: 'Accepted' }, color: 'bg-green-500/15 text-green-400' },
  rifiutato: { label: { it: 'Rifiutato', en: 'Rejected' }, color: 'bg-red-500/15 text-red-400' },
  scaduto: { label: { it: 'Scaduto', en: 'Expired' }, color: 'bg-gray-500/15 text-gray-400' },
};

/**
 * Giorno e ora di un volo, all'europea: "16/09/2026 · 07:30". Mai il formato
 * americano, mai l'ISO del database.
 */
function giornoOraVolo(data?: string | null, ora?: string | null): string {
  const s = String(data || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const giorno = `${m[3]}/${m[2]}/${m[1]}`;
  const orario = String(ora || '').slice(0, 5);
  return orario ? `${giorno} · ${orario}` : giorno;
}

function formatDate(dateStr: string, lang: string): string {
  return new Date(dateStr).toLocaleDateString(dateLocale(lang), {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Rome'
  });
}

/**
 * Resolve un id assicurazione (es. "KASKO_BASE") nella sua label umana
 * ("Kasko Base", "Kasko DR7", ecc.) iterando TUTTI i pool di Centralina
 * Pro — sia i 4 bucket legacy sia ogni categoria custom
 * (Hypercar Elitè, Suv Luxury, ecc.). Senza questa iterazione completa
 * i preventivi delle categorie nuove mostravano l'id raw o "N/A".
 */
function resolveInsuranceLabel(
  rawId: string | null | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proOverlay: any,
): string {
  const raw = String(rawId || '').trim();
  if (!raw) return 'N/A';
  if (!proOverlay) return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const pools: Array<Array<{ id?: string; name?: string }>> = [
    proOverlay.insuranceTier1, proOverlay.insuranceTier2,
    proOverlay.urbanInsurance, proOverlay.utilitaireInsurance, proOverlay.furgoneInsurance,
  ].filter(Array.isArray) as Array<Array<{ id?: string; name?: string }>>;
  if (proOverlay.insuranceByCategory) {
    for (const bucket of Object.values(proOverlay.insuranceByCategory)) {
      if (!bucket) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = bucket as any;
      if (Array.isArray(b.TIER_1)) pools.push(b.TIER_1);
      if (Array.isArray(b.TIER_2)) pools.push(b.TIER_2);
      if (Array.isArray(b._all_tiers)) pools.push(b._all_tiers);
    }
  }
  for (const pool of pools) {
    const hit = pool.find(o => o?.id === raw);
    if (hit?.name) return hit.name;
  }
  return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const MyPreventivi: React.FC = () => {
  const { t, lang } = useTranslation();
  const { user } = useAuth();
  const { overlay: proOverlay } = useCentralinaProOverlay();
  const [preventivi, setPreventivi] = useState<Preventivo[]>([]);
  const [voli, setVoli] = useState<RichiestaVolo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadPreventivi();
  }, [user]);

  const loadPreventivi = async () => {
    setLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;

      const res = await fetch('/.netlify/functions/get-my-preventivi', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPreventivi(data.preventivi || []);
        setVoli(data.aviation || []);
      }
    } catch (err) {
      console.error('Error loading preventivi:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t({ it: 'Eliminare questo preventivo?', en: 'Delete this quote?' }))) return;
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;

      // Use service-role via Netlify function proxy, or direct delete if RLS allows
      const { error } = await supabase
        .from('preventivi')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setPreventivi(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error('Error deleting preventivo:', err);
      alert(t({ it: "Errore eliminazione preventivo", en: "Error deleting the quote" }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-6">{t({ it: "I Miei Preventivi", en: "My Quotes" })}</h2>

      {/* Richieste di volo: elicottero e jet. Arrivano dal modulo del sito e
          le lavora l'ufficio, quindi qui si LEGGONO — non c'e' un bottone
          "prenota ora" finche' DR7 non ha risposto con un prezzo. */}
      {voli.length > 0 && (
        <div className="space-y-4 mb-8">
          {voli.map((v) => {
            const stato = STATUS_VOLO[v.status] || STATUS_VOLO.pending;
            const mezzo = v.preferred_aircraft
              || (v.aircraft_category === 'helicopter'
                ? t({ it: 'Elicottero', en: 'Helicopter' })
                : v.aircraft_category === 'jet'
                  ? t({ it: 'Jet privato', en: 'Private jet' })
                  : t({ it: 'Aeromobile da definire', en: 'Aircraft to be defined' }));
            const righe: { label: string; value: string }[] = [
              { label: t({ it: 'Partenza', en: 'Departure' }), value: giornoOraVolo(v.departure_date, v.departure_time) || '-' },
              { label: t({ it: 'Passeggeri', en: 'Passengers' }), value: String(v.passenger_count || 1) },
            ];
            if (v.return_date) righe.push({ label: t({ it: 'Ritorno', en: 'Return' }), value: giornoOraVolo(v.return_date, v.return_time) });
            if (v.luggage_details) righe.push({ label: t({ it: 'Bagagli', en: 'Luggage' }), value: v.luggage_details });
            if (v.budget_indicative) righe.push({ label: t({ it: 'Budget indicativo', en: 'Indicative budget' }), value: v.budget_indicative });

            return (
              <div key={v.id} className="rounded-2xl border border-gray-700 bg-gray-900/30 p-5">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {v.departure_location || '-'} → {v.arrival_location || '-'}
                    </h3>
                    <p className="text-sm text-gray-400 mt-0.5">{mezzo}</p>
                  </div>
                  <span className={`text-xs font-semibold px-3 py-1 ${stato.color}`}>{t(stato.label)}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  {righe.map(r => (
                    <div key={r.label}>
                      <p className="text-gray-500 text-xs">{r.label}</p>
                      <p className="text-white font-medium">{r.value}</p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-4 mt-4 border-t border-gray-800">
                  <div>
                    <p className="text-gray-500 text-xs">{t({ it: 'Preventivo', en: 'Quote' })}</p>
                    <p className="text-xl font-bold text-white">
                      {Number(v.quote_amount) > 0
                        ? `€${Number(v.quote_amount).toFixed(2)}`
                        : t({ it: 'In lavorazione', en: 'Being prepared' })}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 text-right">
                    {t({ it: 'Richiesta del', en: 'Requested on' })} {giornoOraVolo(v.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {preventivi.length === 0 && voli.length === 0 ? (
        <div className="text-center py-16 bg-gray-900/50 rounded-2xl border border-gray-800">
          <p className="text-gray-400 text-lg mb-2">{t({ it: "Nessun preventivo salvato", en: "No saved quotes" })}</p>
          <p className="text-gray-500 text-sm">{t({ it: "Quando richiedi un preventivo dal configuratore, lo troverai qui.", en: "When you request a quote from the configurator, you will find it here." })}</p>
        </div>
      ) : preventivi.length === 0 ? null : (
        <div className="space-y-4">
          {preventivi.map((p) => {
            const statusInfo = STATUS_LABELS[p.status] || STATUS_LABELS.bozza;
            const isExpired = p.status === 'scaduto' || (p.expires_at && new Date(p.expires_at) < new Date());
            const isActive = p.status === 'bozza' || p.status === 'inviato';

            return (
              <div
                key={p.id}
                className={`rounded-2xl border p-5 transition-all ${
                  isExpired ? 'border-gray-800 opacity-60' : 'border-gray-700 bg-gray-900/30'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">{p.vehicle_name}</h3>
                    <p className="text-sm text-gray-400 mt-0.5">
                      {formatDate(p.pickup_date, lang)} — {formatDate(p.dropoff_date, lang)} ({p.rental_days} {p.rental_days === 1 ? t({ it: "giorno", en: "day" }) : t({ it: "giorni", en: "days" })})
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-3 py-1 ${statusInfo.color}`}>
                    {t(statusInfo.label)}
                  </span>
                </div>

                {/* Details grid: i 4 campi standard sempre visibili. */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
                  <div>
                    <p className="text-gray-500 text-xs">{t({ it: "Tariffa/giorno", en: "Rate/day" })}</p>
                    <p className="text-white font-medium">€{Number(p.base_daily_rate).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">{t({ it: "Assicurazione", en: "Insurance" })}</p>
                    <p className="text-white font-medium">{resolveInsuranceLabel(p.insurance_option, proOverlay)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">KM</p>
                    <p className="text-white font-medium">{p.unlimited_km ? t({ it: "Illimitati", en: "Unlimited" }) : `${p.km_limit} km`}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">{t({ it: "Cauzione", en: "Deposit" })}</p>
                    <p className="text-white font-medium">€{Number(p.deposit_amount).toFixed(0)}</p>
                  </div>
                </div>

                {/* Extras presi dal cliente: ogni voce non-zero appare come riga
                    dedicata cosi' "I Miei Preventivi" rispecchia esattamente le
                    opzioni scelte sul wizard (DR7 Flex, Secondo Guidatore,
                    Lavaggio, Cauzione Veicolo, Experience, Consegna/Ritiro). */}
                {(() => {
                  const extras = (p.extras_detail || {}) as Record<string, unknown>
                  const rows: { label: string; value: string }[] = []
                  const num = (v: unknown): number => {
                    const n = Number(v); return Number.isFinite(n) ? n : 0
                  }
                  if (num(p.unlimited_km_total) > 0) rows.push({ label: t({ it: 'Km Illimitati', en: 'Unlimited km' }), value: `€${num(p.unlimited_km_total).toFixed(2)}` })
                  if (num(p.lavaggio_fee) > 0) rows.push({ label: t({ it: 'Lavaggio finale', en: 'Final wash' }), value: `€${num(p.lavaggio_fee).toFixed(2)}` })
                  if (num(p.no_cauzione_total) > 0) rows.push({ label: t({ it: 'No Cauzione', en: 'No Deposit' }), value: `€${num(p.no_cauzione_total).toFixed(2)}` })
                  if (num(p.second_driver_total) > 0) rows.push({ label: t({ it: 'Secondo Guidatore', en: 'Additional Driver' }), value: `€${num(p.second_driver_total).toFixed(2)}` })
                  if (num(extras.dr7_flex_total) > 0) rows.push({ label: 'DR7 FLEX', value: `€${num(extras.dr7_flex_total).toFixed(2)}` })
                  if (num(extras.cauzione_veicoli_total) > 0) rows.push({ label: t({ it: 'Cauzione Veicolo', en: 'Vehicle Deposit' }), value: `€${num(extras.cauzione_veicoli_total).toFixed(2)}` })
                  if (num(extras.experience_cost) > 0) rows.push({ label: 'Experience', value: `€${num(extras.experience_cost).toFixed(2)}` })
                  if (num(extras.delivery_fee) > 0) rows.push({ label: t({ it: 'Consegna', en: 'Delivery' }), value: `€${num(extras.delivery_fee).toFixed(2)}` })
                  if (num(extras.pickup_fee) > 0) rows.push({ label: t({ it: 'Ritiro', en: 'Collection' }), value: `€${num(extras.pickup_fee).toFixed(2)}` })
                  if (rows.length === 0) return null
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-4 pt-3 border-t border-gray-800/70">
                      {rows.map(r => (
                        <div key={r.label}>
                          <p className="text-gray-500 text-xs">{r.label}</p>
                          <p className="text-white font-medium">{r.value}</p>
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {/* Total + actions */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                  <div>
                    <p className="text-gray-500 text-xs">{t({ it: "Totale preventivo", en: "Quote total" })}</p>
                    <p className="text-xl font-bold text-white">€{Number(p.total_final).toFixed(2)}</p>
                  </div>

                  {(isActive || (p.status === 'accettato' && !p.booking_id)) && !isExpired && (
                    <div className="flex flex-wrap gap-2">
                      {/* 2026-05-21: "Modifica" opens the wizard in edit
                          mode (stays on step 1, on save the preventivo is
                          UPDATED instead of duplicated). Only when not yet
                          converted to a booking. */}
                      <a
                        href={`/supercar-luxury?preventivo=${p.id}&edit=1`}
                        className="px-5 py-2.5 bg-transparent border border-white/40 text-white text-sm font-bold hover:bg-white/10 transition-colors"
                      >
                        {t({ it: "Modifica", en: "Edit" })}
                      </a>
                      <a
                        href={`/supercar-luxury?preventivo=${p.id}`}
                        className="px-5 py-2.5 bg-white text-black text-sm font-bold hover:bg-gray-200 transition-colors"
                      >
                        {p.status === 'accettato' ? t({ it: "Completa Prenotazione", en: "Complete Booking" }) : t({ it: "Prenota Ora", en: "Book Now" })}
                      </a>
                    </div>
                  )}

                  {p.status === 'rifiutato' && (
                    <div className="flex flex-col items-end gap-2">
                      <a
                        href={`/supercar-luxury?preventivo=${p.id}`}
                        className="px-5 py-2.5 bg-white text-black text-sm font-bold hover:bg-gray-200 transition-colors"
                      >
                        {t({ it: "Prenota Ora con Cauzione", en: "Book Now with Deposit" })}
                      </a>
                    </div>
                  )}

                  {p.status === 'accettato' && p.booking_id && (
                    <span className="text-green-400 text-sm font-medium">{t({ it: "Prenotazione confermata", en: "Booking confirmed" })}</span>
                  )}

                  {/* Delete button — not for converted bookings */}
                  {!(p.status === 'accettato' && p.booking_id) && (
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="text-gray-500 hover:text-red-400 transition-colors text-xs underline"
                    >
                      {t({ it: "Elimina", en: "Delete" })}
                    </button>
                  )}
                </div>

                {/* Discount code for rejected no-cauzione */}
                {p.status === 'rifiutato' && (() => {
                  const rejectEvent = p.events?.find(e => e.event === 'no_cauzione_rifiutato');
                  const code = rejectEvent?.detail?.replace('discount_code: ', '');
                  if (!code) return null;
                  return (
                    <div className="mt-4 p-4 rounded-xl bg-green-500/10 border border-green-500/30">
                      <p className="text-green-400 text-sm font-semibold mb-1">{t({ it: "Sconto del 5% attivato per te!", en: "A 5% discount has been activated for you!" })}</p>
                      <p className="text-white text-lg font-bold font-mono tracking-wider">{code}</p>
                      <p className="text-gray-400 text-xs mt-1">{t({ it: "Inserisci il codice al momento del pagamento per ottenere lo sconto.", en: "Enter the code at checkout to get the discount." })}</p>
                    </div>
                  );
                })()}

                {/* Expiry info */}
                {isActive && p.expires_at && !isExpired && (
                  <p className="text-xs text-gray-500 mt-3">
                    {t({ it: 'Valido fino al', en: 'Valid until' })} {formatDate(p.expires_at, lang)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyPreventivi;

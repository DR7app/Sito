import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { addCredits } from '../utils/creditWallet';
import { useTranslation } from '../hooks/useTranslation';
import { getPaymentSuccessCopy, type PaymentSuccessCopy, getMessageTemplateBody } from '../utils/siteCopy';
import { trackBookingCompleted } from '../utils/analytics';
import { useContactInfo } from '../hooks/useContactInfo';

// Token substitution for WhatsApp templates loaded from system_messages.
function applyTokens(tpl: string, tokens: Record<string, string>): string {
  let out = tpl;
  for (const [k, v] of Object.entries(tokens)) out = out.split(`{${k}}`).join(v);
  return out;
}

// Build a WhatsApp URL from a booking using the appropriate system_messages
// template (rental vs appointment). Returns null if template is missing.
// `whatsappBase` should be ContactCopy.whatsapp_url (admin-editable).
async function buildBookingWhatsAppUrl(booking: any, whatsappBase: string): Promise<string | null> {
  if (!booking?.booking_details?.customer) return null;
  const bId = String(booking.id).substring(0, 8).toUpperCase();
  const customer = booking.booking_details.customer;
  const price = (booking.price_total / 100).toFixed(2);
  const phone = customer.phone || booking.customer_phone || '';
  const isAppointment = booking.service_type === 'car_wash' || booking.service_type === 'mechanical_service';
  const templateKey = isAppointment ? 'pro_payment_success_appointment' : 'pro_payment_success_rental';
  const template = await getMessageTemplateBody(templateKey);
  if (!template) return null;

  let tokens: Record<string, string>;
  if (isAppointment) {
    const apptDate = booking.appointment_date ? new Date(booking.appointment_date) : null;
    const formattedDate = apptDate
      ? apptDate.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' })
      : 'N/A';
    const formattedTime = booking.appointment_time || (apptDate ? apptDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : '');
    tokens = {
      id: `DR7-${bId}`,
      cliente: customer.fullName,
      email: customer.email || '',
      telefono: phone,
      servizio: booking.service_name || booking.vehicle_name || '',
      data: formattedDate,
      ora: formattedTime,
      totale: `€${price}`,
      stato_pagamento: '✅ Pagato',
    };
  } else {
    const pDate = new Date(booking.pickup_date);
    const dDate = new Date(booking.dropoff_date);
    tokens = {
      id: `DR7-${bId}`,
      cliente: customer.fullName,
      email: customer.email || '',
      telefono: phone,
      veicolo: booking.vehicle_name || '',
      ritiro: pDate.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }),
      ora_ritiro: pDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }),
      riconsegna: dDate.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }),
      ora_riconsegna: dDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }),
      totale: `€${price}`,
      stato_pagamento: '✅ Pagato',
    };
  }
  const msg = applyTokens(template, tokens);
  return `${whatsappBase}?text=${encodeURIComponent(msg)}`;
}

const PaymentSuccessPage: React.FC = () => {
    const navigate = useNavigate();
    const { lang } = useTranslation();
    const [searchParams] = useSearchParams();
    const contact = useContactInfo();
    const [updating, setUpdating] = useState(true);
    const [updateError, setUpdateError] = useState<string | null>(null);
    const [purchaseType, setPurchaseType] = useState<'booking' | 'wallet' | 'membership' | 'dr7_club' | null>(null);
    const [walletInfo, setWalletInfo] = useState<{ packageName: string; receivedAmount: number } | null>(null);
    const [membershipInfo, setMembershipInfo] = useState<{ tierName: string; billingCycle: string } | null>(null);
    const [copy, setCopy] = useState<PaymentSuccessCopy | null>(null);
    const copyRef = useRef<PaymentSuccessCopy | null>(null);

    useEffect(() => {
        let cancelled = false;
        getPaymentSuccessCopy().then(c => {
            if (cancelled) return;
            copyRef.current = c;
            setCopy(c);
        });
        return () => { cancelled = true; };
    }, []);

    const s = (it: keyof PaymentSuccessCopy, en: keyof PaymentSuccessCopy): string => {
        const cur = copyRef.current;
        if (!cur) return '';
        return cur[lang === 'it' ? it : en] as string;
    };
    const applyTokens = (template: string, tokens: Record<string, string>): string =>
        Object.entries(tokens).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(v), template);

    const orderId = searchParams.get('codTrans') || searchParams.get('orderId') || searchParams.get('paymentid') || sessionStorage.getItem('dr7_pending_order');
    const pendingType = sessionStorage.getItem('dr7_pending_type');
    const amount = searchParams.get('importo');
    const authCode = searchParams.get('codAut');

    // URL base per le Netlify Functions
    const FUNCTIONS_BASE = import.meta.env.VITE_FUNCTIONS_BASE ?? (window.location.hostname === 'localhost' ? 'http://localhost:8888' : window.location.origin);
    const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);

    // Update payment status immediately
    useEffect(() => {
        const updatePaymentStatus = async () => {
            // Clean up sessionStorage after reading
            sessionStorage.removeItem('dr7_pending_order');
            sessionStorage.removeItem('dr7_pending_type');

            if (!orderId) {
                // Last resort: if no orderId but we know it was a membership, look up by user
                if (pendingType === 'membership') {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user) {
                        const { data: recent } = await supabase
                            .from('membership_purchases')
                            .select('*')
                            .eq('user_id', user.id)
                            .in('payment_status', ['pending', 'succeeded'])
                            .order('created_at', { ascending: false })
                            .limit(1)
                            .single();

                        if (recent) {
                            console.log('Found recent membership by user fallback:', recent.id);
                            setPurchaseType('membership');
                            setMembershipInfo({
                                tierName: recent.tier_name,
                                billingCycle: recent.billing_cycle,
                            });
                            setUpdating(false);
                            return;
                        }
                    }
                }

                console.warn('No orderId found in URL parameters');
                setUpdating(false);
                return;
            }

            try {
                console.log('Processing payment success for orderId:', orderId);

                // 1. Try bookings first (nexi_order_id column, then booking_details JSONB fallback)
                let bookings = null;
                const result1 = await supabase
                    .from('bookings')
                    .select('*')
                    .or(`id.eq.${orderId},nexi_order_id.eq.${orderId}`)
                    .limit(1);

                if (!result1.error && result1.data && result1.data.length > 0) {
                    bookings = result1.data;
                } else {
                    // Fallback: check booking_details JSONB
                    const result2 = await supabase
                        .from('bookings')
                        .select('*')
                        .eq('booking_details->>nexi_order_id', orderId)
                        .limit(1);
                    if (!result2.error && result2.data && result2.data.length > 0) {
                        bookings = result2.data;
                    }
                }

                if (bookings && bookings.length > 0) {
                    const booking = bookings[0];
                    console.log('Found booking:', booking.id);
                    setPurchaseType('booking');
                    trackBookingCompleted(booking);

                    // Update if not already confirmed (backward compat + idempotency)
                    if (booking.payment_status !== 'succeeded' && booking.payment_status !== 'completed' && booking.payment_status !== 'paid') {
                        await supabase
                            .from('bookings')
                            .update({
                                status: 'confirmed',
                                payment_status: 'succeeded',
                                nexi_payment_id: orderId,
                                nexi_authorization_code: authCode || null,
                                payment_completed_at: new Date().toISOString()
                            })
                            .eq('id', booking.id);
                    }

                    // FATTURA servizio: genera SEMPRE (idempotente lato admin
                    // contro fatture esistenti). Il webhook nexi-callback puo' non
                    // completare e questa pagina e' sempre raggiunta dal cliente:
                    // garantisce la fattura per i servizi pagati dal sito + PDF WhatsApp.
                    fetch(`${FUNCTIONS_BASE}/.netlify/functions/generate-fattura`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ bookingId: booking.id, includeIVA: true }),
                    }).then(r => console.log('[PaymentSuccess] booking fattura trigger:', r.status))
                      .catch(e => console.error('[PaymentSuccess] booking fattura trigger failed:', e));

                    // Send notifications
                    fetch(`${FUNCTIONS_BASE}/.netlify/functions/send-booking-confirmation`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ booking: { ...booking, payment_status: 'succeeded' } }),
                    }).catch(e => console.error('Email error', e));

                    fetch(`${FUNCTIONS_BASE}/.netlify/functions/send-whatsapp-notification`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ booking: { ...booking, payment_status: 'succeeded' } }),
                    }).catch(e => console.error('WhatsApp error', e));

                    // Send customer confirmation WhatsApp via system_messages template (if callback hasn't already)
                    if (!booking.booking_details?.nexi_paid_at) {
                        const cPhone = booking.customer_phone || booking.booking_details?.customer?.phone;
                        if (cPhone) {
                            fetch(`${FUNCTIONS_BASE}/.netlify/functions/send-whatsapp-notification`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ booking: { ...booking, payment_status: 'succeeded' }, customPhone: cPhone }),
                            }).catch(e => console.error('Customer WhatsApp error', e));
                        }
                    }

                    const url = await buildBookingWhatsAppUrl(booking, contact.whatsapp_url);
                    if (url) setWhatsappUrl(url);
                    setUpdating(false);
                    return;
                }

                // 1b. Try pending_nexi_bookings — new flow: booking created only after payment
                const { data: pendingRows } = await supabase
                    .from('pending_nexi_bookings')
                    .select('*')
                    .eq('nexi_order_id', orderId)
                    .limit(1);

                if (pendingRows && pendingRows.length > 0) {
                    const pending = pendingRows[0];
                    const existingBookingId = pending.booking_data?.booking_id;
                    console.log('Found pending booking, updating existing booking after payment success', { existingBookingId });
                    setPurchaseType('booking');

                    if (existingBookingId) {
                        // UPDATE the existing pending booking (created at checkout time)
                        const { error: updateErr } = await supabase
                            .from('bookings')
                            .update({
                                status: 'confirmed',
                                payment_status: 'succeeded',
                                nexi_order_id: orderId,
                                nexi_payment_id: orderId,
                                nexi_authorization_code: authCode || null,
                                payment_completed_at: new Date().toISOString()
                            })
                            .eq('id', existingBookingId)
                            .in('payment_status', ['unpaid', 'pending']);

                        if (updateErr) {
                            console.warn('Update failed (callback may have been faster):', updateErr.message);
                        }

                        // Fetch the updated booking
                        const { data: updatedBookings } = await supabase
                            .from('bookings')
                            .select('*')
                            .eq('id', existingBookingId)
                            .limit(1);

                        if (updatedBookings && updatedBookings.length > 0) {
                            const newBooking = updatedBookings[0];
                            console.log('Booking confirmed:', newBooking.id);

                            // Clean up pending record
                            await supabase.from('pending_nexi_bookings').delete().eq('id', pending.id);

                            // Send notifications
                            fetch(`${FUNCTIONS_BASE}/.netlify/functions/send-booking-confirmation`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ booking: newBooking }),
                            }).catch(e => console.error('Email error', e));

                            fetch(`${FUNCTIONS_BASE}/.netlify/functions/send-whatsapp-notification`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ booking: newBooking }),
                            }).catch(e => console.error('WhatsApp error', e));

                            // Customer WhatsApp via system_messages template
                            const cPhone = newBooking.customer_phone || newBooking.booking_details?.customer?.phone;
                            if (cPhone) {
                                fetch(`${FUNCTIONS_BASE}/.netlify/functions/send-whatsapp-notification`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ booking: { ...newBooking, payment_status: 'succeeded' }, customPhone: cPhone }),
                                }).catch(e => console.error('Customer WhatsApp error', e));
                            }

                            const url = await buildBookingWhatsAppUrl(newBooking, contact.whatsapp_url);
                            if (url) setWhatsappUrl(url);

                            setUpdating(false);
                            return;
                        }
                    }

                    // TOUR (Aria/Mare/Soggiorni): la prenotazione viene creata
                    // ESCLUSIVAMENTE da nexi-callback (che marca i posti 'sold' e
                    // NON genera contratto). Qui NON la creiamo, per evitare doppioni
                    // e posti non marcati. Mostriamo successo; se il callback ha gia'
                    // creato il booking lo recuperiamo, altrimenti arriva a breve.
                    const pendingSvc = String(pending.booking_data?.service_type || '').toLowerCase();
                    const isPendingTour = pendingSvc === 'heli_rental' || pendingSvc === 'boat_rental' || pendingSvc === 'stay_rental';
                    if (isPendingTour) {
                        setPurchaseType('booking');
                        const { data: tourBk } = await supabase
                            .from('bookings').select('*').eq('nexi_order_id', orderId).limit(1);
                        if (tourBk && tourBk.length > 0) {
                            const url = await buildBookingWhatsAppUrl(tourBk[0], contact.whatsapp_url);
                            if (url) setWhatsappUrl(url);
                        }
                        setUpdating(false);
                        return;
                    }

                    // Fallback: old flow — create new booking (for legacy pending records without booking_id)
                    const bookingPayload = {
                        ...pending.booking_data,
                        status: 'confirmed',
                        payment_status: 'succeeded',
                        nexi_order_id: orderId,
                        nexi_payment_id: orderId,
                        nexi_authorization_code: authCode || null,
                        payment_completed_at: new Date().toISOString()
                    };

                    const { data: newBooking, error: insertErr } = await supabase
                        .from('bookings')
                        .insert(bookingPayload)
                        .select()
                        .single();

                    if (insertErr) {
                        console.warn('Insert failed (callback may have been faster):', insertErr.message);
                        const { data: existingBookings } = await supabase
                            .from('bookings')
                            .select('*')
                            .eq('nexi_order_id', orderId)
                            .limit(1);

                        if (existingBookings && existingBookings.length > 0) {
                            console.log('Callback already created booking, showing success');
                            const b = existingBookings[0];
                            const url = await buildBookingWhatsAppUrl(b, contact.whatsapp_url);
                            if (url) setWhatsappUrl(url);
                            setUpdating(false);
                            return;
                        }

                        setUpdateError(s('err_booking_create_it', 'err_booking_create_en'));
                        setUpdating(false);
                        return;
                    }

                    // Clean up pending record
                    await supabase
                        .from('pending_nexi_bookings')
                        .delete()
                        .eq('id', pending.id);

                    console.log('Booking created:', newBooking.id);

                    // Send notifications
                    fetch(`${FUNCTIONS_BASE}/.netlify/functions/send-booking-confirmation`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ booking: newBooking }),
                    }).catch(e => console.error('Email error', e));

                    fetch(`${FUNCTIONS_BASE}/.netlify/functions/send-whatsapp-notification`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ booking: newBooking }),
                    }).catch(e => console.error('WhatsApp error', e));

                    // Send customer confirmation WhatsApp
                    {
                        // Customer WhatsApp via system_messages template
                        const cPhone = newBooking.customer_phone || newBooking.booking_details?.customer?.phone;
                        if (cPhone) {
                            fetch(`${FUNCTIONS_BASE}/.netlify/functions/send-whatsapp-notification`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ booking: { ...newBooking, payment_status: 'succeeded' }, customPhone: cPhone }),
                            }).catch(e => console.error('Customer WhatsApp error', e));
                        }
                    }

                    const url = await buildBookingWhatsAppUrl(newBooking, contact.whatsapp_url);
                    if (url) setWhatsappUrl(url);
                    setUpdating(false);
                    return;
                }

                // 2. Try credit wallet purchases
                const { data: purchases, error: purchaseError } = await supabase
                    .from('credit_wallet_purchases')
                    .select('*')
                    .eq('nexi_order_id', orderId)
                    .limit(1);

                if (!purchaseError && purchases && purchases.length > 0) {
                    const purchase = purchases[0];
                    console.log('Found credit wallet purchase:', purchase.id);
                    setPurchaseType('wallet');
                    setWalletInfo({
                        packageName: purchase.package_name,
                        receivedAmount: purchase.received_amount
                    });

                    // Verify the logged-in user matches the purchase owner
                    const { data: { user: authUser } } = await supabase.auth.getUser();
                    if (!authUser || authUser.id !== purchase.user_id) {
                        console.error('Auth mismatch: logged-in user does not match purchase owner');
                        setUpdateError(s('err_auth_it', 'err_auth_en'));
                        setUpdating(false);
                        return;
                    }

                    // Crediti: aggiungi SOLO se non gia' processato (race col
                    // callback). add_credits e' comunque idempotente per reference_id.
                    const alreadyDone = purchase.payment_status === 'completed' || purchase.payment_status === 'succeeded' || purchase.payment_status === 'paid';
                    if (!alreadyDone) {
                        const { data: updatedPurchase, error: upErr } = await supabase
                            .from('credit_wallet_purchases')
                            .update({
                                payment_status: 'succeeded',
                                payment_completed_at: new Date().toISOString()
                            })
                            .eq('id', purchase.id)
                            .neq('payment_status', 'succeeded')
                            .select()
                            .single();

                        if (upErr) {
                            console.error('Error updating purchase:', upErr);
                            setUpdateError(s('err_purchase_update_it', 'err_purchase_update_en'));
                        } else if (updatedPurchase) {
                            // Abbiamo vinto la race -> accredita.
                            // 2026-08-08 FIX: qui veniva accreditato l'INTERO
                            // received_amount (ricarica + bonus pacchetto) come
                            // un'unica riga 'wallet_purchase' = credito reale.
                            // Il bonus del pacchetto finiva quindi nel capitale
                            // (maturando interessi) e spariva dal conteggio bonus.
                            // Il webhook nexi-callback fa lo SPLIT dal 2026-07-13:
                            // qui replichiamo lo stesso split, altrimenti il modo
                            // in cui la ricarica viene registrata dipende da chi
                            // vince la race (browser o webhook).
                            const rechargeEur = parseFloat(String(purchase.recharge_amount ?? purchase.received_amount));
                            const receivedEur = parseFloat(String(purchase.received_amount));
                            const bonusEur = Math.round((receivedEur - rechargeEur) * 100) / 100;

                            // PRINCIPALE = importo pagato con carta.
                            const result = await addCredits(
                                purchase.user_id,
                                rechargeEur,
                                `Ricarica ${purchase.package_name} (€${rechargeEur.toFixed(2)})`,
                                purchase.id,
                                'wallet_purchase'
                            );
                            if (result.success) {
                                console.log(`Credits added: €${rechargeEur} (new balance: €${result.newBalance})`);
                            } else {
                                console.error('Error adding credits:', result.error);
                                setUpdateError(s('err_credit_add_it', 'err_credit_add_en'));
                            }

                            // BONUS pacchetto = omaggio -> NON capitale, niente interessi.
                            if (bonusEur > 0) {
                                const bonusRes = await addCredits(
                                    purchase.user_id,
                                    bonusEur,
                                    `Bonus ricarica ${purchase.bonus_percentage}% (€${bonusEur.toFixed(2)})`,
                                    purchase.id,
                                    'wallet_package_bonus'
                                );
                                if (!bonusRes.success) {
                                    console.error('Error adding package bonus:', bonusRes.error);
                                }
                            }
                        } else {
                            console.log('Purchase credits already processed by callback');
                        }
                    }

                    // FATTURA: genera SEMPRE (idempotente lato server via note
                    // 'wallet_purchase:{id}'). Il webhook nexi-callback puo' NON
                    // scattare/completare e questa pagina e' SEMPRE raggiunta dal
                    // cliente: senza questa chiamata le ricariche restavano SENZA
                    // fattura (bug ricorrente da mesi). La function invia anche il
                    // PDF della fattura su WhatsApp.
                    fetch(`${FUNCTIONS_BASE}/.netlify/functions/generate-fattura`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            purchaseType: 'wallet_purchase',
                            purchaseId: purchase.id,
                            includeIVA: true,
                            purchaseData: {
                                userId: purchase.user_id,
                                packageName: purchase.package_name,
                                amount: purchase.recharge_amount,
                                receivedAmount: purchase.received_amount,
                                bonusPercentage: purchase.bonus_percentage,
                            },
                        }),
                    }).then(r => console.log('[PaymentSuccess] wallet fattura trigger:', r.status))
                      .catch(e => console.error('[PaymentSuccess] wallet fattura trigger failed:', e));

                    // CASHBACK DR7 Club: applica SEMPRE (idempotente lato server).
                    // Il cashback dei membri DR7 Club veniva calcolato SOLO nel
                    // webhook nexi-callback: se il webhook non scattava, il cliente
                    // non riceveva il reward. Questa pagina e' sempre raggiunta ->
                    // garantisce il cashback (skip se gia' applicato o se non club).
                    fetch(`${FUNCTIONS_BASE}/.netlify/functions/award-wallet-cashback`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ purchaseId: purchase.id }),
                    }).then(r => console.log('[PaymentSuccess] wallet cashback trigger:', r.status))
                      .catch(e => console.error('[PaymentSuccess] wallet cashback trigger failed:', e));

                    setUpdating(false);
                    return;
                }

                // 3. Try membership purchases
                const { data: memberships, error: membershipError } = await supabase
                    .from('membership_purchases')
                    .select('*')
                    .eq('nexi_order_id', orderId)
                    .limit(1);

                if (!membershipError && memberships && memberships.length > 0) {
                    const membership = memberships[0];
                    console.log('Found membership purchase:', membership.id);
                    setPurchaseType('membership');
                    setMembershipInfo({
                        tierName: membership.tier_name,
                        billingCycle: membership.billing_cycle,
                    });
                    // The callback handles payment status + metadata activation
                    // Just show the success page
                    setUpdating(false);
                    return;
                }

                // 4. Try DR7 Club subscriptions
                const { data: clubSubs, error: clubError } = await supabase
                    .from('dr7_club_subscriptions')
                    .select('*')
                    .eq('nexi_order_id', orderId)
                    .limit(1);

                if (!clubError && clubSubs && clubSubs.length > 0) {
                    const clubSub = clubSubs[0];
                    console.log('Found DR7 Club subscription:', clubSub.id);
                    setPurchaseType('dr7_club');

                    // Activate if callback hasn't done it yet
                    if (clubSub.status === 'pending') {
                        await supabase
                            .from('dr7_club_subscriptions')
                            .update({
                                status: 'active',
                                updated_at: new Date().toISOString(),
                            })
                            .eq('id', clubSub.id);
                    }

                    setUpdating(false);
                    return;
                }

                // Nothing found
                console.error('No order found for orderId:', orderId);
                setUpdateError(s('err_order_not_found_it', 'err_order_not_found_en'));
            } catch (error) {
                console.error('Unexpected error:', error);
                setUpdateError(s('err_generic_it', 'err_generic_en'));
            } finally {
                setUpdating(false);
            }
        };

        updatePaymentStatus();
    }, [orderId, authCode]);

    if (updating) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8">
                    <div className="text-center">
                        <div className="mx-auto w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-6">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">
                            {s('loading_title_it', 'loading_title_en')}
                        </h1>
                        <p className="text-gray-600">
                            {s('loading_subtitle_it', 'loading_subtitle_en')}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8">
                <div className="text-center">
                    <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>

                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        {s('success_title_it', 'success_title_en')}
                    </h1>

                    <p className="text-gray-600 mb-8">
                        {purchaseType === 'dr7_club'
                            ? s('body_dr7_club_it', 'body_dr7_club_en')
                            : purchaseType === 'membership'
                            ? applyTokens(s('body_membership_template_it', 'body_membership_template_en'), {
                                tierName: membershipInfo?.tierName || '',
                                cycle: membershipInfo?.billingCycle === 'monthly'
                                    ? s('billing_cycle_monthly_it', 'billing_cycle_monthly_en')
                                    : s('billing_cycle_annual_it', 'billing_cycle_annual_en'),
                            })
                            : purchaseType === 'wallet'
                            ? applyTokens(s('body_wallet_template_it', 'body_wallet_template_en'), {
                                packageName: walletInfo?.packageName || '',
                                amount: walletInfo?.receivedAmount?.toFixed(2) || '',
                            })
                            : s('body_generic_it', 'body_generic_en')}
                    </p>

                    {orderId && (
                        <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
                            <h3 className="font-semibold text-gray-700 mb-3">{s('transaction_heading_it', 'transaction_heading_en')}</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">{s('transaction_order_id_label_it', 'transaction_order_id_label_en')}</span>
                                    <span className="font-mono text-gray-900">{orderId}</span>
                                </div>
                                {amount && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">{s('transaction_amount_label_it', 'transaction_amount_label_en')}</span>
                                        <span className="font-semibold text-gray-900">€{(parseInt(amount) / 100).toFixed(2)}</span>
                                    </div>
                                )}
                                {authCode && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">{s('transaction_auth_code_label_it', 'transaction_auth_code_label_en')}</span>
                                        <span className="font-mono text-gray-900">{authCode}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="space-y-3">
                        <button
                            onClick={() => navigate('/')}
                            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 transition-all"
                        >
                            {s('cta_home_it', 'cta_home_en')}
                        </button>

                        {whatsappUrl && (
                            <a
                                href={whatsappUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block w-full bg-[#25D366] text-white py-3 px-6 rounded-lg font-semibold hover:bg-[#20bd5a] transition-all flex items-center justify-center gap-2"
                            >
                                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.592 2.654-.698c1.09.587 2.107.89 3.037.89h.007c3.181 0 5.768-2.587 5.768-5.776 0-1.545-.6-2.994-1.692-4.085-1.096-1.09-2.55-1.693-4.316-1.693l.002.015zm6.814 10.373c-1.045 1.049-2.227 1.58-3.567 1.458-1.5-.138-3.037-1.127-4.436-2.527-1.4-1.4-2.39-2.936-2.527-4.436-.122-1.341.408-2.523 1.458-3.567l.156-.155c.319-.317.76-.325 1.082-.016l1.373 1.346c.321.319.311.751.01.996l-.974.795c-.295.241-.482.72.064 1.266.545.546 1.023.36 1.265.064l.795-.974c.245-.301.677-.311.996.01l1.347 1.373c.31.322.302.763-.017 1.082l-.155.156z" />
                                </svg>
                                {s('cta_whatsapp_it', 'cta_whatsapp_en')}
                            </a>
                        )}

                        {purchaseType === 'membership' ? (
                            <button
                                onClick={() => navigate('/account/membership')}
                                className="w-full bg-gray-100 text-gray-700 py-3 px-6 rounded-lg font-semibold hover:bg-gray-200 transition-all"
                            >
                                {s('cta_membership_it', 'cta_membership_en')}
                            </button>
                        ) : purchaseType === 'wallet' ? (
                            <button
                                onClick={() => navigate('/credit-wallet')}
                                className="w-full bg-gray-100 text-gray-700 py-3 px-6 rounded-lg font-semibold hover:bg-gray-200 transition-all"
                            >
                                {s('cta_wallet_it', 'cta_wallet_en')}
                            </button>
                        ) : (
                            <button
                                onClick={() => navigate('/account/bookings')}
                                className="w-full bg-gray-100 text-gray-700 py-3 px-6 rounded-lg font-semibold hover:bg-gray-200 transition-all"
                            >
                                {s('cta_bookings_it', 'cta_bookings_en')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PaymentSuccessPage;

import type { Handler } from "@netlify/functions";
import { renderTemplate, resolveKeyForContext } from './utils/messageTemplates';
import { getInsuranceNameById } from './utils/centralinaProLookups';
import { formatLocation } from './utils/formatLocation';

const GREEN_API_INSTANCE_ID = process.env.GREEN_API_INSTANCE_ID;
const GREEN_API_TOKEN = process.env.GREEN_API_TOKEN;
const NOTIFICATION_PHONE = process.env.NOTIFICATION_PHONE || "393457905205";

// Return "Illimitati" whenever the booking is flagged unlimited OR the stored km count
// is the sentinel 9999 (≥). Otherwise the numeric km count. Never show "9999".
function formatKmInfo(booking: { booking_details?: Record<string, unknown> }): string {
  const bd = (booking.booking_details || {}) as Record<string, unknown>;
  const kmPkg = (bd.kmPackage || {}) as Record<string, unknown>;
  const unlimited =
    bd.unlimited_km === true
    || bd.unlimited_km === 'true'
    || bd.km_limit === 'Illimitati'
    || kmPkg.type === 'unlimited'
    || kmPkg.distance === 'unlimited';
  const rawIncluded = Number(kmPkg.includedKm ?? bd.km_limit ?? 0);
  if (unlimited || rawIncluded >= 9999) return 'Illimitati';
  return rawIncluded > 0 ? `${rawIncluded} km` : 'Illimitati';
}

/**
 * Build the standard placeholder variables from a booking. Used by BOTH:
 *   1. The legacy "booking-only" branch (no templateKey → picks
 *      rental_new_customer / carwash_new_customer / ecc.)
 *   2. The "templateKey + booking" branch used by
 *      process-scheduled-system-messages-cron, which fires a specific
 *      system_messages template against a real booking.
 *
 * Before this helper, the templateKey branch built vars only from
 * `templateVars` — when the cron sent { booking, messageKey } the body
 * inherited zero placeholders and customers received raw {vehicle_name}
 * / {pickup_date} / {booking_id} text. See May 2026 bug report.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildVarsFromBooking(booking: any, isCustomerMessage: boolean): Promise<Record<string, string>> {
  void isCustomerMessage;
  const customerName: string = booking.customer_name || booking.booking_details?.customer?.fullName || 'Cliente';
  const customerEmail: string = booking.customer_email || booking.booking_details?.customer?.email || '';
  const customerPhone: string = booking.customer_phone || booking.booking_details?.customer?.phone || '';
  const bookingId: string = (booking.id || '').substring(0, 8).toUpperCase();
  const totalPrice: string = booking.price_total != null ? (Number(booking.price_total) / 100).toFixed(2) : '';
  const notes: string = booking.booking_details?.notes || '';
  const paymentLabel: string =
    booking.payment_method === 'credit_wallet' || booking.payment_method === 'credit' ? 'Credit Wallet' :
    booking.payment_method === 'nexi' || booking.payment_method === 'Nexi Pay by Link' ? 'Carta' :
    (booking.payment_status === 'paid' || booking.payment_status === 'succeeded' || booking.payment_status === 'completed') ? 'Pagato' : 'Da saldare';

  const vars: Record<string, string> = {
    nome: customerName.split(' ')[0] || customerName,
    customer_name: customerName,
    cliente: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    booking_id: bookingId,
    total: totalPrice,
    totale: totalPrice,
    importo: totalPrice,
    amount: totalPrice,
    notes,
    note: notes,
    nota: notes,
    payment_status: paymentLabel,
    payment_method: booking.payment_method || '',
    payment_info: paymentLabel,
    pagamento: paymentLabel,
  };

  const serviceType = booking.service_type as string | undefined;
  if (serviceType === 'car_wash') {
    const appt = booking.appointment_date ? new Date(booking.appointment_date) : null;
    const plateValue: string = booking.vehicle_plate || booking.booking_details?.customerVehicle?.plate || booking.booking_details?.plate || booking.booking_details?.targa || '';
    const flexInfo: string = booking.booking_details?.prime_flex ? 'Prime Flex' : booking.booking_details?.dr7_flex ? 'DR7 Flex' : '';
    const baseService: string = booking.service_name || '';
    const composedService = flexInfo ? `${baseService} + ${flexInfo}` : baseService;
    const apptDateShort = appt ? appt.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' }) : '';
    const apptDateLong = appt ? appt.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' }) : '';
    const apptTime = appt ? appt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : '';
    Object.assign(vars, {
      service_name: composedService,
      servizio: composedService,
      plate: plateValue,
      targa: plateValue,
      date: apptDateShort,
      data: apptDateShort,
      data_lunga: apptDateLong,
      time: apptTime,
      ora: apptTime,
      appointment_date: apptDateShort,
      appointment_time: apptTime,
      pickup_date: apptDateShort,
      pickup_time: apptTime,
      extras: booking.booking_details?.additionalService || '',
      flex: flexInfo,
    });
  } else if (serviceType === 'mechanical' || serviceType === 'mechanical_service') {
    const appt = booking.appointment_date ? new Date(booking.appointment_date) : null;
    Object.assign(vars, {
      service_name: booking.service_name || '',
      pickup_date: appt ? appt.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' }) : '',
      pickup_time: appt ? appt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : '',
    });
  } else {
    const pickup = booking.pickup_date ? new Date(booking.pickup_date) : null;
    const dropoff = booking.dropoff_date ? new Date(booking.dropoff_date) : null;
    const depositAmount = Number(booking.deposit_amount || booking.booking_details?.deposit || 0);
    const depositOption = booking.booking_details?.depositOption;
    let depositStr = '';
    if (depositOption === 'no_deposit') {
      const sur = Number(booking.booking_details?.noDepositSurcharge || 0);
      depositStr = `Senza cauzione (+€${sur.toFixed(2)})`;
    } else if (depositAmount > 0) {
      depositStr = `€${depositAmount}`;
    }
    const insuranceName = await getInsuranceNameById(booking.insurance_option || booking.booking_details?.insuranceOption || '');
    Object.assign(vars, {
      vehicle_name: booking.vehicle_name || '',
      veicolo: booking.vehicle_name || '',
      // Tour Aria/Mare/Soggiorni: esperienza/data/orario/posti per pro_conferma_tour.
      esperienza: booking.vehicle_name || '',
      data: pickup ? pickup.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }) : '',
      orario: pickup ? pickup.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : '',
      posti: booking.booking_details?.seats || (booking.booking_details?.seat_count != null ? String(booking.booking_details.seat_count) : ''),
      plate: booking.vehicle_plate || '',
      targa: booking.vehicle_plate || '',
      pickup_date: pickup ? pickup.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }) : '',
      pickup_time: pickup ? pickup.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : '',
      ritiro_data: pickup ? pickup.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }) : '',
      ritiro_ora: pickup ? pickup.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : '',
      dropoff_date: dropoff ? dropoff.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }) : '',
      dropoff_time: dropoff ? dropoff.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : '',
      riconsegna_data: dropoff ? dropoff.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }) : '',
      riconsegna_ora: dropoff ? dropoff.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : '',
      pickup_location: formatLocation(booking.pickup_location),
      dropoff_location: formatLocation(booking.dropoff_location),
      luogo_ritiro: formatLocation(booking.pickup_location),
      luogo_riconsegna: formatLocation(booking.dropoff_location),
      insurance: insuranceName,
      assicurazione: insuranceName,
      deposit: depositStr,
      cauzione: depositStr,
      caution: depositStr,
      km_info: formatKmInfo(booking),
      km: formatKmInfo(booking),
      chilometraggio: formatKmInfo(booking),
      flex: booking.booking_details?.dr7_flex || booking.booking_details?.dr7Flex ? 'DR7 Flex' : '',
    });
  }
  return vars;
}

/**
 * Sends a WhatsApp notification via Green API.
 *
 * ZERO HARDCODED MESSAGE BODIES.
 * Every body comes from Messaggi di Sistema Pro (table `system_messages`,
 * keys prefixed `pro_*`). Legacy keys (rental_new_customer, carwash_new, …)
 * are resolved to their Pro equivalent by `resolveKeyForContext`. If no Pro
 * template is mapped OR the template is disabled/empty, we skip the send.
 *
 * Accepted payload shapes:
 *   { booking: {...}, customPhone?: string, skipHeader?: boolean }
 *   { customMessage: string, customPhone: string }
 *   { templateKey: string, templateVars?: Record<string,string>, customPhone: string }
 */
const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }
  if (!GREEN_API_INSTANCE_ID || !GREEN_API_TOKEN) {
    console.error('Green API not configured.');
    return { statusCode: 500, body: JSON.stringify({ message: 'Green API not configured' }) };
  }

  const body = JSON.parse(event.body || '{}');
  const { booking, customMessage, customPhone, skipHeader, templateVars } = body;
  // Accept both templateKey (this function's documented param) and
  // messageKey (used by process-scheduled-system-messages-cron). Without
  // this alias the cron's explicit template was IGNORED, the function
  // fell into the booking-default branch and sent rental_new_customer
  // again — causing duplicate confirmations + the targeted template
  // (e.g. DR7 Privilege) never reaching the customer.
  const templateKey: string | undefined = body.templateKey || body.messageKey;

  // ── Target phone ──
  let targetPhone: string = String(customPhone || NOTIFICATION_PHONE).replace(/[\s\-+]/g, '');
  if (targetPhone.startsWith('0')) targetPhone = '39' + targetPhone.substring(1);
  if (!targetPhone.startsWith('39') && targetPhone.length === 10) targetPhone = '39' + targetPhone;

  const isCustomerMessage = !!customPhone;

  // ── Build the message ──
  let message: string | null = null;

  if (customMessage) {
    // Admin-authored free text — already composed upstream.
    message = customMessage;
  } else if (templateKey) {
    // Explicit template key → resolved to Pro → rendered with templateVars.
    // Caller passes keys like '{nome}' (with braces) OR bare 'nome'.
    const resolvedKey = await resolveKeyForContext(String(templateKey));
    if (resolvedKey === null) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, skipped: true, reason: 'pro_template_unavailable', key: templateKey }),
      };
    }
    // Normalize var keys: renderTemplate uses {var} syntax; strip braces if the caller sent them.
    const vars: Record<string, string> = {};
    if (templateVars && typeof templateVars === 'object') {
      for (const [k, v] of Object.entries(templateVars as Record<string, unknown>)) {
        const cleanKey = k.replace(/^\{|\}$/g, '');
        vars[cleanKey] = v == null ? '' : String(v);
      }
    }
    // If a booking is ALSO provided, enrich vars with the standard
    // booking-derived placeholders (vehicle_name, pickup_date, booking_id,
    // ecc.). Without this enrichment, automatic crons that pass
    // { booking, messageKey } received a body with empty vars and the
    // raw {vehicle_name}/{booking_id}/{pickup_date} placeholders leaked
    // into the customer's WhatsApp (visible bug, May 2026).
    if (booking) {
      Object.assign(vars, await buildVarsFromBooking(booking, !!customPhone));
    }
    message = await renderTemplate(resolvedKey, vars, undefined, booking ? { vehiclePlate: booking.vehicle_plate } : undefined);
  } else if (booking) {
    const serviceType = booking.service_type as string | undefined;
    // TOUR (elicottero/barca/soggiorno): evento dedicato -> template "Conferma
    // Tour" (pro_conferma_tour). Prima cadeva nel ramo noleggio e il cliente
    // riceveva "NUOVA PRENOTAZIONE NOLEGGIO" invece della conferma tour.
    const isTour = serviceType === 'heli_rental' || serviceType === 'boat_rental' || serviceType === 'stay_rental';
    const legacyKey =
      serviceType === 'car_wash' ? (isCustomerMessage ? 'carwash_new_customer' : 'carwash_new_admin') :
      serviceType === 'mechanical' || serviceType === 'mechanical_service' ? (isCustomerMessage ? 'mechanical_new_customer' : 'mechanical_new_admin') :
      isTour ? (isCustomerMessage ? 'tour_new_customer' : 'tour_new_admin') :
      (isCustomerMessage ? 'rental_new_customer' : 'rental_new_admin');

    const resolvedKey = await resolveKeyForContext(legacyKey);
    if (resolvedKey === null) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, skipped: true, reason: 'pro_template_unavailable', key: legacyKey }),
      };
    }

    // Build template variables from the booking
    const customerName: string = booking.customer_name || booking.booking_details?.customer?.fullName || 'Cliente';
    const customerEmail: string = booking.customer_email || booking.booking_details?.customer?.email || '';
    const customerPhone: string = booking.customer_phone || booking.booking_details?.customer?.phone || '';
    const bookingId: string = (booking.id || '').substring(0, 8).toUpperCase();
    const totalPrice: string = booking.price_total != null ? (Number(booking.price_total) / 100).toFixed(2) : '';
    const notes: string = booking.booking_details?.notes || '';
    const paymentLabel: string =
      booking.payment_method === 'credit_wallet' || booking.payment_method === 'credit' ? 'Credit Wallet' :
      booking.payment_method === 'nexi' || booking.payment_method === 'Nexi Pay by Link' ? 'Carta' :
      (booking.payment_status === 'paid' || booking.payment_status === 'succeeded' || booking.payment_status === 'completed') ? 'Pagato' : 'Da saldare';

    const vars: Record<string, string> = {
      nome: customerName.split(' ')[0] || customerName,
      customer_name: customerName,
      cliente: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone,
      booking_id: bookingId,
      total: totalPrice,
      totale: totalPrice,
      importo: totalPrice,
      amount: totalPrice,
      notes,
      note: notes,
      nota: notes,
      payment_status: paymentLabel,
      payment_method: booking.payment_method || '',
      // Italian aliases — Pro / system templates often use {payment_info}
      // and {pagamento}; without these the literal placeholder leaks into
      // the customer's WhatsApp message (visible bug: "Pagamento: {payment_info}").
      payment_info: paymentLabel,
      pagamento: paymentLabel,
    };

    if (serviceType === 'car_wash') {
      const appt = booking.appointment_date ? new Date(booking.appointment_date) : null;
      const plateValue: string = booking.vehicle_plate || booking.booking_details?.customerVehicle?.plate || booking.booking_details?.plate || booking.booking_details?.targa || '';
      const flexInfo: string = booking.booking_details?.prime_flex ? 'Prime Flex' : booking.booking_details?.dr7_flex ? 'DR7 Flex' : '';
      const baseService: string = booking.service_name || '';
      const composedService = flexInfo ? `${baseService} + ${flexInfo}` : baseService;
      const apptDateShort = appt ? appt.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' }) : '';
      const apptDateLong = appt ? appt.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' }) : '';
      const apptTime = appt ? appt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : '';
      Object.assign(vars, {
        service_name: composedService,
        servizio: composedService,
        plate: plateValue,
        targa: plateValue,
        date: apptDateShort,
        data: apptDateShort,
        data_lunga: apptDateLong,
        time: apptTime,
        ora: apptTime,
        appointment_date: apptDateShort,
        appointment_time: apptTime,
        pickup_date: apptDateShort,
        pickup_time: apptTime,
        extras: booking.booking_details?.additionalService || '',
        flex: flexInfo,
      });
    } else if (serviceType === 'mechanical' || serviceType === 'mechanical_service') {
      const appt = booking.appointment_date ? new Date(booking.appointment_date) : null;
      Object.assign(vars, {
        service_name: booking.service_name || '',
        pickup_date: appt ? appt.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' }) : '',
        pickup_time: appt ? appt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : '',
      });
    } else {
      // Rental
      const pickup = booking.pickup_date ? new Date(booking.pickup_date) : null;
      const dropoff = booking.dropoff_date ? new Date(booking.dropoff_date) : null;
      const depositAmount = Number(booking.deposit_amount || booking.booking_details?.deposit || 0);
      const depositOption = booking.booking_details?.depositOption;
      let depositStr = '';
      if (depositOption === 'no_deposit') {
        const sur = Number(booking.booking_details?.noDepositSurcharge || 0);
        depositStr = `Senza cauzione (+€${sur.toFixed(2)})`;
      } else if (depositAmount > 0) {
        depositStr = `€${depositAmount}`;
      }
      Object.assign(vars, {
        vehicle_name: booking.vehicle_name || '',
        veicolo: booking.vehicle_name || '',
        plate: booking.vehicle_plate || '',
        targa: booking.vehicle_plate || '',
        pickup_date: pickup ? pickup.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }) : '',
        pickup_time: pickup ? pickup.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : '',
        ritiro_data: pickup ? pickup.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }) : '',
        ritiro_ora: pickup ? pickup.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : '',
        dropoff_date: dropoff ? dropoff.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }) : '',
        dropoff_time: dropoff ? dropoff.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : '',
        riconsegna_data: dropoff ? dropoff.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }) : '',
        riconsegna_ora: dropoff ? dropoff.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }) : '',
        pickup_location: formatLocation(booking.pickup_location),
        dropoff_location: formatLocation(booking.dropoff_location),
        luogo_ritiro: formatLocation(booking.pickup_location),
        luogo_riconsegna: formatLocation(booking.dropoff_location),
        insurance: await getInsuranceNameById(booking.insurance_option || booking.booking_details?.insuranceOption || ''),
        assicurazione: await getInsuranceNameById(booking.insurance_option || booking.booking_details?.insuranceOption || ''),
        // Deposit/cauzione — both English and Italian aliases. Without
        // {cauzione} a Pro template referencing the Italian placeholder
        // would render as empty when the customer picked "Senza cauzione".
        deposit: depositStr,
        cauzione: depositStr,
        caution: depositStr,
        km_info: formatKmInfo(booking),
        km: formatKmInfo(booking),
        chilometraggio: formatKmInfo(booking),
        flex: booking.booking_details?.dr7_flex || booking.booking_details?.dr7Flex ? 'DR7 Flex' : '',
      });
    }

    message = await renderTemplate(resolvedKey, vars, undefined, { vehiclePlate: booking.vehicle_plate });
  } else {
    return { statusCode: 400, body: JSON.stringify({ message: 'No booking or custom message provided' }) };
  }

  if (!message || !message.trim()) {
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, skipped: true, reason: 'empty_body_no_template' }),
    };
  }

  // Strip zero-width / invisible Unicode characters that often hitchhike
  // when admins paste template bodies from rich-text sources. They're
  // visually invisible but break WhatsApp's URL auto-linking — a clean
  // "www.dr7.app" suddenly becomes a non-clickable string because
  // a Word Joiner (U+2060) or Zero-Width Space (U+200B) sits next to it.
  // Stripping these has no visible side effect on legitimate text.
  message = message.replace(/[\u200B-\u200D\u2060\uFEFF\u180E]/g, '');

  // skipHeader is handled by the Pro wrapper logic inside messageTemplates
  // (the template's own `include_header` flag decides). Retained as a no-op
  // hint in the payload for legacy callers.
  void skipHeader;

  try {
    const greenApiUrl = `https://api.green-api.com/waInstance${GREEN_API_INSTANCE_ID}/sendMessage/${GREEN_API_TOKEN}`;
    const response = await fetch(greenApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: `${targetPhone}@c.us`, message }),
    });
    const result = await response.json();
    if (!response.ok || result.error) {
      console.error('Green API error:', result);
      throw new Error(result.error || 'Green API error');
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'WhatsApp notification sent via Green API', success: true, messageId: result.idMessage }),
    };
  } catch (error: any) {
    console.error('Error sending WhatsApp notification:', error);
    return { statusCode: 500, body: JSON.stringify({ message: 'Error sending WhatsApp notification', error: error.message }) };
  }
};

export { handler };

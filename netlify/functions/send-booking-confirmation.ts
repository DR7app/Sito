import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import nodemailer from "nodemailer";
import { createCalendarEvent, formatCarRentalEvent, formatCarWashEvent } from './utils/googleCalendar';
import { getInsuranceNameById } from './utils/centralinaProLookups';

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  console.log('📧 [send-booking-confirmation] Function invoked');

  if (event.httpMethod !== 'POST') {
    console.error('❌ Invalid HTTP method:', event.httpMethod);
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  }

  const { booking } = JSON.parse(event.body || '{}');

  if (!booking) {
    console.error('❌ No booking data provided');
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Booking data is required' }),
    };
  }

  console.log('📋 Processing booking:', {
    id: booking.id,
    service_type: booking.service_type,
    customer_email: booking.customer_email || booking.booking_details?.customer?.email,
    payment_status: booking.payment_status
  });

  // Check SMTP credentials
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    console.error('❌ Missing SMTP credentials in environment variables');
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Email service not configured' }),
    };
  }

  console.log('✅ SMTP credentials found, creating transporter...');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.secureserver.net',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  // Extract data from booking structure
  const serviceType = booking.service_type; // 'car_wash' or null (car rental)
  const customerEmail = booking.customer_email || booking.booking_details?.customer?.email || booking.customer?.email;
  const customerName = booking.customer_name || booking.booking_details?.customer?.fullName || booking.customer?.fullName || 'Cliente';
  const bookingId = booking.id;
  const totalPrice = booking.price_total / 100; // Convert from cents to euros
  const currency = booking.currency || 'EUR';

  // Generate email content based on service type
  let emailSubject = '';
  let emailHtml = '';

  if (serviceType === 'car_wash') {
    // Car Wash Booking Email
    const appointmentDate = new Date(booking.appointment_date);
    const serviceName = booking.service_name;
    const additionalService = booking.booking_details?.additionalService;
    const notes = booking.booking_details?.notes;

    // Format date in Europe/Rome timezone with dd/mm/yyyy format
    const formattedDate = appointmentDate.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Europe/Rome'
    });
    // Use the appointment_time field directly (e.g., "16:30") as it's the source of truth
    const formattedTime = booking.appointment_time || appointmentDate.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Europe/Rome'
    });

    emailSubject = `🚗 Conferma Prenotazione Autolavaggio #${bookingId.substring(0, 8).toUpperCase()}`;
    emailHtml = `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #000; border-bottom: 2px solid #000; padding-bottom: 10px;">🚗 Prenotazione Autolavaggio Confermata!</h1>
        <p>Gentile ${customerName},</p>
        <p>Grazie per aver prenotato il servizio di autolavaggio con DR7. Ecco il riepilogo del tuo appuntamento:</p>

        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h2 style="margin-top: 0;">Riepilogo Appuntamento</h2>
          <p><strong>Servizio:</strong> ${serviceName}</p>
          <p><strong>Numero Prenotazione:</strong> DR7-${bookingId.substring(0, 8).toUpperCase()}</p>
          <p><strong>Data e Ora:</strong> ${formattedDate} alle ${formattedTime}</p>
          ${additionalService ? `<p><strong>Servizio Aggiuntivo:</strong> ${additionalService}</p>` : ''}
          ${notes ? `<p><strong>Note:</strong> ${notes}</p>` : ''}
        </div>

        <h3 style="font-size: 24px;">Totale: ${new Intl.NumberFormat('it-IT', { style: 'currency', currency: currency }).format(totalPrice)}</h3>

        <div style="background: #e3f2fd; padding: 15px; border-left: 4px solid #2196f3; margin: 20px 0;">
          <p style="margin: 0;"><strong>📍 Orari di apertura:</strong> Lunedì - Sabato, 9:00 - 20:00</p>
          <p style="margin: 5px 0 0 0;"><strong>⚠️</strong> Chiusi la domenica</p>
        </div>

        <p style="margin-top: 30px;">Ti aspettiamo al tuo appuntamento!</p>
        <p><strong>DR7 Team</strong></p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        <p style="font-size: 12px; color: #666;">
          Per qualsiasi domanda, contattaci all'indirizzo <a href="mailto:info@dr7.app">info@dr7.app</a>
        </p>
      </div>
    `;
  } else {
    // Car Rental Booking Email
    const vehicleName = booking.vehicle_name;
    const pickupDate = new Date(booking.pickup_date);
    const dropoffDate = new Date(booking.dropoff_date);
    const customerPhone = booking.customer_phone || booking.booking_details?.customer?.phone || 'N/A';
    const insuranceOption = booking.insurance_option || booking.booking_details?.insuranceOption || '';

    // Nome dell'assicurazione: unica fonte Centralina Pro. Se la Centralina
    // non conosce l'id salvato, resta vuoto — mai l'id grezzo in una mail al
    // cliente, mai un nome scritto nel codice.
    const insuranceDisplayName = await getInsuranceNameById(insuranceOption);

    // Get deposit from booking data (calculated in frontend based on loyalty/membership)
    const depositAmount = booking.deposit_amount !== undefined && booking.deposit_amount !== null
      ? (booking.deposit_amount === 0 ? '0€' : `${booking.deposit_amount}€`)
      : 'N/A';

    // Get pickup location - replace dr7_office with actual address
    let pickupLocation = booking.pickup_location || 'DR7 Office';
    if (pickupLocation === 'dr7_office' || pickupLocation === 'DR7 Office') {
      pickupLocation = 'Viale Marconi, 229, 09131 Cagliari CA';
    }

    // Format dates and times in Europe/Rome timezone with dd/mm/yyyy and 24-hour format
    const pickupDateFormatted = pickupDate.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' });
    const pickupTimeFormatted = pickupDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Rome' });
    const dropoffDateFormatted = dropoffDate.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' });
    const dropoffTimeFormatted = dropoffDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Rome' });

    emailSubject = `Conferma Prenotazione #${bookingId.substring(0, 8).toUpperCase()}`;
    emailHtml = `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #000; border-bottom: 2px solid #000; padding-bottom: 10px;">Prenotazione Confermata!</h1>
        <p>Gentile ${customerName},</p>
        <p>Grazie per aver prenotato con DR7. Ecco il riepilogo della tua prenotazione:</p>

        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h2 style="margin-top: 0;">Riepilogo Prenotazione</h2>
          <p><strong>Veicolo:</strong> ${vehicleName}</p>
          <p><strong>Numero Prenotazione:</strong> DR7-${bookingId.substring(0, 8).toUpperCase()}</p>
          <p><strong>Nome:</strong> ${customerName}</p>
          <p><strong>Email:</strong> ${customerEmail}</p>
          <p><strong>Telefono:</strong> ${customerPhone}</p>
          <p><strong>Data e Ora Ritiro:</strong> ${pickupDateFormatted} alle ${pickupTimeFormatted}</p>
          <p><strong>Data e Ora Riconsegna:</strong> ${dropoffDateFormatted} alle ${dropoffTimeFormatted}</p>
          <p><strong>Luogo di Ritiro:</strong> ${pickupLocation}</p>
          <p><strong>Assicurazione:</strong> ${insuranceDisplayName}</p>
          <p><strong>Cauzione:</strong> ${depositAmount}</p>
          ${booking.booking_details?.secondDriver ? `
          <p style="margin-top: 10px;"><strong>Secondo Conducente:</strong> ${booking.booking_details.secondDriver.fullName || `${booking.booking_details.secondDriver.firstName} ${booking.booking_details.secondDriver.lastName}`}</p>
          <p><strong>Telefono 2° conducente:</strong> ${booking.booking_details.secondDriver.phone || 'N/A'}</p>
          ` : ''}
          <p><strong>Stato Pagamento:</strong> ${booking.payment_status === 'pending' ? 'In attesa' : 'Completato'}</p>
        </div>

        <h3 style="font-size: 24px;">Costo Totale: ${new Intl.NumberFormat('it-IT', { style: 'currency', currency: currency }).format(totalPrice)}</h3>

        ${booking.payment_method === 'agency' ? `
          <p style="background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0;">
            <strong>⚠️ Nota:</strong> Il pagamento sarà effettuato in sede al momento del ritiro del veicolo.
          </p>
        ` : ''}

        <p style="margin-top: 30px;">Ti aspettiamo!</p>
        <p><strong>DR7 Team</strong></p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        <p style="font-size: 12px; color: #666;">
          Per qualsiasi domanda, contattaci all'indirizzo <a href="mailto:info@dr7.app">info@dr7.app</a>
        </p>
      </div>
    `;
  }

  const customerMailOptions = {
    from: `"DR7" <info@dr7.app>`,
    to: customerEmail,
    subject: emailSubject,
    html: emailHtml,
  };

  // Admin notification email
  const adminMailOptions = {
    from: `"DR7" <info@dr7.app>`,
    to: 'info@dr7.app',
    subject: `[NUOVA PRENOTAZIONE] ${emailSubject}`,
    html: emailHtml,
  };

  try {
    // Send email to customer
    console.log('📤 Sending email to customer:', customerEmail);
    await transporter.sendMail(customerMailOptions);
    console.log('✅ Customer email sent successfully to:', customerEmail);

    // Send copy to admin (blocking to catch errors)
    try {
      console.log('📤 Sending notification to admin: info@dr7.app');
      await transporter.sendMail(adminMailOptions);
      console.log('✅ Admin notification email sent successfully');
    } catch (adminError: any) {
      console.error('❌ Failed to send admin notification:', adminError.message);
      console.error('Admin email error details:', {
        code: adminError.code,
        command: adminError.command,
        response: adminError.response,
        responseCode: adminError.responseCode
      });
    }

    // Create Google Calendar event (non-blocking)
    try {
      console.log('🗓️ Starting calendar event creation...');
      console.log('Service type:', serviceType);
      console.log('Booking data:', JSON.stringify(booking, null, 2));

      const eventDetails = serviceType === 'car_wash'
        ? formatCarWashEvent(booking)
        : formatCarRentalEvent(booking);

      console.log('Event details formatted:', JSON.stringify(eventDetails, null, 2));

      await createCalendarEvent(eventDetails);
      console.log('✅ Calendar event created successfully');
    } catch (calendarError: any) {
      console.error('❌ Failed to create calendar event:', calendarError);
      console.error('Error message:', calendarError.message);
      console.error('Error stack:', calendarError.stack);
      // Don't fail the entire request if calendar creation fails
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Email sent successfully' }),
    };
  } catch (error: any) {
    console.error('❌ Critical error sending email:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      stack: error.stack
    });
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error sending email',
        error: error.message,
        code: error.code
      }),
    };
  }
};

export { handler };

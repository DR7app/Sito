const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

/**
 * Scheduled function — runs daily at 06:00 UTC
 * Sends WhatsApp + Email reminders ONLY for membership packages expiring within 3 days.
 * Does NOT touch bookings, credit wallet, or any other purchase type.
 */
exports.handler = async (event) => {
  console.log('=== Membership Reminder Cron Started ===');

  // Require service role key for admin queries
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return { statusCode: 500, body: 'Server configuration error' };
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const siteUrl = process.env.URL || 'https://dr7.app';

  // Find memberships expiring in the next 3 days
  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const { data: expiringMemberships, error: queryError } = await supabase
    .from('membership_purchases')
    .select('*')
    .eq('payment_status', 'succeeded')
    .eq('subscription_status', 'active')
    .lte('renewal_date', threeDaysFromNow.toISOString())
    .gte('renewal_date', now.toISOString());

  if (queryError) {
    console.error('Error querying expiring memberships:', queryError);
    return { statusCode: 500, body: 'Query error' };
  }

  if (!expiringMemberships || expiringMemberships.length === 0) {
    console.log('No memberships expiring in the next 3 days.');
    return { statusCode: 200, body: 'No reminders to send' };
  }

  console.log(`Found ${expiringMemberships.length} membership(s) expiring soon.`);

  // Setup email transporter
  let transporter = null;
  if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.secureserver.net',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }

  // Green API config
  const greenInstanceId = process.env.GREEN_API_INSTANCE_ID;
  const greenToken = process.env.GREEN_API_TOKEN;

  let sent = 0;
  let failed = 0;

  for (const membership of expiringMemberships) {
    try {
      const renewalDate = new Date(membership.renewal_date);
      const daysLeft = Math.ceil((renewalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const formattedExpiry = renewalDate.toLocaleDateString('it-IT', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });

      // Build renewal link
      const renewalLink = `${siteUrl}/membership/enroll/${membership.tier_id}?billing=${membership.billing_cycle}`;

      // Get user email from auth.users
      let userEmail = null;
      let userName = null;
      if (membership.user_id) {
        const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(membership.user_id);
        if (!userErr && userData?.user) {
          userEmail = userData.user.email;
          userName = userData.user.user_metadata?.full_name || userData.user.user_metadata?.name || null;
        }
      }

      // Get user phone from customers_extended
      let userPhone = null;
      if (membership.user_id) {
        const { data: customer } = await supabase
          .from('customers_extended')
          .select('telefono, nome, cognome')
          .eq('user_id', membership.user_id)
          .single();

        if (customer) {
          userPhone = customer.telefono;
          if (!userName && (customer.nome || customer.cognome)) {
            userName = `${customer.nome || ''} ${customer.cognome || ''}`.trim();
          }
        }
      }

      const displayName = userName || 'Cliente';

      console.log(`Processing reminder for user ${membership.user_id}: ${displayName}, tier=${membership.tier_name}, expires=${formattedExpiry}, daysLeft=${daysLeft}`);

      // --- Send WhatsApp reminder to customer ---
      if (userPhone && greenInstanceId && greenToken) {
        // Clean phone for Green API
        // Solo cifre: \s non prende gli invisibili (es. U+202D) che i
        // telefoni infilano nei contatti, e restavano nel chatId.
        let cleanPhone = userPhone.replace(/\D/g, '');
        if (cleanPhone.startsWith('00')) cleanPhone = cleanPhone.substring(2);
        if (cleanPhone.startsWith('0')) {
          cleanPhone = '39' + cleanPhone.substring(1);
        }
        if (!cleanPhone.startsWith('39') && cleanPhone.length === 10) {
          cleanPhone = '39' + cleanPhone;
        }

        const whatsappMsg =
          `Ciao ${displayName}!\n\n` +
          `La tua membership *${membership.tier_name}* scade il *${formattedExpiry}* (tra ${daysLeft} giorn${daysLeft === 1 ? 'o' : 'i'}).\n\n` +
          `Rinnova subito per continuare a usufruire dei tuoi vantaggi esclusivi:\n` +
          `${renewalLink}\n\n` +
          `Per qualsiasi domanda, rispondi a questo messaggio.\n\n` +
          `DR7 Team`;

        try {
          const greenApiUrl = `https://api.green-api.com/waInstance${greenInstanceId}/sendMessage/${greenToken}`;
          const waResponse = await fetch(greenApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chatId: `${cleanPhone}@c.us`,
              message: whatsappMsg,
            }),
          });

          if (waResponse.ok) {
            console.log(`WhatsApp reminder sent to ${cleanPhone}`);
          } else {
            console.error(`WhatsApp send failed for ${cleanPhone}:`, await waResponse.text());
          }
        } catch (waErr) {
          console.error(`WhatsApp error for user ${membership.user_id}:`, waErr.message);
        }
      }

      // --- Send Email reminder to customer ---
      if (userEmail && transporter) {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #000; border-bottom: 2px solid #000; padding-bottom: 10px;">La tua Membership sta per scadere</h1>
            <p>Ciao ${escapeHtml(displayName)},</p>
            <p>Ti informiamo che la tua membership <strong>${escapeHtml(membership.tier_name)}</strong> scade il <strong>${formattedExpiry}</strong> (tra ${daysLeft} giorn${daysLeft === 1 ? 'o' : 'i'}).</p>

            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h2 style="margin-top: 0;">Riepilogo Membership</h2>
              <p><strong>Piano:</strong> ${escapeHtml(membership.tier_name)}</p>
              <p><strong>Ciclo:</strong> ${membership.billing_cycle === 'monthly' ? 'Mensile' : 'Annuale'}</p>
              <p><strong>Scadenza:</strong> ${formattedExpiry}</p>
            </div>

            <p>Rinnova subito per continuare a usufruire di tutti i vantaggi esclusivi:</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${renewalLink}" style="display: inline-block; background: #000; color: #fff; padding: 14px 32px; border-radius: 50px; text-decoration: none; font-weight: bold; font-size: 16px;">
                Rinnova Membership
              </a>
            </div>

            <p style="margin-top: 30px;">A presto!</p>
            <p><strong>DR7 Team</strong></p>

            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
            <p style="font-size: 12px; color: #666;">
              Per qualsiasi domanda, contattaci all'indirizzo <a href="mailto:info@dr7.app">info@dr7.app</a>
            </p>
          </div>
        `;

        try {
          await transporter.sendMail({
            from: '"DR7" <info@dr7.app>',
            to: userEmail,
            subject: `La tua membership ${membership.tier_name} scade tra ${daysLeft} giorn${daysLeft === 1 ? 'o' : 'i'}`,
            html: emailHtml,
          });
          console.log(`Email reminder sent to ${userEmail}`);
        } catch (emailErr) {
          console.error(`Email error for ${userEmail}:`, emailErr.message);
        }
      }

      // --- Notify admin via WhatsApp ---
      if (greenInstanceId && greenToken) {
        const adminPhone = process.env.NOTIFICATION_PHONE || '393457905205';
        const adminMsg =
          `Promemoria Membership in Scadenza\n\n` +
          `Cliente: ${displayName}\n` +
          `Email: ${userEmail || 'N/A'}\n` +
          `Telefono: ${userPhone || 'N/A'}\n` +
          `Tier: ${membership.tier_name}\n` +
          `Scade: ${formattedExpiry} (${daysLeft}g)\n` +
          `Link rinnovo: ${renewalLink}`;

        try {
          const greenApiUrl = `https://api.green-api.com/waInstance${greenInstanceId}/sendMessage/${greenToken}`;
          await fetch(greenApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chatId: `${adminPhone}@c.us`,
              message: adminMsg,
            }),
          });
        } catch (adminWaErr) {
          console.error('Admin WhatsApp notification failed:', adminWaErr.message);
        }
      }

      sent++;
    } catch (err) {
      console.error(`Error processing membership ${membership.id}:`, err.message);
      failed++;
    }
  }

  console.log(`=== Membership Reminders Complete: ${sent} sent, ${failed} failed ===`);
  return { statusCode: 200, body: `Reminders sent: ${sent}, failed: ${failed}` };
};

// HTML escape helper
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

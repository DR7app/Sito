const nodemailer = require('nodemailer');

exports.handler = async (event) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const body = event.body ? JSON.parse(event.body) : {};
        const { email, fullName } = body;

        if (!email) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Email is required' }),
            };
        }

        // Create transporter
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.secureserver.net',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD,
            },
        });

        // Email content
        const mailOptions = {
            from: '"DR7" <info@dr7.app>',
            to: email,
            subject: 'Account Deletion Confirmation - DR7',
            html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #000; color: #fff; padding: 20px; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 8px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>DR7</h1>
            </div>
            <div class="content">
              <h2>Account Deletion Confirmed</h2>
              <p>Hello ${fullName || 'Customer'},</p>
              <p>This email confirms that your DR7 account has been successfully deleted.</p>
              <p><strong>What was deleted:</strong></p>
              <ul>
                <li>Your profile and personal information</li>
                <li>All booking history</li>
                <li>Membership status and benefits</li>
                <li>Credit wallet balance</li>
              </ul>
              <p>If you did not request this deletion, please contact us immediately at <a href="mailto:${process.env.SMTP_USER}">${process.env.SMTP_USER}</a>.</p>
              <p>We're sorry to see you go. If you'd like to return in the future, you're always welcome to create a new account.</p>
              <p>Best regards,<br>The DR7 Team</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} DR7. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
        };

        // Send email
        await transporter.sendMail(mailOptions);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Deletion confirmation email sent' }),
        };
    } catch (error) {
        console.error('Error sending deletion confirmation email:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to send email' }),
        };
    }
};

const sgMail = require('@sendgrid/mail');

// Initialize SendGrid with API key
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  console.warn('⚠️ SENDGRID_API_KEY not found in environment variables');
}

// Safe debug logger (no secrets). Enable with EMAIL_DEBUG=true
function dbg(...args) {
  if (process.env.EMAIL_DEBUG === 'true') {
    console.log('📧 SendGrid:', ...args);
  }
}

function buildFromAddress() {
  const {
    FROM_EMAIL,
    FROM_NAME,
    EMAIL_FROM,
    EMAIL_FROM_NAME,
    EMAIL_FROM_ADDRESS,
    EMAIL_USER
  } = process.env;

  // Use new SendGrid environment variables first
  const email = FROM_EMAIL || EMAIL_FROM_ADDRESS || EMAIL_USER;
  const name = FROM_NAME || EMAIL_FROM_NAME || 'GouMo Dance Chronicles';

  if (EMAIL_FROM) return EMAIL_FROM;
  
  if (email && name) {
    return { email, name };
  }
  
  if (email) {
    return { email, name: 'GouMo Dance Chronicles' };
  }

  // Fallback to hardcoded values if env vars not set
  return { 
    email: 'goumodnzchronicles@gmail.com', 
    name: 'GouMo Dance Chronicles' 
  };
}

/**
 * Sends a registration confirmation email using SendGrid.
 * @param {string} to - Recipient email
 * @param {Object} data - Email payload
 * @param {string} data.courseName
 * @param {string} [data.scheduleInfo]
 * @param {number|string} data.amount
 * @param {number|string} data.registrationId
 * @param {string} [data.studentName]
 */
async function sendRegistrationConfirmationEmail(to, data = {}) {
  if (!process.env.SENDGRID_API_KEY) {
    throw new Error('SendGrid API key is not configured. Please set SENDGRID_API_KEY environment variable.');
  }

  const {
    courseName,
    scheduleInfo,
    amount,
    registrationId,
    studentName
  } = data;

  const from = buildFromAddress();
  const subject = `Registration Confirmed - ${courseName || 'Dance Class'}`;
  const safeAmount = typeof amount === 'number' ? amount.toFixed(2) : amount;

  // Create improved HTML email with better deliverability
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Registration Confirmed - ${escapeHtml(courseName || 'Dance Class')}</title>
    </head>
    <body style="margin:0; padding:0; font-family:Arial, sans-serif; background-color:#f5f5f5;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5; padding:20px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
              <!-- Header -->
              <tr>
                <td style="padding:30px 30px 20px; text-align:center; background-color:#e91e63; border-radius:8px 8px 0 0;">
                  <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:bold;">Registration Confirmed!</h1>
                  <p style="margin:8px 0 0; color:#ffcccb; font-size:14px;">GouMo Dance Chronicles</p>
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding:30px;">
                  <p style="margin:0 0 16px; font-size:16px; color:#333; line-height:1.5;">
                    Hi ${studentName ? escapeHtml(studentName) : 'Student'},
                  </p>
                  
                  <p style="margin:0 0 20px; font-size:16px; color:#333; line-height:1.5;">
                    Your payment has been confirmed for <strong>${escapeHtml(courseName || 'Dance Class')}</strong>. Welcome to the class!
                  </p>
                  
                  <!-- Registration Details -->
                  <table width="100%" cellpadding="8" cellspacing="0" border="0" style="background-color:#f8f9fa; border-radius:6px; margin:20px 0;">
                    <tr>
                      <td style="padding:20px;">
                        <h3 style="margin:0 0 16px; color:#e91e63; font-size:18px;">Registration Details</h3>
                        
                        ${scheduleInfo ? `
                        <p style="margin:0 0 12px; font-size:14px; color:#555;">
                          <strong>Schedule:</strong> ${escapeHtml(scheduleInfo)}
                        </p>
                        ` : ''}
                        
                        <p style="margin:0 0 12px; font-size:14px; color:#555;">
                          <strong>Amount Paid:</strong> 
                          <span style="color:#28a745; font-size:18px; font-weight:bold;">$${escapeHtml(String(safeAmount || ''))}</span>
                        </p>
                        
                        <p style="margin:0; font-size:14px; color:#555;">
                          <strong>Registration ID:</strong> #${escapeHtml(String(registrationId || ''))}
                        </p>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- Next Steps -->
                  <div style="margin:24px 0; padding:20px; background:#e8f5e8; border-radius:6px; border-left:4px solid #28a745;">
                    <h4 style="margin:0 0 12px; color:#155724; font-size:16px;">What's Next?</h4>
                    <p style="margin:0 0 8px; color:#155724; font-size:14px;">We look forward to seeing you in class!</p>
                    <p style="margin:0; color:#6c757d; font-size:13px;">Questions? Reply to this email or contact us through our website.</p>
                  </div>
                  
                  <!-- Social Media -->
                  <div style="text-align:center; margin:24px 0;">
                    <p style="margin:0 0 8px; color:#666; font-size:14px;">Follow us on social media!</p>
                    <p style="margin:0; color:#e91e63; font-size:14px; font-weight:bold;">@goumo_dancechronicles</p>
                  </div>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding:20px 30px; text-align:center; background-color:#f8f9fa; border-radius:0 0 8px 8px; border-top:1px solid #dee2e6;">
                  <p style="margin:0 0 8px; color:#6c757d; font-size:13px; line-height:1.4;">
                    This email was sent because you registered for a dance class with GouMo Dance Chronicles.
                  </p>
                  <p style="margin:0 0 8px; color:#6c757d; font-size:12px;">
                    <a href="mailto:${buildFromAddress().email}?subject=Unsubscribe%20Request" 
                       style="color:#6c757d; text-decoration:underline;">
                      Unsubscribe from future emails
                    </a>
                  </p>
                  <p style="margin:0; color:#adb5bd; font-size:11px;">
                    © 2024 GouMo Dance Chronicles. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`;

  // Create plain text version for better deliverability
  const text = `
Registration Confirmed!

Hi ${studentName || 'Student'},

Your payment has been confirmed for ${courseName || 'Dance Class'}. Welcome to the class!

Registration Details:
${scheduleInfo ? `Schedule: ${scheduleInfo}` : ''}
Amount Paid: $${safeAmount || ''}
Registration ID: #${registrationId || ''}

What's Next?
We look forward to seeing you in class!

Questions? Reply to this email or contact us through our website.

Follow us on social media: @goumo_dancechronicles

---
This email was sent because you registered for a dance class with GouMo Dance Chronicles.
To unsubscribe from future emails, reply with "UNSUBSCRIBE" in the subject line.

© 2024 GouMo Dance Chronicles. All rights reserved.
`.trim();

  const msg = {
    to,
    from,
    subject,
    html,
    text,
    replyTo: process.env.REPLY_TO || from.email,
    // Improved deliverability headers
    headers: {
      'List-Unsubscribe': `mailto:${buildFromAddress().email}?subject=Unsubscribe%20Request`,
      'X-Entity-Ref-ID': `registration-${registrationId || 'unknown'}`,
    },
    trackingSettings: {
      clickTracking: {
        enable: false
      },
      openTracking: {
        enable: false
      }
    },
    mailSettings: {
      sandboxMode: {
        enable: false
      }
    }
  };

  dbg('sending email', {
    to,
    from: from.email,
    subject,
    hasScheduleInfo: !!scheduleInfo,
    registrationId
  });

  try {
    await sgMail.send(msg);
    dbg('✅ Email sent successfully via SendGrid');
    console.log('✅ Registration confirmation email sent to:', to);
  } catch (error) {
    dbg('❌ SendGrid error:', error.message || error);
    console.error('❌ Failed to send email via SendGrid:', error.message || error);
    throw error;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function verifyEmailTransport() {
  if (!process.env.SENDGRID_API_KEY) {
    throw new Error('SendGrid API key is not configured');
  }

  // SendGrid doesn't have a direct "verify" method like nodemailer
  // We'll do a basic API key validation by checking if it's properly formatted
  const apiKey = process.env.SENDGRID_API_KEY;
  
  if (!apiKey.startsWith('SG.')) {
    throw new Error('Invalid SendGrid API key format');
  }

  dbg('✅ SendGrid API key format appears valid');
  return { success: true, message: 'SendGrid API key format is valid' };
}

/**
 * Sends email using SendGrid (replaces the SMTP fallback method)
 * Maintains the same function signature for compatibility
 */
async function sendEmailWithFallback(to, data) {
  // This function now uses SendGrid instead of SMTP fallback
  // but maintains the same signature for compatibility
  return await sendRegistrationConfirmationEmail(to, data);
}

// Legacy function for compatibility (some code might still reference this)
function getTransporter() {
  return {
    verify: verifyEmailTransport,
    sendMail: async (options) => {
      // Convert nodemailer-style options to SendGrid format
      const data = {
        courseName: 'Dance Class',
        scheduleInfo: '',
        amount: '0',
        registrationId: '0',
        studentName: ''
      };
      
      return await sendRegistrationConfirmationEmail(options.to, data);
    }
  };
}

module.exports = {
  getTransporter,
  sendRegistrationConfirmationEmail,
  sendEmailWithFallback,
  verifyEmailTransport
};

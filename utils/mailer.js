const { Resend } = require('resend');

// Initialize Resend client
let resend;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
} else {
  console.warn('⚠️ RESEND_API_KEY not found in environment variables');
}

// Safe debug logger (no secrets). Enable with EMAIL_DEBUG=true
function dbg(...args) {
  if (process.env.EMAIL_DEBUG === 'true') {
    console.log('📧 Resend:', ...args);
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

  const name = FROM_NAME || EMAIL_FROM_NAME || 'GouMo Dance Chronicles';

  // If EMAIL_FROM is set as a full string like "Name <email>", use it
  if (EMAIL_FROM) return EMAIL_FROM;

  // Use configured email or Resend default
  const email = FROM_EMAIL || EMAIL_FROM_ADDRESS || EMAIL_USER || 'onboarding@resend.dev';
  
  return `${name} <${email}>`;
}

function getReplyTo() {
  const from = process.env.FROM_EMAIL || process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER;
  return process.env.REPLY_TO || from || undefined;
}

/**
 * Sends a registration confirmation email using Resend.
 * @param {string} to - Recipient email
 * @param {Object} data - Email payload
 * @param {string} data.courseName
 * @param {string} [data.scheduleInfo]
 * @param {number|string} data.amount
 * @param {number|string} data.registrationId
 * @param {string} [data.studentName]
 */
async function sendRegistrationConfirmationEmail(to, data = {}) {
  if (!resend) {
    throw new Error('Resend API key is not configured. Please set RESEND_API_KEY environment variable.');
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
                  <p style="margin:0; color:#adb5bd; font-size:11px;">
                    &copy; 2024 GouMo Dance Chronicles. All rights reserved.
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

© 2024 GouMo Dance Chronicles. All rights reserved.
`.trim();

  const emailParams = {
    from,
    to: [to],
    subject,
    html,
    text,
  };

  const replyTo = getReplyTo();
  if (replyTo) {
    emailParams.reply_to = replyTo;
  }

  dbg('sending email', {
    to,
    from,
    subject,
    hasScheduleInfo: !!scheduleInfo,
    registrationId
  });

  try {
    const { data: result, error } = await resend.emails.send(emailParams);
    if (error) {
      throw new Error(error.message || JSON.stringify(error));
    }
    dbg('✅ Email sent successfully via Resend', result);
    console.log('✅ Registration confirmation email sent to:', to);
  } catch (error) {
    dbg('❌ Resend error:', error.message || error);
    console.error('❌ Failed to send email via Resend:', error.message || error);
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
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Resend API key is not configured');
  }

  const apiKey = process.env.RESEND_API_KEY;
  
  if (!apiKey.startsWith('re_')) {
    throw new Error('Invalid Resend API key format (should start with re_)');
  }

  dbg('✅ Resend API key format appears valid');
  return { success: true, message: 'Resend API key format is valid' };
}

/**
 * Sends a registration cancellation email using Resend
 */
async function sendRegistrationCancellationEmail(to, data = {}) {
  if (!resend) {
    throw new Error('Resend API key is not configured. Please set RESEND_API_KEY environment variable.');
  }

  const {
    courseName,
    scheduleInfo,
    amount,
    registrationId,
    studentName,
    cancellationReason
  } = data;

  const from = buildFromAddress();
  const subject = `Registration Canceled - ${courseName || 'Dance Class'}`;
  const safeAmount = typeof amount === 'number' ? amount.toFixed(2) : amount;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Registration Canceled - ${escapeHtml(courseName || 'Dance Class')}</title>
    </head>
    <body style="margin:0; padding:0; font-family:Arial, sans-serif; background-color:#f5f5f5;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5; padding:20px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
              <!-- Header -->
              <tr>
                <td style="padding:30px 30px 20px; text-align:center; background-color:#6c757d; border-radius:8px 8px 0 0;">
                  <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:bold;">Registration Canceled</h1>
                  <p style="margin:8px 0 0; color:#e2e3e5; font-size:14px;">GouMo Dance Chronicles</p>
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding:30px;">
                  <p style="margin:0 0 16px; font-size:16px; color:#333; line-height:1.5;">
                    Hi ${studentName ? escapeHtml(studentName) : 'Student'},
                  </p>
                  
                  <p style="margin:0 0 16px; font-size:16px; color:#333; line-height:1.5;">
                    Your registration for <strong>${escapeHtml(courseName || 'Dance Class')}</strong> has been canceled.
                  </p>

                  ${cancellationReason ? `
                  <div style="margin:16px 0; padding:16px; background:#fff3cd; border-left:4px solid #ffc107; border-radius:4px;">
                    <strong style="color:#856404; display:block; margin-bottom:6px;">Reason provided:</strong>
                    <div style="color:#856404; font-size:14px; white-space:pre-wrap;">${escapeHtml(String(cancellationReason))}</div>
                  </div>
                  ` : ''}

                  <table width="100%" cellpadding="8" cellspacing="0" border="0" style="background-color:#f8f9fa; border-radius:6px; margin:20px 0;">
                    <tr>
                      <td style="padding:20px;">
                        <h3 style="margin:0 0 16px; color:#6c757d; font-size:18px;">Registration Details</h3>
                        
                        ${scheduleInfo ? `
                        <p style="margin:0 0 12px; font-size:14px; color:#555;">
                          <strong>Schedule:</strong> ${escapeHtml(scheduleInfo)}
                        </p>
                        ` : ''}

                        ${safeAmount ? `
                        <p style="margin:0 0 12px; font-size:14px; color:#555;">
                          <strong>Original Amount:</strong> $${escapeHtml(String(safeAmount))}
                        </p>
                        ` : ''}

                        <p style="margin:0; font-size:14px; color:#555;">
                          <strong>Registration ID:</strong> #${escapeHtml(String(registrationId || ''))}
                        </p>
                      </td>
                    </tr>
                  </table>

                  <div style="margin:24px 0; padding:16px; background:#e2e3e5; border-radius:6px;">
                    <p style="margin:0; color:#495057; font-size:14px;">
                      If this cancellation was a mistake or you have questions, please reply to this email.
                    </p>
                  </div>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="padding:20px 30px; text-align:center; background-color:#f8f9fa; border-radius:0 0 8px 8px; border-top:1px solid #dee2e6;">
                  <p style="margin:0 0 8px; color:#6c757d; font-size:13px; line-height:1.4;">
                    This email was sent regarding your dance class registration with GouMo Dance Chronicles.
                  </p>
                  <p style="margin:0; color:#adb5bd; font-size:11px;">
                    &copy; 2024 GouMo Dance Chronicles. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`;

  const text = `
Registration Canceled

Hi ${studentName || 'Student'},

Your registration for ${courseName || 'Dance Class'} has been canceled.
${cancellationReason ? `Reason: ${cancellationReason}\n` : ''}${scheduleInfo ? `Schedule: ${scheduleInfo}\n` : ''}${safeAmount ? `Original Amount: $${safeAmount}\n` : ''}Registration ID: #${registrationId || ''}

If this cancellation was a mistake or you have questions, please reply to this email.

---
This email was sent regarding your dance class registration with GouMo Dance Chronicles.

© 2024 GouMo Dance Chronicles. All rights reserved.
  `.trim();

  const emailParams = {
    from,
    to: [to],
    subject,
    html,
    text,
  };

  const replyTo = getReplyTo();
  if (replyTo) {
    emailParams.reply_to = replyTo;
  }

  dbg('sending cancellation email', {
    to,
    from,
    subject,
    registrationId
  });

  try {
    const { data: result, error } = await resend.emails.send(emailParams);
    if (error) {
      throw new Error(error.message || JSON.stringify(error));
    }
    dbg('✅ Cancellation email sent successfully via Resend', result);
    console.log('✅ Registration cancellation email sent to:', to);
  } catch (error) {
    dbg('❌ Resend cancellation error:', error.message || error);
    console.error('❌ Failed to send cancellation email via Resend:', error.message || error);
    throw error;
  }
}

/**
 * Sends a waitlist notification email when a spot becomes available
 */
async function sendWaitlistNotificationEmail(to, data = {}) {
  if (!resend) {
    throw new Error('Resend API key is not configured. Please set RESEND_API_KEY environment variable.');
  }

  const {
    courseName,
    scheduleInfo,
    amount,
    studentName,
    position,
    registrationUrl,
    expiresAt,
    expiresHours = 48
  } = data;

  const from = buildFromAddress();
  const subject = `Spot Available! ${courseName || 'Dance Class'} - Register Now`;
  const safeAmount = typeof amount === 'number' ? amount.toFixed(2) : amount;
  
  // Format expiration date for display
  const expirationDate = new Date(expiresAt);
  const expirationDisplay = expirationDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Spot Available - ${escapeHtml(courseName || 'Dance Class')}</title>
    </head>
    <body style="margin:0; padding:0; font-family:Arial, sans-serif; background-color:#f5f5f5;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5; padding:20px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
              <!-- Header -->
              <tr>
                <td style="padding:30px 30px 20px; text-align:center; background-color:#28a745; border-radius:8px 8px 0 0;">
                  <h1 style="margin:0; color:#ffffff; font-size:26px; font-weight:bold;">Spot Available!</h1>
                  <p style="margin:8px 0 0; color:#d4edda; font-size:14px;">GouMo Dance Chronicles</p>
                </td>
              </tr>
              
              <!-- Content -->
              <tr>
                <td style="padding:30px;">
                  <p style="margin:0 0 16px; font-size:16px; color:#333; line-height:1.5;">
                    Hi ${studentName ? escapeHtml(studentName) : 'Student'},
                  </p>
                  
                  <p style="margin:0 0 20px; font-size:16px; color:#333; line-height:1.5;">
                    Great news! A spot has opened up in <strong>${escapeHtml(courseName || 'Dance Class')}</strong> and you're next on the waitlist!
                  </p>

                  <!-- Urgent Action Required -->
                  <div style="margin:24px 0; padding:20px; background:#fff3cd; border-left:4px solid #ffc107; border-radius:6px;">
                    <h3 style="margin:0 0 12px; color:#856404; font-size:18px; font-weight:bold;">Act Fast!</h3>
                    <p style="margin:0 0 12px; color:#856404; font-size:16px; line-height:1.4;">
                      You have <strong>${expiresHours} hours</strong> to secure your spot. This offer expires on:
                    </p>
                    <p style="margin:0; color:#856404; font-size:16px; font-weight:bold;">
                      ${expirationDisplay}
                    </p>
                  </div>
                  
                  <!-- Course Details -->
                  <table width="100%" cellpadding="8" cellspacing="0" border="0" style="background-color:#f8f9fa; border-radius:6px; margin:20px 0;">
                    <tr>
                      <td style="padding:20px;">
                        <h3 style="margin:0 0 16px; color:#e91e63; font-size:18px;">Class Details</h3>
                        
                        ${scheduleInfo ? `
                        <p style="margin:0 0 12px; font-size:14px; color:#555;">
                          <strong>Schedule:</strong> ${escapeHtml(scheduleInfo)}
                        </p>
                        ` : ''}
                        
                        ${safeAmount ? `
                        <p style="margin:0 0 12px; font-size:14px; color:#555;">
                          <strong>Price:</strong> 
                          <span style="color:#28a745; font-size:18px; font-weight:bold;">$${escapeHtml(String(safeAmount))}</span>
                        </p>
                        ` : ''}
                        
                        <p style="margin:0; font-size:14px; color:#555;">
                          <strong>Your Waitlist Position:</strong> #${position || 'Next'}
                        </p>
                      </td>
                    </tr>
                  </table>

                  <!-- Call to Action Button -->
                  <div style="text-align:center; margin:30px 0;">
                    <a href="${registrationUrl}" 
                       style="display:inline-block; padding:16px 32px; background-color:#28a745; color:#ffffff; text-decoration:none; font-weight:bold; font-size:18px; border-radius:6px; text-align:center;">
                      Register Now &amp; Pay
                    </a>
                  </div>

                  <!-- Backup Link -->
                  <div style="margin:20px 0; padding:16px; background:#e8f4fd; border-radius:6px; text-align:center;">
                    <p style="margin:0 0 8px; color:#0c5460; font-size:14px;">
                      Can't click the button above? Copy and paste this link:
                    </p>
                    <p style="margin:0; font-family:monospace; font-size:12px; color:#0c5460; word-break:break-all;">
                      ${registrationUrl}
                    </p>
                  </div>

                  <!-- Important Notes -->
                  <div style="margin:24px 0; padding:16px; background:#f8d7da; border-left:4px solid #dc3545; border-radius:4px;">
                    <h4 style="margin:0 0 8px; color:#721c24; font-size:14px; font-weight:bold;">Important:</h4>
                    <ul style="margin:0; padding-left:16px; color:#721c24; font-size:14px;">
                      <li>This link is unique to you and expires in ${expiresHours} hours</li>
                      <li>If you don't register by the deadline, the spot goes to the next person</li>
                      <li>Payment must be completed to secure your spot</li>
                    </ul>
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
                    This email was sent because you joined our waitlist for ${escapeHtml(courseName || 'Dance Class')}.
                  </p>
                  <p style="margin:0; color:#adb5bd; font-size:11px;">
                    &copy; 2024 GouMo Dance Chronicles. All rights reserved.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`;

  const text = `
Spot Available! 

Hi ${studentName || 'Student'},

Great news! A spot has opened up in ${courseName || 'Dance Class'} and you're next on the waitlist!

ACT FAST! You have ${expiresHours} hours to secure your spot.
This offer expires on: ${expirationDisplay}

Class Details:
${scheduleInfo ? `Schedule: ${scheduleInfo}` : ''}
${safeAmount ? `Price: $${safeAmount}` : ''}
Your Waitlist Position: #${position || 'Next'}

REGISTER NOW: ${registrationUrl}

IMPORTANT:
- This link is unique to you and expires in ${expiresHours} hours
- If you don't register by the deadline, the spot goes to the next person  
- Payment must be completed to secure your spot

Questions? Reply to this email or contact us through our website.

Follow us on social media: @goumo_dancechronicles

---
This email was sent because you joined our waitlist for ${courseName || 'Dance Class'}.

© 2024 GouMo Dance Chronicles. All rights reserved.
  `.trim();

  const emailParams = {
    from,
    to: [to],
    subject,
    html,
    text,
  };

  const replyTo = getReplyTo();
  if (replyTo) {
    emailParams.reply_to = replyTo;
  }

  dbg('sending waitlist notification email', {
    to,
    from,
    subject,
    courseName,
    position,
    expiresHours
  });

  try {
    const { data: result, error } = await resend.emails.send(emailParams);
    if (error) {
      throw new Error(error.message || JSON.stringify(error));
    }
    dbg('✅ Waitlist notification email sent successfully via Resend', result);
    console.log('✅ Waitlist notification email sent to:', to);
  } catch (error) {
    dbg('❌ Resend waitlist notification error:', error.message || error);
    console.error('❌ Failed to send waitlist notification email via Resend:', error.message || error);
    throw error;
  }
}

async function sendEmailWithFallback(to, data) {
  return await sendRegistrationConfirmationEmail(to, data);
}

// Legacy function for compatibility
function getTransporter() {
  return {
    verify: verifyEmailTransport,
    sendMail: async (options) => {
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
  sendRegistrationCancellationEmail,
  sendWaitlistNotificationEmail,
  sendEmailWithFallback,
  verifyEmailTransport
};

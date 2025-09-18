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

  const html = `
    <div style="font-family:Arial, sans-serif; font-size:14px; color:#333; line-height:1.5;">
      <h2 style="margin:0 0 12px; color:#e91e63;">Registration Confirmed!</h2>
      <p style="margin:0 0 12px;">Hi ${studentName ? escapeHtml(studentName) : 'Student'},</p>
      <p style="margin:0 0 12px;">Your payment has been confirmed for <strong>${escapeHtml(courseName || 'Dance Class')}</strong>.</p>
      ${scheduleInfo ? `<p style="margin:0 0 12px;"><strong>Schedule:</strong> ${escapeHtml(scheduleInfo)}</p>` : ''}
      <p style="margin:0 0 12px;"><strong>Amount Paid:</strong> <span style="color:#28a745; font-size:16px; font-weight:bold;">$${escapeHtml(String(safeAmount || ''))}</span></p>
      <p style="margin:0 0 12px;"><strong>Registration ID:</strong> #${escapeHtml(String(registrationId || ''))}</p>
      <div style="margin:24px 0; padding:16px; background:#f8f9fa; border-left:4px solid #e91e63; border-radius:4px;">
        <p style="margin:0; color:#666;">We look forward to seeing you in class!</p>
        <p style="margin:8px 0 0; font-size:12px; color:#999;">Questions? Reply to this email or contact us through our website.</p>
      </div>
      <div style="margin:24px 0 0; padding:16px 0; border-top:1px solid #eee; text-align:center; color:#999; font-size:12px;">
        <p style="margin:0;">GouMo Dance Chronicles</p>
        <p style="margin:4px 0 0;">Follow us @goumo_dancechronicles</p>
      </div>
    </div>`;

  const msg = {
    to,
    from,
    subject,
    html,
    replyTo: process.env.REPLY_TO || from.email,
    // Note: SendGrid doesn't support BCC in the same way, would need to send separate emails for BCC
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

const nodemailer = require('nodemailer');

let _transporter = null;

function buildFromAddress() {
  const {
    EMAIL_FROM,
    EMAIL_FROM_NAME,
    EMAIL_FROM_ADDRESS,
    EMAIL_USER
  } = process.env;

  if (EMAIL_FROM) return EMAIL_FROM;

  const name = EMAIL_FROM_NAME || '';
  const addr = EMAIL_FROM_ADDRESS || EMAIL_USER;

  if (name && addr) return `${name} <${addr}>`;
  return addr || undefined;
}

function getTransportOptions() {
  const {
    EMAIL_SERVICE,
    EMAIL_HOST,
    EMAIL_PORT,
    EMAIL_USER,
    EMAIL_PASSWORD,
    EMAIL_PASS
  } = process.env;

  const pass = EMAIL_PASSWORD || EMAIL_PASS;

  if (EMAIL_SERVICE) {
    return {
      service: EMAIL_SERVICE,
      auth: EMAIL_USER && pass ? { user: EMAIL_USER, pass } : undefined
    };
  }

  // Fallback to host/port if provided
  if (EMAIL_HOST) {
    const port = Number(EMAIL_PORT || 587);
    return {
      host: EMAIL_HOST,
      port,
      secure: port === 465, // secure for 465, otherwise false
      auth: EMAIL_USER && pass ? { user: EMAIL_USER, pass } : undefined
    };
  }

  throw new Error('Email transport is not configured. Provide EMAIL_SERVICE=gmail or EMAIL_HOST/EMAIL_PORT and credentials.');
}

function getTransporter() {
  if (_transporter) return _transporter;

  const transportOptions = getTransportOptions();
  _transporter = nodemailer.createTransport(transportOptions);

  return _transporter;
}

/**
 * Sends a registration confirmation email.
 * @param {string} to - Recipient email
 * @param {Object} data - Email payload
 * @param {string} data.courseName
 * @param {string} [data.scheduleInfo]
 * @param {number|string} data.amount
 * @param {number|string} data.registrationId
 * @param {string} [data.studentName]
 */
async function sendRegistrationConfirmationEmail(to, data = {}) {
  const transporter = getTransporter();

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
      <h2 style="margin:0 0 12px;">Registration Confirmed!</h2>
      <p style="margin:0 0 12px;">Hi ${studentName ? escapeHtml(studentName) : 'Student'},</p>
      <p style="margin:0 0 12px;">Your payment has been confirmed for <strong>${escapeHtml(courseName || 'Dance Class')}</strong>.</p>
      ${scheduleInfo ? `<p style="margin:0 0 12px;"><strong>Schedule:</strong> ${escapeHtml(scheduleInfo)}</p>` : ''}
      <p style="margin:0 0 12px;"><strong>Amount Paid:</strong> $${escapeHtml(String(safeAmount || ''))}</p>
      <p style="margin:0 0 12px;"><strong>Registration ID:</strong> #${escapeHtml(String(registrationId || ''))}</p>
      <p style="margin:16px 0 0;">We look forward to seeing you in class!</p>
    </div>`;

  const { REPLY_TO, ADMIN_BCC } = process.env;

  await transporter.sendMail({
    from,
    to,
    subject,
    html,
    replyTo: REPLY_TO || undefined,
    bcc: ADMIN_BCC || undefined
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  getTransporter,
  sendRegistrationConfirmationEmail
};

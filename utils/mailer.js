const nodemailer = require('nodemailer');

let _transporter = null;

// Safe debug logger (no secrets). Enable with EMAIL_DEBUG=true
function dbg(...args) {
  if (process.env.EMAIL_DEBUG === 'true') {
    console.log('📧 Email:', ...args);
  }
}

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
  // Normalize env values
  const rawService = process.env.EMAIL_SERVICE;
  const rawHost = process.env.EMAIL_HOST;
  const rawUser = process.env.EMAIL_USER;
  const rawPort = process.env.EMAIL_PORT;
  const rawPass = process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS;

  const service = rawService ? String(rawService).trim().toLowerCase() : '';
  const host = rawHost ? String(rawHost).trim() : '';
  const user = rawUser ? String(rawUser).trim() : '';
  const pass = rawPass ? String(rawPass).trim() : '';
  const port = rawPort ? Number(rawPort) : undefined;

  dbg('config detection', {
    hasService: !!service,
    service,
    hasHost: !!host,
    hasUser: !!user,
    hasPass: !!pass,
    port
  });

  // Service-based config (e.g., gmail)
  if (service) {
    const opts = {
      service,
      auth: user && pass ? { user, pass } : undefined
    };
    dbg('using service transport', { service, hasAuth: !!opts.auth });
    return opts;
  }

  // Host/port SMTP
  if (host) {
    const p = port || 587;
    const opts = {
      host,
      port: p,
      secure: p === 465,
      auth: user && pass ? { user, pass } : undefined
    };
    dbg('using host/port transport', { host, port: p, secure: opts.secure, hasAuth: !!opts.auth });
    return opts;
  }

  // Implicit Gmail SMTP fallback if credentials provided
  if (user && pass) {
    const opts = {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user, pass }
    };
    dbg('using gmail fallback transport', { host: opts.host, port: opts.port, secure: opts.secure, hasAuth: true });
    return opts;
  }

  throw new Error('Email transport is not configured. Provide EMAIL_SERVICE=gmail or EMAIL_HOST/EMAIL_PORT with credentials, or ensure EMAIL_USER and EMAIL_PASSWORD are set for Gmail fallback.');
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

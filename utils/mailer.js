const nodemailer = require('nodemailer');

// Safe debug logger (no secrets). Enable with EMAIL_DEBUG=true
function dbg(...args) {
  if (process.env.EMAIL_DEBUG === 'true') {
    console.log('📧 Gmail:', ...args);
  }
}

// Create Gmail SMTP transporter
function createTransporter() {
  const user = process.env.GMAIL_USER || process.env.EMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASSWORD;

  if (!user || !pass) {
    console.warn('⚠️ Gmail credentials not configured (GMAIL_USER / GMAIL_APP_PASSWORD)');
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

let transporter = createTransporter();

function getFromAddress() {
  const email = process.env.GMAIL_USER || process.env.EMAIL_USER || 'goumo.dancechronicles@gmail.com';
  const name = process.env.FROM_NAME || process.env.EMAIL_FROM_NAME || 'GouMo Dance Chronicles';
  return `"${name}" <${email}>`;
}

function getReplyTo() {
  return process.env.REPLY_TO || process.env.GMAIL_USER || process.env.EMAIL_USER || undefined;
}

function isEmailConfigured() {
  return !!(process.env.GMAIL_USER || process.env.EMAIL_USER) && 
         !!(process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASSWORD);
}

/**
 * Sends a registration confirmation email via Gmail SMTP.
 */
async function sendRegistrationConfirmationEmail(to, data = {}) {
  if (!transporter) {
    transporter = createTransporter();
    if (!transporter) {
      throw new Error('Gmail SMTP is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.');
    }
  }

  const { courseName, scheduleInfo, amount, registrationId, studentName } = data;
  const from = getFromAddress();
  const subject = `Registration Confirmed - ${courseName || 'Dance Class'}`;
  const safeAmount = typeof amount === 'number' ? amount.toFixed(2) : amount;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f5;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;padding:20px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,.1);">
<tr><td style="padding:30px 30px 20px;text-align:center;background:#e91e63;border-radius:8px 8px 0 0;">
  <h1 style="margin:0;color:#fff;font-size:24px;">Registration Confirmed!</h1>
  <p style="margin:8px 0 0;color:#ffcccb;font-size:14px;">GouMo Dance Chronicles</p>
</td></tr>
<tr><td style="padding:30px;">
  <p style="margin:0 0 16px;font-size:16px;color:#333;">Hi ${studentName ? escapeHtml(studentName) : 'Student'},</p>
  <p style="margin:0 0 20px;font-size:16px;color:#333;">Your payment has been confirmed for <strong>${escapeHtml(courseName || 'Dance Class')}</strong>. Welcome to the class!</p>
  <table width="100%" cellpadding="8" cellspacing="0" border="0" style="background:#f8f9fa;border-radius:6px;margin:20px 0;"><tr><td style="padding:20px;">
    <h3 style="margin:0 0 16px;color:#e91e63;font-size:18px;">Registration Details</h3>
    ${scheduleInfo ? `<p style="margin:0 0 12px;font-size:14px;color:#555;"><strong>Schedule:</strong> ${escapeHtml(scheduleInfo)}</p>` : ''}
    <p style="margin:0 0 12px;font-size:14px;color:#555;"><strong>Amount Paid:</strong> <span style="color:#28a745;font-size:18px;font-weight:bold;">$${escapeHtml(String(safeAmount || ''))}</span></p>
    <p style="margin:0;font-size:14px;color:#555;"><strong>Registration ID:</strong> #${escapeHtml(String(registrationId || ''))}</p>
  </td></tr></table>
  <div style="margin:24px 0;padding:20px;background:#e8f5e8;border-radius:6px;border-left:4px solid #28a745;">
    <h4 style="margin:0 0 12px;color:#155724;font-size:16px;">What's Next?</h4>
    <p style="margin:0 0 8px;color:#155724;font-size:14px;">We look forward to seeing you in class!</p>
    <p style="margin:0;color:#6c757d;font-size:13px;">Questions? Reply to this email or contact us through our website.</p>
  </div>
  <div style="text-align:center;margin:24px 0;">
    <p style="margin:0 0 8px;color:#666;font-size:14px;">Follow us on social media!</p>
    <p style="margin:0;color:#e91e63;font-size:14px;font-weight:bold;">@goumo_dancechronicles</p>
  </div>
</td></tr>
<tr><td style="padding:20px 30px;text-align:center;background:#f8f9fa;border-radius:0 0 8px 8px;border-top:1px solid #dee2e6;">
  <p style="margin:0 0 8px;color:#6c757d;font-size:13px;">This email was sent because you registered for a dance class with GouMo Dance Chronicles.</p>
  <p style="margin:0;color:#adb5bd;font-size:11px;">&copy; 2024 GouMo Dance Chronicles. All rights reserved.</p>
</td></tr></table></td></tr></table></body></html>`;

  const text = `Registration Confirmed!\n\nHi ${studentName || 'Student'},\n\nYour payment has been confirmed for ${courseName || 'Dance Class'}. Welcome to the class!\n\n${scheduleInfo ? `Schedule: ${scheduleInfo}\n` : ''}Amount Paid: $${safeAmount || ''}\nRegistration ID: #${registrationId || ''}\n\nWe look forward to seeing you in class!\n\nFollow us: @goumo_dancechronicles`;

  dbg('sending confirmation email', { to, from, subject, registrationId });

  try {
    await transporter.sendMail({ from, to, subject, html, text, replyTo: getReplyTo() });
    console.log('✅ Registration confirmation email sent to:', to);
  } catch (error) {
    console.error('❌ Failed to send email:', error.message || error);
    throw error;
  }
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function verifyEmailTransport() {
  if (!isEmailConfigured()) {
    throw new Error('Gmail SMTP is not configured');
  }
  if (!transporter) {
    transporter = createTransporter();
  }
  await transporter.verify();
  dbg('✅ Gmail SMTP verified');
  return { success: true, message: 'Gmail SMTP connection verified' };
}

/**
 * Sends a registration cancellation email via Gmail SMTP.
 */
async function sendRegistrationCancellationEmail(to, data = {}) {
  if (!transporter) {
    transporter = createTransporter();
    if (!transporter) throw new Error('Gmail SMTP is not configured.');
  }

  const { courseName, scheduleInfo, amount, registrationId, studentName, cancellationReason } = data;
  const from = getFromAddress();
  const subject = `Registration Canceled - ${courseName || 'Dance Class'}`;
  const safeAmount = typeof amount === 'number' ? amount.toFixed(2) : amount;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f5;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;padding:20px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,.1);">
<tr><td style="padding:30px 30px 20px;text-align:center;background:#6c757d;border-radius:8px 8px 0 0;">
  <h1 style="margin:0;color:#fff;font-size:24px;">Registration Canceled</h1>
  <p style="margin:8px 0 0;color:#e2e3e5;font-size:14px;">GouMo Dance Chronicles</p>
</td></tr>
<tr><td style="padding:30px;">
  <p style="margin:0 0 16px;font-size:16px;color:#333;">Hi ${studentName ? escapeHtml(studentName) : 'Student'},</p>
  <p style="margin:0 0 16px;font-size:16px;color:#333;">Your registration for <strong>${escapeHtml(courseName || 'Dance Class')}</strong> has been canceled.</p>
  ${cancellationReason ? `<div style="margin:16px 0;padding:16px;background:#fff3cd;border-left:4px solid #ffc107;border-radius:4px;"><strong style="color:#856404;">Reason:</strong><div style="color:#856404;font-size:14px;white-space:pre-wrap;">${escapeHtml(String(cancellationReason))}</div></div>` : ''}
  <table width="100%" cellpadding="8" cellspacing="0" border="0" style="background:#f8f9fa;border-radius:6px;margin:20px 0;"><tr><td style="padding:20px;">
    <h3 style="margin:0 0 16px;color:#6c757d;font-size:18px;">Registration Details</h3>
    ${scheduleInfo ? `<p style="margin:0 0 12px;font-size:14px;color:#555;"><strong>Schedule:</strong> ${escapeHtml(scheduleInfo)}</p>` : ''}
    ${safeAmount ? `<p style="margin:0 0 12px;font-size:14px;color:#555;"><strong>Original Amount:</strong> $${escapeHtml(String(safeAmount))}</p>` : ''}
    <p style="margin:0;font-size:14px;color:#555;"><strong>Registration ID:</strong> #${escapeHtml(String(registrationId || ''))}</p>
  </td></tr></table>
  <div style="margin:24px 0;padding:16px;background:#e2e3e5;border-radius:6px;">
    <p style="margin:0;color:#495057;font-size:14px;">If this was a mistake, please reply to this email.</p>
  </div>
</td></tr>
<tr><td style="padding:20px 30px;text-align:center;background:#f8f9fa;border-radius:0 0 8px 8px;border-top:1px solid #dee2e6;">
  <p style="margin:0 0 8px;color:#6c757d;font-size:13px;">This email was sent regarding your dance class registration with GouMo Dance Chronicles.</p>
  <p style="margin:0;color:#adb5bd;font-size:11px;">&copy; 2024 GouMo Dance Chronicles. All rights reserved.</p>
</td></tr></table></td></tr></table></body></html>`;

  const text = `Registration Canceled\n\nHi ${studentName || 'Student'},\n\nYour registration for ${courseName || 'Dance Class'} has been canceled.\n${cancellationReason ? `Reason: ${cancellationReason}\n` : ''}${scheduleInfo ? `Schedule: ${scheduleInfo}\n` : ''}${safeAmount ? `Amount: $${safeAmount}\n` : ''}Registration ID: #${registrationId || ''}`;

  dbg('sending cancellation email', { to, from, subject, registrationId });

  try {
    await transporter.sendMail({ from, to, subject, html, text, replyTo: getReplyTo() });
    console.log('✅ Registration cancellation email sent to:', to);
  } catch (error) {
    console.error('❌ Failed to send cancellation email:', error.message || error);
    throw error;
  }
}

/**
 * Sends a waitlist notification email via Gmail SMTP.
 */
async function sendWaitlistNotificationEmail(to, data = {}) {
  if (!transporter) {
    transporter = createTransporter();
    if (!transporter) throw new Error('Gmail SMTP is not configured.');
  }

  const { courseName, scheduleInfo, amount, studentName, position, registrationUrl, expiresAt, expiresHours = 48 } = data;
  const from = getFromAddress();
  const subject = `Spot Available! ${courseName || 'Dance Class'} - Register Now`;
  const safeAmount = typeof amount === 'number' ? amount.toFixed(2) : amount;
  const expirationDate = new Date(expiresAt);
  const expirationDisplay = expirationDate.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short' });

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f5;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;padding:20px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,.1);">
<tr><td style="padding:30px 30px 20px;text-align:center;background:#28a745;border-radius:8px 8px 0 0;">
  <h1 style="margin:0;color:#fff;font-size:26px;">Spot Available!</h1>
  <p style="margin:8px 0 0;color:#d4edda;font-size:14px;">GouMo Dance Chronicles</p>
</td></tr>
<tr><td style="padding:30px;">
  <p style="margin:0 0 16px;font-size:16px;color:#333;">Hi ${studentName ? escapeHtml(studentName) : 'Student'},</p>
  <p style="margin:0 0 20px;font-size:16px;color:#333;">Great news! A spot has opened up in <strong>${escapeHtml(courseName || 'Dance Class')}</strong> and you're next on the waitlist!</p>
  <div style="margin:24px 0;padding:20px;background:#fff3cd;border-left:4px solid #ffc107;border-radius:6px;">
    <h3 style="margin:0 0 12px;color:#856404;font-size:18px;">Act Fast!</h3>
    <p style="margin:0 0 12px;color:#856404;font-size:16px;">You have <strong>${expiresHours} hours</strong> to secure your spot. Expires: <strong>${expirationDisplay}</strong></p>
  </div>
  <table width="100%" cellpadding="8" cellspacing="0" border="0" style="background:#f8f9fa;border-radius:6px;margin:20px 0;"><tr><td style="padding:20px;">
    <h3 style="margin:0 0 16px;color:#e91e63;font-size:18px;">Class Details</h3>
    ${scheduleInfo ? `<p style="margin:0 0 12px;font-size:14px;color:#555;"><strong>Schedule:</strong> ${escapeHtml(scheduleInfo)}</p>` : ''}
    ${safeAmount ? `<p style="margin:0 0 12px;font-size:14px;color:#555;"><strong>Price:</strong> <span style="color:#28a745;font-size:18px;font-weight:bold;">$${escapeHtml(String(safeAmount))}</span></p>` : ''}
    <p style="margin:0;font-size:14px;color:#555;"><strong>Waitlist Position:</strong> #${position || 'Next'}</p>
  </td></tr></table>
  <div style="text-align:center;margin:30px 0;">
    <a href="${registrationUrl}" style="display:inline-block;padding:16px 32px;background:#28a745;color:#fff;text-decoration:none;font-weight:bold;font-size:18px;border-radius:6px;">Register Now &amp; Pay</a>
  </div>
  <div style="margin:20px 0;padding:16px;background:#e8f4fd;border-radius:6px;text-align:center;">
    <p style="margin:0 0 8px;color:#0c5460;font-size:14px;">Can't click? Copy this link:</p>
    <p style="margin:0;font-family:monospace;font-size:12px;color:#0c5460;word-break:break-all;">${registrationUrl}</p>
  </div>
  <div style="margin:24px 0;padding:16px;background:#f8d7da;border-left:4px solid #dc3545;border-radius:4px;">
    <h4 style="margin:0 0 8px;color:#721c24;font-size:14px;">Important:</h4>
    <ul style="margin:0;padding-left:16px;color:#721c24;font-size:14px;">
      <li>This link expires in ${expiresHours} hours</li>
      <li>If you don't register, the spot goes to the next person</li>
      <li>Payment must be completed to secure your spot</li>
    </ul>
  </div>
</td></tr>
<tr><td style="padding:20px 30px;text-align:center;background:#f8f9fa;border-radius:0 0 8px 8px;border-top:1px solid #dee2e6;">
  <p style="margin:0 0 8px;color:#6c757d;font-size:13px;">This email was sent because you joined our waitlist for ${escapeHtml(courseName || 'Dance Class')}.</p>
  <p style="margin:0;color:#adb5bd;font-size:11px;">&copy; 2024 GouMo Dance Chronicles. All rights reserved.</p>
</td></tr></table></td></tr></table></body></html>`;

  const text = `Spot Available!\n\nHi ${studentName || 'Student'},\n\nA spot opened in ${courseName || 'Dance Class'}!\n\nYou have ${expiresHours} hours. Expires: ${expirationDisplay}\n\nREGISTER NOW: ${registrationUrl}\n\n${scheduleInfo ? `Schedule: ${scheduleInfo}\n` : ''}${safeAmount ? `Price: $${safeAmount}\n` : ''}Position: #${position || 'Next'}`;

  dbg('sending waitlist email', { to, from, subject, courseName, position, expiresHours });

  try {
    await transporter.sendMail({ from, to, subject, html, text, replyTo: getReplyTo() });
    console.log('✅ Waitlist notification email sent to:', to);
  } catch (error) {
    console.error('❌ Failed to send waitlist email:', error.message || error);
    throw error;
  }
}

async function sendEmailWithFallback(to, data) {
  return await sendRegistrationConfirmationEmail(to, data);
}

function getTransporter() {
  return {
    verify: verifyEmailTransport,
    sendMail: async (options) => {
      return await sendRegistrationConfirmationEmail(options.to, {
        courseName: 'Dance Class', scheduleInfo: '', amount: '0', registrationId: '0', studentName: ''
      });
    }
  };
}

module.exports = {
  getTransporter,
  sendRegistrationConfirmationEmail,
  sendRegistrationCancellationEmail,
  sendWaitlistNotificationEmail,
  sendEmailWithFallback,
  verifyEmailTransport,
  isEmailConfigured
};

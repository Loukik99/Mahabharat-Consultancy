const nodemailer = require("nodemailer");
const env = require("./../config/env");

// Gmail SMTP transporter — created only when email is configured.
let transporter = null;
if (env.emailEnabled) {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: env.email.user, pass: env.email.pass },
  });
}

async function sendMail({ to, subject, html, text }) {
  if (!transporter) {
    console.log(`[mail] not configured — skipping "${subject}" to ${to}`);
    return;
  }
  try {
    await transporter.sendMail({
      from: `"${env.email.fromName}" <${env.email.user}>`,
      to,
      subject,
      text,
      html,
    });
    console.log(`[mail] sent "${subject}" to ${to}`);
  } catch (e) {
    console.error("[mail] send failed:", e.message);
  }
}

// Welcome email sent when a new customer registers.
function sendWelcomeEmail(user) {
  const subject = "Welcome to Mahabharat Consultancy";
  const text =
    `Hi ${user.name},\n\n` +
    `Your account on Mahabharat Consultancy has been created successfully.\n` +
    `You can now log in to submit service requests, upload documents and track their status.\n\n` +
    `If you did not create this account, please ignore this email.\n\n` +
    `— Mahabharat Consultancy, One Stop Service Center`;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;border:1px solid #e4e8ef;border-radius:10px;overflow:hidden">
    <div style="background:#0b1f3a;padding:20px 24px;color:#fff">
      <div style="font-size:18px;font-weight:700">Mahabharat Consultancy</div>
      <div style="font-size:11px;letter-spacing:2px;color:#c2a14d;text-transform:uppercase">One Stop Service Center</div>
    </div>
    <div style="padding:24px;color:#1f2a44;font-size:14px;line-height:1.6">
      <p>Hi <strong>${user.name}</strong>,</p>
      <p>Your account has been created successfully. 🎉</p>
      <p>You can now log in to submit service requests, upload documents, and track their status from your dashboard.</p>
      <p style="color:#6b7280;font-size:12px;margin-top:20px">If you did not create this account, you can safely ignore this email.</p>
    </div>
    <div style="background:#f7f8fa;padding:14px 24px;color:#6b7280;font-size:12px">
      Mahabharat Consultancy &middot; Belagavi, Karnataka
    </div>
  </div>`;
  // Fire-and-forget: never block or fail registration because of email.
  return sendMail({ to: user.email, subject, text, html });
}

// Password-reset email carrying a 6-digit one-time code.
function sendPasswordResetEmail(user, otp) {
  const subject = "Your Mahabharat Consultancy password reset code";
  const text =
    `Hi ${user.name},\n\n` +
    `Your password reset code is: ${otp}\n` +
    `It is valid for 10 minutes.\n\n` +
    `If you did not request a password reset, you can safely ignore this email.\n\n` +
    `— Mahabharat Consultancy, One Stop Service Center`;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;border:1px solid #e4e8ef;border-radius:10px;overflow:hidden">
    <div style="background:#0b1f3a;padding:20px 24px;color:#fff">
      <div style="font-size:18px;font-weight:700">Mahabharat Consultancy</div>
      <div style="font-size:11px;letter-spacing:2px;color:#c2a14d;text-transform:uppercase">One Stop Service Center</div>
    </div>
    <div style="padding:24px;color:#1f2a44;font-size:14px;line-height:1.6">
      <p>Hi <strong>${user.name}</strong>,</p>
      <p>Use this code to reset your password:</p>
      <p style="font-size:30px;font-weight:700;letter-spacing:8px;color:#0b1f3a;background:#f7f8fa;border:1px solid #e4e8ef;border-radius:8px;padding:14px 0;text-align:center">${otp}</p>
      <p style="color:#6b7280;font-size:13px">This code expires in <strong>10 minutes</strong>.</p>
      <p style="color:#6b7280;font-size:12px;margin-top:20px">If you did not request a password reset, you can safely ignore this email — your password will not change.</p>
    </div>
    <div style="background:#f7f8fa;padding:14px 24px;color:#6b7280;font-size:12px">
      Mahabharat Consultancy &middot; Belagavi, Karnataka
    </div>
  </div>`;
  return sendMail({ to: user.email, subject, text, html });
}

module.exports = { sendMail, sendWelcomeEmail, sendPasswordResetEmail };

/**
 * Email smoke test — sends exactly ONE message to EMAIL_TEST_RECIPIENT using the
 * app's existing Nodemailer transport (src/utils/mailer.js).
 *
 * Safe by design: no database connection, no models, no API calls, no accounts
 * created or deleted. Exit codes: 0 = provider accepted, 1 = failed, 2 = blocked.
 *
 * Usage (from server/): npm run test:email
 */
const env = require("../src/config/env");
const { sendMail } = require("../src/utils/mailer");

function maskEmail(email) {
  const [u, d] = String(email).split("@");
  return d ? `${u.slice(0, 2)}***@${d}` : "(invalid)";
}

function blocked(reason) {
  console.log(`BLOCKED  ${reason}`);
  console.log("Nothing was sent.");
  process.exit(2);
}

function assertNoDatabaseLoaded() {
  const loaded = Object.keys(require.cache).some((p) => /[\\/](mongoose|mongodb)[\\/]/.test(p));
  if (loaded) {
    console.log("FAIL     database driver was loaded — smoke test must stay DB-free");
    process.exit(1);
  }
}

async function main() {
  console.log("\n=== Email smoke test ===\n");
  assertNoDatabaseLoaded();

  if (!env.emailEnabled) blocked("EMAIL_USER / EMAIL_PASS are not set in server/.env.");

  const to = env.email.testRecipient;
  if (!to) {
    blocked(
      "EMAIL_TEST_RECIPIENT is not set. Add EMAIL_TEST_RECIPIENT=<an inbox you control> to server/.env and rerun."
    );
  }
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) {
    blocked("EMAIL_TEST_RECIPIENT must be exactly one valid email address.");
  }

  const sentAt = new Date().toISOString();
  const subject = `[TEST] Mahabharat Consultancy email smoke test ${sentAt}`;
  const text =
    `This is an automated email smoke test from the Mahabharat Consultancy server.\n\n` +
    `Sent at: ${sentAt}\n` +
    `No action is needed. No account was created.`;

  console.log(`Sender:    ${maskEmail(env.email.user)} (Gmail SMTP)`);
  console.log(`Recipient: ${maskEmail(to)}`);

  let info;
  try {
    info = await sendMail({ to, subject, text, html: `<p>${text.replace(/\n/g, "<br/>")}</p>` });
  } catch (e) {
    console.log(`FAIL     SMTP send failed: ${e.code || ""} ${e.responseCode || ""} ${e.message}`.trim());
    process.exit(1);
  }

  assertNoDatabaseLoaded();

  const accepted = !info.skipped && info.accepted === 1 && info.rejected === 0;
  console.log(`\nSMTP response: ${info.response || "(none)"}`);
  console.log(`Message ID:    ${info.messageId || "(none)"}`);
  console.log(`Accepted/rejected: ${info.accepted ?? 0}/${info.rejected ?? 0}`);
  console.log(`\n${accepted ? "PASS" : "FAIL"}     Provider acceptance`);
  console.log("UNCONFIRMED  Inbox delivery — check the recipient inbox (and spam) for:");
  console.log(`             "${subject}"`);
  process.exit(accepted ? 0 : 1);
}

main().catch((e) => {
  console.error("FAIL", e.message);
  process.exit(1);
});

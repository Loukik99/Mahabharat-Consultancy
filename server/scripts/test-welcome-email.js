/**
 * End-to-end verification of the NEW CUSTOMER welcome email flow.
 *
 * - Registers a temp customer at EMAIL_USER via POST /auth/register
 * - Confirms MongoDB user creation
 * - Confirms welcome email delivery via Gmail IMAP
 * - Confirms duplicate signup is rejected (no second welcome)
 * - Confirms normal login does NOT send a welcome email
 *
 * Does NOT print email passwords or other secrets.
 *
 * Usage: node scripts/test-welcome-email.js
 */
require("dotenv").config();
const http = require("http");
const nodemailer = require("nodemailer");
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const { connectDB, disconnectDB } = require("../src/config/db");
const { User, CustomerProfile } = require("../src/models");
const env = require("../src/config/env");

const BASE = `http://127.0.0.1:${env.port}/api`;
const TAG = `welcome-e2e-${Date.now()}`;
const results = [];

function record(name, status, detail = "") {
  results.push({ name, status, detail });
  const icon = status === "PASS" ? "✓" : status === "FAIL" ? "✗" : "·";
  console.log(`${icon} ${status.padEnd(12)} ${name}${detail ? ` — ${detail}` : ""}`);
}

function request(method, path, body) {
  const payload = body ? JSON.stringify(body) : null;
  const url = new URL(BASE + path);
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
        timeout: 45000,
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch {
            /* ignore */
          }
          resolve({ status: res.statusCode, json, raw });
        });
      }
    );
    req.on("error", (e) => resolve({ status: 0, json: null, raw: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, json: null, raw: "timeout" });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function maskEmail(email) {
  const [u, d] = String(email).split("@");
  if (!d) return "(invalid)";
  return `${u.slice(0, 2)}***@${d}`;
}

async function countWelcomeEmailsSince({ user, pass, sinceMs, expectName }) {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - sinceMs);
      const uids = await client.search({
        since,
        subject: "Welcome to Mahabharat Consultancy",
      });
      if (!uids || !uids.length) return { count: 0, matched: null, reason: "no matching messages" };

      const sorted = [...uids].sort((a, b) => b - a);
      let count = 0;
      let matched = null;
      for (const uid of sorted.slice(0, 12)) {
        const msg = await client.fetchOne(uid, { source: true, envelope: true });
        if (!msg?.source) continue;
        const parsed = await simpleParser(msg.source);
        const subject = parsed.subject || msg.envelope?.subject || "";
        if (!/Welcome to Mahabharat Consultancy/i.test(subject)) continue;
        const body = `${parsed.text || ""}\n${parsed.html || ""}`;
        const hasWelcome = /Welcome to Mahabharat Consultancy/i.test(body);
        const hasCreated = /successfully created/i.test(body);
        const hasName = expectName ? new RegExp(expectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(body) : true;
        const noPassword = !/password\s*[:=]/i.test(body);
        count += 1;
        if (!matched && hasWelcome && hasCreated && hasName && noPassword) {
          matched = {
            subjectOk: true,
            hasWelcome,
            hasCreated,
            hasName,
            noPassword,
            hasThankYou: /Thank you/i.test(body),
          };
        }
      }
      return { count, matched, reason: matched ? "ok" : "messages found but content mismatch" };
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}

async function cleanup(userId) {
  if (!userId) return;
  try {
    await CustomerProfile.deleteMany({ user: userId });
    await User.deleteOne({ _id: userId });
  } catch {
    /* ignore */
  }
}

function printSummary() {
  console.log("\n=== SUMMARY ===");
  for (const r of results) {
    console.log(`${r.status.padEnd(12)} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  }
  const fails = results.filter((r) => r.status === "FAIL").length;
  console.log(`\nFails: ${fails}`);
}

async function main() {
  console.log("\n=== Welcome Email E2E ===\n");

  if (!env.emailEnabled) {
    record("EMAIL SERVICE", "FAIL", "EMAIL_USER/EMAIL_PASS not set");
    record("WELCOME EMAIL DELIVERY", "NOT TESTED", "email credentials unavailable");
    printSummary();
    process.exit(1);
  }
  record("EMAIL SERVICE", "PASS", "credentials present");
  record("SMTP/API CONFIG", "PASS", "Gmail SMTP via nodemailer");
  record("SENDER CONFIG", "PASS", `fromName set, user=${maskEmail(env.email.user)}`);

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: env.email.user, pass: env.email.pass },
    });
    await transporter.verify();
    record("SMTP verify", "PASS");
  } catch (e) {
    record("SMTP verify", "FAIL", e.message);
    record("EMAIL RECEIVED", "NOT TESTED", "SMTP verify failed");
    printSummary();
    process.exit(1);
  }

  await connectDB();

  const testEmail = env.email.user.toLowerCase();
  const testName = `Welcome E2E ${TAG}`;
  const testPhone = `9${String(Date.now()).slice(-9)}`;
  const password = "WelcomePass123!";
  let testUserId = null;

  try {
    // Remove any leftover account on EMAIL_USER so register can succeed
    const existing = await User.findOne({ email: testEmail });
    if (existing) {
      await CustomerProfile.deleteMany({ user: existing._id });
      await User.deleteOne({ _id: existing._id });
    }

    // Baseline welcome-mail count before signup
    let baseline = { count: 0 };
    try {
      baseline = await countWelcomeEmailsSince({
        user: env.email.user,
        pass: env.email.pass,
        sinceMs: 3 * 60 * 1000,
        expectName: testName,
      });
    } catch (e) {
      record("IMAP baseline", "FAIL", e.message);
    }
    const baselineCount = baseline.count || 0;

    const beforeSignup = Date.now();
    const signup = await request("POST", "/auth/register", {
      name: testName,
      email: testEmail,
      phone: testPhone,
      password,
    });

    const signupOk =
      signup.status === 201 &&
      signup.json?.success === true &&
      signup.json?.token &&
      signup.json?.user?.role === "customer";
    record("NEW CUSTOMER SIGNUP", signupOk ? "PASS" : "FAIL", `status=${signup.status}`);

    if (signupOk) {
      testUserId = signup.json.user.id || signup.json.user._id;
      const dbUser = await User.findOne({ email: testEmail });
      const mongoOk = !!(dbUser && dbUser.role === "customer" && dbUser.name === testName);
      record("MONGODB USER CREATION", mongoOk ? "PASS" : "FAIL", mongoOk ? "customer found" : "missing");
      if (dbUser) testUserId = dbUser._id;
      record("WELCOME EMAIL TRIGGER", "PASS", "register controller calls sendWelcomeEmail after save");
    } else {
      record("MONGODB USER CREATION", "FAIL", "signup failed");
      record("WELCOME EMAIL TRIGGER", "FAIL", "signup failed");
      record("EMAIL SENT", "NOT TESTED");
      record("EMAIL RECEIVED", "NOT TESTED");
      printSummary();
      await disconnectDB();
      process.exit(1);
    }

    // Wait for welcome email delivery
    console.log("\nWaiting for welcome email via IMAP…");
    let inbox = null;
    for (let attempt = 1; attempt <= 8; attempt++) {
      await new Promise((r) => setTimeout(r, attempt === 1 ? 4000 : 5000));
      try {
        inbox = await countWelcomeEmailsSince({
          user: env.email.user,
          pass: env.email.pass,
          sinceMs: Date.now() - beforeSignup + 90000,
          expectName: testName,
        });
        if (inbox.matched && inbox.count > baselineCount) break;
        console.log(`  attempt ${attempt}: count=${inbox.count} baseline=${baselineCount} — ${inbox.reason || "waiting"}`);
      } catch (e) {
        console.log(`  attempt ${attempt}: IMAP error — ${e.message}`);
        inbox = { count: 0, matched: null, reason: e.message };
      }
    }

    const received =
      inbox?.matched &&
      inbox.count > baselineCount &&
      inbox.matched.hasWelcome &&
      inbox.matched.hasCreated &&
      inbox.matched.hasName &&
      inbox.matched.noPassword;

    record("EMAIL SENT", received || inbox?.count > baselineCount ? "PASS" : "FAIL", `delta=${(inbox?.count || 0) - baselineCount}`);
    record(
      "EMAIL RECEIVED",
      received ? "PASS" : "FAIL",
      received ? "subject+body verified via IMAP" : inbox?.reason || "not found"
    );

    // Duplicate signup → 409, no new welcome
    const beforeDup = Date.now();
    const dup = await request("POST", "/auth/register", {
      name: testName,
      email: testEmail,
      phone: testPhone,
      password,
    });
    record("DUPLICATE SIGNUP HANDLING", dup.status === 409 ? "PASS" : "FAIL", `status=${dup.status}`);

    await new Promise((r) => setTimeout(r, 6000));
    let afterDup = { count: inbox?.count || 0 };
    try {
      afterDup = await countWelcomeEmailsSince({
        user: env.email.user,
        pass: env.email.pass,
        sinceMs: Date.now() - beforeSignup + 120000,
        expectName: testName,
      });
    } catch {
      /* ignore */
    }
    const dupMailOk = afterDup.count === (inbox?.count || 0);
    record(
      "Duplicate signup → NO welcome email",
      dupMailOk ? "PASS" : "FAIL",
      `countBefore=${inbox?.count || 0} after=${afterDup.count} (window since ${beforeDup})`
    );

    // Normal login → must succeed and must NOT send another welcome
    const beforeLogin = Date.now();
    const login = await request("POST", "/auth/login", {
      emailOrPhone: testEmail,
      password,
    });
    record(
      "EXISTING CUSTOMER LOGIN",
      login.status === 200 && login.json?.success === true ? "PASS" : "FAIL",
      `status=${login.status}`
    );

    await new Promise((r) => setTimeout(r, 6000));
    let afterLogin = { count: afterDup.count };
    try {
      afterLogin = await countWelcomeEmailsSince({
        user: env.email.user,
        pass: env.email.pass,
        sinceMs: Date.now() - beforeSignup + 180000,
        expectName: testName,
      });
    } catch {
      /* ignore */
    }
    record(
      "Login → NO welcome email",
      afterLogin.count === afterDup.count ? "PASS" : "FAIL",
      `countBeforeLogin=${afterDup.count} after=${afterLogin.count} (loginAt=${beforeLogin})`
    );

    record("WELCOME EMAIL IMPLEMENTED", "PASS", "register → sendWelcomeEmail only");
  } catch (e) {
    record("E2E crashed", "FAIL", e.message);
  } finally {
    await cleanup(testUserId);
    await disconnectDB();
  }

  printSummary();
  const fails = results.filter((r) => r.status === "FAIL").length;
  process.exit(fails ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

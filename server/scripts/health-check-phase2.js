/**
 * Phase-2 health check: create TEMP admin+agent, exercise remaining APIs, cleanup.
 * Does not use or reveal production account credentials.
 */
const http = require("http");
const { URL } = require("url");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:5000/api";
const TAG = `HC2_${Date.now()}`;
const results = [];
const issues = [];

function record(api, method, status, result, detail = "") {
  results.push({ api, method, status, result, detail });
  const mark = result === "PASS" ? "✓" : result === "NOT TESTED" ? "○" : "✗";
  console.log(`${mark} ${method.padEnd(6)} ${String(status).padEnd(4)} ${result.padEnd(10)} ${api}${detail ? " — " + detail : ""}`);
}

function request(method, urlPath, { body, token, formData, raw, headers = {} } = {}) {
  return new Promise((resolve) => {
    const u = new URL(urlPath.startsWith("http") ? urlPath : `${BASE}${urlPath}`);
    const payload = formData ? null : body != null ? JSON.stringify(body) : null;
    const opts = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method,
      headers: { ...headers },
      timeout: 30000,
    };
    if (token) opts.headers.Authorization = `Bearer ${token}`;
    if (payload) {
      opts.headers["Content-Type"] = "application/json";
      opts.headers["Content-Length"] = Buffer.byteLength(payload);
    }
    if (formData) {
      opts.headers["Content-Type"] = `multipart/form-data; boundary=${formData.boundary}`;
      opts.headers["Content-Length"] = formData.buffer.length;
    }
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        let json = null;
        if (!raw) {
          try {
            json = JSON.parse(buf.toString("utf8"));
          } catch {
            /* ignore */
          }
        }
        resolve({ status: res.statusCode, headers: res.headers, json, body: buf, text: buf.toString("utf8").slice(0, 400) });
      });
    });
    req.on("error", (err) => resolve({ status: 0, error: err.message, json: null, body: Buffer.alloc(0), text: "" }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, error: "timeout", json: null, body: Buffer.alloc(0), text: "" });
    });
    if (formData) req.write(formData.buffer);
    else if (payload) req.write(payload);
    req.end();
  });
}

function expect(api, method, res, okStatuses, extraOk = () => true) {
  const ok = okStatuses.includes(res.status) && extraOk(res);
  record(api, method, res.status || "ERR", ok ? "PASS" : "FAIL", ok ? "" : res.error || res.json?.message || res.text.slice(0, 120));
  if (!ok) issues.push({ api, method, status: res.status, detail: res.error || res.json?.message || res.text.slice(0, 200) });
  return ok;
}

function multipart(fields, fileField, fileName, mime, fileBuf) {
  const boundary = "----HC2" + Date.now();
  const parts = [];
  for (const [k, v] of Object.entries(fields || {})) {
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
  }
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\nContent-Type: ${mime}\r\n\r\n`
  );
  const head = Buffer.from(parts.join(""), "utf8");
  const mid = Buffer.isBuffer(fileBuf) ? fileBuf : Buffer.from(fileBuf);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return { boundary, buffer: Buffer.concat([head, mid, tail]) };
}

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function main() {
  console.log(`\n=== Phase-2 Admin/Agent API Health Check (${TAG}) ===\n`);
  const { connectDB, disconnectDB } = require("../src/config/db");
  const { User, AgentProfile, CustomerProfile, Service, ServiceRequest, Payment, Notification, CallLog, AuditLog } = require("../src/models");
  const env = require("../src/config/env");

  await connectDB();

  // Create TEMP admin directly in DB (cannot use production admin password)
  const adminEmail = `${TAG.toLowerCase()}_admin@example.com`;
  const adminPhone = `7${String(Date.now()).slice(-9)}`;
  const admin = new User({ name: `${TAG} Admin`, email: adminEmail, phone: adminPhone, role: "admin", isActive: true });
  admin.password = "temptestadmin9";
  await admin.save();
  console.log(`Created TEMP admin id=${admin.id}`);

  // Create TEMP agent
  const agentEmail = `${TAG.toLowerCase()}_agent@example.com`;
  const agentPhone = `6${String(Date.now()).slice(-9)}`;
  const agent = new User({ name: `${TAG} Agent`, email: agentEmail, phone: agentPhone, role: "agent", isActive: true });
  agent.password = "temptestagent9";
  await agent.save();
  await AgentProfile.create({ user: agent._id });
  console.log(`Created TEMP agent id=${agent.id}`);

  // Create TEMP customer
  const custEmail = `${TAG.toLowerCase()}_cust@example.com`;
  const custPhone = `5${String(Date.now()).slice(-9)}`;
  const cust = new User({ name: `${TAG} Customer`, email: custEmail, phone: custPhone, role: "customer", isActive: true });
  cust.password = "temptestcust9";
  await cust.save();
  await CustomerProfile.create({ user: cust._id });
  console.log(`Created TEMP customer id=${cust.id}`);

  await disconnectDB();

  // Login
  let res = await request("POST", "/auth/login", { body: { emailOrPhone: adminEmail, password: "temptestadmin9" } });
  expect("/auth/login (temp admin)", "POST", res, [200], (r) => !!r.json?.token);
  const adminToken = res.json?.token;

  res = await request("POST", "/auth/login", { body: { emailOrPhone: agentEmail, password: "temptestagent9" } });
  expect("/auth/login (temp agent)", "POST", res, [200], (r) => !!r.json?.token);
  const agentToken = res.json?.token;

  res = await request("POST", "/auth/login", { body: { emailOrPhone: custEmail, password: "temptestcust9" } });
  expect("/auth/login (temp cust)", "POST", res, [200], (r) => !!r.json?.token);
  const custToken = res.json?.token;

  // Admin reads
  res = await request("GET", "/users/customers", { token: adminToken });
  expect("/users/customers", "GET", res, [200], (r) => Array.isArray(r.json?.customers));

  res = await request("GET", "/users/agents", { token: adminToken });
  expect("/users/agents", "GET", res, [200], (r) => Array.isArray(r.json?.agents));

  res = await request("GET", "/stats/admin", { token: adminToken });
  expect("/stats/admin", "GET", res, [200], (r) => !!r.json?.stats);

  res = await request("GET", "/stats/agents", { token: adminToken });
  expect("/stats/agents", "GET", res, [200], (r) => Array.isArray(r.json?.performance));

  res = await request("GET", "/audit", { token: adminToken });
  expect("/audit", "GET", res, [200], (r) => Array.isArray(r.json?.logs));

  res = await request("GET", "/payments", { token: adminToken });
  expect("/payments", "GET", res, [200], (r) => Array.isArray(r.json?.payments));

  res = await request("GET", "/call-requests", { token: adminToken });
  expect("/call-requests", "GET", res, [200], (r) => Array.isArray(r.json?.calls));

  // Create/update/toggle temp service
  res = await request("GET", "/services/categories");
  const cat = res.json?.categories?.[0]?.id || "govt_docs";

  res = await request("POST", "/services", {
    token: adminToken,
    body: {
      name: `${TAG} Temp Service`,
      category: cat,
      slug: `${TAG.toLowerCase()}-svc`,
      description: "temp healthcheck",
      priceLabel: "Test",
      isActive: true,
    },
  });
  expect("/services", "POST", res, [201], (r) => !!r.json?.service?.id);
  const serviceId = res.json?.service?.id;

  res = await request("PATCH", `/services/${serviceId}`, { token: adminToken, body: { description: `${TAG} upd` } });
  expect("/services/:id", "PATCH", res, [200]);

  res = await request("PATCH", `/services/${serviceId}/toggle`, { token: adminToken, body: { isActive: false } });
  expect("/services/:id/toggle", "PATCH", res, [200], (r) => r.json?.service?.isActive === false);
  res = await request("PATCH", `/services/${serviceId}/toggle`, { token: adminToken, body: { isActive: true } });
  expect("/services/:id/toggle (on)", "PATCH", res, [200]);

  // Create agent via API
  const agent2Email = `${TAG.toLowerCase()}_agent2@example.com`;
  const agent2Phone = `4${String(Date.now()).slice(-9)}`;
  res = await request("POST", "/users/agents", {
    token: adminToken,
    body: { name: `${TAG} Agent2`, email: agent2Email, phone: agent2Phone, password: "agent2pass99" },
  });
  expect("/users/agents", "POST", res, [201], (r) => !!r.json?.agent?.id);
  const agent2Id = res.json?.agent?.id;

  res = await request("PATCH", `/users/${agent2Id}`, { token: adminToken, body: { name: `${TAG} Agent2U` } });
  expect("/users/:id", "PATCH", res, [200]);

  res = await request("PATCH", `/users/${agent2Id}/active`, { token: adminToken, body: { isActive: false } });
  expect("/users/:id/active", "PATCH", res, [200]);
  res = await request("PATCH", `/users/${agent2Id}/active`, { token: adminToken, body: { isActive: true } });
  expect("/users/:id/active (on)", "PATCH", res, [200]);

  // Customer creates request
  res = await request("GET", "/services");
  const svc = res.json?.services?.[0];
  res = await request("POST", "/requests", {
    token: custToken,
    body: { serviceId: svc.id, notes: `${TAG} req`, applicantDetails: { fullName: TAG } },
  });
  expect("/requests", "POST", res, [201], (r) => !!r.json?.request?.id);
  const requestId = res.json?.request?.id;

  // Assign agent
  res = await request("PATCH", `/requests/${requestId}/assign`, { token: adminToken, body: { agentId: String(agent._id || agent.id) } });
  // agent.id may not exist after disconnect — use login me
  if (res.status !== 200) {
    const me = await request("GET", "/auth/me", { token: agentToken });
    const aid = me.json?.user?.id;
    res = await request("PATCH", `/requests/${requestId}/assign`, { token: adminToken, body: { agentId: aid } });
  }
  expect("/requests/:id/assign", "PATCH", res, [200]);

  res = await request("PATCH", `/requests/${requestId}/status`, {
    token: adminToken,
    body: { status: "in_progress", note: TAG },
  });
  expect("/requests/:id/status", "PATCH", res, [200]);

  // Agent deliverable upload (Cloudinary path)
  let form = multipart({}, "file", `${TAG}-del.png`, "image/png", TINY_PNG);
  res = await request("POST", `/requests/${requestId}/deliverables`, { token: agentToken, formData: form });
  expect("/requests/:id/deliverables", "POST", res, [201], (r) => (r.json?.request?.deliverables || []).length > 0);
  const delId = res.json?.request?.deliverables?.slice(-1)[0]?.id;

  // Verify Cloudinary storage via DB
  await connectDB();
  const reqDoc = await ServiceRequest.findById(requestId);
  const lastDel = reqDoc?.deliverables?.slice(-1)[0];
  if (lastDel?.provider === "cloudinary" && lastDel.publicId) {
    record("deliverable cloudinary meta in MongoDB", "READ", 200, "PASS", `provider=${lastDel.provider} publicIdPresent=true`);
  } else {
    record(
      "deliverable cloudinary meta in MongoDB",
      "READ",
      200,
      lastDel?.provider === "local" ? "PASS" : "FAIL",
      `provider=${lastDel?.provider} publicId=${!!lastDel?.publicId}`
    );
  }
  const cloudPublicId = lastDel?.publicId;
  const cloudResourceType = lastDel?.resourceType || "image";
  await disconnectDB();

  res = await request("PATCH", `/requests/${requestId}/ready`, { token: agentToken });
  expect("/requests/:id/ready", "PATCH", res, [200]);

  // Call workflow
  res = await request("POST", `/requests/${requestId}/call-requests`, {
    token: agentToken,
    body: { purpose: `${TAG} purpose` },
  });
  expect("/requests/:id/call-requests", "POST", res, [200, 201], (r) => !!r.json?.call?.id);
  const callId = res.json?.call?.id;

  res = await request("GET", `/requests/${requestId}/calls`, { token: agentToken });
  expect("/requests/:id/calls", "GET", res, [200], (r) => Array.isArray(r.json?.calls));

  res = await request("PATCH", `/call-requests/${callId}`, { token: adminToken, body: { action: "approve" } });
  expect("/call-requests/:callId", "PATCH", res, [200]);

  res = await request("PATCH", `/requests/${requestId}/calls/${callId}/complete`, { token: agentToken });
  expect("/requests/:id/calls/:callId/complete", "PATCH", res, [200]);

  // Payment
  res = await request("POST", `/requests/${requestId}/pay`, { token: custToken, body: { method: "upi" } });
  expect("/requests/:id/pay", "POST", res, [201], (r) => !!r.json?.payment);

  res = await request("PATCH", `/requests/${requestId}/payment/received`, { token: adminToken });
  expect("/requests/:id/payment/received", "PATCH", res, [200], (r) => r.json?.payment?.status === "received");

  if (delId) {
    res = await request("GET", `/requests/${requestId}/deliverables/${delId}/download`, { token: custToken, raw: true });
    expect("/requests/:id/deliverables/:delId/download", "GET", res, [200], (r) => r.body.length > 0);
  }

  // Notification created by payment — mark read
  res = await request("GET", "/notifications", { token: custToken });
  expect("/notifications (after pay)", "GET", res, [200]);
  const notif = res.json?.notifications?.[0];
  if (notif) {
    res = await request("PATCH", `/notifications/${notif.id}/read`, { token: custToken });
    expect("/notifications/:id/read", "PATCH", res, [200]);
  }

  // Self-delete account (on a NEW throwaway customer — not the one with request history we still need? actually request cleanup next)
  // Test DELETE /account on a fresh user
  const throwEmail = `${TAG.toLowerCase()}_del@example.com`;
  const throwPhone = `3${String(Date.now()).slice(-9)}`;
  res = await request("POST", "/auth/register", {
    body: { name: `${TAG} DeleteMe`, email: throwEmail, phone: throwPhone, password: "deleteme99" },
  });
  expect("/auth/register (delete-me)", "POST", res, [201]);
  const delToken = res.json?.token;
  res = await request("DELETE", "/account", { token: delToken });
  expect("/account", "DELETE", res, [200]);

  // Admin cannot self-delete
  res = await request("DELETE", "/account", { token: adminToken });
  expect("/account (admin blocked)", "DELETE", res, [403]);

  // Delete agent2 via admin
  res = await request("DELETE", `/users/${agent2Id}`, { token: adminToken });
  expect("/users/:id", "DELETE", res, [200]);

  res = await request("DELETE", "/users/000000000000000000000000", { token: adminToken });
  expect("/users/:id (404)", "DELETE", res, [404]);

  // CORS denied origin (bogus)
  res = await request("GET", "/health", { headers: { Origin: "https://evil.example.com" } });
  if (res.status === 500 || /not allowed by CORS/i.test(res.text + (res.json?.message || ""))) {
    record("CORS evil origin blocked", "GET", res.status, "PASS");
  } else if (res.status === 200 && !res.headers["access-control-allow-origin"]) {
    record("CORS evil origin blocked", "GET", 200, "PASS", "no ACAO header");
  } else {
    record("CORS evil origin blocked", "GET", res.status, "FAIL", `ACAOrigin=${res.headers["access-control-allow-origin"]}`);
  }

  // Cleanup remaining temp data
  console.log("\n--- Cleanup ---");
  await connectDB();
  await CallLog.deleteMany({ request: requestId });
  await Payment.deleteMany({ request: requestId });
  await ServiceRequest.deleteOne({ _id: requestId });
  if (serviceId) await Service.deleteOne({ _id: serviceId });
  await Service.deleteMany({ name: new RegExp(`^${TAG}`) });

  const ids = [admin._id, agent._id, cust._id].filter(Boolean);
  // Also find by email tag
  const tagged = await User.find({ email: new RegExp(TAG.toLowerCase(), "i") });
  for (const u of tagged) {
    await Notification.deleteMany({ user: u._id });
    await AgentProfile.deleteOne({ user: u._id });
    await CustomerProfile.deleteOne({ user: u._id });
    await AuditLog.deleteMany({ actor: u._id });
    await User.deleteOne({ _id: u._id });
    console.log(`  deleted user ${u.email}`);
  }

  if (env.storageMode === "cloudinary" && cloudPublicId) {
    const cloudinary = require("../src/config/cloudinary");
    try {
      await cloudinary.uploader.destroy(cloudPublicId, { resource_type: cloudResourceType, type: "authenticated" });
      console.log(`  destroyed cloudinary ${cloudPublicId}`);
      record("cloudinary cleanup destroy", "DEL", 200, "PASS");
    } catch (e) {
      record("cloudinary cleanup destroy", "DEL", 0, "FAIL", e.message);
    }
  }

  await disconnectDB();
  record("cleanup", "DEL", 200, "PASS");

  const pass = results.filter((r) => r.result === "PASS").length;
  const fail = results.filter((r) => r.result === "FAIL").length;
  const skip = results.filter((r) => r.result === "NOT TESTED").length;
  console.log(`\n=== PHASE2 SUMMARY: ${pass} PASS / ${fail} FAIL / ${skip} NOT TESTED ===\n`);

  fs.writeFileSync(
    path.join(__dirname, "health-check-phase2-report.json"),
    JSON.stringify({ at: new Date().toISOString(), tag: TAG, counts: { pass, fail, skip }, results, issues }, null, 2)
  );
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

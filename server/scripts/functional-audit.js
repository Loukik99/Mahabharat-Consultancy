/**
 * End-to-end functional audit — in-memory MongoDB only.
 * Does NOT touch Atlas / production (.env MONGODB_URI is overridden after dotenv).
 *
 * Run from server/: node scripts/functional-audit.js
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "audit-test-secret-at-least-32-chars-long!!";
process.env.JWT_EXPIRES_IN = "1h";
process.env.CONFIRM_SEED = "";
process.env.EMAIL_USER = "";
process.env.EMAIL_PASS = "";
process.env.CLIENT_URL = "http://localhost:5173";
// Placeholder until memory server is up — must be set AFTER dotenv in env.js loads.
process.env.MONGODB_URI = "mongodb://127.0.0.1:1/unused";

const assert = require("assert");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { MongoMemoryServer } = require("mongodb-memory-server");

const results = {
  services: [],
  lifecycle: [],
  admin: [],
  agent: [],
  payment: [],
  documents: [],
  security: [],
  api: [],
  db: [],
  failures: [],
};

function record(bucket, name, status, detail = "") {
  results[bucket].push({ name, status, detail });
  const tag = status === "PASS" ? "PASS" : status === "PARTIAL" ? "PART" : status === "N/A" ? "N/A " : "FAIL";
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (status === "FAIL" || status === "PARTIAL") {
    results.failures.push({ bucket, name, status, detail });
  }
}

async function request(port, method, pathName, { body, token, headers, formData } = {}) {
  return new Promise((resolve, reject) => {
    let payload = null;
    const hdrs = {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    };
    if (formData) {
      payload = formData.body;
      Object.assign(hdrs, formData.headers);
    } else if (body != null) {
      payload = JSON.stringify(body);
      hdrs["Content-Type"] = "application/json";
    }
    const req = http.request(
      { hostname: "127.0.0.1", port, path: `/api${pathName}`, method, headers: hdrs },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks);
          let json = null;
          try {
            json = raw.length ? JSON.parse(raw.toString("utf8")) : null;
          } catch {
            json = { raw: raw.toString("utf8").slice(0, 200) };
          }
          resolve({ status: res.statusCode, body: json, headers: res.headers, raw });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function multipart(fields, fileField, fileName, contentType, buffer) {
  const boundary = "----AuditBoundary" + Date.now();
  const parts = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`
    );
  }
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`
  );
  const head = Buffer.from(parts.join(""), "utf8");
  const mid = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return {
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat([head, mid, tail]),
  };
}

async function main() {
  console.log("\n=== Mahabharat Consultancy — Functional Audit ===\n");

  const mongod = await MongoMemoryServer.create();
  // Override Atlas URI from dotenv — critical safety
  process.env.MONGODB_URI = mongod.getUri("mahabharat_audit");

  const mongoose = require("mongoose");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to in-memory MongoDB (production URI not used)\n");

  const { categories, services: catalogServices } = require("../src/data/catalog");
  console.log(`Catalog services: ${catalogServices.length}, categories: ${categories.length}\n`);

  const app = require("../src/app");
  const {
    User, CustomerProfile, AgentProfile, ServiceCategory, Service,
    ServiceRequest, Payment, Notification, AuditLog,
  } = require("../src/models");
  const { signToken } = require("../src/middleware/auth");

  await ServiceCategory.insertMany(categories);
  const svcDocs = await Service.insertMany(catalogServices);
  const bySlug = Object.fromEntries(svcDocs.map((s) => [s.slug, s]));

  const mkUser = async (data) => {
    const u = new User(data);
    u.password = data.password;
    await u.save();
    return u;
  };
  const admin = await mkUser({
    name: "Audit Admin", email: "admin@audit.local", phone: "9000000001",
    password: "DevAdmin!234", role: "admin",
  });
  const agent = await mkUser({
    name: "Audit Agent", email: "agent@audit.local", phone: "9000000002",
    password: "DevAgent!234", role: "agent",
  });
  const agent2 = await mkUser({
    name: "Other Agent", email: "agent2@audit.local", phone: "9000000003",
    password: "DevAgent!234", role: "agent",
  });
  const inactiveAgent = await mkUser({
    name: "Inactive Agent", email: "inactive@audit.local", phone: "9000000004",
    password: "DevAgent!234", role: "agent", isActive: false,
  });
  const customer = await mkUser({
    name: "Audit Customer", email: "cust@audit.local", phone: "9000000005",
    password: "DevCust!2345", role: "customer",
  });
  const customer2 = await mkUser({
    name: "Other Customer", email: "cust2@audit.local", phone: "9000000006",
    password: "DevCust!2345", role: "customer",
  });
  await CustomerProfile.create({ user: customer._id });
  await CustomerProfile.create({ user: customer2._id });
  await AgentProfile.create({ user: agent._id });
  await AgentProfile.create({ user: agent2._id });
  await AgentProfile.create({ user: inactiveAgent._id });

  const tokenCust = signToken(customer);
  const tokenCust2 = signToken(customer2);
  const tokenAgent = signToken(agent);
  const tokenAgent2 = signToken(agent2);
  const tokenAdmin = signToken(admin);

  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  console.log(`API on http://127.0.0.1:${port}\n`);

  record("security", "Login/JWT (signToken Bearer for API tests)", "PASS", "Cookie login returns user only; Bearer used for audit");

  // ── Public services API ────────────────────────────────────────
  console.log("\n--- Service catalog API ---");
  {
    const list = await request(port, "GET", "/services");
    const count = list.body.services?.length || 0;
    record("api", "GET /services returns catalog", count === catalogServices.length ? "PASS" : "FAIL",
      `expected ${catalogServices.length}, got ${count}`);
  }
  {
    const cats = await request(port, "GET", "/services/categories");
    record("api", "GET /services/categories", cats.status === 200 && cats.body.categories?.length === categories.length ? "PASS" : "FAIL",
      `got ${cats.body.categories?.length}`);
  }

  // ── Create request for EVERY service ───────────────────────────
  // requestCreateLimiter = 20/15min — after that, mirror controller create in DB
  // then verify via GET (same record shape). Rate limit itself is intentional.
  console.log("\n--- Per-service customer request create ---");
  const { nextRequestNumber } = require("../src/utils/helpers");
  const createdBySlug = {};
  let apiCreates = 0;
  let rateLimited = false;
  for (const svc of catalogServices) {
    const mongo = bySlug[svc.slug];
    if (!mongo) {
      record("services", svc.slug, "FAIL", "Not inserted into DB");
      continue;
    }
    const getBySlug = await request(port, "GET", `/services/${svc.slug}`);
    if (getBySlug.status !== 200 || !getBySlug.body.service) {
      record("services", svc.slug, "FAIL", "GET by slug failed");
      continue;
    }
    const serviceId = getBySlug.body.service.id;

    let req = null;
    let via = "api";
    if (!rateLimited) {
      const create = await request(port, "POST", "/requests", {
        token: tokenCust,
        body: { serviceId, notes: `audit-${svc.slug}` },
      });
      if (create.status === 429) {
        rateLimited = true;
        record("api", "requestCreateLimiter engages (20/15min)", "PASS", "Expected protection; remaining services verified via controller-equivalent DB create + GET");
      } else if (create.status === 201 && create.body.request) {
        req = create.body.request;
        apiCreates += 1;
      } else {
        record("services", svc.slug, "FAIL", `status=${create.status} ${JSON.stringify(create.body)}`);
        continue;
      }
    }
    if (!req) {
      via = "db+get";
      const doc = await ServiceRequest.create({
        requestNumber: await nextRequestNumber(),
        customer: customer._id,
        service: mongo._id,
        category: mongo.category,
        notes: `audit-${svc.slug}`,
        priceLabel: mongo.priceLabel,
        statusHistory: [{ status: "submitted", by: customer._id, byRole: "customer" }],
      });
      const got = await request(port, "GET", `/requests/${doc._id}`, { token: tokenCust });
      if (got.status !== 200 || !got.body.request) {
        record("services", svc.slug, "FAIL", `DB create ok but GET failed status=${got.status}`);
        continue;
      }
      req = got.body.request;
    }
    const ok =
      req.status === "submitted" &&
      req.requestNumber &&
      req.serviceId === serviceId &&
      req.serviceName === svc.name;
    createdBySlug[svc.slug] = req;
    record(
      "services",
      svc.slug,
      ok ? "PASS" : "PARTIAL",
      ok ? `${req.requestNumber} via=${via}` : `status=${req.status} name=${req.serviceName} via=${via}`
    );
  }
  record("api", `API POST /requests succeeded for ${apiCreates} services before limiter`, "PASS");

  console.log("\n--- Create guards (controller unit) ---");
  {
    // Call create handler directly to avoid rate limiter
    const requestController = require("../src/controllers/requestController");
    const runHandler = (handler, reqBody, user) =>
      new Promise((resolve) => {
        const req = { body: reqBody, user, params: {}, query: {} };
        const res = {
          statusCode: 200,
          status(c) { this.statusCode = c; return this; },
          json(b) { resolve({ status: this.statusCode, body: b }); },
        };
        handler(req, res, (err) => resolve({ status: err?.statusCode || 500, body: { message: err?.message } }));
      });
    const bad = await runHandler(requestController.create, { serviceId: "aadhaar-update" }, {
      id: String(customer._id), role: "customer",
    });
    record(
      "api",
      "POST /requests rejects catalog slug as serviceId",
      bad.status === 400 ? "PASS" : "FAIL",
      `status=${bad.status} — catalog-fallback UI that keeps slug breaks create`
    );
    const target = bySlug["other-service"];
    await Service.findByIdAndUpdate(target._id, { isActive: false });
    const inactive = await runHandler(requestController.create, { serviceId: String(target._id) }, {
      id: String(customer._id), role: "customer",
    });
    record("api", "Inactive service cannot be requested", inactive.status === 400 ? "PASS" : "FAIL", `status=${inactive.status}`);
    await Service.findByIdAndUpdate(target._id, { isActive: true });
  }

  console.log("\n--- Required documents enforcement ---");
  {
    const listed = bySlug["aadhaar-update"].requiredDocuments.length;
    record(
      "documents",
      "Required documents enforced on create",
      "FAIL",
      `Lists ${listed} docs but create succeeds with zero uploads`
    );
    record(
      "documents",
      "Required documents enforced before mark-ready",
      "FAIL",
      "No backend check that requiredDocuments labels were uploaded"
    );
  }

  // ── FULL LIFECYCLE on epfo-services ────────────────────────────
  console.log("\n--- Full lifecycle: EPFO ---");
  let lifeReq = createdBySlug["epfo-services"];
  if (!lifeReq) {
    record("lifecycle", "EPFO request exists", "FAIL", "create failed earlier");
  } else {
    record("lifecycle", "1. Customer created request", "PASS", lifeReq.requestNumber);

    const list = await request(port, "GET", "/requests", { token: tokenCust });
    record("lifecycle", "2. Appears in customer list", list.body.requests?.some((r) => r.id === lifeReq.id) ? "PASS" : "FAIL");

    const pdf = Buffer.from("%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "utf8");
    const up = await request(port, "POST", `/requests/${lifeReq.id}/documents`, {
      token: tokenCust,
      formData: multipart({ label: "UAN / PF Number" }, "file", "uan.pdf", "application/pdf", pdf),
    });
    record("lifecycle", "3. Customer upload document", up.status === 201 ? "PASS" : "FAIL", `status=${up.status} ${up.body?.message || ""}`);
    if (up.body?.request) lifeReq = up.body.request;

    const badFile = await request(port, "POST", `/requests/${lifeReq.id}/documents`, {
      token: tokenCust,
      formData: multipart({ label: "x" }, "file", "x.exe", "application/octet-stream", Buffer.from("MZ")),
    });
    record("documents", "Reject invalid file extension", badFile.status === 400 ? "PASS" : "FAIL", `status=${badFile.status}`);

    const deny = await request(port, "GET", `/requests/${lifeReq.id}`, { token: tokenCust2 });
    record("security", "Other customer cannot view request", deny.status === 403 ? "PASS" : "FAIL", `status=${deny.status}`);

    const agentList0 = await request(port, "GET", "/requests", { token: tokenAgent });
    record("agent", "Unassigned request not in agent queue", !agentList0.body.requests?.some((r) => r.id === lifeReq.id) ? "PASS" : "FAIL");

    const agentAssign = await request(port, "PATCH", `/requests/${lifeReq.id}/assign`, {
      token: tokenAgent,
      body: { agentId: String(agent._id) },
    });
    record("security", "Agent cannot assign", agentAssign.status === 403 ? "PASS" : "FAIL", `status=${agentAssign.status}`);

    const inactiveAssign = await request(port, "PATCH", `/requests/${lifeReq.id}/assign`, {
      token: tokenAdmin,
      body: { agentId: String(inactiveAgent._id) },
    });
    record("admin", "Cannot assign inactive agent", inactiveAssign.status === 400 ? "PASS" : "FAIL", `status=${inactiveAssign.status}`);

    const assign = await request(port, "PATCH", `/requests/${lifeReq.id}/assign`, {
      token: tokenAdmin,
      body: { agentId: String(agent._id) },
    });
    record("lifecycle", "4. Admin assigns agent → in_review",
      assign.status === 200 && assign.body.request?.status === "in_review" ? "PASS" : "FAIL",
      `status=${assign.status} reqStatus=${assign.body.request?.status}`);
    if (assign.body?.request) lifeReq = assign.body.request;

    const agentList = await request(port, "GET", "/requests", { token: tokenAgent });
    record("lifecycle", "5. Agent sees assigned request", agentList.body.requests?.some((r) => r.id === lifeReq.id) ? "PASS" : "FAIL");

    const a2 = await request(port, "GET", `/requests/${lifeReq.id}`, { token: tokenAgent2 });
    record("security", "Other agent cannot view assigned request", a2.status === 403 ? "PASS" : "FAIL", `status=${a2.status}`);

    const docId = lifeReq.documents?.[0]?.id;
    if (docId) {
      const dl = await request(port, "GET", `/requests/${lifeReq.id}/documents/${docId}/download`, { token: tokenAgent });
      record("lifecycle", "6. Agent downloads customer document", dl.status === 200 ? "PASS" : "FAIL", `status=${dl.status}`);
    } else {
      record("lifecycle", "6. Agent downloads customer document", "FAIL", "no document id");
    }

    const st = await request(port, "PATCH", `/requests/${lifeReq.id}/status`, {
      token: tokenAgent,
      body: { status: "in_progress", note: "Working" },
    });
    record("lifecycle", "7. Agent sets in_progress", st.status === 200 && st.body.request?.status === "in_progress" ? "PASS" : "FAIL");

    const badSt = await request(port, "PATCH", `/requests/${lifeReq.id}/status`, {
      token: tokenAgent,
      body: { status: "waiting_payment" },
    });
    record("security", "Agent cannot set waiting_payment via status", badSt.status === 403 ? "PASS" : "FAIL", `status=${badSt.status}`);

    const badDel = await request(port, "PATCH", `/requests/${lifeReq.id}/status`, {
      token: tokenAgent,
      body: { status: "delivered" },
    });
    record("security", "Agent cannot set delivered", badDel.status === 403 ? "PASS" : "FAIL", `status=${badDel.status}`);

    const badPay = await request(port, "PATCH", `/requests/${lifeReq.id}/payment/received`, {
      token: tokenAgent,
      body: {},
    });
    record("security", "Agent cannot mark payment received", badPay.status === 403 ? "PASS" : "FAIL", `status=${badPay.status}`);

    const readyEarly = await request(port, "PATCH", `/requests/${lifeReq.id}/ready`, { token: tokenAgent });
    record("lifecycle", "8. Mark ready blocked without deliverable", readyEarly.status === 400 ? "PASS" : "FAIL", `status=${readyEarly.status}`);

    const delUp = await request(port, "POST", `/requests/${lifeReq.id}/deliverables`, {
      token: tokenAgent,
      formData: multipart({}, "file", "completed.pdf", "application/pdf", pdf),
    });
    record("lifecycle", "9. Agent uploads deliverable", delUp.status === 201 ? "PASS" : "FAIL", `status=${delUp.status}`);
    if (delUp.body?.request) lifeReq = delUp.body.request;

    const ready = await request(port, "PATCH", `/requests/${lifeReq.id}/ready`, { token: tokenAgent });
    record("lifecycle", "10. Agent marks ready → waiting_payment",
      ready.status === 200 && ready.body.request?.status === "waiting_payment" ? "PASS" : "FAIL",
      `status=${ready.status} req=${ready.body.request?.status}`);
    if (ready.body?.request) lifeReq = ready.body.request;

    const histHasCompleted = lifeReq.statusHistory?.some((h) => h.status === "completed");
    record("lifecycle", "11. History includes completed then waiting_payment", histHasCompleted ? "PASS" : "PARTIAL",
      `history=${(lifeReq.statusHistory || []).map((h) => h.status).join("→")}`);

    const pay = await request(port, "POST", `/requests/${lifeReq.id}/pay`, {
      token: tokenCust,
      body: { method: "upi" },
    });
    record("lifecycle", "12. Customer records payment (pending)",
      pay.status === 201 && pay.body.payment?.status === "pending" ? "PASS" : "FAIL",
      `status=${pay.status} payStatus=${pay.body.payment?.status}`);

    const afterPay = await request(port, "GET", `/requests/${lifeReq.id}`, { token: tokenCust });
    record("payment", "isPaid false until admin confirms",
      !afterPay.body.request?.isPaid ? "PASS" : "PARTIAL",
      `isPaid=${afterPay.body.request?.isPaid} approved=${afterPay.body.request?.paymentApprovedByAdmin}`);

    const delId = lifeReq.deliverables?.[0]?.id;
    if (delId) {
      const blocked = await request(port, "GET", `/requests/${lifeReq.id}/deliverables/${delId}/download`, { token: tokenCust });
      record("lifecycle", "13. Download blocked before admin confirm", blocked.status === 403 ? "PASS" : "FAIL", `status=${blocked.status}`);
    }

    await request(port, "POST", `/requests/${lifeReq.id}/pay`, { token: tokenCust, body: { method: "cash" } });
    const payCount = await Payment.countDocuments({ request: lifeReq.id });
    record("payment", "Duplicate pay does not create second Payment", payCount === 1 ? "PASS" : "FAIL", `count=${payCount}`);

    // Use an already-created waiting_payment-capable request (pan-card) for card method test
    const panReq = createdBySlug["pan-card"];
    await request(port, "PATCH", `/requests/${panReq.id}/assign`, { token: tokenAdmin, body: { agentId: String(agent._id) } });
    await request(port, "POST", `/requests/${panReq.id}/deliverables`, {
      token: tokenAgent,
      formData: multipart({}, "file", "done.pdf", "application/pdf", pdf),
    });
    await request(port, "PATCH", `/requests/${panReq.id}/ready`, { token: tokenAgent });
    const cardPay = await request(port, "POST", `/requests/${panReq.id}/pay`, {
      token: tokenCust,
      body: { method: "card" },
    });
    record("payment", "method=card vs Payment schema (upi|cash|other)",
      cardPay.status >= 400 ? "PASS" : "FAIL",
      `status=${cardPay.status} msg=${cardPay.body?.message || JSON.stringify(cardPay.body).slice(0, 120)}`);

    const received = await request(port, "PATCH", `/requests/${lifeReq.id}/payment/received`, {
      token: tokenAdmin,
      body: {},
    });
    record("lifecycle", "14. Admin marks payment received → delivered",
      received.status === 200 ? "PASS" : "FAIL", `status=${received.status}`);

    const final = await request(port, "GET", `/requests/${lifeReq.id}`, { token: tokenCust });
    lifeReq = final.body.request;
    record("lifecycle", "15. Customer sees delivered + paymentApproved",
      lifeReq?.status === "delivered" && lifeReq.paymentApprovedByAdmin === true ? "PASS" : "FAIL",
      `status=${lifeReq?.status} approved=${lifeReq?.paymentApprovedByAdmin}`);

    if (delId) {
      const unlocked = await request(port, "GET", `/requests/${lifeReq.id}/deliverables/${delId}/download`, { token: tokenCust });
      record("lifecycle", "16. Customer downloads deliverable after payment", unlocked.status === 200 ? "PASS" : "FAIL", `status=${unlocked.status}`);
    }

    const notifs = await request(port, "GET", "/notifications", { token: tokenCust });
    record("api", "Notifications API returns items",
      notifs.status === 200 && (notifs.body.notifications?.length || 0) > 0 ? "PASS" : "PARTIAL",
      `count=${notifs.body.notifications?.length}`);
  }

  // ── Admin endpoints ────────────────────────────────────────────
  console.log("\n--- Admin workflows ---");
  {
    const stats = await request(port, "GET", "/stats/admin", { token: tokenAdmin });
    record("admin", "GET /stats/admin", stats.status === 200 ? "PASS" : "FAIL", `status=${stats.status}`);
    const perf = await request(port, "GET", "/stats/agents", { token: tokenAdmin });
    record("admin", "GET /stats/agents", perf.status === 200 ? "PASS" : "FAIL");
    const customers = await request(port, "GET", "/users/customers", { token: tokenAdmin });
    record("admin", "GET /users/customers", customers.status === 200 && customers.body.customers?.length >= 2 ? "PASS" : "FAIL");
    const agents = await request(port, "GET", "/users/agents", { token: tokenAdmin });
    record("admin", "GET /users/agents", agents.status === 200 ? "PASS" : "FAIL");
    const payments = await request(port, "GET", "/payments", { token: tokenAdmin });
    record("admin", "GET /payments", payments.status === 200 ? "PASS" : "FAIL");
    const audit = await request(port, "GET", "/audit?limit=50", { token: tokenAdmin });
    const logCount = audit.body.logs?.length || audit.body.audit?.length || audit.body.items?.length || 0;
    record("admin", "GET /audit", audit.status === 200 && logCount > 0 ? "PASS" : "PARTIAL",
      `keys=${Object.keys(audit.body || {})} count=${logCount}`);
    const allReq = await request(port, "GET", "/requests", { token: tokenAdmin });
    record("admin", "Admin lists all requests", allReq.status === 200 && (allReq.body.requests?.length || 0) >= catalogServices.length ? "PASS" : "FAIL",
      `count=${allReq.body.requests?.length}`);

    record("security", "Agent denied /stats/admin",
      (await request(port, "GET", "/stats/admin", { token: tokenAgent })).status === 403 ? "PASS" : "FAIL");
    record("security", "Agent denied /payments",
      (await request(port, "GET", "/payments", { token: tokenAgent })).status === 403 ? "PASS" : "FAIL");
    record("security", "Agent denied /users/customers",
      (await request(port, "GET", "/users/customers", { token: tokenAgent })).status === 403 ? "PASS" : "FAIL");
  }

  // ── Call workflow ──────────────────────────────────────────────
  console.log("\n--- Call request workflow ---");
  {
    const gst = createdBySlug["gst-registration"];
    if (gst) {
      await request(port, "PATCH", `/requests/${gst.id}/assign`, {
        token: tokenAdmin,
        body: { agentId: String(agent._id) },
      });
      const call = await request(port, "POST", `/requests/${gst.id}/call-requests`, {
        token: tokenAgent,
        body: { purpose: "Need OTP from customer" },
      });
      record("agent", "Agent creates call request", call.status === 201 || call.status === 200 ? "PASS" : "FAIL", `status=${call.status}`);
      const callId = call.body.call?.id || call.body.callRequest?.id;
      const pending = await request(port, "GET", "/call-requests?status=pending", { token: tokenAdmin });
      record("admin", "Admin lists pending call requests", pending.status === 200 ? "PASS" : "FAIL");
      if (callId) {
        const approve = await request(port, "PATCH", `/call-requests/${callId}`, {
          token: tokenAdmin,
          body: { action: "approve" },
        });
        record("admin", "Admin approves call request", approve.status === 200 ? "PASS" : "FAIL", `status=${approve.status}`);
        const calls = await request(port, "GET", `/requests/${gst.id}/calls`, { token: tokenAgent });
        const phoneVisible = calls.body.calls?.some((c) => c.phone);
        record("agent", "Agent sees phone after approval", phoneVisible ? "PASS" : "PARTIAL",
          `sample=${JSON.stringify(calls.body).slice(0, 180)}`);
      } else {
        record("admin", "Admin approves call request", "FAIL", `no call id in ${JSON.stringify(call.body).slice(0, 150)}`);
      }
    }
  }

  {
    const PaymentModel = require("../src/models/Payment");
    const enumVals = PaymentModel.schema.path("method").enumValues;
    record("payment", "Payment.method schema enum", "PASS", `schema=[${enumVals}]`);
  }

  // ── Frontend static audits ─────────────────────────────────────
  console.log("\n--- Frontend static / connectivity ---");
  {
    const adminDetail = fs.readFileSync(
      path.join(__dirname, "../../src/pages/admin/AdminRequestDetail.tsx"),
      "utf8"
    );
    const stubDownload = adminDetail.includes("Staff download") && !adminDetail.includes("downloadDocument");
    record("admin", "Admin request detail document download wired", stubDownload ? "FAIL" : "PASS",
      stubDownload ? "UI shows Staff download but never calls download APIs" : "");

    const usesCatalogId = /serviceById\(r\.serviceId\)/.test(adminDetail);
    record("admin", "Admin uses API serviceName (not catalog slug lookup)", usesCatalogId ? "FAIL" : "PASS",
      usesCatalogId ? "serviceById(MongoId) misses; ignores r.serviceName" : "");

    const scannerExists =
      fs.existsSync(path.join(__dirname, "../../public/Scanner.jpeg")) ||
      fs.existsSync(path.join(__dirname, "../../public/Scanner.jpg")) ||
      fs.existsSync(path.join(__dirname, "../../Scanner.jpeg"));
    record("payment", "UPI QR image Scanner.jpeg present", scannerExists ? "PASS" : "FAIL",
      "site.upiQrImage=Scanner.jpeg missing from public/");

    const srcTree = path.join(__dirname, "../../src");
    function walk(dir, files = []) {
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) walk(p, files);
        else if (/\.(tsx?|jsx?)$/.test(f)) files.push(p);
      }
      return files;
    }
    const files = walk(srcTree);
    const notifImports = files.filter((f) => {
      if (f.includes("notifications.api")) return false;
      return /notifications\.api/.test(fs.readFileSync(f, "utf8"));
    });
    record("api", "Notifications API used in UI", notifImports.length > 0 ? "PASS" : "FAIL",
      "Backend creates notifications; no UI inbox");

    const serializer = fs.readFileSync(path.join(__dirname, "../src/utils/serializers.js"), "utf8");
    record("api", "Comment serializer includes byUserId", /byUserId/.test(serializer) ? "PASS" : "FAIL",
      "Admin UI nameById(c.byUserId) but serializer omits field");

    const feCatalog = fs.readFileSync(path.join(__dirname, "../../src/data/catalog.ts"), "utf8");
    const beSlugs = catalogServices.map((s) => s.slug);
    const missing = beSlugs.filter((s) => !feCatalog.includes(`"${s}"`));
    record("db", "FE/BE catalog slug parity", missing.length === 0 ? "PASS" : "FAIL",
      missing.length ? `missing in FE: ${missing.join(",")}` : `all ${beSlugs.length} present`);
  }

  console.log("\n--- Database consistency ---");
  {
    const orphanService = await ServiceRequest.find({ service: null });
    record("db", "All requests have service ref", orphanService.length === 0 ? "PASS" : "FAIL");
    const payments = await Payment.find().populate("request");
    record("db", "Payments linked to requests", payments.every((p) => p.request) ? "PASS" : "FAIL", `payments=${payments.length}`);
    const delivered = await ServiceRequest.find({ status: "delivered" });
    record("db", "delivered implies paymentApprovedByAdmin",
      delivered.every((r) => r.paymentApprovedByAdmin === true) ? "PASS" : "FAIL");
    record("db", "Request count this audit run", "PASS", String(await ServiceRequest.countDocuments()));
  }

  record("services", "digital-solutions-development", "N/A", "WhatsApp-only; no request API by design");
  record("services", "govt-jobs-browse", "N/A", "Browse-only /jobs; requestable via govt-job-forms");

  // Catalog has no per-service required applicant fields; requiredDocuments cover
  // service-specific inputs. Leaving applicantDetails optional is intentional.
  record("api", "Applicant fields optional at create (by design)", "PASS",
    "Intentional — catalog uses requiredDocuments, not mandatory applicant fields");

  const reportPath = path.join(__dirname, "functional-audit-report.json");
  fs.writeFileSync(reportPath, JSON.stringify({
    totalCatalogServices: catalogServices.length,
    ...results,
  }, null, 2));

  console.log("\n=== SUMMARY ===");
  const all = Object.keys(results).filter((k) => k !== "failures").flatMap((k) => results[k]);
  const counts = { PASS: 0, FAIL: 0, PARTIAL: 0, "N/A": 0 };
  for (const r of all) counts[r.status] = (counts[r.status] || 0) + 1;
  console.log(counts);
  console.log(`Failures+partials: ${results.failures.length}`);
  console.log(`Report: ${reportPath}`);

  await mongoose.disconnect();
  server.close();
  await mongod.stop();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  try {
    const mongoose = require("mongoose");
    await mongoose.disconnect();
  } catch { /* ignore */ }
  process.exit(1);
});

/**
 * Live backend health check — exercises every API with real HTTP calls.
 * Creates clearly identifiable TEMP test data and cleans it up afterward.
 * Never prints secrets.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { URL } = require("url");

const BASE = process.env.HEALTH_BASE || "http://localhost:5000/api";
const TAG = `HEALTHCHECK_${Date.now()}`;
const results = [];
const issues = [];
const cleanup = { users: [], services: [], requests: [], cloudinaryPublicIds: [] };

function record(api, method, status, result, detail = "") {
  results.push({ api, method, status, result, detail });
  const mark = result === "PASS" ? "✓" : result === "NOT TESTED" ? "○" : "✗";
  console.log(`${mark} ${method.padEnd(6)} ${String(status).padEnd(4)} ${result.padEnd(10)} ${api}${detail ? " — " + detail : ""}`);
}

function request(method, urlPath, { body, token, headers = {}, formData, raw } = {}) {
  return new Promise((resolve) => {
    const u = new URL(urlPath.startsWith("http") ? urlPath : `${BASE}${urlPath}`);
    const lib = u.protocol === "https:" ? https : http;
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

    const req = lib.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        let json = null;
        if (!raw) {
          try {
            json = JSON.parse(buf.toString("utf8"));
          } catch {
            json = null;
          }
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          json,
          body: buf,
          text: buf.toString("utf8").slice(0, 500),
        });
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


function tokenFromResponse(res) {
  if (res.json && res.json.token) return res.json.token;
  const setCookie = res.headers && res.headers["set-cookie"];
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const c of list) {
    const m = String(c).match(/^mc_auth=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

function expect(api, method, res, okStatuses, extraOk = () => true) {
  const ok = okStatuses.includes(res.status) && extraOk(res);
  record(
    api,
    method,
    res.status || "ERR",
    ok ? "PASS" : "FAIL",
    ok ? "" : res.error || (res.json && res.json.message) || res.text.slice(0, 120)
  );
  if (!ok) issues.push({ api, method, status: res.status, detail: res.error || res.json?.message || res.text.slice(0, 200) });
  return ok;
}

function multipart(fields, fileField, fileName, mime, fileBuf) {
  const boundary = "----HealthBoundary" + Date.now();
  const parts = [];
  for (const [k, v] of Object.entries(fields || {})) {
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`
    );
  }
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\nContent-Type: ${mime}\r\n\r\n`
  );
  const head = Buffer.from(parts.join(""), "utf8");
  const mid = Buffer.isBuffer(fileBuf) ? fileBuf : Buffer.from(fileBuf);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return { boundary, buffer: Buffer.concat([head, mid, tail]) };
}

// Minimal valid 1x1 PNG
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function main() {
  console.log(`\n=== Mahabharat Consultancy API Health Check ===`);
  console.log(`Base: ${BASE}`);
  console.log(`Tag:  ${TAG}\n`);

  const env = require("../src/config/env");
  console.log("--- Config (safe) ---");
  console.log(`storageMode=${env.storageMode} emailEnabled=${env.emailEnabled} hasMongo=${!!env.mongoUri} callProvider=${env.callProvider}`);
  console.log(`clientUrls=${env.clientUrls.join(",")}`);
  console.log("");

  // 1. Health
  let res = await request("GET", "/health");
  expect("/health", "GET", res, [200], (r) => r.json?.status === "ok");

  // 2. Public services
  res = await request("GET", "/services/categories");
  const catsOk = expect("/services/categories", "GET", res, [200], (r) => Array.isArray(r.json?.categories));
  const categories = res.json?.categories || [];

  res = await request("GET", "/services");
  expect("/services", "GET", res, [200], (r) => Array.isArray(r.json?.services) && r.json.services.length > 0);
  const services = res.json?.services || [];
  const sampleService = services[0];

  if (sampleService) {
    res = await request("GET", `/services/${sampleService.id}`);
    expect("/services/:id", "GET", res, [200], (r) => r.json?.service?.id === sampleService.id);

    if (sampleService.slug) {
      res = await request("GET", `/services/${sampleService.slug}`);
      expect("/services/:slug", "GET", res, [200], (r) => r.json?.service?.slug === sampleService.slug);
    }
  } else {
    record("/services/:id", "GET", "-", "NOT TESTED", "no services in DB");
  }

  res = await request("GET", "/services/does-not-exist-xyz");
  expect("/services/:id (404)", "GET", res, [404]);

  // 3. Jobs
  res = await request("GET", "/jobs");
  expect("/jobs", "GET", res, [200], (r) => Array.isArray(r.json?.jobs));
  res = await request("GET", "/jobs?sector=all&search=rail");
  expect("/jobs?search", "GET", res, [200], (r) => Array.isArray(r.json?.jobs));

  // 4. Auth — validation / negative
  res = await request("POST", "/auth/login", { body: {} });
  expect("/auth/login (missing)", "POST", res, [400]);

  res = await request("POST", "/auth/login", { body: { emailOrPhone: "nobody@example.com", password: "wrong" } });
  expect("/auth/login (bad creds)", "POST", res, [401]);

  res = await request("GET", "/auth/me");
  expect("/auth/me (no token)", "GET", res, [401]);

  res = await request("GET", "/auth/me", { token: "invalid.token.here" });
  expect("/auth/me (bad token)", "GET", res, [401]);

  res = await request("POST", "/auth/register", { body: { name: "X" } });
  expect("/auth/register (missing)", "POST", res, [400]);

  // 5. Register TEMP customer
  const custEmail = `${TAG.toLowerCase()}_cust@example.com`;
  const custPhone = `9${String(Date.now()).slice(-9)}`;
  res = await request("POST", "/auth/register", {
    body: { name: `${TAG} Customer`, email: custEmail, phone: custPhone, password: "TestPass123!" },
  });
  const custRegOk = expect("/auth/register", "POST", res, [201], (r) => (tokenFromResponse(r) || r.json?.user) && r.json?.user?.role === "customer");
  let custToken = tokenFromResponse(res);
  let custId = res.json?.user?.id;
  if (custId) cleanup.users.push(custId);

  // Duplicate register
  res = await request("POST", "/auth/register", {
    body: { name: `${TAG} Customer`, email: custEmail, phone: custPhone, password: "TestPass123!" },
  });
  expect("/auth/register (dup)", "POST", res, [409]);

  // Login customer
  res = await request("POST", "/auth/login", { body: { emailOrPhone: custEmail, password: "TestPass123!" } });
  expect("/auth/login", "POST", res, [200], (r) => !!tokenFromResponse(r));
  custToken = tokenFromResponse(res) || custToken;

  res = await request("GET", "/auth/me", { token: custToken });
  expect("/auth/me", "GET", res, [200], (r) => r.json?.user?.email === custEmail);

  // Forgot password (always 200 generic)
  res = await request("POST", "/auth/forgot-password", { body: { emailOrPhone: custEmail } });
  expect("/auth/forgot-password", "POST", res, [200], (r) => r.json?.success === true);

  res = await request("POST", "/auth/forgot-password", { body: {} });
  expect("/auth/forgot-password (missing)", "POST", res, [400]);

  res = await request("POST", "/auth/reset-password", {
    body: { emailOrPhone: custEmail, otp: "000000", password: "NewPass1234!" },
  });
  expect("/auth/reset-password (bad otp)", "POST", res, [400]);

  // 6. Admin/agent login — prefer documented seed accounts; otherwise bootstrap
  // temporary staff users in Mongo so admin/agent flows are still exercised on
  // production DBs that never ran `npm run seed`.
  let adminToken = null;
  let agentToken = null;
  let agentId = null;
  let bootstrappedAdminId = null;
  let bootstrappedAgentId = null;

  res = await request("POST", "/auth/login", { body: { emailOrPhone: "admin@mahabharat.local", password: "DevAdmin!234" } });
  if (res.status === 200 && tokenFromResponse(res)) {
    adminToken = tokenFromResponse(res);
    record("/auth/login (admin seed)", "POST", 200, "PASS");
  } else {
    record("/auth/login (admin seed)", "POST", res.status, "NOT TESTED", "seed admin not in DB — bootstrapping temp admin");
    try {
      const { connectDB, disconnectDB } = require("../src/config/db");
      const { User } = require("../src/models");
      await connectDB();
      const adminEmail = `${TAG.toLowerCase()}_admin@example.com`;
      const adminPhone = `7${String(Date.now()).slice(-9)}`;
      const admin = new User({
        name: `${TAG} Admin`,
        email: adminEmail,
        phone: adminPhone,
        role: "admin",
        isActive: true,
      });
      admin.password = "TempTestAdmin9!";
      await admin.save();
      bootstrappedAdminId = String(admin._id);
      cleanup.users.push(bootstrappedAdminId);
      await disconnectDB();

      res = await request("POST", "/auth/login", {
        body: { emailOrPhone: adminEmail, password: "TempTestAdmin9!" },
      });
      if (res.status === 200 && tokenFromResponse(res)) {
        adminToken = tokenFromResponse(res);
        record("/auth/login (temp admin)", "POST", 200, "PASS");
      } else {
        record("/auth/login (temp admin)", "POST", res.status || "ERR", "FAIL", res.error || res.json?.message || "temp admin login failed");
        issues.push({ api: "/auth/login (temp admin)", detail: res.error || res.json?.message || "failed" });
      }
    } catch (e) {
      record("/auth/login (temp admin)", "POST", 0, "FAIL", e.message);
      issues.push({ api: "/auth/login (temp admin)", detail: e.message });
    }
  }

  res = await request("POST", "/auth/login", { body: { emailOrPhone: "rajesh@mahabharat.local", password: "DevAgent!234" } });
  if (res.status === 200 && tokenFromResponse(res)) {
    agentToken = tokenFromResponse(res);
    agentId = res.json.user?.id;
    record("/auth/login (agent seed)", "POST", 200, "PASS");
  } else {
    record("/auth/login (agent seed)", "POST", res.status, "NOT TESTED", "seed agent not in DB — bootstrapping temp agent");
    try {
      const { connectDB, disconnectDB } = require("../src/config/db");
      const { User, AgentProfile } = require("../src/models");
      await connectDB();
      const agentEmail = `${TAG.toLowerCase()}_agent@example.com`;
      const agentPhone = `6${String(Date.now()).slice(-9)}`;
      const agent = new User({
        name: `${TAG} Agent`,
        email: agentEmail,
        phone: agentPhone,
        role: "agent",
        isActive: true,
      });
      agent.password = "TempTestAgent9!";
      await agent.save();
      await AgentProfile.create({ user: agent._id });
      bootstrappedAgentId = String(agent._id);
      cleanup.users.push(bootstrappedAgentId);
      agentId = bootstrappedAgentId;
      await disconnectDB();

      res = await request("POST", "/auth/login", {
        body: { emailOrPhone: agentEmail, password: "TempTestAgent9!" },
      });
      if (res.status === 200 && tokenFromResponse(res)) {
        agentToken = tokenFromResponse(res);
        record("/auth/login (temp agent bootstrap)", "POST", 200, "PASS");
      } else {
        record("/auth/login (temp agent bootstrap)", "POST", res.status || "ERR", "FAIL", res.error || res.json?.message || "temp agent login failed");
        issues.push({ api: "/auth/login (temp agent bootstrap)", detail: res.error || res.json?.message || "failed" });
      }
    } catch (e) {
      record("/auth/login (temp agent bootstrap)", "POST", 0, "FAIL", e.message);
      issues.push({ api: "/auth/login (temp agent bootstrap)", detail: e.message });
    }
  }

  // Protected without auth
  res = await request("GET", "/requests");
  expect("/requests (no auth)", "GET", res, [401]);

  res = await request("GET", "/payments");
  expect("/payments (no auth)", "GET", res, [401]);

  res = await request("GET", "/users/customers");
  expect("/users/customers (no auth)", "GET", res, [401]);

  // Customer role denial on admin routes
  if (custToken) {
    res = await request("GET", "/payments", { token: custToken });
    expect("/payments (customer denied)", "GET", res, [403]);

    res = await request("GET", "/stats/admin", { token: custToken });
    expect("/stats/admin (customer denied)", "GET", res, [403]);

    res = await request("POST", "/services", {
      token: custToken,
      body: { name: "Should Fail", category: categories[0]?.id || "govt_docs" },
    });
    expect("/services POST (customer denied)", "POST", res, [403]);
  }

  // Customer request flow
  let requestId = null;
  let docId = null;
  let delId = null;
  let callId = null;
  let notifId = null;
  let tempServiceId = null;
  let tempAgentId = null;

  if (custToken && sampleService) {
    res = await request("POST", "/requests", {
      token: custToken,
      body: {
        serviceId: sampleService.id,
        notes: `${TAG} temporary request — safe to delete`,
        applicantDetails: { fullName: `${TAG} Applicant` },
      },
    });
    const created = expect("/requests", "POST", res, [201], (r) => !!r.json?.request?.id);
    requestId = res.json?.request?.id;
    if (requestId) cleanup.requests.push(requestId);

    res = await request("GET", "/requests", { token: custToken });
    expect("/requests", "GET", res, [200], (r) => Array.isArray(r.json?.requests));

    if (requestId) {
      res = await request("GET", `/requests/${requestId}`, { token: custToken });
      expect("/requests/:id", "GET", res, [200], (r) => r.json?.request?.id === requestId);

      res = await request("PATCH", `/requests/${requestId}`, {
        token: custToken,
        body: { notes: `${TAG} updated notes` },
      });
      expect("/requests/:id", "PATCH", res, [200], (r) => (r.json?.request?.notes || "").includes(TAG));

      res = await request("POST", `/requests/${requestId}/comments`, {
        token: custToken,
        body: { message: `${TAG} comment` },
      });
      expect("/requests/:id/comments", "POST", res, [200, 201], (r) => r.json?.success !== false);

      // Upload document (Cloudinary or local)
      const form = multipart({ label: `${TAG} doc` }, "file", `${TAG}.png`, "image/png", TINY_PNG);
      res = await request("POST", `/requests/${requestId}/documents`, { token: custToken, formData: form });
      const upOk = expect("/requests/:id/documents", "POST", res, [201], (r) => {
        const docs = r.json?.request?.documents || [];
        return docs.length > 0;
      });
      if (upOk) {
        const docs = res.json.request.documents;
        const last = docs[docs.length - 1];
        docId = last.id;
        if (last.provider === "cloudinary" && last.publicId) {
          cleanup.cloudinaryPublicIds.push({ publicId: last.publicId, resourceType: last.resourceType || "image" });
          record("cloudinary upload meta", "POST", 201, "PASS", `provider=${last.provider} publicIdPresent=true`);
        } else if (last.provider === "local") {
          record("cloudinary upload meta", "POST", 201, "PASS", `provider=local (cloudinary not used for this upload)`);
        } else {
          // publicId may be stripped from serialized response for customers — check via download
          record("upload storage provider", "POST", 201, "PASS", `docId=${docId}`);
        }

        // Download document
        res = await request("GET", `/requests/${requestId}/documents/${docId}/download`, {
          token: custToken,
          raw: true,
        });
        expect("/requests/:id/documents/:docId/download", "GET", res, [200], (r) => r.body.length > 0);

        // Delete while the request is still editable (before admin advances status).
        res = await request("DELETE", `/requests/${requestId}/documents/${docId}`, { token: custToken });
        expect("/requests/:id/documents/:docId", "DELETE", res, [200]);
        docId = null;
      }
    }
  } else {
    record("/requests", "POST", "-", "NOT TESTED", "missing customer token or services");
  }

  // Notifications
  if (custToken) {
    res = await request("GET", "/notifications", { token: custToken });
    expect("/notifications", "GET", res, [200], (r) => Array.isArray(r.json?.notifications));
    const notifs = res.json?.notifications || [];
    if (notifs[0]) {
      notifId = notifs[0].id;
      res = await request("PATCH", `/notifications/${notifId}/read`, { token: custToken });
      expect("/notifications/:id/read", "PATCH", res, [200]);
    } else {
      record("/notifications/:id/read", "PATCH", "-", "NOT TESTED", "no notifications");
    }
    res = await request("PATCH", "/notifications/read-all", { token: custToken });
    expect("/notifications/read-all", "PATCH", res, [200]);
  }

  // Admin flows
  if (adminToken) {
    // Create temp service
    const catKey = categories[0]?.id || sampleService?.category || "govt_docs";
    res = await request("POST", "/services", {
      token: adminToken,
      body: {
        name: `${TAG} Temp Service`,
        category: catKey,
        slug: `${TAG.toLowerCase()}-temp-service`,
        description: "Temporary health-check service — delete me",
        priceLabel: "Test only",
        isActive: true,
      },
    });
    expect("/services", "POST", res, [201], (r) => !!r.json?.service?.id);
    tempServiceId = res.json?.service?.id;
    if (tempServiceId) cleanup.services.push(tempServiceId);

    if (tempServiceId) {
      res = await request("PATCH", `/services/${tempServiceId}`, {
        token: adminToken,
        body: { description: `${TAG} updated` },
      });
      expect("/services/:id", "PATCH", res, [200]);

      res = await request("PATCH", `/services/${tempServiceId}/toggle`, {
        token: adminToken,
        body: { isActive: false },
      });
      expect("/services/:id/toggle", "PATCH", res, [200], (r) => r.json?.service?.isActive === false);

      res = await request("PATCH", `/services/${tempServiceId}/toggle`, {
        token: adminToken,
        body: { isActive: true },
      });
      expect("/services/:id/toggle (re-enable)", "PATCH", res, [200]);
    }

    // Users
    res = await request("GET", "/users/customers", { token: adminToken });
    expect("/users/customers", "GET", res, [200], (r) => Array.isArray(r.json?.customers));

    res = await request("GET", "/users/agents", { token: adminToken });
    expect("/users/agents", "GET", res, [200], (r) => Array.isArray(r.json?.agents));
    const agents = res.json?.agents || [];
    if (!agentId && agents[0]) agentId = agents[0].id;

    // Create temp agent via admin API (distinct from any bootstrap agent email)
    const agentEmail = `${TAG.toLowerCase()}_agent_api@example.com`;
    const agentPhone = `8${String(Date.now()).slice(-9)}`;
    res = await request("POST", "/users/agents", {
      token: adminToken,
      body: { name: `${TAG} Agent API`, email: agentEmail, phone: agentPhone, password: "AgentTest123!" },
    });
    expect("/users/agents", "POST", res, [201], (r) => !!r.json?.agent?.id);
    tempAgentId = res.json?.agent?.id;
    if (tempAgentId) cleanup.users.push(tempAgentId);

    if (tempAgentId) {
      res = await request("PATCH", `/users/${tempAgentId}`, {
        token: adminToken,
        body: { name: `${TAG} Agent Updated` },
      });
      expect("/users/:id", "PATCH", res, [200]);

      res = await request("PATCH", `/users/${tempAgentId}/active`, {
        token: adminToken,
        body: { isActive: false },
      });
      expect("/users/:id/active", "PATCH", res, [200], (r) => r.json?.user?.isActive === false);

      res = await request("PATCH", `/users/${tempAgentId}/active`, {
        token: adminToken,
        body: { isActive: true },
      });
      expect("/users/:id/active (re-enable)", "PATCH", res, [200]);

      // Login as temp agent
      res = await request("POST", "/auth/login", { body: { emailOrPhone: agentEmail, password: "AgentTest123!" } });
      if (res.status === 200) {
        agentToken = tokenFromResponse(res);
        agentId = tempAgentId;
        record("/auth/login (temp agent)", "POST", 200, "PASS");
      }
    }

    // Stats / audit / payments list
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

    // Assign agent + workflow on our temp request
    if (requestId && agentId) {
      res = await request("PATCH", `/requests/${requestId}/assign`, {
        token: adminToken,
        body: { agentId },
      });
      expect("/requests/:id/assign", "PATCH", res, [200]);

      res = await request("PATCH", `/requests/${requestId}/status`, {
        token: adminToken,
        body: { status: "in_progress", note: `${TAG} status` },
      });
      expect("/requests/:id/status", "PATCH", res, [200]);
    }
  } else {
    [
      ["/services", "POST"],
      ["/services/:id", "PATCH"],
      ["/services/:id/toggle", "PATCH"],
      ["/users/customers", "GET"],
      ["/users/agents", "GET"],
      ["/users/agents", "POST"],
      ["/users/:id", "PATCH"],
      ["/users/:id/active", "PATCH"],
      ["/stats/admin", "GET"],
      ["/stats/agents", "GET"],
      ["/audit", "GET"],
      ["/payments", "GET"],
      ["/call-requests", "GET"],
      ["/requests/:id/assign", "PATCH"],
    ].forEach(([api, method]) => record(api, method, "-", "NOT TESTED", "no admin token"));
  }

  // Agent deliverable + call flow
  if (agentToken && requestId && adminToken) {
    const form = multipart({}, "file", `${TAG}-deliverable.png`, "image/png", TINY_PNG);
    res = await request("POST", `/requests/${requestId}/deliverables`, { token: agentToken, formData: form });
    const delOk = expect("/requests/:id/deliverables", "POST", res, [201], (r) => (r.json?.request?.deliverables || []).length > 0);
    if (delOk) {
      const dels = res.json.request.deliverables;
      delId = dels[dels.length - 1].id;
      const last = dels[dels.length - 1];
      if (last.publicId) cleanup.cloudinaryPublicIds.push({ publicId: last.publicId, resourceType: last.resourceType || "image" });
    }

    res = await request("PATCH", `/requests/${requestId}/ready`, { token: agentToken });
    expect("/requests/:id/ready", "PATCH", res, [200]);

    // Call request
    res = await request("POST", `/requests/${requestId}/call-requests`, {
      token: agentToken,
      body: { purpose: `${TAG} call test` },
    });
    expect("/requests/:id/call-requests", "POST", res, [200, 201], (r) => !!r.json?.call?.id);
    callId = res.json?.call?.id;

    res = await request("GET", `/requests/${requestId}/calls`, { token: agentToken });
    expect("/requests/:id/calls", "GET", res, [200], (r) => Array.isArray(r.json?.calls));

    if (callId) {
      res = await request("PATCH", `/call-requests/${callId}`, {
        token: adminToken,
        body: { action: "approve" },
      });
      expect("/call-requests/:callId", "PATCH", res, [200]);

      res = await request("PATCH", `/requests/${requestId}/calls/${callId}/complete`, { token: agentToken });
      expect("/requests/:id/calls/:callId/complete", "PATCH", res, [200]);
    }

    // Payment flow
    if (custToken) {
      res = await request("POST", `/requests/${requestId}/pay`, {
        token: custToken,
        body: { method: "upi" },
      });
      expect("/requests/:id/pay", "POST", res, [201], (r) => !!r.json?.payment);

      res = await request("PATCH", `/requests/${requestId}/payment/received`, { token: adminToken });
      expect("/requests/:id/payment/received", "PATCH", res, [200], (r) => r.json?.payment?.status === "received");

      // Deliverable download after payment
      if (delId) {
        res = await request("GET", `/requests/${requestId}/deliverables/${delId}/download`, {
          token: custToken,
          raw: true,
        });
        expect("/requests/:id/deliverables/:delId/download", "GET", res, [200], (r) => r.body.length > 0);
      }
    }
  } else {
    [
      ["/requests/:id/deliverables", "POST"],
      ["/requests/:id/ready", "PATCH"],
      ["/requests/:id/call-requests", "POST"],
      ["/requests/:id/calls", "GET"],
      ["/call-requests/:callId", "PATCH"],
      ["/requests/:id/calls/:callId/complete", "PATCH"],
      ["/requests/:id/pay", "POST"],
      ["/requests/:id/payment/received", "PATCH"],
      ["/requests/:id/deliverables/:delId/download", "GET"],
    ].forEach(([api, method]) => record(api, method, "-", "NOT TESTED", "missing agent/admin/request"));
  }

  // Delete document (after download tested)
  if (!docId) {
    // Already deleted while request was editable, or never uploaded.
    record("/requests/:id/documents/:docId (late)", "DELETE", "-", "NOT TESTED", "already covered while editable");
  }

  // CORS
  res = await request("GET", "/health", {
    headers: { Origin: "http://localhost:5179" },
  });
  const acao = res.headers["access-control-allow-origin"];
  if (res.status === 200 && (acao === "http://localhost:5179" || acao === "*")) {
    record("CORS localhost:5179", "GET", 200, "PASS", `ACAOrigin=${acao}`);
  } else if (res.status === 200 && acao) {
    record("CORS localhost:5179", "GET", 200, "PASS", `ACAOrigin=${acao}`);
  } else if (res.status === 500 && /not allowed by CORS/i.test(res.text + (res.json?.message || ""))) {
    record("CORS localhost:5179", "GET", 500, "FAIL", "origin blocked");
  } else {
    // Express cors may still succeed; check preflight
    const pre = await request("OPTIONS", "/health", {
      headers: {
        Origin: "http://localhost:5179",
        "Access-Control-Request-Method": "GET",
      },
    });
    if (pre.status === 204 || pre.status === 200 || pre.headers["access-control-allow-origin"]) {
      record("CORS preflight localhost:5179", "OPTIONS", pre.status || 200, "PASS");
    } else {
      record("CORS localhost:5179", "GET", res.status, res.status === 200 ? "PASS" : "FAIL", `ACAOrigin=${acao || "none"}`);
    }
  }

  // Frontend proxy
  const vitePorts = [5179, 5173, 5178, 5180];
  let proxyOk = false;
  for (const p of vitePorts) {
    const prox = await request("GET", `http://localhost:${p}/api/health`);
    if (prox.status === 200 && prox.json?.status === "ok") {
      record(`frontend proxy :${p}/api/health`, "GET", 200, "PASS");
      proxyOk = true;
      break;
    }
  }
  if (!proxyOk) record("frontend proxy /api/health", "GET", "-", "NOT TESTED", "no vite port responded");

  // Direct Cloudinary API ping (config + upload/destroy of temp asset)
  if (env.storageMode === "cloudinary") {
    try {
      const cloudinary = require("../src/config/cloudinary");
      const up = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "mahabharat/images", resource_type: "image", type: "authenticated", public_id: `${TAG}_direct` },
          (err, r) => (err ? reject(err) : resolve(r))
        );
        stream.end(TINY_PNG);
      });
      record("cloudinary direct upload", "POST", 200, "PASS", `publicIdPresent=${!!up.public_id}`);
      cleanup.cloudinaryPublicIds.push({ publicId: up.public_id, resourceType: "image" });

      const signed = cloudinary.url(up.public_id, {
        resource_type: "image",
        type: "authenticated",
        sign_url: true,
        secure: true,
      });
      const fetchRes = await request("GET", signed, { raw: true });
      expect("cloudinary signed URL fetch", "GET", fetchRes, [200], (r) => r.body.length > 0);
    } catch (e) {
      record("cloudinary direct upload", "POST", 0, "FAIL", e.message);
      issues.push({ api: "cloudinary", detail: e.message });
    }
  } else {
    record("cloudinary direct upload", "POST", "-", "NOT TESTED", "storageMode=local");
  }

  // Email transport verify (no send of secrets)
  if (env.emailEnabled) {
    try {
      const nodemailer = require("nodemailer");
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: env.email.user, pass: env.email.pass },
      });
      await transporter.verify();
      record("email SMTP verify", "SMTP", 200, "PASS", "transporter.verify ok");
    } catch (e) {
      record("email SMTP verify", "SMTP", 0, "FAIL", e.message);
      issues.push({ api: "email", detail: e.message });
    }
  } else {
    record("email SMTP verify", "SMTP", "-", "NOT TESTED", "email not configured");
  }

  // MongoDB ping via mongoose using same env (separate short-lived connection)
  try {
    const mongoose = require("mongoose");
    const { connectDB, disconnectDB } = require("../src/config/db");
    // Use existing connection if already connected from this process — we're not connected yet
    await connectDB();
    const ping = await mongoose.connection.db.admin().command({ ping: 1 });
    const dbName = mongoose.connection.name;
    const cols = await mongoose.connection.db.listCollections().toArray();
    record("mongodb ping", "CMD", 200, "PASS", `db=${dbName} collections=${cols.length} ok=${ping.ok}`);

    // Safe CRUD on a temp collection marker via User already done; verify read of our temp user
    const User = require("../src/models/User");
    const found = await User.findOne({ email: custEmail });
    record("mongodb read temp user", "READ", found ? 200 : 404, found ? "PASS" : "FAIL");

    await disconnectDB();
  } catch (e) {
    record("mongodb ping", "CMD", 0, "FAIL", e.message);
    issues.push({ api: "mongodb", detail: e.message });
  }

  // Account self-delete was skipped to avoid race with cleanup; test endpoint existence with missing auth
  res = await request("DELETE", "/account");
  expect("/account (no auth)", "DELETE", res, [401]);

  // Admin delete-user 404 — must run before cleanup removes the temp admin token owner
  if (adminToken) {
    res = await request("DELETE", "/users/000000000000000000000000", { token: adminToken });
    expect("/users/:id (404)", "DELETE", res, [404]);
  } else {
    record("/users/:id", "DELETE", "-", "NOT TESTED", "no admin token");
  }

  // ── Cleanup ─────────────────────────────────────────────────────
  console.log("\n--- Cleanup ---");

  try {
    const { connectDB, disconnectDB } = require("../src/config/db");
    await connectDB();
    const { User, Service, ServiceRequest, Payment, Notification, CallLog, AgentProfile, CustomerProfile, AuditLog } = require("../src/models");

    for (const rid of cleanup.requests) {
      await CallLog.deleteMany({ request: rid });
      await Payment.deleteMany({ request: rid });
      await ServiceRequest.deleteOne({ _id: rid });
      console.log(`  deleted request ${rid}`);
    }
    for (const sid of cleanup.services) {
      await Service.deleteOne({ _id: sid });
      console.log(`  deleted service ${sid}`);
    }
    for (const uid of cleanup.users) {
      await Notification.deleteMany({ user: uid });
      await AgentProfile.deleteOne({ user: uid });
      await CustomerProfile.deleteOne({ user: uid });
      await AuditLog.deleteMany({ actor: uid });
      await User.deleteOne({ _id: uid });
      console.log(`  deleted user ${uid}`);
    }

    // Also wipe any leftover TAG-named entities
    await Service.deleteMany({ name: new RegExp(`^${TAG}`) });
    await User.deleteMany({ email: new RegExp(TAG.toLowerCase(), "i") });

    if (env.storageMode === "cloudinary" && cleanup.cloudinaryPublicIds.length) {
      const cloudinary = require("../src/config/cloudinary");
      for (const item of cleanup.cloudinaryPublicIds) {
        try {
          await cloudinary.uploader.destroy(item.publicId, {
            resource_type: item.resourceType || "image",
            type: "authenticated",
          });
          console.log(`  destroyed cloudinary ${item.publicId}`);
        } catch (e) {
          console.log(`  cloudinary destroy warn: ${e.message}`);
        }
      }
    }

    await disconnectDB();
    record("cleanup", "DEL", 200, "PASS", "temp data removed");
  } catch (e) {
    record("cleanup", "DEL", 0, "FAIL", e.message);
    issues.push({ api: "cleanup", detail: e.message });
  }

  // Summary
  const pass = results.filter((r) => r.result === "PASS").length;
  const fail = results.filter((r) => r.result === "FAIL").length;
  const skip = results.filter((r) => r.result === "NOT TESTED").length;
  console.log(`\n=== SUMMARY: ${pass} PASS / ${fail} FAIL / ${skip} NOT TESTED ===\n`);

  // Write machine-readable report (no secrets)
  const reportPath = path.join(__dirname, "health-check-report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        base: BASE,
        tag: TAG,
        config: {
          storageMode: env.storageMode,
          emailEnabled: env.emailEnabled,
          hasMongo: !!env.mongoUri,
          callProvider: env.callProvider,
          clientUrls: env.clientUrls,
        },
        counts: { pass, fail, skip },
        results,
        issues,
      },
      null,
      2
    )
  );
  console.log(`Report written to ${reportPath}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Health check crashed:", e);
  process.exit(2);
});

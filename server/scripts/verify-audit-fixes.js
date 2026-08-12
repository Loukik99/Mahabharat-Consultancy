/**
 * Targeted verification for audit HIGH/MEDIUM fixes.
 * Uses in-memory MongoDB — does not touch production data.
 * Run: node scripts/verify-audit-fixes.js
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-security-secret-at-least-32-chars-long!!";
process.env.JWT_EXPIRES_IN = "1h";
process.env.CONFIRM_SEED = "";
process.env.MONGODB_URI = "";
process.env.EMAIL_USER = "";
process.env.EMAIL_PASS = "";

const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { MongoMemoryServer } = require("mongodb-memory-server");

let passed = 0;
let failed = 0;

function ok(name) {
  passed += 1;
  console.log(`  PASS  ${name}`);
}
function fail(name, err) {
  failed += 1;
  console.log(`  FAIL  ${name}: ${err?.message || err}`);
}

async function request(port, method, pathName, { body, token, formData, raw } = {}) {
  const isForm = !!formData;
  const payload = isForm ? formData.body : body != null ? JSON.stringify(body) : null;
  const hdrs = {
    Accept: "application/json",
    ...(payload && !isForm ? { "Content-Type": "application/json" } : {}),
    ...(isForm ? { "Content-Type": `multipart/form-data; boundary=${formData.boundary}` } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: `/api${pathName}`, method, headers: hdrs },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          if (raw) {
            resolve({ status: res.statusCode, body: buf, headers: res.headers });
            return;
          }
          const rawStr = buf.toString("utf8");
          let json = null;
          try {
            json = rawStr ? JSON.parse(rawStr) : null;
          } catch {
            json = { raw: rawStr };
          }
          resolve({ status: res.statusCode, body: json, headers: res.headers });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function multipart(fields, fileField, fileName, mime, buffer) {
  const boundary = "----McBoundary" + Date.now();
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
  const mid = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return { boundary, body: Buffer.concat([head, mid, tail]) };
}

async function main() {
  console.log("\n=== Audit-fix verification ===\n");

  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri("mahabharat_audit_fix");
  const mongoose = require("mongoose");
  await mongoose.connect(process.env.MONGODB_URI);

  const { syncCatalog } = require("../src/syncCatalog");
  await syncCatalog();

  const { User, Service, Notification } = require("../src/models");
  const { signToken } = require("../src/middleware/auth");

  const mk = async (data) => {
    const u = new User({ ...data });
    u.password = data.password;
    await u.save();
    return u;
  };

  const strong = "Str0ngPass!x";
  const customer = await mk({
    name: "Cust One", email: "cust1@test.local", phone: "9000000001",
    password: strong, role: "customer",
  });
  const customer2 = await mk({
    name: "Cust Two", email: "cust2@test.local", phone: "9000000002",
    password: strong, role: "customer",
  });
  const agent = await mk({
    name: "Agent One", email: "agent1@test.local", phone: "9000000003",
    password: strong, role: "agent",
  });
  const admin = await mk({
    name: "Admin One", email: "admin1@test.local", phone: "9000000004",
    password: strong, role: "admin",
  });

  const app = require("../src/app");
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  const tokenCust = signToken(customer);
  const tokenCust2 = signToken(customer2);
  const tokenAgent = signToken(agent);
  const tokenAdmin = signToken(admin);

  const epfo = await Service.findOne({ slug: "epfo-services" });
  const eway = await Service.findOne({ slug: "eway-bill" });
  const pmegp = await Service.findOne({ slug: "pmegp" });
  assert.ok(epfo && eway && pmegp, "catalog services present");
  ok("Regression: EPFO / E-Way Bill / PMEGP exist in DB catalog");

  // MEDIUM #5 — ObjectId create
  {
    const res = await request(port, "POST", "/requests", {
      token: tokenCust,
      body: { serviceId: String(epfo._id), notes: "oid create" },
    });
    if (res.status === 201 && res.body.request?.id) ok("Create with Mongo ObjectId");
    else fail("Create with Mongo ObjectId", new Error(`status=${res.status} ${res.body?.message}`));
  }

  // MEDIUM #5 — slug create
  let slugReq;
  {
    const res = await request(port, "POST", "/requests", {
      token: tokenCust,
      body: { serviceId: "epfo-services", notes: "slug create" },
    });
    if (res.status === 201 && res.body.request?.serviceName) {
      ok("Create with service slug");
      slugReq = res.body.request;
    } else fail("Create with service slug", new Error(`status=${res.status} ${JSON.stringify(res.body)}`));
  }

  // MEDIUM #5 — invalid slug → 4xx
  {
    const res = await request(port, "POST", "/requests", {
      token: tokenCust,
      body: { serviceId: "not-a-real-service-slug-xyz", notes: "bad" },
    });
    if (res.status >= 400 && res.status < 500) ok(`Invalid slug returns 4xx (${res.status})`);
    else fail("Invalid slug returns 4xx", new Error(`status=${res.status}`));
  }

  // HIGH #3 — mark ready without required docs
  {
    const created = await request(port, "POST", "/requests", {
      token: tokenCust,
      body: { serviceId: "epfo-services" },
    });
    const reqId = created.body.request.id;
    await request(port, "PATCH", `/requests/${reqId}/assign`, {
      token: tokenAdmin,
      body: { agentId: String(agent._id) },
    });
    const pdf = Buffer.from("%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "utf8");
    await request(port, "POST", `/requests/${reqId}/deliverables`, {
      token: tokenAgent,
      formData: multipart({}, "file", "done.pdf", "application/pdf", pdf),
    });
    const ready = await request(port, "PATCH", `/requests/${reqId}/ready`, { token: tokenAgent });
    if (ready.status === 400 && /Missing required documents/i.test(ready.body?.message || "")) {
      ok("Mark Ready blocked when required docs missing");
    } else {
      fail("Mark Ready blocked when required docs missing", new Error(`status=${ready.status} msg=${ready.body?.message}`));
    }

    for (const label of epfo.requiredDocuments) {
      await request(port, "POST", `/requests/${reqId}/documents`, {
        token: tokenCust,
        formData: multipart({ label }, "file", `${label.replace(/[^\w]+/g, "_")}.pdf`, "application/pdf", pdf),
      });
    }
    // Customer docs may be blocked after assign (status in_review). Upload as agent instead if needed.
    let ready2 = await request(port, "PATCH", `/requests/${reqId}/ready`, { token: tokenAgent });
    if (ready2.status !== 200) {
      for (const label of epfo.requiredDocuments) {
        await request(port, "POST", `/requests/${reqId}/documents`, {
          token: tokenAgent,
          formData: multipart({ label }, "file", `${label.replace(/[^\w]+/g, "_")}.pdf`, "application/pdf", pdf),
        });
      }
      ready2 = await request(port, "PATCH", `/requests/${reqId}/ready`, { token: tokenAgent });
    }
    if (ready2.status === 200) ok("Mark Ready succeeds when required docs present");
    else fail("Mark Ready succeeds when required docs present", new Error(`status=${ready2.status} ${ready2.body?.message}`));
  }

  // HIGH #1 — serviceName on serialized request
  {
    if (slugReq?.serviceName === "EPFO Services") ok("API returns serviceName for admin display");
    else fail("API returns serviceName", new Error(String(slugReq?.serviceName)));
  }

  // MEDIUM #4 + #8 — assign statusHistory + agent notification
  {
    const created = await request(port, "POST", "/requests", {
      token: tokenCust,
      body: { serviceId: String(eway._id) },
    });
    const reqId = created.body.request.id;
    await Notification.deleteMany({ user: agent._id });
    const assign = await request(port, "PATCH", `/requests/${reqId}/assign`, {
      token: tokenAdmin,
      body: { agentId: String(agent._id) },
    });
    const hist = assign.body.request?.statusHistory || [];
    const hasInReview = hist.some((h) => h.status === "in_review");
    if (assign.status === 200 && assign.body.request.status === "in_review" && hasInReview) {
      ok("Assign records in_review in statusHistory");
    } else {
      fail("Assign statusHistory", new Error(JSON.stringify({ status: assign.status, hist, msg: assign.body?.message })));
    }
    const notifs = await Notification.find({ user: agent._id });
    if (notifs.length >= 1 && /assigned/i.test(notifs[0].message)) ok("Assigned agent receives notification");
    else fail("Assigned agent notification", new Error(`count=${notifs.length}`));

    const other = await request(port, "GET", "/notifications", { token: tokenCust2 });
    const leaked = (other.body.notifications || []).some((n) => /assigned/i.test(n.message));
    if (other.status === 200 && !leaked) ok("Notifications isolated to recipient");
    else fail("Notification isolation", new Error("leak or bad status"));
  }

  // HIGH #2 — admin download + unauthorized blocked
  {
    const created = await request(port, "POST", "/requests", {
      token: tokenCust,
      body: { serviceId: "pmegp" },
    });
    const reqId = created.body.request.id;
    const pdf = Buffer.from("%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "utf8");
    const up = await request(port, "POST", `/requests/${reqId}/documents`, {
      token: tokenCust,
      formData: multipart({ label: "Aadhaar Card" }, "file", "aadhaar.pdf", "application/pdf", pdf),
    });
    const docId = up.body.request?.documents?.[0]?.id;
    const adminDl = await request(port, "GET", `/requests/${reqId}/documents/${docId}/download`, {
      token: tokenAdmin,
      raw: true,
    });
    if (adminDl.status === 200 && adminDl.body.length > 0) ok("Admin can download authorized document");
    else fail("Admin download", new Error(`status=${adminDl.status}`));

    const blocked = await request(port, "GET", `/requests/${reqId}/documents/${docId}/download`, {
      token: tokenCust2,
      raw: true,
    });
    if (blocked.status === 403) ok("Unauthorized document download blocked");
    else fail("Unauthorized download blocked", new Error(`status=${blocked.status}`));
  }

  // MEDIUM #7 — comment byUserId
  {
    const created = await request(port, "POST", "/requests", {
      token: tokenCust,
      body: { serviceId: String(pmegp._id) },
    });
    const reqId = created.body.request.id;
    const c = await request(port, "POST", `/requests/${reqId}/comments`, {
      token: tokenAdmin,
      body: { message: "Internal check", internal: true },
    });
    const comment = c.body.request?.comments?.slice(-1)[0];
    if (comment?.byUserId === String(admin._id)) ok("Comment serializer includes byUserId");
    else fail("Comment byUserId", new Error(JSON.stringify(comment)));
  }

  // Frontend static checks
  {
    const adminDetail = fs.readFileSync(
      path.join(__dirname, "../../src/pages/admin/AdminRequestDetail.tsx"),
      "utf8"
    );
    if (adminDetail.includes("downloadDocument") && adminDetail.includes("displayServiceName")) {
      ok("AdminRequestDetail wires download + serviceName");
    } else fail("AdminRequestDetail wiring", new Error("missing expected symbols"));

    const srcRoot = path.join(__dirname, "../../src");
    const walk = (dir, out = []) => {
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) walk(p, out);
        else if (/\.(tsx?)$/.test(f)) out.push(p);
      }
      return out;
    };
    const used = walk(srcRoot).filter((f) => {
      if (f.includes("notifications.api")) return false;
      return /notifications\.api/.test(fs.readFileSync(f, "utf8"));
    });
    if (used.length > 0) ok("notifications.api used in UI");
    else fail("notifications.api used in UI", new Error("no imports"));

    const catalogTs = fs.readFileSync(path.join(__dirname, "../../src/data/catalog.ts"), "utf8");
    for (const slug of ["epfo-services", "eway-bill", "pmegp"]) {
      if (catalogTs.includes(`"${slug}"`) || catalogTs.includes(`'${slug}'`)) ok(`FE catalog retains ${slug}`);
      else fail(`FE catalog retains ${slug}`, new Error("missing"));
    }

    const custDetail = fs.readFileSync(
      path.join(__dirname, "../../src/pages/customer/RequestDetail.tsx"),
      "utf8"
    );
    if (custDetail.includes("downloadDocument") && !custDetail.includes("image/gif") && !custDetail.includes('accept="image/*"')) {
      ok("Customer RequestDetail: own-doc download + no GIF/image/*");
    } else {
      fail("Customer RequestDetail upload/download policy", new Error("gif/image* still present or downloadDocument missing"));
    }
  }

  // LOW #1 — applicant fields remain optional (intentional)
  {
    const res = await request(port, "POST", "/requests", {
      token: tokenCust,
      body: { serviceId: "pan-card" },
    });
    if (res.status === 201) ok("Applicant fields optional at create (intentional)");
    else fail("Applicant fields optional", new Error(`status=${res.status}`));
  }

  // LOW #3 — payment method canonical set (upi|cash|other); reject card/bank
  {
    const created = await request(port, "POST", "/requests", {
      token: tokenCust,
      body: { serviceId: "pan-card", notes: "pay method test" },
    });
    const reqId = created.body.request.id;
    await request(port, "PATCH", `/requests/${reqId}/assign`, {
      token: tokenAdmin,
      body: { agentId: String(agent._id) },
    });
    const pdf = Buffer.from("%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "utf8");
    const pan = await Service.findOne({ slug: "pan-card" });
    for (const label of pan.requiredDocuments || []) {
      await request(port, "POST", `/requests/${reqId}/documents`, {
        token: tokenAgent,
        formData: multipart({ label }, "file", "doc.pdf", "application/pdf", pdf),
      });
    }
    await request(port, "POST", `/requests/${reqId}/deliverables`, {
      token: tokenAgent,
      formData: multipart({}, "file", "done.pdf", "application/pdf", pdf),
    });
    const ready = await request(port, "PATCH", `/requests/${reqId}/ready`, { token: tokenAgent });
    if (ready.status !== 200) {
      fail("Payment method test setup (ready)", new Error(`status=${ready.status} ${ready.body?.message}`));
    } else {
      const badCard = await request(port, "POST", `/requests/${reqId}/pay`, {
        token: tokenCust,
        body: { method: "card" },
      });
      if (badCard.status === 400) ok("Invalid payment method card → 400");
      else fail("Invalid payment method card → 400", new Error(`status=${badCard.status}`));

      const badBank = await request(port, "POST", `/requests/${reqId}/pay`, {
        token: tokenCust,
        body: { method: "bank" },
      });
      if (badBank.status === 400) ok("Invalid payment method bank → 400");
      else fail("Invalid payment method bank → 400", new Error(`status=${badBank.status}`));

      const good = await request(port, "POST", `/requests/${reqId}/pay`, {
        token: tokenCust,
        body: { method: "upi" },
      });
      if (good.status === 201 && good.body.payment?.method === "upi") ok("Valid payment method upi accepted");
      else fail("Valid payment method upi", new Error(`status=${good.status}`));
    }
  }

  // LOW #4 — customer can re-download own uploaded docs; cannot access another customer's
  {
    const pdf = Buffer.from("%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "utf8");
    const a = await request(port, "POST", "/requests", {
      token: tokenCust,
      body: { serviceId: "printing", notes: "own doc dl" },
    });
    const reqA = a.body.request.id;
    const up = await request(port, "POST", `/requests/${reqA}/documents`, {
      token: tokenCust,
      formData: multipart({ label: "Scan" }, "file", "mine.pdf", "application/pdf", pdf),
    });
    const docId = up.body.request?.documents?.[0]?.id;
    if (!docId) {
      fail("Customer own-document upload for download test", new Error("no doc id"));
    } else {
      const own = await request(port, "GET", `/requests/${reqA}/documents/${docId}/download`, {
        token: tokenCust,
        raw: true,
      });
      if (own.status === 200 && own.body.length > 0) ok("Customer can re-download own uploaded document");
      else fail("Customer own document download", new Error(`status=${own.status}`));

      const blocked = await request(port, "GET", `/requests/${reqA}/documents/${docId}/download`, {
        token: tokenCust2,
        raw: true,
      });
      if (blocked.status === 403) ok("Customer cannot download another customer's document");
      else fail("Cross-customer document download blocked", new Error(`status=${blocked.status}`));

      const adminDl = await request(port, "GET", `/requests/${reqA}/documents/${docId}/download`, {
        token: tokenAdmin,
        raw: true,
      });
      if (adminDl.status === 200) ok("Admin document download unchanged");
      else fail("Admin document download", new Error(`status=${adminDl.status}`));
    }
  }

  // LOW #2 — GIF rejected by backend upload policy
  {
    const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);
    const created = await request(port, "POST", "/requests", {
      token: tokenCust,
      body: { serviceId: "printing" },
    });
    const reqId = created.body.request.id;
    const res = await request(port, "POST", `/requests/${reqId}/documents`, {
      token: tokenCust,
      formData: multipart({ label: "GIF" }, "file", "bad.gif", "image/gif", gif),
    });
    if (res.status >= 400 && res.status < 500) ok("GIF upload rejected by backend");
    else fail("GIF upload rejected", new Error(`status=${res.status}`));
  }

  server.close();
  await mongoose.disconnect();
  await mongod.stop();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

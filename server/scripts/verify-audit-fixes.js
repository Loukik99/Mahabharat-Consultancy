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

  // ── Milestone 1 — applicant profile, masked identity, prefill, audit ──
  // Failure output never includes response bodies, so test identity values are not printed.
  {
    const { CustomerProfile, ServiceRequest, AuditLog } = require("../src/models");
    const { verhoeffValid } = require("../src/utils/identity");
    const check = (name, cond, detail = "") => (cond ? ok(name) : fail(name, new Error(detail || "assertion failed")));

    const base = "23456789012";
    const fullAadhaar = base + [...Array(10).keys()].find((d) => verhoeffValid(base + d));
    const spacedAadhaar = fullAadhaar.replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3");
    const fullPan = "ABCPE1234F";
    const leaks = (v) => {
      const s = JSON.stringify(v || "");
      return s.includes(fullAadhaar) || s.includes(spacedAadhaar) || s.includes(fullPan);
    };
    const profileBody = {
      personal: {
        fullName: "Ravi Kumar", fatherName: "Suresh Kumar", motherName: "Asha Devi", dob: "2004-05-17",
        gender: "Male", category: "OBC", religion: "Hindu", maritalStatus: "Unmarried", nationality: "Indian",
      },
      contact: { mobile: "+91 98765-43210", email: "Ravi@Example.com" },
      permanentAddress: { line: "12 Main Road", village: "Kakati", tehsil: "Belagavi", district: "Belagavi", state: "Karnataka", pincode: "590001" },
      correspondenceAddress: { line: "12 Main Road", district: "Belagavi", state: "Karnataka", pincode: "590001" },
      education: {
        tenth: { board: "KSEEB", rollNumber: "2020123", passingYear: 2020, percentage: "88.456" },
        twelfth: { board: "PUE", rollNumber: "2022456", passingYear: "2022", percentage: 76.5 },
        graduation: {},
      },
      exams: [{ examName: "Agniveer GD", applicationNumber: "APP-778899", examDate: "2026-09-01" }],
      aadhaarRef: "1234",
      panRef: "xxxxxx234f",
    };

    // Backward compatibility: customer2 was created without a CustomerProfile.
    const noProf = await request(port, "GET", "/profile", { token: tokenCust2 });
    const stillNone = (await CustomerProfile.countDocuments({ user: customer2._id })) === 0;
    check(
      "No profile: GET /profile → 200 empty, no record created",
      noProf.status === 200 && !noProf.body.profile?.personal?.fullName && noProf.body.profile?.aadhaarRef === "" && stillNone,
      `status=${noProf.status} created=${!stillNone}`
    );
    const noProfReq = await request(port, "POST", "/requests", { token: tokenCust2, body: { serviceId: "pan-card" } });
    check("No profile: request creation still works", noProfReq.status === 201, `status=${noProfReq.status}`);

    // Creation (upsert) + normalisation + masked identity.
    const put1 = await request(port, "PUT", "/profile", { token: tokenCust, body: profileBody });
    const p1 = put1.body?.profile || {};
    check(
      "Profile created via PUT /profile (upsert)",
      put1.status === 200 && (await CustomerProfile.countDocuments({ user: customer._id })) === 1,
      `status=${put1.status}`
    );
    check(
      "Profile input normalised (mobile, enums, email, percentage)",
      p1.contact?.mobile === "9876543210" && p1.personal?.gender === "male" && p1.personal?.category === "obc" &&
        p1.contact?.email === "ravi@example.com" && p1.education?.tenth?.percentage === 88.46 && p1.education?.twelfth?.passingYear === 2022
    );
    check("Masked identity stored as last 4 only", p1.aadhaarRef === "XXXX-XXXX-1234" && p1.panRef === "XXXXXX234F");
    check(
      "Profile response returns only UI fields",
      JSON.stringify(Object.keys(p1).sort()) ===
        JSON.stringify(["aadhaarRef", "contact", "correspondenceAddress", "education", "exams", "panRef", "permanentAddress", "personal", "updatedAt"]),
      Object.keys(p1).join(",")
    );

    // Retrieval and full-replace update (masked values round-trip unchanged).
    const get1 = await request(port, "GET", "/profile", { token: tokenCust });
    check("Profile retrieval returns saved data", get1.status === 200 && get1.body.profile?.personal?.motherName === "Asha Devi");
    const put2 = await request(port, "PUT", "/profile", {
      token: tokenCust,
      body: { ...get1.body.profile, personal: { ...get1.body.profile.personal, fatherName: "S. Kumar" }, exams: [] },
    });
    check(
      "Profile update (full replace) + masked round-trip",
      put2.status === 200 && put2.body.profile?.personal?.fatherName === "S. Kumar" && put2.body.profile?.exams?.length === 0 &&
        put2.body.profile?.aadhaarRef === "XXXX-XXXX-1234",
      `status=${put2.status}`
    );

    // Cross-customer: no id parameter exists; a smuggled `user` field is ignored.
    const hijack = await request(port, "PUT", "/profile", {
      token: tokenCust2,
      body: { user: String(customer._id), personal: { fullName: "Hijack Attempt" } },
    });
    const c1 = await CustomerProfile.findOne({ user: customer._id }).lean();
    const c2 = await CustomerProfile.findOne({ user: customer2._id }).lean();
    check(
      "Cross-customer: other customer's profile untouched",
      hijack.status === 200 && c1.personal.fullName === "Ravi Kumar" && c2?.personal?.fullName === "Hijack Attempt"
    );
    const c2get = await request(port, "GET", "/profile", { token: tokenCust2 });
    check("Cross-customer: GET returns only own profile", c2get.body.profile?.personal?.fullName === "Hijack Attempt" && !c2get.body.profile?.contact?.mobile);

    // Agents / admins / anonymous get no access through these endpoints.
    const staff = await Promise.all([
      request(port, "GET", "/profile", { token: tokenAgent }),
      request(port, "PUT", "/profile", { token: tokenAgent, body: profileBody }),
      request(port, "GET", "/profile", { token: tokenAdmin }),
      request(port, "PUT", "/profile", { token: tokenAdmin, body: profileBody }),
    ]);
    check("Agent/admin denied on GET/PUT /profile (403)", staff.every((r) => r.status === 403), staff.map((r) => r.status).join(","));
    const anon = await request(port, "GET", "/profile");
    check("Unauthenticated GET /profile → 401", anon.status === 401, `status=${anon.status}`);

    // Input validation (messages name the field, never echo the value).
    const invalid = [
      { permanentAddress: { pincode: "059000" } },
      { personal: { dob: "2999-01-01" } },
      { personal: { gender: "robot" } },
      { contact: { mobile: "12345" } },
      { education: { tenth: { percentage: 140 } } },
      { personal: { fullName: { nested: "x" } } },
      { personal: { fullName: ["x"] } },
      { exams: Array.from({ length: 6 }, () => ({ examName: "x" })) },
    ];
    const invalidRes = await Promise.all(invalid.map((body) => request(port, "PUT", "/profile", { token: tokenCust, body })));
    check("Profile input validation rejects bad values (400)", invalidRes.every((r) => r.status === 400), invalidRes.map((r) => r.status).join(","));

    // Identity-number rejection in profile.
    const idCases = [
      { aadhaarRef: fullAadhaar },
      { aadhaarRef: spacedAadhaar },
      { panRef: fullPan },
      { aadhaarRef: "XXXX-XXXX-12" },
      { exams: [{ applicationNumber: `ref ${spacedAadhaar}` }] },
      { personal: { religion: fullPan } },
    ];
    const idRes = await Promise.all(idCases.map((body) => request(port, "PUT", "/profile", { token: tokenCust, body })));
    const stored = await CustomerProfile.findOne({ user: customer._id }).lean();
    check(
      "Full Aadhaar/PAN rejected in profile; never echoed or stored",
      idRes.every((r) => r.status === 400 && !leaks(r.body)) && !leaks(stored) && stored.personal.fullName === "Ravi Kumar",
      idRes.map((r) => r.status).join(",")
    );

    // Request applicant details: reject full numbers, accept masked / ordinary roll numbers.
    const mkReq = (referenceNumber) =>
      request(port, "POST", "/requests", { token: tokenCust, body: { serviceId: "pan-card", applicantDetails: { referenceNumber } } });
    // Sequential: request numbers are count-based, so parallel creates could collide.
    const rA = await mkReq(fullAadhaar);
    const rP = await mkReq(fullPan);
    const rM = await mkReq("XXXX-XXXX-1234");
    const rollNo = ["230000000000", "230000000001", "230000000002"].find((n) => !verhoeffValid(n));
    const rRoll = await mkReq(rollNo);
    check(
      "applicantDetails: full Aadhaar/PAN rejected, not echoed",
      rA.status === 400 && rP.status === 400 && !leaks(rA.body) && !leaks(rP.body),
      `${rA.status},${rP.status}`
    );
    check("applicantDetails: masked value + non-Aadhaar 12-digit roll no. accepted", rM.status === 201 && rRoll.status === 201, `${rM.status},${rRoll.status}`);
    const patchFull = await request(port, "PATCH", `/requests/${rM.body.request.id}`, {
      token: tokenCust,
      body: { applicantDetails: { referenceNumber: fullPan } },
    });
    check("applicantDetails PATCH with full PAN rejected", patchFull.status === 400 && !leaks(patchFull.body), `status=${patchFull.status}`);

    // Legacy record holding a full number is masked in responses; shape unchanged.
    const legacyId = rRoll.body.request.id;
    await ServiceRequest.updateOne({ _id: legacyId }, { $set: { "applicantDetails.referenceNumber": fullPan, "applicantDetails.additionalInfo": `old ${spacedAadhaar}` } });
    const legacy = await request(port, "GET", `/requests/${legacyId}`, { token: tokenCust });
    const la = legacy.body.request?.applicantDetails || {};
    check(
      "Legacy full Aadhaar/PAN masked in request response (same keys)",
      legacy.status === 200 && !leaks(legacy.body) && la.referenceNumber === "XXXXXX234F" && la.additionalInfo === "old XXXX-XXXX-" + fullAadhaar.slice(-4) &&
        JSON.stringify(Object.keys(la).sort()) === JSON.stringify(Object.keys(rRoll.body.request.applicantDetails).concat("additionalInfo").sort())
    );
    const agentView = await request(port, "GET", "/requests", { token: tokenAdmin });
    check("Legacy full numbers masked in list responses too", agentView.status === 200 && !leaks(agentView.body));

    // Prefill: profile → applicant details on a new request (client reviews before submit).
    const prof = (await request(port, "GET", "/profile", { token: tokenCust })).body.profile;
    const prefilled = { fullName: prof.personal.fullName, fatherName: prof.personal.fatherName, dob: prof.personal.dob };
    const preReq = await request(port, "POST", "/requests", { token: tokenCust, body: { serviceId: "pan-card", applicantDetails: prefilled } });
    const pa = preReq.body.request?.applicantDetails || {};
    check(
      "Prefill: profile values create a request with matching applicant details",
      preReq.status === 201 && pa.fullName === "Ravi Kumar" && pa.fatherName === "S. Kumar" && pa.dob === "2004-05-17"
    );
    const newReqSrc = fs.readFileSync(path.join(__dirname, "../../src/pages/customer/NewRequest.tsx"), "utf8");
    check(
      "NewRequest wires optional prefill + safe reference placeholder",
      newReqSrc.includes("getProfile") && newReqSrc.includes("applicantPrefill") && newReqSrc.includes("Fill from my profile") &&
        !newReqSrc.includes("Aadhaar / PAN / Roll No.")
    );

    // Audit events (no identity values or profile contents in meta).
    const profAudit = await AuditLog.find({ action: "profile_updated", actor: customer._id }).lean();
    check(
      "Audit: profile_updated recorded without values",
      profAudit.length >= 2 && profAudit.every((a) => /^sections: /.test(a.meta) && !/Ravi|Kumar|1234|234F|9876543210/.test(a.meta)),
      `count=${profAudit.length}`
    );
    await request(port, "PATCH", `/requests/${rM.body.request.id}`, {
      token: tokenCust,
      body: { applicantDetails: { fullName: "Ravi K", referenceNumber: "XXXX-XXXX-1234" } },
    });
    const appAudit = await AuditLog.findOne({ action: "applicant_details_updated", targetId: rM.body.request.id }).lean();
    check(
      "Audit: applicant_details_updated recorded (field names only)",
      appAudit && /fields: .*fullName/.test(appAudit.meta) && !/Ravi|1234/.test(appAudit.meta),
      appAudit ? "meta leaked values" : "missing"
    );
    const pdf = Buffer.from("%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "utf8");
    const up = await request(port, "POST", `/requests/${rM.body.request.id}/documents`, {
      token: tokenCust,
      formData: multipart({ label: "Photo" }, "file", "photo.pdf", "application/pdf", pdf),
    });
    const docId = up.body.request?.documents?.[0]?.id;
    const del = await request(port, "DELETE", `/requests/${rM.body.request.id}/documents/${docId}`, { token: tokenCust });
    const delAudit = await AuditLog.findOne({ action: "document_removed", targetId: String(docId) }).lean();
    check(
      "Audit: document_removed recorded on deletion",
      del.status === 200 && delAudit && delAudit.targetType === "file" && /Photo/.test(delAudit.meta),
      `status=${del.status} audit=${!!delAudit}`
    );

    // ── Milestone 2 — read-only autofill API ──
    const sameKeys = (o, keys) => JSON.stringify(Object.keys(o || {}).sort()) === JSON.stringify([...keys].sort());
    const flatten = (fields) => {
      const out = {};
      const walk = (o, p) => {
        if (o && typeof o === "object" && !Array.isArray(o) && "status" in o && "value" in o) out[p] = o;
        else if (Array.isArray(o)) o.forEach((x, i) => walk(x, `${p}[${i}]`));
        else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, p ? `${p}.${k}` : k);
      };
      walk(fields, "");
      return out;
    };
    const autofill = (id, token, query = "") => request(port, "GET", `/requests/${id}/autofill${query}`, { token });
    const agent2 = await mk({ name: "Agent Two", email: "agent2@test.local", phone: "9000000005", password: strong, role: "agent" });
    const customer3 = await mk({ name: "Cust Three", email: "cust3@test.local", phone: "9000000006", password: strong, role: "customer" });
    const tokenAgent2 = signToken(agent2);
    const tokenCust3 = signToken(customer3);

    const afReq = (
      await request(port, "POST", "/requests", {
        token: tokenCust,
        body: { serviceId: "pan-card", applicantDetails: { fullName: "Ravi K Request", referenceNumber: "ROLL-5566" }, notes: "SENTINEL-NOTE" },
      })
    ).body.request;
    await request(port, "POST", `/requests/${afReq.id}/documents`, {
      token: tokenCust,
      formData: multipart({ label: "Photo" }, "file", "p.pdf", "application/pdf", pdf),
    });
    await request(port, "PATCH", `/requests/${afReq.id}`, { token: tokenAdmin, body: { adminNotes: "SENTINEL-ADMIN" } });
    await request(port, "POST", `/requests/${afReq.id}/comments`, { token: tokenAdmin, body: { message: "SENTINEL-COMMENT", internal: true } });
    await request(port, "PATCH", `/requests/${afReq.id}/assign`, { token: tokenAdmin, body: { agentId: String(agent._id) } });

    // Owner customer
    const own = await autofill(afReq.id, tokenCust);
    const af = own.body?.autofill || {};
    check(
      "Autofill: owner customer → 200 with request + service identifiers",
      own.status === 200 && af.requestId === afReq.id && af.requestNumber === afReq.requestNumber &&
        af.service?.slug === "pan-card" && af.service?.name === afReq.serviceName && af.profileFound === true,
      `status=${own.status}`
    );
    check(
      "Autofill: explicit top-level + field-group allowlist",
      sameKeys(af, ["requestId", "requestNumber", "status", "service", "profileFound", "fields", "missing", "invalid", "generatedAt"]) &&
        sameKeys(af.fields, ["personal", "contact", "permanentAddress", "correspondenceAddress", "education", "exams", "identity", "requestDetails"]) &&
        sameKeys(af.service, ["id", "slug", "name"])
    );
    check(
      "Autofill: request details override profile; profile fills the rest",
      af.fields?.personal?.fullName?.value === "Ravi K Request" && af.fields.personal.fullName.source === "request" &&
        af.fields.personal.motherName?.value === "Asha Devi" && af.fields.personal.motherName.source === "profile" &&
        af.fields.contact?.mobile?.value === "9876543210" && af.fields.requestDetails?.referenceNumber?.value === "ROLL-5566"
    );
    check(
      "Autofill: missing optional values explicit (null, no invented defaults)",
      af.fields?.education?.graduation?.board?.status === "missing" && af.fields.education.graduation.board.value === null &&
        af.fields.correspondenceAddress?.village?.status === "missing" && af.fields.exams?.length === 0 &&
        af.missing?.includes("education.graduation.board") && af.missing.includes("exams") &&
        !af.missing.includes("personal.motherName") && af.invalid?.length === 0
    );
    check(
      "Autofill: masked identity only, no full Aadhaar/PAN",
      af.fields?.identity?.aadhaarMasked?.value === "XXXX-XXXX-1234" && af.fields.identity.panMasked?.value === "XXXXXX234F" && !leaks(own.body)
    );
    check(
      "Autofill: no internal notes, comments, documents, storage or account data",
      !/SENTINEL|adminNotes|"notes"|comments|documents|deliverables|password|tokenVersion|publicId|storedName|"_id"|__v|"user"|cust1@test\.local|9000000001/.test(
        JSON.stringify(own.body)
      )
    );
    check("Autofill: Cache-Control no-store", /no-store/.test(own.headers["cache-control"] || ""));

    // Cross-customer / nonexistent / invalid id — all identical 404s
    const cross = await autofill(afReq.id, tokenCust2);
    const ghost = await autofill(new mongoose.Types.ObjectId().toString(), tokenCust2);
    const badId = await autofill("not-an-object-id", tokenAdmin);
    check(
      "Autofill: other customer → 404 indistinguishable from nonexistent",
      cross.status === 404 && ghost.status === 404 && cross.body?.message === ghost.body?.message && !leaks(cross.body) &&
        !/Ravi|Asha/.test(JSON.stringify(cross.body)),
      `${cross.status},${ghost.status}`
    );
    check("Autofill: nonexistent / malformed request id → 404", ghost.status === 404 && badId.status === 404, `${ghost.status},${badId.status}`);

    // Agents and admin
    const agentAf = await autofill(afReq.id, tokenAgent);
    const agent2Af = await autofill(afReq.id, tokenAgent2);
    const adminAf = await autofill(afReq.id, tokenAdmin);
    check(
      "Autofill: assigned agent → 200 (same minimal payload)",
      agentAf.status === 200 && sameKeys(agentAf.body.autofill?.fields, Object.keys(af.fields || {})) && !leaks(agentAf.body),
      `status=${agentAf.status}`
    );
    check("Autofill: unassigned agent → 404", agent2Af.status === 404 && !/Ravi/.test(JSON.stringify(agent2Af.body)), `status=${agent2Af.status}`);
    check("Autofill: admin → 200 on open request (existing admin policy)", adminAf.status === 200, `status=${adminAf.status}`);

    const closed = (await request(port, "POST", "/requests", { token: tokenCust, body: { serviceId: "pan-card" } })).body.request;
    await request(port, "PATCH", `/requests/${closed.id}/status`, { token: tokenCust, body: { status: "cancelled" } });
    const closedAdmin = await autofill(closed.id, tokenAdmin);
    const closedOwner = await autofill(closed.id, tokenCust);
    check(
      "Autofill: closed request → 409 for admin and owner (no data)",
      closedAdmin.status === 409 && closedOwner.status === 409 && !closedAdmin.body?.autofill && !closedOwner.body?.autofill,
      `${closedAdmin.status},${closedOwner.status}`
    );

    const anonAf = await autofill(afReq.id, undefined);
    check("Autofill: unauthenticated → 401", anonAf.status === 401, `status=${anonAf.status}`);

    // Forged ownership hints in the query string are ignored
    const forged = await autofill(afReq.id, tokenCust2, `?customer=${customer._id}&userId=${customer._id}&role=admin`);
    const forgedOwn = await autofill(afReq.id, tokenCust, `?customer=${customer2._id}`);
    check(
      "Autofill: forged user/role/ownership params ignored",
      forged.status === 404 && forgedOwn.status === 200 && forgedOwn.body.autofill?.fields?.personal?.motherName?.value === "Asha Devi",
      `${forged.status},${forgedOwn.status}`
    );

    // Missing profile: only request-provided values are available
    const c3req = (
      await request(port, "POST", "/requests", { token: tokenCust3, body: { serviceId: "pan-card", applicantDetails: { fullName: "Cust Three" } } })
    ).body.request;
    const c3 = await autofill(c3req.id, tokenCust3);
    const c3flat = flatten(c3.body?.autofill?.fields);
    const c3others = Object.entries(c3flat).filter(([k]) => k !== "personal.fullName");
    check(
      "Autofill: missing profile → profileFound=false, everything else explicitly missing",
      c3.status === 200 && c3.body.autofill.profileFound === false && c3flat["personal.fullName"]?.value === "Cust Three" &&
        c3others.length > 20 && c3others.every(([, v]) => v.status === "missing" && v.value === null) &&
        c3.body.autofill.invalid.length === 0 && (await CustomerProfile.countDocuments({ user: customer3._id })) === 0,
      `status=${c3.status}`
    );

    // Legacy / invalid stored values are reported invalid, never returned raw
    await CustomerProfile.updateOne(
      { user: customer2._id },
      { $set: { aadhaarRef: fullAadhaar, panRef: fullPan, "personal.dob": "17/05/2004", "personal.religion": fullPan, "contact.mobile": "12345" } }
    );
    const c2ReqId = noProfReq.body.request.id;
    await ServiceRequest.updateOne({ _id: c2ReqId }, { $set: { "applicantDetails.referenceNumber": fullPan } });
    const c2af = await autofill(c2ReqId, tokenCust2);
    const inv = c2af.body?.autofill?.invalid || [];
    check(
      "Autofill: legacy full Aadhaar/PAN + malformed values → invalid with null value",
      c2af.status === 200 && !leaks(c2af.body) &&
        ["identity.aadhaarMasked", "identity.panMasked", "personal.dob", "personal.religion", "contact.mobile", "requestDetails.referenceNumber"].every(
          (p) => inv.includes(p) && flatten(c2af.body.autofill.fields)[p]?.value === null
        ),
      `status=${c2af.status} invalid=${inv.join(",")}`
    );

    // Audit: one event per successful access, request identifier only
    const afAudit = await AuditLog.find({ action: "autofill_data_accessed", targetId: afReq.id }).lean();
    check(
      "Audit: autofill_data_accessed per successful access (actor, role, request id only)",
      afAudit.length === 4 &&
        ["customer", "agent", "admin"].every((role) => afAudit.some((a) => a.actorRole === role)) &&
        afAudit.every((a) => a.targetType === "request" && a.meta === afReq.requestNumber && a.actor && a.at),
      `count=${afAudit.length}`
    );
    const deniedAudits = await AuditLog.countDocuments({ action: "autofill_data_accessed", targetId: closed.id });
    const auditBlob = JSON.stringify(await AuditLog.find({ action: "autofill_data_accessed" }).lean());
    check(
      "Audit: no event for denied/closed access; no applicant values logged",
      deniedAudits === 0 && !leaks(auditBlob) && !/Ravi|Asha|9876543210|XXXX|ROLL-5566/.test(auditBlob)
    );

    // Backward compatibility of existing responses
    const adminGet = await request(port, "GET", `/requests/${afReq.id}`, { token: tokenAdmin });
    check(
      "Back-compat: GET /requests/:id response keys unchanged",
      sameKeys(adminGet.body.request, [
        "id", "requestNumber", "userId", "customerName", "serviceId", "serviceName", "category", "status", "applicantDetails",
        "notes", "adminNotes", "assignedAgentId", "assignedAgentName", "documents", "deliverables", "statusHistory", "comments",
        "priceLabel", "isPaid", "paymentApprovedByAdmin", "createdAt", "updatedAt",
      ]),
      Object.keys(adminGet.body.request || {}).join(",")
    );
    const profGet = await request(port, "GET", "/profile", { token: tokenCust });
    check(
      "Back-compat: GET /profile response keys unchanged",
      sameKeys(profGet.body.profile, ["aadhaarRef", "contact", "correspondenceAddress", "education", "exams", "panRef", "permanentAddress", "personal", "updatedAt"])
    );
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

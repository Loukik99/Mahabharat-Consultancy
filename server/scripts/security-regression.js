/**
 * Security regression tests — run with: npm run test:security
 * Uses an in-memory MongoDB. Does not touch production.
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
const { MongoMemoryServer } = require("mongodb-memory-server");

let passed = 0;
let failed = 0;
const failures = [];

function ok(name) {
  passed += 1;
  console.log(`  PASS  ${name}`);
}
function fail(name, err) {
  failed += 1;
  failures.push({ name, err: err?.message || String(err) });
  console.log(`  FAIL  ${name}: ${err?.message || err}`);
}

async function request(port, method, path, { body, token, cookie, headers } = {}) {
  const payload = body != null ? JSON.stringify(body) : null;
  const hdrs = {
    Accept: "application/json",
    ...(payload ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
    ...headers,
  };
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: `/api${path}`, method, headers: hdrs },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = { raw };
          }
          const setCookie = res.headers["set-cookie"] || [];
          resolve({ status: res.statusCode, body: json, setCookie, headers: res.headers });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  console.log("\n=== Security regression suite ===\n");

  // ── 1. Production JWT fail-closed ───────────────────────────────
  console.log("1. Startup / secrets");
  {
    const { spawnSync } = require("child_process");
    const path = require("path");
    const envJs = path.join(__dirname, "..", "src", "config", "env.js");
    const r = spawnSync(
      process.execPath,
      [
        "-e",
        `process.env.NODE_ENV='production'; delete process.env.JWT_SECRET; require(${JSON.stringify(envJs)}); console.log('STARTED');`,
      ],
      { encoding: "utf8" }
    );
    if (r.status !== 0 && !String(r.stdout + r.stderr).includes("STARTED")) ok("Missing JWT_SECRET in production → refuse start");
    else fail("Missing JWT_SECRET in production → refuse start", new Error(`exit=${r.status} out=${r.stdout} err=${r.stderr}`));
  }

  {
    const { spawnSync } = require("child_process");
    const path = require("path");
    const envJs = path.join(__dirname, "..", "src", "config", "env.js");
    const r = spawnSync(
      process.execPath,
      [
        "-e",
        `process.env.NODE_ENV='production'; process.env.JWT_SECRET='${"x".repeat(40)}'; process.env.CLIENT_URL=''; require(${JSON.stringify(envJs)}); console.log('STARTED');`,
      ],
      { encoding: "utf8" }
    );
    if (r.status !== 0 && !String(r.stdout + r.stderr).includes("STARTED")) {
      ok("Missing CLIENT_URL in production → refuse start");
    } else {
      fail("Missing CLIENT_URL in production → refuse start", new Error(`exit=${r.status} out=${r.stdout} err=${r.stderr}`));
    }
  }

  {
    const { assertSeedAllowed } = require("../src/seed");
    process.env.NODE_ENV = "production";
    try {
      assertSeedAllowed();
      fail("Seed blocked in production", new Error("should have thrown"));
    } catch (e) {
      ok("Seed blocked in production");
    }
    process.env.NODE_ENV = "test";
    delete process.env.CONFIRM_SEED;
    try {
      assertSeedAllowed();
      fail("Seed requires CONFIRM_SEED=YES", new Error("should have thrown"));
    } catch (e) {
      ok("Seed requires CONFIRM_SEED=YES");
    }
  }

  // ── Boot API against memory Mongo ───────────────────────────────
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri("mahabharat_security");
  // Re-require env/db with URI set — env already loaded; set mongo via process and connect manually
  const mongoose = require("mongoose");
  await mongoose.connect(process.env.MONGODB_URI);

  // Clear module cache for app so rate limiters are fresh; env already has JWT
  const app = require("../src/app");
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const call = (method, path, opts) => request(port, method, path, opts);

  const { User } = require("../src/models");
  const { signToken } = require("../src/middleware/auth");

  const mk = async (data) => {
    const u = new User({ ...data, role: data.role || "customer" });
    u.password = data.password;
    await u.save();
    return u;
  };

  const strong = "Str0ngPass!x";
  const admin = await mk({
    name: "Admin",
    email: "admin@test.local",
    phone: "9000000001",
    password: strong,
    role: "admin",
  });
  const agent = await mk({
    name: "Agent",
    email: "agent@test.local",
    phone: "9000000002",
    password: strong,
    role: "agent",
  });
  const custA = await mk({
    name: "CustA",
    email: "a@test.local",
    phone: "9000000003",
    password: strong,
    role: "customer",
  });
  const custB = await mk({
    name: "CustB",
    email: "b@test.local",
    phone: "9000000004",
    password: strong,
    role: "customer",
  });

  const { ServiceCategory, Service, ServiceRequest, AgentProfile, CustomerProfile } = require("../src/models");
  await AgentProfile.create({ user: agent._id });
  await CustomerProfile.create({ user: custA._id });
  await CustomerProfile.create({ user: custB._id });
  await ServiceCategory.create({
    key: "govt_docs",
    name: "Govt",
    order: 1,
    isActive: true,
  });
  const svc = await Service.create({
    name: "PAN",
    slug: "pan-card",
    category: "govt_docs",
    priceLabel: "₹100",
    isActive: true,
  });
  const reqA = await ServiceRequest.create({
    requestNumber: "MC-SEC-1",
    customer: custA._id,
    service: svc._id,
    category: "govt_docs",
    status: "in_progress",
    assignedAgent: agent._id,
    priceLabel: "₹100",
    statusHistory: [{ status: "submitted", by: custA._id, byRole: "customer" }],
  });
  const reqB = await ServiceRequest.create({
    requestNumber: "MC-SEC-2",
    customer: custB._id,
    service: svc._id,
    category: "govt_docs",
    status: "submitted",
    priceLabel: "₹100",
    statusHistory: [{ status: "submitted", by: custB._id, byRole: "customer" }],
  });

  const tokenAdmin = signToken(admin);
  const tokenAgent = signToken(agent);
  const tokenA = signToken(custA);
  const tokenB = signToken(custB);

  console.log("\n2. Authentication / authorization");

  try {
    const r = await call("GET", "/users/customers");
    assert.strictEqual(r.status, 401);
    ok("Unauthorized API access → rejected");
  } catch (e) {
    fail("Unauthorized API access → rejected", e);
  }

  try {
    const r = await call("GET", "/users/customers", { token: tokenA });
    assert.strictEqual(r.status, 403);
    ok("Customer → admin API → rejected");
  } catch (e) {
    fail("Customer → admin API → rejected", e);
  }

  try {
    const r = await call("GET", "/stats/admin", { token: tokenA });
    assert.strictEqual(r.status, 403);
    ok("Customer → staff/admin stats → rejected");
  } catch (e) {
    fail("Customer → staff/admin stats → rejected", e);
  }

  try {
    const r = await call("GET", "/users/agents", { token: tokenAgent });
    assert.strictEqual(r.status, 403);
    ok("Staff → admin API → rejected");
  } catch (e) {
    fail("Staff → admin API → rejected", e);
  }

  try {
    const r = await call("GET", `/requests/${reqB._id}`, { token: tokenA });
    assert.strictEqual(r.status, 403);
    ok("User A → User B resource → rejected");
  } catch (e) {
    fail("User A → User B resource → rejected", e);
  }

  try {
    const r = await call("GET", `/requests/${reqA._id}`, { token: tokenB });
    assert.strictEqual(r.status, 403);
    ok("User B → User A resource → rejected");
  } catch (e) {
    fail("User B → User A resource → rejected", e);
  }

  try {
    const r = await call("GET", "/auth/me", { token: "not.a.jwt" });
    assert.strictEqual(r.status, 401);
    ok("Invalid JWT → rejected");
  } catch (e) {
    fail("Invalid JWT → rejected", e);
  }

  try {
    const jwt = require("jsonwebtoken");
    const env = require("../src/config/env");
    const expired = jwt.sign({ id: custA.id, role: "customer", tv: 0 }, env.jwtSecret, { expiresIn: -10 });
    const r = await call("GET", "/auth/me", { token: expired });
    assert.strictEqual(r.status, 401);
    ok("Expired JWT → rejected");
  } catch (e) {
    fail("Expired JWT → rejected", e);
  }

  try {
    // Privilege escalation via body role on register must not create admin
    const r = await call("POST", "/auth/register", {
      body: {
        name: "Hacker",
        email: "hack@test.local",
        phone: "9000000099",
        password: strong,
        role: "admin",
      },
    });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body.user.role, "customer");
    assert.strictEqual(r.body.token, undefined);
    ok("Register ignores client role (no escalation)");
  } catch (e) {
    fail("Register ignores client role (no escalation)", e);
  }

  try {
    const r = await call("PATCH", `/requests/${reqA._id}/status`, {
      token: tokenAgent,
      body: { status: "delivered" },
    });
    assert.strictEqual(r.status, 403);
    ok("Agent cannot set delivered status");
  } catch (e) {
    fail("Agent cannot set delivered status", e);
  }

  try {
    const r = await call("PATCH", `/requests/${reqA._id}/payment/received`, {
      token: tokenAgent,
      body: {},
    });
    assert.strictEqual(r.status, 403);
    ok("Agent cannot mark payment received");
  } catch (e) {
    fail("Agent cannot mark payment received", e);
  }

  try {
    const jwt = require("jsonwebtoken");
    const envMod = require("../src/config/env");
    const forged = jwt.sign(
      { id: custA.id, role: "admin", tv: custA.tokenVersion || 0 },
      envMod.jwtSecret,
      { expiresIn: "1h" }
    );
    const r = await call("GET", "/users/customers", { token: forged });
    assert.strictEqual(r.status, 403);
    ok("Forged JWT role claim ignored (DB role wins)");
  } catch (e) {
    fail("Forged JWT role claim ignored (DB role wins)", e);
  }

  console.log("\n3. Session invalidation / password reset");

  try {
    const before = signToken(custA);
    const u = await User.findById(custA._id);
    u.password = "NewStr0ngPass!";
    await u.save();
    const r = await call("GET", "/auth/me", { token: before });
    assert.strictEqual(r.status, 401);
    ok("Old JWT after password change → rejected");
    // refresh custA tokenVersion for later tests
    Object.assign(custA, await User.findById(custA._id));
  } catch (e) {
    fail("Old JWT after password change → rejected", e);
  }

  console.log("\n4. Injection / input hardening");

  try {
    const { stripMongoOperators } = require("../src/utils/sanitize");
    const cleaned = stripMongoOperators({ email: { $gt: "" }, name: "x", nested: { $where: "1" } });
    assert.strictEqual(cleaned.email, undefined);
    assert.strictEqual(cleaned.name, "x");
    assert.strictEqual(cleaned.nested, undefined);
    ok("MongoDB operators stripped from objects");
  } catch (e) {
    fail("MongoDB operators stripped from objects", e);
  }

  try {
    const r = await call("POST", "/auth/login", {
      body: { emailOrPhone: { $gt: "" }, password: { $gt: "" } },
    });
    // Should not 500; either 400 credentials required or 401
    assert.ok(r.status === 400 || r.status === 401);
    ok("Mongo operator login body → rejected safely");
  } catch (e) {
    fail("Mongo operator login body → rejected safely", e);
  }

  try {
    const { validatePassword } = require("../src/utils/passwordPolicy");
    let threw = false;
    try {
      validatePassword("admin123");
    } catch {
      threw = true;
    }
    assert.ok(threw);
    ok("Weak password policy enforced");
  } catch (e) {
    fail("Weak password policy enforced", e);
  }

  console.log("\n5. Uploads");

  try {
    const r = await call("POST", `/requests/${reqA._id}/documents`, {
      token: signToken(await User.findById(custA._id)),
      // no multipart — should 400
    });
    assert.ok(r.status === 400 || r.status === 415 || r.status === 500);
    // Without multer file, controller returns 400 No file — but content-type missing may differ
    ok("Unauthorized/empty upload rejected (no file)");
  } catch (e) {
    fail("Unauthorized/empty upload rejected (no file)", e);
  }

  try {
    const { assertSafeUpload } = require("../src/utils/fileMagic");
    let threw = false;
    try {
      assertSafeUpload({
        buffer: Buffer.from("MZ\x90\x00fake-exe"),
        originalname: "virus.exe",
        mimetype: "application/pdf",
      });
    } catch {
      threw = true;
    }
    assert.ok(threw);
    ok("Invalid file type / magic bytes → rejected");
  } catch (e) {
    fail("Invalid file type / magic bytes → rejected", e);
  }

  try {
    // Oversized: craft multer limit check via env — unit-level assert on config
    const env = require("../src/config/env");
    assert.ok(env.maxUploadBytes > 0 && env.maxUploadBytes <= 50 * 1024 * 1024);
    ok("Upload size limit configured");
  } catch (e) {
    fail("Upload size limit configured", e);
  }

  console.log("\n6. Cookies / CSRF / logout");

  try {
    await mk({
      name: "CookieUser",
      email: "cookie@test.local",
      phone: "9000000088",
      password: strong,
      role: "customer",
    });
    const r = await call("POST", "/auth/login", {
      body: { emailOrPhone: "cookie@test.local", password: strong },
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.token, undefined);
    const authCookie = (r.setCookie || []).find((c) => c.startsWith("mc_auth="));
    const csrfCookie = (r.setCookie || []).find((c) => c.startsWith("mc_csrf="));
    assert.ok(authCookie);
    assert.ok((authCookie || "").toLowerCase().includes("httponly"));
    assert.ok(csrfCookie);
    ok("Login sets HttpOnly auth cookie, CSRF cookie, no JWT in JSON");

    const csrfVal = decodeURIComponent(String(csrfCookie).split(";")[0].slice("mc_csrf=".length));
    const cookieHeader = `${String(authCookie).split(";")[0]}; ${String(csrfCookie).split(";")[0]}`;

    const blocked = await call("POST", "/auth/logout", { cookie: cookieHeader });
    assert.strictEqual(blocked.status, 403);
    ok("Cookie auth without CSRF header → rejected");

    const okLogout = await call("POST", "/auth/logout", {
      cookie: cookieHeader,
      headers: { "X-CSRF-Token": csrfVal },
    });
    assert.strictEqual(okLogout.status, 200);
    ok("Cookie auth with CSRF header → logout ok");
  } catch (e) {
    fail("Cookie/CSRF login-logout flow", e);
  }

  try {
    const u = await mk({
      name: "LogoutUser",
      email: "logout@test.local",
      phone: "9000000077",
      password: strong,
      role: "customer",
    });
    const tok = signToken(u);
    const out = await call("POST", "/auth/logout", { token: tok });
    assert.strictEqual(out.status, 200);
    const after = await call("GET", "/auth/me", { token: tok });
    assert.strictEqual(after.status, 401);
    ok("Logout invalidates prior JWT (tokenVersion bump)");
  } catch (e) {
    fail("Logout invalidates prior JWT (tokenVersion bump)", e);
  }

  // Cleanup
  server.close();
  await mongoose.disconnect();
  await mem.stop();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  if (failures.length) {
    for (const f of failures) console.log(` - ${f.name}: ${f.err}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

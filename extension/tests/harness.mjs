/**
 * Shared local-only harness for the real-browser extension tests (browser-smoke, portal-smoke).
 * In-memory MongoDB + the real API, Vite dev server, and Chrome/Edge driven over the DevTools
 * pipe. Production is blocked inside the browser; cookie values are never read or printed.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const extDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const repo = path.resolve(extDir, "..");
export const APP = "http://localhost:5173";
export const API_PORT = 5000;
export const PRODUCTION_PATTERNS = ["https://www.mahabharat.net.in/*", "https://mahabharat.net.in/*"];

export const log = (...a) => process.stdout.write(`${a.join(" ")}\n`);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createReporter() {
  const r = { passed: 0, failed: 0 };
  r.check = (name, cond, detail = "") => {
    if (cond) r.passed += 1;
    else r.failed += 1;
    log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    return !!cond;
  };
  return r;
}

/** Resolves with fn()'s result, or with `fallback` once `ms` elapses (a hung fn cannot block the caller). */
function within(ms, fn, fallback) {
  let timer;
  return Promise.race([
    Promise.resolve().then(fn),
    new Promise((r) => {
      timer = setTimeout(() => r(fallback), Math.max(0, ms));
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function waitFor(fn, { timeout = 15000, interval = 150, label = "condition" } = {}) {
  const end = Date.now() + timeout;
  const TIMED_OUT = Symbol("timed out");
  let lastError = null;
  while (Date.now() < end) {
    try {
      const v = await within(end - Date.now(), fn, TIMED_OUT);
      if (v === TIMED_OUT) {
        lastError = "the last attempt did not return before the deadline";
        break;
      }
      if (v) return v;
    } catch (e) {
      lastError = e.message;
    }
    await sleep(interval);
  }
  throw new Error(`Timed out after ${timeout} ms waiting for ${label}${lastError ? ` (${lastError})` : ""}`);
}

const BROWSERS = {
  chrome: [
    path.join(process.env.ProgramFiles || "", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
  ],
  edge: [
    path.join(process.env["ProgramFiles(x86)"] || "", "Microsoft/Edge/Application/msedge.exe"),
    path.join(process.env.ProgramFiles || "", "Microsoft/Edge/Application/msedge.exe"),
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/microsoft-edge",
  ],
};
export const findBrowser = (name) => BROWSERS[name]?.find((p) => p && fs.existsSync(p)) || null;

export function parseArgs(argv = process.argv.slice(2)) {
  return { browserName: (argv[argv.indexOf("--browser") + 1] || "chrome").toLowerCase(), headed: argv.includes("--headed") };
}

// ── Local backend (in-memory DB, fake data only) ─────────────────
export function setTestEnv() {
  Object.assign(process.env, {
    NODE_ENV: "test",
    JWT_SECRET: "browser-smoke-secret-at-least-32-characters!!",
    JWT_EXPIRES_IN: "1h",
    MONGODB_URI: "",
    CONFIRM_SEED: "",
    EMAIL_USER: "",
    EMAIL_PASS: "",
    CLIENT_URL: APP,
    CLOUDINARY_CLOUD_NAME: "",
    CLOUDINARY_API_KEY: "",
    CLOUDINARY_API_SECRET: "",
  });
}

export const serverRequire = createRequire(path.join(repo, "server", "package.json"));

export function apiCall(method, p, { token, body } = {}) {
  const payload = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: API_PORT,
        path: `/api${p}`,
        method,
        headers: {
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null }));
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Starts the real Express app on 127.0.0.1:5000 against an in-memory MongoDB. */
export async function startApi(dbName) {
  setTestEnv();
  const { MongoMemoryServer } = serverRequire("mongodb-memory-server");
  const mongoose = serverRequire("mongoose");
  const mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri(dbName));
  await serverRequire("./src/syncCatalog").syncCatalog();
  const models = serverRequire("./src/models");
  const { signToken } = serverRequire("./src/middleware/auth");
  const app = serverRequire("./src/app");
  const server = http.createServer(app);
  const listen = () => new Promise((r) => server.listen(API_PORT, "127.0.0.1", r));
  const stop = () =>
    new Promise((r) => {
      server.closeAllConnections?.();
      server.close(() => r());
    });
  await listen();
  return {
    models,
    signToken,
    listen,
    stop,
    async createCustomer(name, email, phone, password) {
      const u = new models.User({ name, email, phone, role: "customer" });
      u.password = password;
      await u.save();
      return { user: u, token: signToken(u) };
    },
    async shutdown() {
      await stop().catch(() => {});
      await mongoose.disconnect();
      await mem.stop();
    },
  };
}

export async function startVite() {
  const proc = spawn(process.execPath, [path.join(repo, "node_modules/vite/bin/vite.js"), "--port", "5173", "--strictPort", "--host", "localhost"], {
    cwd: repo,
    env: { ...process.env, VITE_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
    stdio: "ignore",
  });
  await waitFor(async () => (await fetch(`${APP}/`)).ok, { timeout: 60000, label: "Vite dev server" });
  return proc;
}

export async function stopVite(proc) {
  proc.kill();
  await waitFor(async () => {
    try {
      await fetch(`${APP}/`);
      return false;
    } catch {
      return true;
    }
  }, { label: "Vite to stop" });
}

// ── Browser over the DevTools pipe ───────────────────────────────
/**
 * Every CDP call settles: it rejects when its session detaches (e.g. a toolbar popup closes), when the
 * browser exits, or after `callTimeout` ms. Set MC_BROWSER_LOG=<file> to capture the browser's own log.
 */
export function launchBrowser(exe, profileDir, { headed = false, callTimeout = 30000, extraArgs = [] } = {}) {
  const browserLog = process.env.MC_BROWSER_LOG || "";
  const proc = spawn(
    exe,
    [
      "--remote-debugging-pipe",
      "--enable-unsafe-extension-debugging",
      // Without it Edge shows its "developer mode extensions" bubble a few seconds after an unpacked
      // load; the bubble takes activation and the browser closes any open toolbar popup.
      "--enable-automation",
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-sync",
      ...(browserLog ? ["--enable-logging=stderr", "--v=0"] : []),
      ...(headed ? [] : ["--headless=new"]),
      ...extraArgs,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", browserLog ? "pipe" : "ignore", "pipe", "pipe"] }
  );
  if (browserLog) proc.stderr.pipe(fs.createWriteStream(browserLog));
  const pending = new Map(); // id -> { resolve, reject, method, sessionId, timer }
  const listeners = new Set();
  let nextId = 1;
  let buf = "";
  let exited = null;
  const settle = (id, err, result) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    clearTimeout(p.timer);
    if (err) p.reject(err);
    else p.resolve(result);
  };
  proc.on("exit", (code, signal) => {
    exited = `browser exited (${code ?? signal})`;
    for (const [id, p] of pending) settle(id, new Error(`${p.method}: ${exited}`));
  });
  proc.stdio[4].setEncoding("utf8");
  proc.stdio[4].on("data", (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\0")) !== -1) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (msg.id && pending.has(msg.id)) {
        settle(msg.id, msg.error ? new Error(msg.error.message) : null, msg.result);
        continue;
      }
      if (msg.method === "Target.detachedFromTarget") {
        for (const [id, p] of pending) {
          if (p.sessionId === msg.params.sessionId) settle(id, new Error(`${p.method}: target detached before replying (${msg.params.targetId || "session"})`));
        }
      }
      for (const l of listeners) l(msg);
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      if (exited) return reject(new Error(`${method}: ${exited}`));
      const id = nextId++;
      const timer = setTimeout(() => settle(id, new Error(`${method}: no reply within ${callTimeout} ms`)), callTimeout);
      pending.set(id, { resolve, reject, method, sessionId, timer });
      proc.stdio[3].write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
    });
  return { proc, send, on: (fn) => listeners.add(fn) };
}

/**
 * Session bookkeeping on top of a launched browser: production blocking on every target,
 * per-session console / exception / request counters, and small page helpers.
 */
export function createDriver(b) {
  const sessions = new Map(); // sessionId -> { targetId, url, console, exceptions, requests: [], api: Map }
  const byTarget = new Map(); // targetId -> sessionId (auto-attached)
  const stats = { productionBlocked: 0 };
  const newSession = (targetId = null, url = "") => ({ targetId, url, console: 0, exceptions: 0, requests: [], api: new Map(), logs: [] });
  const blockProduction = (sessionId) => b.send("Fetch.enable", { patterns: PRODUCTION_PATTERNS.map((urlPattern) => ({ urlPattern })) }, sessionId);

  // Target lifecycle and log timeline, printed by tests when a stage fails.
  const started = Date.now();
  const timeline = [];
  const mark = (event, detail = "") => timeline.push(`+${((Date.now() - started) / 1000).toFixed(1)}s ${event}${detail ? ` ${detail}` : ""}`);
  const short = (u = "") => (u.length > 90 ? `${u.slice(0, 87)}...` : u);
  mark("driver.start", new Date(started).toLocaleTimeString("en-GB", { hour12: false }));
  b.send("Browser.getVersion").then((v) => mark("browser.version", v.product), () => {});
  b.send("Target.setDiscoverTargets", { discover: true }).catch(() => {});
  b.proc.on("exit", (code, signal) => mark("browser.exit", String(code ?? signal)));

  b.on((msg) => {
    const p = msg.params || {};
    if (msg.method === "Target.targetCreated") mark("target.created", `${p.targetInfo.type} ${short(p.targetInfo.url)} [${p.targetInfo.targetId.slice(0, 8)}]`);
    else if (msg.method === "Target.targetDestroyed") mark("target.destroyed", `[${p.targetId.slice(0, 8)}]`);
    else if (msg.method === "Target.targetCrashed") mark("target.crashed", `[${p.targetId.slice(0, 8)}] ${p.status} ${p.errorCode}`);
    else if (msg.method === "Target.detachedFromTarget") mark("session.detached", `[${(p.targetId || "").slice(0, 8)}]`);
    else if (msg.method === "Inspector.detached") mark("inspector.detached", p.reason);
    else if (msg.method === "Inspector.targetCrashed") mark("inspector.targetCrashed");
  });

  b.on((msg) => {
    if (msg.method === "Target.attachedToTarget" && msg.params.waitingForDebugger) {
      const sid = msg.params.sessionId;
      const info = msg.params.targetInfo || {};
      sessions.set(sid, newSession(info.targetId, info.url));
      if (info.targetId) byTarget.set(info.targetId, sid);
      Promise.all([blockProduction(sid), b.send("Runtime.enable", {}, sid), b.send("Network.enable", {}, sid)])
        .catch(() => {})
        .finally(() => b.send("Runtime.runIfWaitingForDebugger", {}, sid).catch(() => {}));
      return;
    }
    if (msg.method === "Fetch.requestPaused") {
      stats.productionBlocked += 1;
      // Delayed so a superseded production attempt resolves after the local one.
      setTimeout(() => {
        b.send("Fetch.failRequest", { requestId: msg.params.requestId, errorReason: "BlockedByClient" }, msg.sessionId).catch(() => {});
      }, 800);
      return;
    }
    const s = msg.sessionId && sessions.get(msg.sessionId);
    if (!s) return;
    if (msg.method === "Runtime.consoleAPICalled") {
      s.console += 1;
      s.logs.push(`console.${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(" ").slice(0, 300)}`);
    }
    if (msg.method === "Runtime.exceptionThrown") {
      s.exceptions += 1;
      const d = msg.params.exceptionDetails;
      s.logs.push(`exception: ${(d.exception?.description || d.text || "").split("\n")[0].slice(0, 300)}`);
    }
    if (msg.method === "Network.requestWillBeSent") {
      s.requests.push({ url: msg.params.request.url, method: msg.params.request.method, type: msg.params.type });
      if (msg.params.request.url.includes("/api/")) {
        s.api.set(msg.params.requestId, { path: new URL(msg.params.request.url).pathname, sent: [], blocked: [] });
      }
    }
    if (msg.method === "Network.requestWillBeSentExtraInfo") {
      const rec = s.api.get(msg.params.requestId);
      if (!rec) return;
      for (const c of msg.params.associatedCookies || []) {
        if (c.blockedReasons?.length) rec.blocked.push(`${c.cookie.name}:${c.blockedReasons.join("+")}`);
        else rec.sent.push(c.cookie.name);
      }
    }
  });

  const evaluate = async (sessionId, expression) => {
    const r = await b.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const navigate = async (sessionId, url) => {
    await b.send("Page.navigate", { url }, sessionId);
    await waitFor(() => evaluate(sessionId, `location.href === ${JSON.stringify(url)} && document.readyState === "complete"`), { label: url });
  };
  const attach = async (targetId) => {
    const { sessionId } = await b.send("Target.attachToTarget", { targetId, flatten: true });
    sessions.set(sessionId, newSession(targetId));
    for (const d of ["Runtime", "Network", "Page"]) await b.send(`${d}.enable`, {}, sessionId);
    await blockProduction(sessionId);
    return sessionId;
  };
  const openTab = async (url) => {
    const { targetId } = await b.send("Target.createTarget", { url: "about:blank" });
    const sessionId = await attach(targetId);
    await navigate(sessionId, url);
    return { targetId, sessionId };
  };
  const targets = async () => (await b.send("Target.getTargets")).targetInfos;
  /** Recent timeline entries plus captured console/exception text, for failure reports. */
  const diagnostics = (n = 40) => [
    ...timeline.slice(0, 2),
    ...timeline.slice(2).slice(-n),
    ...[...sessions.values()].filter((s) => s.logs.length).map((s) => `logs ${short(s.url || s.targetId)}: ${s.logs.slice(-5).join(" | ")}`),
  ];

  return { sessions, byTarget, stats, blockProduction, evaluate, navigate, attach, openTab, targets, mark, diagnostics };
}

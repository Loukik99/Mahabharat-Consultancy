/**
 * Real-browser smoke test for the extension (local only).
 *   node extension/tests/browser-smoke.mjs --browser chrome|edge [--headed]
 *
 * Starts an in-memory MongoDB + the API on 127.0.0.1:5000 + Vite on localhost:5173,
 * launches Chrome/Edge with a throwaway profile, loads the unpacked extension over the
 * DevTools pipe (Extensions.loadUnpacked), and drives the real popup page and content script.
 * Fake accounts only; production is never contacted. Cookie values are never read or printed —
 * only cookie names, flags and browser block reasons.
 *
 * Limits: the popup is opened as an extension tab (same chrome-extension:// origin and cookie
 * context as the toolbar popup); the toolbar popup itself is attempted via chrome.action.openPopup.
 * Only http://localhost:5173 is exercised — the production HTTPS origin needs the manual plan.
 * Portal form filling is covered separately by portal-smoke.mjs.
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { summarizeAutofill } from "../src/api.js";
import { describeReadiness } from "../src/popup-controller.js";
import {
  APP,
  apiCall,
  createDriver,
  createReporter,
  extDir,
  findBrowser,
  launchBrowser,
  log,
  parseArgs,
  sleep,
  startApi,
  startVite,
  stopVite,
  waitFor,
} from "./harness.mjs";

const { browserName, headed } = parseArgs();
const MOCK_PORTAL_HTML = `<!doctype html><title>Mock government portal</title>
<form id="application"><input name="fullName"><input name="dob" type="date"><input name="aadhaar"><button type="submit">Submit</button></form>`;
const PASSWORD = "Br0wserSmoke!x";
const report = createReporter();
const { check } = report;

async function startBackend() {
  const api = await startApi("mahabharat_browser_smoke");
  const { ServiceRequest } = api.models;
  const { token: t1 } = await api.createCustomer("Browser Test Customer", "browser.smoke1@test.local", "9000000101", PASSWORD);
  const { token: t2 } = await api.createCustomer("Other Test Customer", "browser.smoke2@test.local", "9000000102", PASSWORD);
  const prof = await apiCall("PUT", "/profile", { token: t1, body: { personal: { fullName: "Browser Test Applicant" } } });
  const own = await apiCall("POST", "/requests", { token: t1, body: { serviceId: "pan-card" } });
  const closed = await apiCall("POST", "/requests", { token: t1, body: { serviceId: "pan-card" } });
  const foreign = await apiCall("POST", "/requests", { token: t2, body: { serviceId: "pan-card" } });
  if (prof.status !== 200 || own.status !== 201 || closed.status !== 201 || foreign.status !== 201) {
    throw new Error(`seed failed: ${prof.status}/${own.status}/${closed.status}/${foreign.status}`);
  }
  await ServiceRequest.updateOne({ _id: closed.body.request.id }, { $set: { status: "delivered" } });
  const af = await apiCall("GET", `/requests/${own.body.request.id}/autofill`, { token: t1 });
  return {
    ...api,
    ids: { own: own.body.request.id, closed: closed.body.request.id, foreign: foreign.body.request.id },
    expected: describeReadiness(summarizeAutofill(af.body.autofill)),
  };
}

// Untrusted origin standing in for a government portal (never a real site).
async function startMockPortal() {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(MOCK_PORTAL_HTML);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

async function main() {
  const exe = findBrowser(browserName);
  if (!exe) throw new Error(`${browserName} not found`);
  log(`\n=== Extension browser smoke: ${browserName} (${headed ? "headed" : "headless"}) ===\n`);

  const backend = await startBackend();
  let vite = await startVite();
  const portal = await startMockPortal();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-ext-smoke-"));
  const b = launchBrowser(exe, profileDir, { headed });
  const { sessions, stats, evaluate, navigate, openTab } = createDriver(b);

  try {
    let ext;
    try {
      ext = await b.send("Extensions.loadUnpacked", { path: extDir });
    } catch (e) {
      check("Extension loads unpacked", false, e.message);
      return;
    }
    check("Extension loads unpacked (manifest + CSP accepted by the browser)", /^[a-p]{32}$/.test(ext.id));
    const POPUP = `chrome-extension://${ext.id}/src/popup.html`;

    const readPopup = (s) =>
      evaluate(
        s,
        `(() => { const $ = (id) => document.getElementById(id); return {
          state: $("status").dataset.state, status: $("status-text").textContent,
          connection: $("connection-message").textContent, signin: !$("signin").hidden,
          requests: !$("requests-section").hidden, requestsMessage: $("requests-message").textContent,
          options: [...$("request-select").options].map((o) => o.value).filter(Boolean),
          readiness: $("readiness").textContent, page: $("page-status").textContent }; })()`
      );
    const settled = async (s) =>
      waitFor(async () => {
        const st = await readPopup(s);
        return st.state !== "checking" && st.requestsMessage !== "Loading requests…" ? st : null;
      }, { label: "popup to settle" });
    // The popup always starts on the production origin (nothing is persisted); switch to local
    // immediately, while the production check is still in flight (exercises stale-result handling).
    const useLocal = (s) =>
      evaluate(s, `(() => { const o = document.getElementById("origin-select"); o.value = ${JSON.stringify(APP)}; o.dispatchEvent(new Event("change")); return o.value; })()`);
    const reloadPopup = async (s) => {
      await navigate(s, "about:blank");
      await navigate(s, POPUP);
      await useLocal(s);
      await sleep(1200); // let the superseded production attempt finish so a stale overwrite would show
      return settled(s);
    };
    const checkId = async (s, id) => {
      await evaluate(s, `document.getElementById("request-id").value = ${JSON.stringify(id)}; document.getElementById("request-form").requestSubmit(); true`);
      return waitFor(async () => {
        const t = (await readPopup(s)).readiness;
        return t && t !== "Checking…" ? t : null;
      }, { label: "readiness result" });
    };
    const lastApi = (s, p) => [...sessions.get(s).api.values()].filter((r) => r.path === p).at(-1);

    // 1. Signed out
    const popup = await openTab(POPUP);
    const defaultOrigin = await evaluate(popup.sessionId, `document.getElementById("origin-select").value`);
    check("Popup defaults to the production origin", defaultOrigin === "https://www.mahabharat.net.in", defaultOrigin);
    let st = await reloadPopup(popup.sessionId);
    check("Signed out: popup shows 'Not signed in' + sign-in button", st.state === "signed-out" && st.signin && !st.requests, st.status);

    // 2. Sign-in button opens the website login page
    await evaluate(popup.sessionId, `document.getElementById("signin").click(); true`);
    const loginTarget = await waitFor(
      async () => (await b.send("Target.getTargets")).targetInfos.find((t) => t.type === "page" && t.url.startsWith(`${APP}/login`)),
      { timeout: 10000, label: "login tab" }
    ).catch(async () => null);
    check(
      "Sign-in button opens the website login page in a new tab",
      !!loginTarget,
      loginTarget ? "" : (await b.send("Target.getTargets")).targetInfos.map((t) => `${t.type}:${t.url}`).join(" | ")
    );

    // 3. First-party login on the website (browser cookie jar; the extension is not involved)
    const app = await openTab(`${APP}/login`);
    const login = () =>
      evaluate(
        app.sessionId,
        `fetch("/api/auth/login", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ emailOrPhone: "browser.smoke1@test.local", password: ${JSON.stringify(PASSWORD)} }) }).then((r) => r.status)`
      );
    check("Website login succeeds (first-party)", (await login()) === 200);
    const cookies = (await b.send("Storage.getCookies")).cookies
      .filter((c) => ["mc_auth", "mc_csrf"].includes(c.name))
      .map((c) => `${c.name}[httpOnly=${c.httpOnly} secure=${c.secure} sameSite=${c.sameSite || "unset"}]`);
    log(`        cookie flags (values not read): ${cookies.join(" ")}`);

    // 4. Signed-in session recognition from the extension origin
    st = await reloadPopup(popup.sessionId);
    const me = lastApi(popup.sessionId, "/api/auth/me");
    log(`        extension /api/auth/me cookies sent: [${me?.sent.join(",") || ""}] blocked: [${me?.blocked.join(",") || ""}]`);
    check("Signed in: extension request carries the HttpOnly session cookie", st.state === "connected" && me?.sent.includes("mc_auth"), st.status);

    // 5. Request listing
    check(
      "Request list: own open request only (closed + other customer's excluded)",
      st.options.length === 1 && st.options[0] === backend.ids.own,
      `${st.options.length} option(s)`
    );

    // 6. Readiness via selection, unauthorized, closed, invalid id
    await evaluate(popup.sessionId, `document.getElementById("request-select").value = ${JSON.stringify(backend.ids.own)}; true`);
    const readiness = await checkId(popup.sessionId, "");
    check("Readiness counts match the API (selected request)", readiness === backend.expected, readiness);
    check("Other customer's request → not available", (await checkId(popup.sessionId, backend.ids.foreign)) === "Request not found or not available to your account.");
    check("Closed request → closed message", /closed/.test(await checkId(popup.sessionId, backend.ids.closed)));
    check("Malformed request id rejected locally", /valid request ID/.test(await checkId(popup.sessionId, "MC-1042")));

    // 7. Content-script ping / untrusted origins / page isolation
    const mock = await openTab(portal.url);
    const snapshot = `JSON.stringify({ html: document.documentElement.outerHTML, values: [...document.querySelectorAll("input")].map((i) => i.value) })`;
    const portalBefore = await evaluate(mock.sessionId, snapshot);
    const pings = await evaluate(
      popup.sessionId,
      `(async () => {
        const send = (id, m) => chrome.tabs.sendMessage(id, m).then((r) => ({ ok: true, r: r ?? null }), () => ({ ok: false }));
        const all = await chrome.tabs.query({});
        const appTab = all.find((t) => t.url && t.url.startsWith("${APP}/"));
        const others = all.filter((t) => !t.url);
        return {
          valid: await send(appTab.id, { type: "MC_PING", v: 1 }),
          malformed: await Promise.all([{ type: "MC_PING", v: 1, x: 1 }, { type: "MC_PING", v: 2 }, "MC_PING"].map((m) => send(appTab.id, m))),
          others: await Promise.all(others.map((t) => send(t.id, { type: "MC_PING", v: 1 }))),
          detect: await Promise.all(others.map((t) => send(t.id, { type: "MC_DETECT", v: 1 }))),
        };
      })()`
    );
    const pong = pings.valid.r;
    check("Content script answers a valid ping on the Mahabharat page", pings.valid.ok && pong?.type === "MC_PONG" && pong?.formFilling === "unavailable");
    check("Malformed pings get no pong", pings.malformed.every((m) => !m.ok || m.r === null));
    check("No response from tabs outside trusted origins (incl. mock portal)", pings.others.length >= 2 && pings.others.every((m) => !m.ok || m.r === null), `${pings.others.length} tab(s)`);
    check("Shipped build: no portal content script answers detection anywhere", pings.detect.every((m) => !m.ok || m.r === null));
    const pageWorld = await evaluate(app.sessionId, `typeof window.chrome?.runtime?.sendMessage`);
    check("Website page cannot message the extension (no externally_connectable)", pageWorld === "undefined", pageWorld);

    // 8. Toolbar popup (best effort — depends on browser/headless support for action.openPopup)
    try {
      await b.send("Target.activateTarget", { targetId: app.targetId });
      await b.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
      await evaluate(popup.sessionId, `chrome.action.openPopup().then(() => true)`);
      const t = await waitFor(async () => (await b.send("Target.getTargets")).targetInfos.find((x) => x.url === POPUP && x.targetId !== popup.targetId), { timeout: 5000, label: "toolbar popup" });
      const { sessionId } = await b.send("Target.attachToTarget", { targetId: t.targetId, flatten: true });
      const page = await waitFor(async () => {
        const p = await evaluate(sessionId, `document.getElementById("page-status").textContent`);
        return p && p !== "Checking this page…" ? p : null;
      });
      check("Toolbar popup on Mahabharat tab reports 'This is a Mahabharat page'", /This is a Mahabharat page/.test(page), page);
      await b.send("Target.closeTarget", { targetId: t.targetId });
      await waitFor(async () => !(await b.send("Target.getTargets")).targetInfos.some((x) => x.targetId === t.targetId), { timeout: 5000, label: "popup close" });
    } catch (e) {
      log(`  SKIP  Toolbar popup via chrome.action.openPopup unavailable here (${e.message.split("\n")[0]}) — covered by the manual plan`);
    }
    try {
      await b.send("Target.activateTarget", { targetId: mock.targetId });
      await evaluate(popup.sessionId, `chrome.action.openPopup().then(() => true)`);
      const page = await waitFor(async () => {
        for (const x of (await b.send("Target.getTargets")).targetInfos.filter((t) => t.url === POPUP && t.targetId !== popup.targetId)) {
          const { sessionId } = await b.send("Target.attachToTarget", { targetId: x.targetId, flatten: true });
          const p = await evaluate(sessionId, `document.getElementById("page-status").textContent`);
          if (/No supported government portal detected/.test(p)) return p;
        }
        return null;
      }, { timeout: 5000, label: "toolbar popup on mock portal" });
      check("Toolbar popup on mock portal reports 'No supported government portal detected'", !!page, page);
    } catch (e) {
      log(`  SKIP  Toolbar popup on mock portal unavailable here (${e.message.split("\n")[0]})`);
    } finally {
      await b.send("Target.setAutoAttach", { autoAttach: false, waitForDebuggerOnStart: false, flatten: true }).catch(() => {});
    }
    const portalAfter = await evaluate(mock.sessionId, snapshot);
    check("Mock portal page left untouched (DOM and form values unchanged, no adapter)", portalBefore === portalAfter && JSON.parse(portalAfter).values.every((v) => v === ""));

    // 9. Logout → signed out → recovery
    const logout = await evaluate(
      app.sessionId,
      `fetch("/api/auth/logout", { method: "POST", credentials: "include", headers: { Accept: "application/json",
        "X-CSRF-Token": (document.cookie.match(/(?:^|; )mc_csrf=([^;]*)/) || [])[1] || "" } }).then((r) => r.status)`
    );
    st = await reloadPopup(popup.sessionId);
    check("After website logout the popup returns to signed out", logout === 200 && st.state === "signed-out" && st.signin, st.status);
    await login();
    st = await reloadPopup(popup.sessionId);
    check("Recovery: signing in again reconnects", st.state === "connected");

    // 10. Server error (API down behind the Vite proxy) → recovery
    await backend.stop();
    st = await reloadPopup(popup.sessionId);
    check("API down → server error message", st.state === "error" && /server had a problem/.test(st.connection), st.connection);
    await backend.listen();
    st = await reloadPopup(popup.sessionId);
    check("Recovery: API back → reconnects", st.state === "connected");

    // 11. Rate limited (local auth limiter)
    await evaluate(
      app.sessionId,
      `(async () => { for (let i = 0; i < 80; i++) { if ((await fetch("/api/auth/me", { credentials: "include" })).status === 429) return true; } return false; })()`
    );
    st = await reloadPopup(popup.sessionId);
    check("Rate limited → wait-and-retry message", st.state === "error" && /Too many requests/.test(st.connection), st.connection);

    // 12. Network error (site unreachable)
    await stopVite(vite);
    vite = null;
    st = await reloadPopup(popup.sessionId);
    check("Site unreachable → network error message", st.state === "error" && /Could not reach/.test(st.connection), st.connection);

    // 13. Nothing persisted, nothing logged by extension pages
    const stored = await evaluate(
      popup.sessionId,
      `(async () => ({ storageApi: typeof chrome.storage, cookiesApi: typeof chrome.cookies, local: localStorage.length,
        session: sessionStorage.length, idb: (await indexedDB.databases()).length }))()`
    );
    check(
      "No extension storage: chrome.storage/cookies unavailable, web storage + IndexedDB empty",
      stored.storageApi === "undefined" && stored.cookiesApi === "undefined" && stored.local === 0 && stored.session === 0 && stored.idb === 0,
      JSON.stringify(stored)
    );
    const ps = sessions.get(popup.sessionId);
    check("Popup produced no console output and no uncaught exceptions", ps.console === 0 && ps.exceptions === 0, `console=${ps.console} exceptions=${ps.exceptions}`);
    log(`        production requests blocked inside the browser: ${stats.productionBlocked}`);
  } finally {
    b.proc.kill();
    vite?.kill();
    portal.server.close();
    await backend.shutdown();
    await sleep(1000);
    fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
}

main()
  .catch((e) => {
    report.failed += 1;
    log(`  FATAL ${e.message}`);
  })
  .finally(() => {
    log(`\n=== Results (${browserName}): ${report.passed} passed, ${report.failed} failed ===\n`);
    process.exit(report.failed ? 1 : 0);
  });

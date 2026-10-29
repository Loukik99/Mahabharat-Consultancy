/**
 * Extension foundation tests (Node, no browser). Run: node extension/tests/extension.test.mjs
 * Covers manifest policy, message validation, origin allowlist, API/auth error handling,
 * data minimisation, the content script (in a vm sandbox with a mocked chrome API),
 * and absence of logging / persistent storage. Real Chrome/Edge behaviour is NOT exercised here.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { OPEN_STATUSES, TRUSTED_ORIGINS, isTrustedOrigin } from "../src/config.js";
import { createPing, isValidPing, isValidPong, isValidRequestId } from "../src/messages.js";
import { createApiClient, summarizeAutofill } from "../src/api.js";
import { checkConnection, checkReadiness, describeReadiness, errorMessage, loadRequests, probePage } from "../src/popup-controller.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const ORIGINS = TRUSTED_ORIGINS.map((t) => t.origin);
const EXT_ID = "abcdefghijklmnopabcdefghijklmnop";

let passed = 0;
let failed = 0;
const out = console.log.bind(console);
function check(name, cond, detail = "") {
  if (cond) {
    passed += 1;
    out(`  PASS  ${name}`);
  } else {
    failed += 1;
    out(`  FAIL  ${name}${detail ? `: ${detail}` : ""}`);
  }
}
async function rejectsWith(fn, code) {
  try {
    await fn();
    return false;
  } catch (e) {
    return e?.code === code;
  }
}

// Any console output from extension code during the run is a failure.
const consoleCalls = [];
for (const m of ["log", "info", "warn", "error", "debug"]) console[m] = (...args) => consoleCalls.push([m, args]);

function response(status, body, type = "application/json") {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h) => (h.toLowerCase() === "content-type" ? type : null) },
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
  };
}
function mockFetch(handler) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    return handler(url, opts);
  };
  fn.calls = calls;
  return fn;
}

const AUTOFILL = {
  requestId: "6ae06d1ab63bd6ce1baad6dc",
  requestNumber: "MC-1042",
  status: "in_review",
  service: { id: "x", slug: "pan-card", name: "PAN Card Application" },
  profileFound: true,
  fields: {
    personal: {
      fullName: { status: "available", value: "Ravi Kumar", source: "profile" },
      motherName: { status: "missing", value: null },
    },
    identity: { aadhaarMasked: { status: "available", value: "XXXX-XXXX-1234", source: "profile" } },
    exams: [{ examName: { status: "available", value: "Agniveer GD", source: "profile" } }],
    contact: { mobile: { status: "invalid", value: null } },
  },
  missing: ["personal.motherName"],
  invalid: ["contact.mobile"],
  generatedAt: "2026-10-27T00:00:00.000Z",
};

async function main() {
  out("\n=== Extension foundation tests ===\n");

  // ── Manifest ───────────────────────────────────────────────────
  {
    const hostPatterns = ORIGINS.map((o) => `${o}/*`);
    check("Manifest: MV3 with name, version, popup", manifest.manifest_version === 3 && !!manifest.name && /^\d+(\.\d+){0,3}$/.test(manifest.version) && manifest.action?.default_popup === "src/popup.html");
    const files = [manifest.action.default_popup, ...manifest.content_scripts.flatMap((c) => c.js)];
    check("Manifest: referenced files exist", files.every((f) => fs.existsSync(path.join(root, f))), files.join(","));
    check("Manifest: no extra API permissions (no tabs/cookies/storage/scripting/webRequest)", Array.isArray(manifest.permissions) && manifest.permissions.length === 0);
    check("Manifest: host permissions are exactly the trusted origins", JSON.stringify([...manifest.host_permissions].sort()) === JSON.stringify([...hostPatterns].sort()));
    const PMEGP_PAGE = "https://pmegp.msme.gov.in/Home/HomePage*";
    const GST_PAGE = "https://reg.gst.gov.in/registration*";
    const PORTAL_PAGES = [PMEGP_PAGE, GST_PAGE];
    const PORTAL_JS = ["core", "registry", "adapters", "classify", "values", "preview", "protocol", "dom"].map((f) => `src/engine/${f}.js`).concat("src/portal-content.js");
    const allPatterns = [...manifest.host_permissions, ...manifest.content_scripts.flatMap((c) => c.matches)];
    check(
      "Manifest: no broad host patterns (<all_urls>, *://, *. subdomains); the only path patterns are the PMEGP and GST application pages",
      allPatterns.every((p) => p !== "<all_urls>" && !p.startsWith("*") && !p.includes("*.") && (PORTAL_PAGES.includes(p) || /^(https:\/\/[^*/]+|http:\/\/localhost:\d+)\/\*$/.test(p)))
    );
    const [appScript, pmegpScript, gstScript, ...extraScripts] = manifest.content_scripts;
    const scriptKeys = (c) => Object.keys(c).sort().join();
    check(
      "Manifest: Mahabharat content script only on trusted Mahabharat origins, top frame only",
      JSON.stringify([...appScript.matches].sort()) === JSON.stringify([...hostPatterns].sort()) && JSON.stringify(appScript.js) === '["src/content.js"]' &&
        appScript.all_frames === false && scriptKeys(appScript) === "all_frames,js,matches,run_at"
    );
    check(
      "Manifest: exactly two portal content scripts, on the PMEGP and GST application pages only, top frame only",
      extraScripts.length === 0 && JSON.stringify(pmegpScript?.matches) === JSON.stringify([PMEGP_PAGE]) && JSON.stringify(gstScript?.matches) === JSON.stringify([GST_PAGE]) &&
        [pmegpScript, gstScript].every((s) => s.all_frames === false && s.run_at === "document_idle" && scriptKeys(s) === "all_frames,js,matches,run_at"),
      JSON.stringify([pmegpScript, gstScript])
    );
    check(
      "Manifest: each portal script loads the engine and portal content script only (no adapter file, no Mahabharat script)",
      [pmegpScript, gstScript].every((s) => JSON.stringify(s?.js) === JSON.stringify(PORTAL_JS)),
      JSON.stringify([pmegpScript?.js, gstScript?.js])
    );
    check(
      "Manifest: no government portal access beyond the PMEGP and GST application pages (no host permission, no other host)",
      !JSON.stringify(manifest).replace(JSON.stringify(PMEGP_PAGE), "").replace(JSON.stringify(GST_PAGE), "").match(/gov\.in|nic\.in|joinindianarmy|agnipath|cdac\.in|digialm|navydmpr|edcil|pmegp|gst/i) &&
        !manifest.host_permissions.some((h) => /pmegp|gst|gov\.in/i.test(h))
    );
    const csp = manifest.content_security_policy?.extension_pages || "";
    const connect = (csp.match(/connect-src ([^;]+)/) || [])[1]?.trim().split(/\s+/) || [];
    check(
      "Manifest: CSP script-src 'self' only, connect-src limited to trusted origins",
      /script-src 'self'(;|$)/.test(csp) && !/unsafe/.test(csp) && /object-src 'none'/.test(csp) &&
        JSON.stringify(connect.sort()) === JSON.stringify([...ORIGINS].sort())
    );
    check(
      "Manifest: no service worker, externally_connectable or web_accessible_resources",
      !manifest.background && !manifest.externally_connectable && !manifest.web_accessible_resources &&
        !fs.readdirSync(path.join(root, "src")).some((f) => /background|service.?worker/i.test(f))
    );
    const contentSrc = read("src/content.js");
    const contentOrigins = JSON.parse((contentSrc.match(/const TRUSTED = (\[[^\]]+\])/) || [])[1] || "[]");
    check("Config/content-script origin lists in sync", JSON.stringify(contentOrigins.sort()) === JSON.stringify([...ORIGINS].sort()));
  }

  // ── Message validation ─────────────────────────────────────────
  {
    const bad = [
      null, undefined, "MC_PING", 1, [], ["MC_PING", 1],
      { type: "MC_PING" }, { type: "MC_PING", v: 2 }, { type: "MC_PING", v: "1" },
      { type: "MC_FILL", v: 1 }, { type: "MC_PING", v: 1, data: { fullName: "x" } },
      JSON.parse('{"type":"MC_PING","v":1,"__proto__":{"polluted":true}}'),
    ];
    check("Messages: valid ping accepted", isValidPing(createPing()) && isValidPing({ type: "MC_PING", v: 1 }));
    check("Messages: malformed / extra-field / wrong-version pings rejected", bad.every((m) => !isValidPing(m)));
    const pong = { type: "MC_PONG", v: 1, page: "mahabharat-app", formFilling: "unavailable" };
    check(
      "Messages: pong validated strictly",
      isValidPong(pong) && !isValidPong({ ...pong, formFilling: "available" }) && !isValidPong({ ...pong, page: "joinindianarmy" }) &&
        !isValidPong({ ...pong, extra: 1 }) && !isValidPong(null)
    );
    check(
      "Messages: request id must be a 24-hex ObjectId",
      isValidRequestId("6ae06d1ab63bd6ce1baad6dc") &&
        ["", "123", "6ae06d1ab63bd6ce1baad6dz", "../../auth/me", "6ae06d1ab63bd6ce1baad6dc/", null, 42].every((x) => !isValidRequestId(x))
    );
  }

  // ── Content script (vm sandbox, mocked chrome) ─────────────────
  {
    const src = read("src/content.js");
    const load = (origin) => {
      const listeners = [];
      const chrome = { runtime: { id: EXT_ID, onMessage: { addListener: (fn) => listeners.push(fn) } } };
      vm.runInNewContext(src, { chrome, location: { origin } });
      return listeners;
    };
    const send = (listener, msg, sender) => {
      const replies = [];
      listener(msg, sender, (r) => replies.push(r));
      return replies;
    };
    const popupSender = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/src/popup.html` };

    const [listener] = load("https://www.mahabharat.net.in");
    const ok = send(listener, createPing(), popupSender);
    check("Content: answers a valid ping from its own popup", ok.length === 1 && isValidPong(ok[0]));
    check("Content: ignores other extensions", send(listener, createPing(), { id: "otherextensionidotherextensionid" }).length === 0);
    check("Content: ignores messages from tabs / pages", send(listener, createPing(), { id: EXT_ID, tab: { id: 3 } }).length === 0 && send(listener, createPing(), undefined).length === 0);
    check("Content: ignores invalid messages", [{ type: "MC_PING", v: 1, data: 1 }, { type: "MC_FILL", v: 1 }, "MC_PING", null].every((m) => send(listener, m, popupSender).length === 0));
    check(
      "Content: inactive on untrusted / government origins",
      ["https://joinindianarmy.nic.in", "https://pmegp.msme.gov.in", "https://mahabharat.net.in", "https://www.mahabharat.net.in.evil.com", "http://localhost:5000"].every((o) => load(o).length === 0)
    );
    check("Content: no DOM access or page messaging", !/document\.|window\.postMessage|addEventListener\(\s*["']message/.test(src));
  }

  // ── Allowed-origin enforcement ─────────────────────────────────
  {
    const untrusted = [
      "https://mahabharat.net.in", "https://www.mahabharat.net.in.evil.com", "http://www.mahabharat.net.in",
      "https://www.mahabharat.net.in/", "https://joinindianarmy.nic.in", "chrome-extension://x", "", null, undefined,
    ];
    const f = mockFetch(() => response(200, {}));
    check("Origins: trusted origins accepted", ORIGINS.every((o) => isTrustedOrigin(o)));
    let allRejected = true;
    for (const o of untrusted) {
      if (!(await rejectsWith(() => createApiClient(o, f), "UNTRUSTED_ORIGIN"))) allRejected = false;
    }
    check("Origins: untrusted / look-alike / http origins rejected before any request", allRejected && f.calls.length === 0);

    const g = mockFetch(() => response(200, { success: true, user: { name: "Ravi", role: "customer", email: "r@x.in", phone: "98xxxxxx10" } }));
    await createApiClient(ORIGINS[0], g).getSession();
    const { url, opts } = g.calls[0];
    check(
      "Origins: request goes only to <trusted origin>/api with GET, cookies, no redirects",
      url === `${ORIGINS[0]}/api/auth/me` && opts.method === "GET" && opts.credentials === "include" && opts.redirect === "error" &&
        opts.cache === "no-store" && !opts.body && !("Authorization" in (opts.headers || {}))
    );
  }

  // ── Authentication failure + API errors ────────────────────────
  {
    const sentinel = "SERVER-BODY-SENTINEL";
    const withStatus = (status) => createApiClient(ORIGINS[0], mockFetch(() => response(status, { message: sentinel })));
    check("Auth: 401 → AUTH_REQUIRED", await rejectsWith(() => withStatus(401).getSession(), "AUTH_REQUIRED"));
    const conn = await checkConnection(withStatus(401));
    check("Auth: popup shows signed-out state with fixed guidance", conn.state === "signed_out" && /Sign in on the Mahabharat website/.test(conn.message));
    const r401 = await checkReadiness(withStatus(401), "6ae06d1ab63bd6ce1baad6dc");
    check("Auth: expired session during readiness check → signed_out", r401.state === "signed_out");

    const codes = { 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "REQUEST_CLOSED", 429: "RATE_LIMITED", 500: "SERVER", 503: "SERVER", 418: "HTTP" };
    let allCodes = true;
    for (const [status, code] of Object.entries(codes)) {
      if (!(await rejectsWith(() => withStatus(Number(status)).getAutofillReadiness("6ae06d1ab63bd6ce1baad6dc"), code))) allCodes = false;
    }
    check("API: HTTP errors mapped to codes", allCodes);
    const r403 = await checkReadiness(withStatus(403), "6ae06d1ab63bd6ce1baad6dc");
    const r404 = await checkReadiness(withStatus(404), "6ae06d1ab63bd6ce1baad6dc");
    check("API: 403 and 404 show the same message (no existence leak)", r403.message === r404.message && r403.state === "error");
    const r409 = await checkReadiness(withStatus(409), "6ae06d1ab63bd6ce1baad6dc");
    check("API: closed request message", /closed/.test(r409.message));
    check(
      "API: server response bodies never surfaced",
      ![conn, r401, r403, r404, r409].some((s) => JSON.stringify(s).includes(sentinel))
    );
    const net = createApiClient(ORIGINS[0], async () => {
      throw new TypeError("Failed to fetch");
    });
    check("API: network failure → NETWORK", await rejectsWith(() => net.getSession(), "NETWORK"));
    const html = createApiClient(ORIGINS[0], mockFetch(() => response(200, "<html>", "text/html")));
    check("API: non-JSON response → BAD_RESPONSE", await rejectsWith(() => html.getSession(), "BAD_RESPONSE"));
    const broken = createApiClient(ORIGINS[0], mockFetch(() => response(200, "{not json")));
    check("API: malformed JSON → BAD_RESPONSE", await rejectsWith(() => broken.getSession(), "BAD_RESPONSE"));
    const shape = createApiClient(ORIGINS[0], mockFetch(() => response(200, { success: true })));
    check("API: unexpected shape → BAD_RESPONSE", await rejectsWith(() => shape.listOpenRequests(), "BAD_RESPONSE"));
    const noFetch = mockFetch(() => response(200, {}));
    const bad = await checkReadiness(createApiClient(ORIGINS[0], noFetch), "../../auth/me");
    check("API: invalid request id rejected without a request", bad.state === "error" && noFetch.calls.length === 0);
    check("API: unknown errors get a generic message", errorMessage(new Error("boom: secret")) === "Something went wrong.");
  }

  // ── Data minimisation ──────────────────────────────────────────
  {
    const f = mockFetch(() => response(200, { success: true, autofill: AUTOFILL }));
    const summary = await createApiClient(ORIGINS[0], f).getAutofillReadiness(AUTOFILL.requestId);
    check(
      "Data: readiness keeps counts and field paths only, discards applicant values",
      JSON.stringify(Object.keys(summary).sort()) ===
        JSON.stringify(["available", "invalid", "invalidKeys", "missing", "missingKeys", "profileFound", "requestNumber", "serviceName"]) &&
        summary.available === 3 && summary.missing === 1 && summary.invalid === 1 &&
        JSON.stringify(summary.missingKeys) === '["personal.motherName"]' && JSON.stringify(summary.invalidKeys) === '["contact.mobile"]' &&
        !/Ravi|XXXX|Agniveer/.test(JSON.stringify(summary))
    );
    check("Data: autofill URL is the request-scoped endpoint", f.calls[0].url === `${ORIGINS[0]}/api/requests/${AUTOFILL.requestId}/autofill`);
    check("Data: malformed autofill payload → BAD_RESPONSE", await rejectsWith(async () => summarizeAutofill({ fields: {} }), "BAD_RESPONSE"));

    const list = await createApiClient(
      ORIGINS[0],
      mockFetch(() =>
        response(200, {
          requests: [
            { id: "6ae06d1ab63bd6ce1baad6dc", requestNumber: "MC-1", serviceName: "PAN", status: "in_review", applicantDetails: { fullName: "Ravi" }, notes: "n", adminNotes: "a" },
            { id: "6ae06d1ab63bd6ce1baad6dd", requestNumber: "MC-2", serviceName: "PAN", status: "delivered" },
            { id: "not-an-id", requestNumber: "MC-3", serviceName: "PAN", status: "submitted" },
          ],
        })
      )
    ).listOpenRequests();
    check(
      "Data: request list reduced to picker fields, closed/invalid ids dropped",
      list.length === 1 && JSON.stringify(Object.keys(list[0]).sort()) === JSON.stringify(["id", "requestNumber", "serviceName", "status"])
    );
    const serverText = (p) => fs.readFileSync(path.join(root, "..", "server", "src", p), "utf8");
    const quoted = (s) => [...s.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    const allStatuses = quoted(serverText("models/ServiceRequest.js").match(/const REQUEST_STATUSES = \[([^\]]*)\]/)?.[1] || "");
    const terminal = quoted(serverText("controllers/requestController.js").match(/const TERMINAL = \[([^\]]*)\]/)?.[1] || "");
    check(
      "Data: open statuses are exactly the server's request statuses minus the ones autofill refuses",
      allStatuses.length > 0 && terminal.length > 0 && JSON.stringify(allStatuses.filter((s) => !terminal.includes(s))) === JSON.stringify([...OPEN_STATUSES]),
      `${allStatuses.join(",")} / ${terminal.join(",")}`
    );
    const session = await createApiClient(
      ORIGINS[0],
      mockFetch(() => response(200, { user: { name: "Ravi", role: "customer", email: "r@x.in", phone: "9876543210" } }))
    ).getSession();
    check("Data: session keeps name and role only", JSON.stringify(Object.keys(session).sort()) === JSON.stringify(["name", "role"]));

    const sources = fs.readdirSync(path.join(root, "src")).filter((f) => /\.(js|html)$/.test(f)).map((f) => [f, read(`src/${f}`)]);
    const forbidden = /console\.|localStorage|sessionStorage|indexedDB|chrome\.storage|document\.cookie|chrome\.cookies|innerHTML|outerHTML|insertAdjacentHTML|\beval\(|new Function|Authorization|type="password"/;
    const offenders = sources.filter(([, s]) => forbidden.test(s)).map(([f]) => f);
    check("Data: no logging, persistent storage, cookie access, HTML injection or password fields in extension code", offenders.length === 0, offenders.join(","));
    check("Data: no inline scripts in popup (CSP script-src 'self')", !/<script(?![^>]*\bsrc=)[^>]*>/.test(read("src/popup.html")));
  }

  // ── Popup behaviour (controller, no DOM) ───────────────────────
  {
    const fakeApi = (over) => ({
      getSession: async () => ({ name: "Ravi", role: "customer" }),
      listOpenRequests: async () => [],
      getAutofillReadiness: async () => ({ requestNumber: "MC-1", serviceName: "PAN", profileFound: false, available: 2, missing: 5, invalid: 0 }),
      ...over,
    });
    const conn = await checkConnection(fakeApi());
    check("Popup: connected state carries name + role only", conn.state === "connected" && conn.user.role === "customer");
    check("Popup: empty request list state", (await loadRequests(fakeApi())).state === "empty");
    const ready = await loadRequests(fakeApi({ listOpenRequests: async () => [{ id: "6ae06d1ab63bd6ce1baad6dc", requestNumber: "MC-1", serviceName: "PAN", status: "in_review" }] }));
    check("Popup: ready request list state", ready.state === "ready" && ready.requests.length === 1);
    const listErr = await loadRequests(createApiClient(ORIGINS[0], mockFetch(() => response(500, {}))));
    check("Popup: request list error state", listErr.state === "error" && !!listErr.message);
    const rd = await checkReadiness(fakeApi(), " 6ae06d1ab63bd6ce1baad6dc ");
    check(
      "Popup: readiness success state + description",
      rd.state === "ready" && describeReadiness(rd.summary) === "MC-1 · PAN: 2 values available, 5 missing, 0 need correction. No applicant profile saved yet."
    );
    const pong = { type: "MC_PONG", v: 1, page: "mahabharat-app", formFilling: "unavailable" };
    check(
      "Popup: page probe distinguishes Mahabharat page / inactive page",
      (await probePage(async () => pong)).state === "app_page" &&
        (await probePage(async () => null)).state === "inactive" &&
        (await probePage(async () => ({ ...pong, formFilling: "available" }))).state === "inactive" &&
        (await probePage(async () => {
          throw new Error("no receiver");
        })).state === "inactive"
    );
    const popupSrc = read("src/popup.js");
    check(
      "Popup: fill action starts disabled and is enabled only after explicit confirmation + a ticked field",
      /id="fill-button" type="button" disabled/.test(read("src/popup.html")) &&
        /\$\("fill-button"\)\.disabled = !\(preview && \$\("approve-confirm"\)\.checked && ticked > 0\)/.test(popupSrc) &&
        /confirmed: \$\("approve-confirm"\)\.checked/.test(popupSrc)
    );
  }

  check("No console output from extension code during tests", consoleCalls.length === 0, `${consoleCalls.length} call(s)`);

  out(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  out("FATAL", e?.message || e);
  process.exit(1);
});

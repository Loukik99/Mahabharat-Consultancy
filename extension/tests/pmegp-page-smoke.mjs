/**
 * The shipped manifest on the PMEGP application page, in a real browser, without contacting PMEGP.
 *   node extension/tests/pmegp-page-smoke.mjs --browser chrome|edge [--headed]
 *
 * Loads a copy of the shipped extension (manifest.json and src/ unchanged, plus one inert control
 * page). Every request from the test tab is answered locally through DevTools request interception,
 * so https://pmegp.msme.gov.in/Home/HomePage shows the stand-in rendered from the sanitised public
 * capture, and host resolution is disabled so nothing can reach a real server. Proves which URLs
 * the content script runs on and that, while PMEGP filling is off, it only reports the registry
 * status: it reads, fills, submits, navigates and stores nothing. Applicant data is synthetic.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { extRoot, loadAdapterSpec, readCaptures } from "./adapter-fixture-template.mjs";
import { renderCaptureFixture } from "./capture-fixture.mjs";
import { createReporter, findBrowser, launchBrowser, log, parseArgs, sleep, waitFor } from "./harness.mjs";

const { browserName, headed } = parseArgs();
const report = createReporter();
const { check } = report;
const read = (p) => fs.readFileSync(path.join(extRoot, p), "utf8");
const V = 1;
const HOST = "https://pmegp.msme.gov.in";
const PAGE = `${HOST}/Home/HomePage`;
const spec = loadAdapterSpec("pmegp-application");
const capture = readCaptures("pmegp-application").find((c) => c.file === "01-new-unit-public.json").capture;
const STAND_IN = renderCaptureFixture(capture);
const plain = (title) => `<!doctype html><title>${title}</title><p>${title}</p>`;
const FRAME_HOST = `<!doctype html><title>Frame host</title><iframe id="f" src="/Home/HomePage"></iframe>`;
// Responses by protocol + host + path (the query string is ignored). Anything else gets a 404.
const PAGES = {
  [PAGE]: STAND_IN,
  [`${HOST}/Home/HomePageArchive`]: STAND_IN,
  [`${HOST}/home/homepage`]: STAND_IN,
  [`${HOST}/`]: plain("PMEGP home"),
  [`${HOST}/Home/`]: plain("Home"),
  [`${HOST}/Home/Index`]: plain("Index"),
  [`${HOST}/Home/PMEGPUserManual`]: plain("User manual"),
  [`${HOST}/Home/FrameHost`]: FRAME_HOST,
  "https://www.pmegp.msme.gov.in/Home/HomePage": STAND_IN,
  "https://pmegp.msme.gov.in.example.com/Home/HomePage": STAND_IN,
  "http://pmegp.msme.gov.in/Home/HomePage": STAND_IN,
};
const leaf = (value) => ({ status: "available", value });
const TREE = {
  contact: { mobile: leaf("9000000501"), email: leaf("standin.pmegp@test.local") },
  correspondenceAddress: { tehsil: leaf("Standin Taluka"), pincode: leaf("411005") },
};
const SYNTHETIC = ["9000000501", "standin.pmegp@test.local", "Standin Taluka", "411005"];

function buildCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-ext-pmegp-page-"));
  fs.copyFileSync(path.join(extRoot, "manifest.json"), path.join(dir, "manifest.json"));
  fs.cpSync(path.join(extRoot, "src"), path.join(dir, "src"), { recursive: true });
  fs.mkdirSync(path.join(dir, "test-fixtures"));
  fs.writeFileSync(path.join(dir, "test-fixtures", "control.html"), "<!doctype html><title>control</title>\n");
  return dir;
}

async function main() {
  const exe = findBrowser(browserName);
  if (!exe) throw new Error(`${browserName} not found`);
  log(`\n=== PMEGP page match with the shipped manifest: ${browserName} (${headed ? "headed" : "headless"}) ===\n`);

  const dir = buildCopy();
  const shipped = read("manifest.json");
  const copied = fs.readFileSync(path.join(dir, "manifest.json"), "utf8");
  const manifest = JSON.parse(shipped);
  const referenced = [manifest.action.default_popup, ...manifest.content_scripts.flatMap((c) => c.js)];
  check(
    "Test copy: manifest byte-identical to the shipped one; every file it references copied unchanged",
    copied === shipped && referenced.every((f) => fs.readFileSync(path.join(dir, f), "utf8") === read(f)),
    referenced.join(", ")
  );

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "mc-ext-pmegp-page-profile-"));
  const b = launchBrowser(exe, profile, {
    headed,
    extraArgs: ["--host-resolver-rules=MAP * ~NOTFOUND", "--disable-features=HttpsUpgrades,HttpsFirstBalancedModeAutoEnable,HttpsFirstModeV2ForTypicallySecureUsers"],
  });
  const sessions = new Map(); // sessionId -> per-tab record
  const answer = (sessionId, s, p) => {
    const u = new URL(p.request.url);
    const body = p.resourceType === "Document" ? (PAGES[`${u.protocol}//${u.host}${u.pathname}`] ?? null) : null;
    s.paused.push({ method: p.request.method, url: p.request.url, type: p.resourceType, served: body !== null });
    b.send(
      "Fetch.fulfillRequest",
      {
        requestId: p.requestId,
        responseCode: body === null ? 404 : 200,
        responseHeaders: [{ name: "Content-Type", value: "text/html; charset=utf-8" }, { name: "Cache-Control", value: "no-store" }],
        body: Buffer.from(body ?? "").toString("base64"),
      },
      sessionId
    ).catch(() => {});
  };
  b.on((msg) => {
    const s = msg.sessionId && sessions.get(msg.sessionId);
    if (!s) return;
    const p = msg.params;
    if (msg.method === "Fetch.requestPaused") answer(msg.sessionId, s, p);
    else if (msg.method === "Runtime.consoleAPICalled") s.console.push(`${p.type}: ${p.args.map((a) => a.value ?? a.description ?? a.type).join(" ").slice(0, 200)}`);
    else if (msg.method === "Runtime.exceptionThrown") s.exceptions.push((p.exceptionDetails.exception?.description || p.exceptionDetails.text || "").split("\n")[0]);
    else if (msg.method === "Network.requestWillBeSent") s.requests.push(p.request.url);
    else if (msg.method === "Runtime.executionContextsCleared") s.isolated = [];
    else if (msg.method === "Runtime.executionContextCreated" && p.context.auxData?.type === "isolated") s.isolated.push({ id: p.context.id, frameId: p.context.auxData.frameId });
  });
  const evaluate = async (sessionId, expression, contextId) => {
    const r = await b.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, ...(contextId ? { contextId } : {}) }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const attach = async (targetId, urlPattern) => {
    const { sessionId } = await b.send("Target.attachToTarget", { targetId, flatten: true });
    const s = { console: [], exceptions: [], requests: [], paused: [], isolated: [], frameId: null };
    sessions.set(sessionId, s);
    for (const d of ["Runtime", "Network", "Page"]) await b.send(`${d}.enable`, {}, sessionId);
    await b.send("Fetch.enable", { patterns: [{ urlPattern }] }, sessionId);
    s.frameId = (await b.send("Page.getFrameTree", {}, sessionId)).frameTree.frame.id;
    return { sessionId, s };
  };
  const navigate = async (sessionId, url, accept = [url]) => {
    await b.send("Page.navigate", { url }, sessionId);
    return waitFor(() => evaluate(sessionId, `${JSON.stringify(accept)}.includes(location.href) && document.readyState === "complete" ? location.href : null`), { label: url });
  };

  try {
    const ext = await b.send("Extensions.loadUnpacked", { path: dir });
    check("Shipped extension copy loads unpacked", /^[a-p]{32}$/.test(ext.id));
    const { targetId: controlTarget } = await b.send("Target.createTarget", { url: `chrome-extension://${ext.id}/test-fixtures/control.html` });
    const control = await attach(controlTarget, "http*");
    await waitFor(() => evaluate(control.sessionId, `document.readyState === "complete" && typeof chrome.tabs?.sendMessage === "function"`), { label: "control page" });
    const { targetId: probeTarget } = await b.send("Target.createTarget", { url: "about:blank" });
    const probe = await attach(probeTarget, "*");
    const P = probe.sessionId;

    const sendTo = (tabId, message) =>
      evaluate(control.sessionId, `chrome.tabs.sendMessage(${tabId}, ${JSON.stringify(message)}).then((r) => ({ reply: r ?? null }), (e) => ({ error: String(e && e.message).slice(0, 120) }))`);
    const detectAny = () =>
      evaluate(
        control.sessionId,
        `(async () => { for (const t of await chrome.tabs.query({})) { const r = await chrome.tabs.sendMessage(t.id, { type: "MC_DETECT", v: ${V} }).then((x) => x ?? null, () => null);
          if (r) return { tabId: t.id, d: r }; } return null; })()`
      );
    const NO_RECEIVER = /Receiving end does not exist|Could not establish connection/i;
    const mainIsolated = () => probe.s.isolated.filter((c) => c.frameId === probe.s.frameId);

    // ── The application page ──
    await navigate(P, PAGE);
    const found = await waitFor(detectAny, { timeout: 8000, label: "PMEGP detection" });
    const tabId = found.tabId;
    const det = found.d;
    check(
      "Content script runs on https://pmegp.msme.gov.in/Home/HomePage and reports PMEGP with filling off (no form, no field count)",
      det.type === "MC_DETECTION" && det.portal?.id === "pmegp" && det.portal.status === "adapter_pending_verification" && det.portal.category === "PMEGP" &&
        det.form === null && det.fieldCount === 0 && det.formFilling === "unavailable" && /^[0-9a-f]{32}$/.test(det.nonce),
      JSON.stringify(det)
    );
    const ping = await sendTo(tabId, { type: "MC_PING", v: V });
    check("The Mahabharat app content script is not on the PMEGP page (ping unanswered)", ping.reply?.type !== "MC_PONG", JSON.stringify(ping));

    const ctl = await evaluate(
      control.sessionId,
      `(async () => { const m = await import("/src/popup-controller.js"); const p = await m.probePage((msg) => chrome.tabs.sendMessage(${tabId}, msg));
        return { state: p.state, view: p.detection ? m.describePortal(p.detection) : null }; })()`
    );
    check(
      "Popup controller in the browser: PMEGP detected, preview button stays disabled, text says filling is off until verified",
      ctl.state === "portal" && ctl.view?.canPreview === false && /filling off until verified/.test(ctl.view.status) && /Filling is off/.test(ctl.view.form) && /after Aadhaar validation/.test(ctl.view.pageStatus),
      JSON.stringify(ctl)
    );

    const realm = mainIsolated().at(-1);
    const inRealm = realm
      ? await evaluate(
          P,
          `(() => { let refused = null; try { MCEngine.adapters.register(${JSON.stringify(spec)}); } catch (e) { refused = e.message; }
            const e = MCEngine.registry.byId("pmegp");
            return { adapters: MCEngine.adapters.list().length, forOrigin: MCEngine.adapters.forOrigin(location.origin), refused, status: e.status, readiness: e.readiness, scaffolds: typeof MCAdapterScaffolds }; })()`,
          realm.id
        )
      : null;
    check(
      "Content-script realm: no adapter registered, the engine refuses the PMEGP adapter, readiness shows post-validation and real-page fill unverified",
      inRealm?.adapters === 0 && inRealm.forOrigin === null && /not verified_supported/.test(inRealm.refused || "") && inRealm.status === "adapter_pending_verification" &&
        inRealm.readiness?.postValidationVerified === false && inRealm.readiness.realPageFillVerified === false && inRealm.scaffolds === "undefined",
      JSON.stringify(inRealm)
    );
    check("The page's own scripts cannot see the extension engine", (await evaluate(P, `typeof MCEngine === "undefined" && typeof chrome?.runtime?.sendMessage === "undefined"`)) === true);

    await evaluate(
      P,
      `(() => { window.__w = { submit: 0, click: 0, input: 0, change: 0, focusin: 0, keydown: 0 };
        for (const t of Object.keys(window.__w)) addEventListener(t, () => { window.__w[t] += 1; }, true);
        window.__href = location.href; window.__hist = history.length; return true; })()`
    );
    const pageState = () =>
      evaluate(
        P,
        `({ w: { ...window.__w }, sameUrl: location.href === window.__href, sameHistory: history.length === window.__hist, html: document.documentElement.outerHTML,
            values: [...document.querySelectorAll("input,select,textarea")].map((el) => el.tagName === "SELECT" ? el.selectedIndex : el.type === "radio" || el.type === "checkbox" ? el.checked : el.value),
            store: { local: localStorage.length, session: sessionStorage.length, cookie: document.cookie } })`
      );
    const before = await pageState();
    const preview = await sendTo(tabId, { type: "MC_PREVIEW", v: V, nonce: det.nonce, fields: TREE });
    const fill = await sendTo(tabId, { type: "MC_FILL", v: V, nonce: det.nonce, previewId: "a".repeat(32), approved: ["f1", "f2", "f3", "f4"], confirmed: true });
    const unconfirmed = await sendTo(tabId, { type: "MC_FILL", v: V, nonce: det.nonce, previewId: "a".repeat(32), approved: ["f1"] });
    const stale = await sendTo(tabId, { type: "MC_PREVIEW", v: V, nonce: "0".repeat(32), fields: TREE });
    const discard = await sendTo(tabId, { type: "MC_DISCARD", v: V, nonce: det.nonce });
    check("Preview refused on the real page URL while filling is off (FORM_NOT_RECOGNISED)", preview.reply?.code === "FORM_NOT_RECOGNISED", JSON.stringify(preview));
    check("Fill refused without a preview (NO_PREVIEW); a fill without confirmed: true gets no answer", fill.reply?.code === "NO_PREVIEW" && !unconfirmed.reply, JSON.stringify([fill, unconfirmed]));
    check("Wrong page nonce → STALE_PAGE; discard answered", stale.reply?.code === "STALE_PAGE" && discard.reply?.type === "MC_DISCARD");
    const after = await pageState();
    check(
      "Page untouched: same DOM, every control still as loaded, no submit, click, input, change, focus or key event, no navigation",
      after.html === before.html && JSON.stringify(after.values) === JSON.stringify(before.values) && after.values.length > 90 &&
        Object.values(after.w).every((n) => n === 0) && after.sameUrl && after.sameHistory,
      JSON.stringify({ w: after.w, controls: after.values.length })
    );
    check("No synthetic applicant value reached the page", !SYNTHETIC.some((v) => after.html.includes(v)));
    check("No page storage or cookie written", after.store.local === 0 && after.store.session === 0 && after.store.cookie === "", JSON.stringify(after.store));

    // ── Other URLs on the same tab ──
    const stillOff = async (url, name) => {
      await navigate(P, url);
      const r = await waitFor(async () => (await sendTo(tabId, { type: "MC_DETECT", v: V })).reply, { timeout: 8000, label: url }).catch(() => null);
      check(name, r?.portal?.id === "pmegp" && r.formFilling === "unavailable" && r.form === null, JSON.stringify(r));
    };
    await stillOff(`${PAGE}?lang=hi`, "Query string on the application page: content script runs (match patterns include the query); filling still off");
    await stillOff(`${HOST}/Home/HomePageArchive`, "Pattern is a prefix: /Home/HomePageArchive also matches; filling still off there");

    const absent = async (url, name, accept) => {
      const href = await navigate(P, url, accept);
      await sleep(1500);
      const r = await sendTo(tabId, { type: "MC_DETECT", v: V });
      check(name, href === url && !r.reply && NO_RECEIVER.test(r.error || "") && mainIsolated().length === 0, `${href} ${JSON.stringify(r)} isolated=${mainIsolated().length}`);
    };
    await absent(`${HOST}/`, "No content script on the PMEGP homepage");
    await absent(`${HOST}/Home/`, "No content script on /Home/");
    await absent(`${HOST}/Home/Index`, "No content script on /Home/Index");
    await absent(`${HOST}/Home/PMEGPUserManual`, "No content script on /Home/PMEGPUserManual");
    await absent(`${HOST}/home/homepage`, "No content script on /home/homepage (path match is case-sensitive)");
    await absent("https://www.pmegp.msme.gov.in/Home/HomePage", "No content script on www.pmegp.msme.gov.in (exact host)");
    await absent("https://pmegp.msme.gov.in.example.com/Home/HomePage", "No content script on a look-alike host");
    await absent("http://pmegp.msme.gov.in/Home/HomePage", "No content script over plain http", ["http://pmegp.msme.gov.in/Home/HomePage", PAGE]);

    await navigate(P, `${HOST}/Home/FrameHost`);
    await waitFor(() => evaluate(P, `document.getElementById("f").contentDocument?.readyState === "complete" && document.getElementById("f").contentDocument.querySelectorAll("input").length`), { label: "framed page" });
    await sleep(1500);
    const framed = await sendTo(tabId, { type: "MC_DETECT", v: V });
    check(
      "Application page inside a frame gets no content script (top frame only)",
      !framed.reply && NO_RECEIVER.test(framed.error || "") && probe.s.isolated.length === 0,
      `${JSON.stringify(framed)} isolated=${JSON.stringify(probe.s.isolated)}`
    );

    // ── Network, logging and storage ──
    const nonGet = probe.s.paused.filter((r) => r.method !== "GET");
    const servedHosts = [...new Set(probe.s.paused.filter((r) => r.served).map((r) => new URL(r.url).host))].sort();
    check("Every request from the test tab was a GET answered locally (none sent to the network)", probe.s.paused.length > 0 && nonGet.length === 0 && probe.s.requests.filter((u) => /^https?:/.test(u)).every((u) => probe.s.paused.some((r) => r.url === u)), JSON.stringify(nonGet));
    check("Only the stand-in pages were served; the content script made no request", JSON.stringify(servedHosts) === JSON.stringify(["pmegp.msme.gov.in", "pmegp.msme.gov.in.example.com", "www.pmegp.msme.gov.in"]) && probe.s.paused.filter((r) => !r.served).every((r) => /favicon\.ico$/.test(r.url)), JSON.stringify(probe.s.paused.filter((r) => !r.served)));
    check("Control page made no request", control.s.paused.length === 0 && control.s.requests.filter((u) => /^https?:/.test(u)).length === 0);
    check("No console output or exception in the page, the content script or the control page", [probe.s, control.s].every((s) => s.console.length === 0 && s.exceptions.length === 0), [...probe.s.console, ...probe.s.exceptions, ...control.s.console, ...control.s.exceptions].join(" | "));
    const extStore = await evaluate(control.sessionId, `(async () => ({ storage: typeof chrome.storage, local: localStorage.length, session: sessionStorage.length, idb: (await indexedDB.databases()).length }))()`);
    check("No extension storage used", extStore.storage === "undefined" && extStore.local === 0 && extStore.session === 0 && extStore.idb === 0, JSON.stringify(extStore));
  } finally {
    b.proc.kill();
    await sleep(500);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
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

/**
 * Supervised verification trial in a real browser, through the real toolbar popup, the real portal
 * content script and the real message protocol.
 *   node extension/tests/supervised-smoke.mjs --browser chrome|edge [--headed]
 *
 * The pages are the local stand-ins rendered from the sanitised GST and PMEGP public captures,
 * served on 127.0.0.1. A temporary TEST build adds one content script per stand-in origin: the
 * engine, a test-only loopback copy of the adapter that carries the registry's own supervisedTrial
 * declaration (so it runs in supervised mode), and src/portal-content.js. The shipped manifest and
 * registry are not changed: GST and PMEGP stay adapter_pending_verification, and no government
 * site is opened. Starts the real API on an in-memory MongoDB with a synthetic applicant and Vite.
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { checkTrialRecord, extRoot, loadAdapterSpec, loadEngine, loadInspector, localAdapter, localCapture, readCaptures } from "./adapter-fixture-template.mjs";
import { renderCaptureFixture } from "./capture-fixture.mjs";
import { APP, apiCall, createDriver, createReporter, findBrowser, launchBrowser, log, parseArgs, sleep, startApi, startVite, waitFor } from "./harness.mjs";

const { browserName, headed } = parseArgs();
const report = createReporter();
const { check } = report;
const read = (p) => fs.readFileSync(path.join(extRoot, p), "utf8");
const ENGINE = ["core", "registry", "adapters", "classify", "values", "preview", "protocol", "dom"];
const V = 1;
const PASSWORD = "Sup3rvised!x";
const engine = loadEngine();
const inspect = loadInspector();

const PORTALS = {
  gst: { scaffold: "gst-registration", capture: "01-part-a-public.json", formName: "GST new registration, part A" },
  pmegp: { scaffold: "pmegp-application", capture: "01-new-unit-public.json" },
};
for (const [portalId, p] of Object.entries(PORTALS)) {
  p.spec = loadAdapterSpec(p.scaffold);
  p.entry = engine.registry.byId(portalId);
  p.trial = JSON.parse(JSON.stringify(p.entry.supervisedTrial));
  p.capture = readCaptures(p.scaffold).find((c) => c.file === p.capture).capture;
  p.path = p.capture.path;
  p.selectors = p.trial.fields.map((f) => f.selector);
}

const PROFILE = {
  personal: { fullName: "Supervised Trial Applicant", fatherName: "Supervised Trial Father", dob: "2000-03-15", gender: "female", category: "general" },
  contact: { mobile: "9000000611", email: "supervised.trial@test.local" },
  permanentAddress: { line: "7 Trial Street", village: "Trialpur", tehsil: "Trial Taluka", district: "Pune", state: "Maharashtra", pincode: "411007" },
  correspondenceAddress: { line: "7 Trial Street", village: "Trialpur", tehsil: "Trial Taluka", district: "Pune", state: "Maharashtra", pincode: "411007" },
  aadhaarRef: "XXXX-XXXX-6611",
  panRef: "XXXXXX611X",
};
const SYNTHETIC = ["9000000611", "supervised.trial@test.local", "Trial Taluka", "411007", "Supervised Trial Applicant", "Trialpur"];
const MASKED = ["XXXX-XXXX-6611", "XXXXXX611X"];
const leaf = (value) => ({ status: "available", value });

function serve(portal, hits) {
  const html = renderCaptureFixture(localCapture(portal.capture, "http://127.0.0.1"));
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    hits.push(`${req.method} ${url.pathname}`);
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end();
      return;
    }
    const body = url.pathname === portal.path || url.pathname === "/other" ? html : null;
    res.writeHead(body ? 200 : 404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(body || "");
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

function buildTestExtension() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-ext-supervised-build-"));
  fs.cpSync(path.join(extRoot, "src"), path.join(dir, "src"), { recursive: true });
  fs.mkdirSync(path.join(dir, "test-fixtures"));
  const manifest = JSON.parse(read("manifest.json"));
  manifest.name = `${manifest.name} (TEST BUILD)`;
  for (const [portalId, p] of Object.entries(PORTALS)) {
    p.local = { ...localAdapter(p.spec, p.site.origin), supervisedTrial: p.trial };
    fs.writeFileSync(path.join(dir, "test-fixtures", `${portalId}-trial-adapter.js`), `globalThis.MCEngine.adapters.register(${JSON.stringify(p.local)});\n`);
    manifest.content_scripts.push({
      matches: [`${p.site.origin}/*`],
      js: [...ENGINE.map((f) => `src/engine/${f}.js`), `test-fixtures/${portalId}-trial-adapter.js`, "src/portal-content.js"],
      run_at: "document_idle",
      all_frames: false,
    });
  }
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return { dir, manifest };
}

async function startBackend() {
  const api = await startApi("mahabharat_supervised_smoke");
  const { token } = await api.createCustomer("Supervised Trial Customer", "supervised.smoke@test.local", "9000000612", PASSWORD);
  const prof = await apiCall("PUT", "/profile", { token, body: PROFILE });
  const own = await apiCall("POST", "/requests", { token, body: { serviceId: "pan-card" } });
  if (prof.status !== 200 || own.status !== 201) throw new Error(`seed failed: ${prof.status}/${own.status} ${prof.body?.message || ""}`);
  const af = await apiCall("GET", `/requests/${own.body.request.id}/autofill`, { token });
  if (af.status !== 200) throw new Error(`autofill seed check failed: ${af.status}`);
  return { ...api, requestId: own.body.request.id, autofill: af.body.autofill.fields };
}

async function main() {
  const exe = findBrowser(browserName);
  if (!exe) throw new Error(`${browserName} not found`);
  log(`\n=== Supervised verification trial (local stand-ins, real popup): ${browserName} (${headed ? "headed" : "headless"}) ===\n`);

  const hits = [];
  for (const p of Object.values(PORTALS)) p.site = await serve(p, hits);
  const build = buildTestExtension();
  const backend = await startBackend();
  const vite = await startVite();
  const F = backend.autofill;
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-ext-supervised-"));
  const b = launchBrowser(exe, profileDir, { headed });
  const { sessions, byTarget, evaluate, navigate, openTab, targets, mark, diagnostics } = createDriver(b);
  const isolated = new Map();
  b.on((msg) => {
    if (msg.method === "Runtime.executionContextCreated" && msg.params.context.auxData?.type === "isolated") isolated.set(msg.sessionId, msg.params.context.id);
    if (msg.method === "Runtime.executionContextsCleared") isolated.delete(msg.sessionId);
  });
  let currentStage = "setup";
  const stage = (name) => {
    currentStage = name;
    mark("stage", name);
  };

  try {
    // ── Change control: nothing shipped is supervised, verified or widened ──
    stage("change control");
    const shippedText = read("manifest.json");
    const shipped = JSON.parse(shippedText);
    check(
      "Shipped manifest: no permissions, host permissions exactly the Mahabharat site and the local dev site",
      JSON.stringify(shipped.permissions) === "[]" && JSON.stringify(shipped.host_permissions) === JSON.stringify(["https://www.mahabharat.net.in/*", "http://localhost:5173/*"]) && !("optional_host_permissions" in shipped) && !("optional_permissions" in shipped)
    );
    check("Shipped manifest: no loopback origin and no adapter file in any content script", !/127\.0\.0\.1/.test(shippedText) && !shipped.content_scripts.some((c) => c.js.some((f) => f.startsWith("adapters/"))));
    for (const [portalId, p] of Object.entries(PORTALS)) {
      check(
        `Registry ${portalId}: still adapter_pending_verification with no adapter; post-gate and real-page fill unverified; normal fill mode refused`,
        p.entry.status === "adapter_pending_verification" && p.entry.adapterId === null && p.entry.readiness.postValidationVerified === false && p.entry.readiness.realPageFillVerified === false &&
          engine.registry.fillMode(p.entry, p.spec) === null,
        `${p.entry.status} ${p.entry.adapterId}`
      );
    }
    check(
      "Test build keeps every shipped content script, adds one per stand-in origin only; permissions and host permissions unchanged",
      JSON.stringify(build.manifest.content_scripts.slice(0, shipped.content_scripts.length)) === JSON.stringify(shipped.content_scripts) && build.manifest.content_scripts.length === shipped.content_scripts.length + 2 &&
        build.manifest.content_scripts.slice(-2).every((c) => c.matches.length === 1 && /^http:\/\/127\.0\.0\.1:\d+\/\*$/.test(c.matches[0])) &&
        JSON.stringify(build.manifest.host_permissions) === JSON.stringify(shipped.host_permissions) && JSON.stringify(build.manifest.permissions) === JSON.stringify(shipped.permissions)
    );
    const ext = await b.send("Extensions.loadUnpacked", { path: build.dir });
    check("Test build loads unpacked", /^[a-p]{32}$/.test(ext.id));
    const POPUP = `chrome-extension://${ext.id}/src/popup.html`;

    // ── Website sign-in (first-party cookie jar) ──
    stage("website sign-in");
    const app = await openTab(`${APP}/login`);
    const login = await evaluate(
      app.sessionId,
      `fetch("/api/auth/login", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ emailOrPhone: "supervised.smoke@test.local", password: ${JSON.stringify(PASSWORD)} }) }).then((r) => r.status)`
    );
    check("Website login succeeds (first-party)", login === 200);

    const control = await openTab(POPUP);
    const gst = PORTALS.gst;
    const pmegp = PORTALS.pmegp;
    gst.tab = await openTab(`${gst.site.origin}${gst.path}`);
    pmegp.tab = await openTab(`${pmegp.site.origin}${pmegp.path}`);
    await b.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });

    // ── Helpers ──
    const send = (tabId, msg) => evaluate(control.sessionId, `chrome.tabs.sendMessage(${tabId}, ${JSON.stringify(msg)}).then((r) => r ?? null, () => null)`);
    // Without the tabs permission tab URLs are hidden, so the tab is found by the trial origin it reports.
    const tabIdOf = async (p) => {
      p.tabId ??= await waitFor(
        () =>
          evaluate(
            control.sessionId,
            `(async () => { for (const t of await chrome.tabs.query({})) {
              const r = await chrome.tabs.sendMessage(t.id, { type: "MC_TRIAL_DETECT", v: ${V} }).then((x) => x ?? null, () => null);
              if (r?.trial?.origin === ${JSON.stringify(p.site.origin)}) return t.id; } return null; })()`
          ),
        { timeout: 8000, label: `${p.scaffold} tab` }
      );
      return p.tabId;
    };
    const inContentScript = async (p, expression) => {
      const contextId = await waitFor(() => isolated.get(p.tab.sessionId), { timeout: 5000, label: "content-script context" });
      const r = await b.send("Runtime.evaluate", { expression, contextId, returnByValue: true }, p.tab.sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const load = async (p, suffix = p.path) => {
      await navigate(p.tab.sessionId, `${p.site.origin}${suffix}`);
      await waitFor(() => isolated.get(p.tab.sessionId), { timeout: 5000, label: "content script" });
      await evaluate(
        p.tab.sessionId,
        `(() => { window.__w = { submit: 0, click: 0, input: 0, change: 0, href: location.href, history: history.length };
          for (const t of ["submit", "click", "input", "change"]) addEventListener(t, () => { window.__w[t] += 1; }, true);
          return true; })()`
      );
    };
    const pageState = (p) =>
      evaluate(
        p.tab.sessionId,
        `(() => { const trial = ${JSON.stringify(p.selectors)};
          return { w: { ...window.__w, sameUrl: location.href === window.__w.href, sameHistory: history.length === window.__w.history },
            trial: trial.map((s) => document.querySelector(s)?.value ?? null),
            others: [...document.querySelectorAll("input,select,textarea")].filter((el) => !trial.some((s) => el.matches(s)))
              .map((el) => el.tagName === "SELECT" ? el.selectedIndex : el.type === "radio" || el.type === "checkbox" ? el.checked : el.value),
            html: document.documentElement.outerHTML, store: { local: localStorage.length, session: sessionStorage.length, cookie: document.cookie } }; })()`
      );
    const mutate = (p, js) => evaluate(p.tab.sessionId, `(() => { ${js}; return true; })()`);
    const expected = (p) => p.trial.fields.map((f) => f.key.split(".").reduce((o, k) => o?.[k], F)?.value);

    const readPopup = (s) =>
      evaluate(
        s,
        `(() => { const $ = (id) => document.getElementById(id); return {
          state: $("status").dataset.state, page: $("page-status").textContent, portalForm: $("portal-form").textContent, portalVerification: $("portal-verification").textContent,
          previewDisabled: $("preview-button").disabled, trialShown: !$("trial").hidden, notice: $("trial-notice").textContent,
          origin: $("trial-origin").textContent, form: $("trial-form").textContent, adapter: $("trial-adapter").textContent,
          fields: [...$("trial-fields").children].map((li) => li.textContent), startDisabled: $("trial-start").disabled, message: $("trial-message").textContent,
          previewShown: !$("trial-preview").hidden, confirm: $("trial-confirm").checked, fillDisabled: $("trial-fill").disabled,
          rows: [...$("trial-rows").rows].map((tr) => { const t = tr.querySelector("input"); return { status: tr.dataset.status, id: t.dataset.id, tickDisabled: t.disabled,
            ticked: t.checked, label: tr.cells[1].textContent, value: tr.cells[2].textContent, text: tr.cells[3].textContent }; }),
          resultShown: !$("trial-result").hidden, headline: $("trial-headline").textContent, problems: [...$("trial-problems").children].map((li) => li.textContent),
          reminder: $("trial-reminder").textContent, record: $("trial-record").textContent, href: $("trial-download").getAttribute("href") || "",
          download: $("trial-download").getAttribute("download"), normalPreviewShown: !$("preview").hidden, sent: window.__sent || null,
          text: document.body.innerText }; })()`
      );
    const popupTargets = async () => (await targets()).filter((t) => t.url.startsWith(POPUP) && t.targetId !== control.targetId);
    const openToolbarPopup = async (p) => {
      for (const t of await popupTargets()) await b.send("Target.closeTarget", { targetId: t.targetId }).catch(() => {});
      await waitFor(async () => (await popupTargets()).length === 0, { timeout: 5000, label: "previous popup to close" });
      await b.send("Target.activateTarget", { targetId: p.tab.targetId });
      await evaluate(control.sessionId, `chrome.action.openPopup().then(() => true)`);
      const t = await waitFor(async () => (await popupTargets())[0], { timeout: 8000, label: "toolbar popup" });
      const sid = await waitFor(() => byTarget.get(t.targetId), { timeout: 5000, label: "popup session" });
      await waitFor(() => evaluate(sid, `document.readyState === "complete" && !!document.getElementById("origin-select").options.length`), { label: "popup ready" });
      await evaluate(sid, `(() => { const o = document.getElementById("origin-select"); o.value = ${JSON.stringify(APP)}; o.dispatchEvent(new Event("change")); return true; })()`);
      await sleep(1200);
      await waitFor(async () => {
        const st = await readPopup(sid);
        return st.state !== "checking" && st.page !== "Checking this page…" && st.trialShown;
      }, { label: "popup to settle with the trial panel" });
      const spied = await evaluate(
        sid,
        `(() => { const real = chrome.tabs.sendMessage.bind(chrome.tabs); window.__sent = [];
          chrome.tabs.sendMessage = (tabId, m, ...rest) => { window.__sent.push({ type: m && m.type, previewId: m?.previewId ?? null, approved: m?.approved ?? null });
            return Promise.resolve(real(tabId, m, ...rest)).then((r) => { if (r && r.previewId) window.__sent.push({ reply: r.type, previewId: r.previewId }); return r; }); };
          return chrome.tabs.sendMessage !== real; })()`
      );
      if (!spied) throw new Error("could not observe the popup's page messages");
      return sid;
    };
    const selectRequest = (s) =>
      evaluate(s, `(() => { const s = document.getElementById("request-select"); s.value = ${JSON.stringify(backend.requestId)}; s.dispatchEvent(new Event("change")); return s.value; })()`);
    const click = (s, id) => evaluate(s, `document.getElementById(${JSON.stringify(id)}).click(); true`);
    const startTrial = async (s) => {
      await click(s, "trial-start");
      return waitFor(async () => {
        const st = await readPopup(s);
        return st.previewShown || (st.message && st.message !== "Preparing the trial preview…") ? st : null;
      }, { label: "trial preview" });
    };
    const setConfirm = (s, on) => evaluate(s, `(() => { const c = document.getElementById("trial-confirm"); c.checked = ${on}; c.dispatchEvent(new Event("change")); return true; })()`);
    const setTicks = (s, on) =>
      evaluate(s, `(() => { for (const t of document.querySelectorAll("#trial-rows input")) { if (t.disabled) continue; t.checked = ${on}; t.dispatchEvent(new Event("change")); } return true; })()`);
    const fillTrial = async (s) => {
      await click(s, "trial-fill");
      return waitFor(async () => {
        const st = await readPopup(s);
        return st.resultShown || (st.message && st.message !== "Filling the trial fields…") ? st : null;
      }, { timeout: 10000, label: "trial result" });
    };
    const recordOk = (p, text) => checkTrialRecord(text, { adapter: p.local, trial: p.trial, inspect });
    const noValues = (text) => ![...SYNTHETIC, ...MASKED].some((v) => text.includes(v));
    const openTrial = async (p) => {
      await load(p);
      const s = await openToolbarPopup(p);
      await selectRequest(s);
      return s;
    };

    // 1. Popup on the GST stand-in: trial panel, normal filling off
    stage("1 GST trial panel");
    await load(gst);
    const initial = await pageState(gst);
    let popup = await openToolbarPopup(gst);
    let st = await readPopup(popup);
    check("Popup connected to the local account", st.state === "connected");
    check(
      "Normal filling off: form shown as supervised trial only, normal preview disabled",
      st.portalForm === `${gst.formName} (supervised verification trial only)` && /^Normal filling is off on this page/.test(st.page) && st.previewDisabled,
      `${st.portalForm} | ${st.page}`
    );
    check(
      "Trial panel shows the exact origin, form, adapter version and declared field names",
      st.origin === gst.site.origin && st.form === `${gst.formName} (part-a)` && st.adapter === "gst-registration-local version 1.0.0" &&
        st.fields.length === 2 && st.fields.every((f, i) => f.endsWith(`(${gst.selectors[i]})`)) && /does not verify the adapter for production/.test(st.notice),
      JSON.stringify([st.origin, st.form, st.adapter, st.fields])
    );
    check("Start supervised trial disabled until a request is chosen", st.startDisabled);
    await selectRequest(popup);
    st = await readPopup(popup);
    check("Choosing a request enables Start; normal preview stays disabled", !st.startDisabled && st.previewDisabled);

    // 2. Fresh preview, explicit approval, one fill, verification record
    stage("2 GST trial pass");
    st = await startTrial(popup);
    let page = await pageState(gst);
    check(
      "Trial preview lists exactly email and mobile, both matching the captures and ready with the applicant's values",
      st.previewShown && st.rows.length === 2 && st.rows.every((r) => r.status === "ready" && r.text === "Ready" && !r.tickDisabled && r.ticked) &&
        JSON.stringify(st.rows.map((r) => r.value)) === JSON.stringify(expected(gst)) && st.rows.every((r, i) => r.label.endsWith(`(${gst.selectors[i]})`)),
      JSON.stringify(st.rows)
    );
    check("Preview message: nothing filled yet, expires in two minutes", /: nothing has been filled yet\. This preview expires in 2 minutes\.$/.test(st.message), st.message);
    check("Preview changes nothing on the page", page.html === initial.html && Object.entries(page.w).every(([k, v]) => !["submit", "click", "input", "change"].includes(k) || v === 0));
    check("Fill disabled until the confirmation is ticked", st.fillDisabled && !st.confirm);
    await setConfirm(popup, true);
    await setTicks(popup, false);
    st = await readPopup(popup);
    check("Confirmation without any ticked field keeps fill disabled", st.fillDisabled);
    await setTicks(popup, true);
    st = await readPopup(popup);
    check("Confirmation and ticked fields enable fill", !st.fillDisabled);
    st = await fillTrial(popup);
    page = await pageState(gst);
    check("Trial result: passed, adapter still not enabled for normal filling", st.resultShown && st.headline === "Supervised trial passed. The adapter is still not enabled for normal filling." && st.problems.length === 0, st.headline || st.message);
    check("Reminder: the applicant does CAPTCHA, OTP, Proceed, declarations, payment and submission", /CAPTCHA, OTP, Proceed, declarations, uploads, payment and final submission yourself/.test(st.reminder));
    check("Email and mobile hold the approved values", JSON.stringify(page.trial) === JSON.stringify(expected(gst)), JSON.stringify(page.trial));
    check("Every other control is exactly as the page loaded it", JSON.stringify(page.others) === JSON.stringify(initial.others) && page.others.length > 0);
    check("No submit, no click, no navigation; input/change events dispatched", page.w.submit === 0 && page.w.click === 0 && page.w.sameUrl && page.w.sameHistory && page.w.input >= 2 && page.w.change >= 2, JSON.stringify(page.w));
    const record = JSON.parse(st.record);
    check("Verification record is a valid popup export (checkTrialRecord)", recordOk(gst, st.record).length === 0, recordOk(gst, st.record).join("; "));
    check(
      "Record: adapter, version, origin, form, fields tested, editable/approved/filled, page unchanged, pass, timestamp",
      record.adapterId === "gst-registration-local" && record.adapterVersion === "1.0.0" && record.origin === gst.site.origin && record.form === "part-a" &&
        JSON.stringify(record.fields) === JSON.stringify(gst.trial.fields.map((f) => ({ selector: f.selector, key: f.key, editable: true, approved: true, filled: true }))) &&
        record.pageChanged === false && record.result === "pass" && Math.abs(Date.parse(record.recordedAt) - Date.now()) < 60000,
      st.record
    );
    check("Record and popup result hold no applicant value, masked identity, nonce, preview id or request id", noValues(st.record) && !/[0-9a-f]{32}/.test(st.record) && !st.record.includes(backend.requestId));
    check("Record is offered as a download link the applicant clicks (not saved automatically)", /^blob:chrome-extension:\/\//.test(st.href) && st.download === "supervised-trial.json");
    check(
      "Popup sent only a trial preview and one trial fill (no normal preview or fill, no other message)",
      JSON.stringify(st.sent.filter((m) => m.type).map((m) => m.type)) === JSON.stringify(["MC_TRIAL_PREVIEW", "MC_TRIAL_FILL"]),
      JSON.stringify(st.sent)
    );
    const usedPreview = st.sent.find((m) => m.reply === "MC_TRIAL_PREVIEW_RESULT")?.previewId;
    const gstTabId = await tabIdOf(gst);
    let det = await send(gstTabId, { type: "MC_DETECT", v: V });
    const replay = await send(gstTabId, { type: "MC_TRIAL_FILL", v: V, nonce: det.nonce, previewId: usedPreview, approved: [st.sent.find((m) => m.type === "MC_TRIAL_FILL").approved[0]], confirmed: true });
    check("Replaying the used trial preview → NO_PREVIEW", replay?.code === "NO_PREVIEW", JSON.stringify(replay));

    // 3. Cancellation
    stage("3 cancel");
    popup = await openTrial(gst);
    const cancelBase = await pageState(gst);
    st = await startTrial(popup);
    await click(popup, "trial-cancel");
    st = await waitFor(async () => {
      const x = await readPopup(popup);
      return x.message === "Trial cancelled. Nothing was filled." && x.sent.some((m) => m.type === "MC_DISCARD") ? x : null;
    }, { label: "cancel" });
    check("Cancel trial: preview closed at once, page told to drop it, nothing filled", !st.previewShown && st.fillDisabled && (await pageState(gst)).html === cancelBase.html);
    det = await send(gstTabId, { type: "MC_DETECT", v: V });
    const cancelled = st.sent.find((m) => m.reply === "MC_TRIAL_PREVIEW_RESULT").previewId;
    const afterCancel = await send(gstTabId, { type: "MC_TRIAL_FILL", v: V, nonce: det.nonce, previewId: cancelled, approved: ["f1"], confirmed: true });
    check("The cancelled preview cannot be used (NO_PREVIEW); page untouched", afterCancel?.code === "NO_PREVIEW" && (await pageState(gst)).html === cancelBase.html, JSON.stringify(afterCancel));
    st = await startTrial(popup);
    await selectRequest(popup);
    st = await waitFor(async () => {
      const x = await readPopup(popup);
      return x.sent.filter((m) => m.type === "MC_DISCARD").length === 2 ? x : null;
    }, { label: "cancel on request change" });
    check("Changing the request cancels a running trial", !st.previewShown && st.fillDisabled);

    // 4. Popup-side expiry (no message reaches the page)
    stage("4 popup expiry");
    popup = await openTrial(gst);
    const expiryBase = await pageState(gst);
    st = await startTrial(popup);
    await setConfirm(popup, true);
    await evaluate(popup, `(() => { const real = Date.now; Date.now = () => real() + 3 * 60 * 1000; return true; })()`);
    st = await fillTrial(popup);
    check(
      "A preview older than two minutes is refused in the popup; no fill message sent; page untouched",
      !st.resultShown && /expired/i.test(st.message) && !st.sent.some((m) => m.type === "MC_TRIAL_FILL") && (await pageState(gst)).html === expiryBase.html,
      st.message
    );

    // 5. A field read-only before the preview is rejected and cannot be ticked
    stage("5 rejected before preview");
    popup = await openTrial(gst);
    await mutate(gst, `document.getElementById("mobile").readOnly = true`);
    st = await startTrial(popup);
    check(
      "Read-only mobile → rejected row, tick disabled; email still ready",
      st.rows[0].status === "ready" && st.rows[1].status === "rejected" && st.rows[1].tickDisabled && !st.rows[1].ticked && st.rows[1].text === "Rejected: Read-only" && st.rows[1].value === "—",
      JSON.stringify(st.rows)
    );
    await setConfirm(popup, true);
    st = await fillTrial(popup);
    page = await pageState(gst);
    check(
      "Partial trial fails and says why; only email filled; record valid and failing",
      /^Supervised trial failed/.test(st.headline) && st.problems.some((m) => /not part of this trial/.test(m)) && page.trial[0] === expected(gst)[0] && page.trial[1] === "" &&
        recordOk(gst, st.record).length === 0 && JSON.parse(st.record).result === "fail" && noValues(st.record),
      `${st.headline} ${st.problems.join(" | ")}`
    );

    // 6. The page changes between preview and fill
    stage("6 changed after preview");
    popup = await openTrial(gst);
    st = await startTrial(popup);
    await mutate(gst, `document.querySelector('label[for="email"]').textContent = "Alternate Email Address"`);
    await setConfirm(popup, true);
    st = await fillTrial(popup);
    page = await pageState(gst);
    check(
      "Field relabelled after preview: nothing filled, trial fails with 'page changed', record valid",
      /^Supervised trial failed/.test(st.headline) && st.problems.includes("The page changed during the trial.") && st.problems.some((m) => /^Mobile Number: not filled because the page changed$/.test(m)) &&
        page.trial.every((v) => v === "") &&
        recordOk(gst, st.record).length === 0 && JSON.parse(st.record).pageChanged === true,
      `${st.headline} ${st.problems.join(" | ")}`
    );

    // 7. Protocol-level matrix against the content script
    stage("7 protocol matrix");
    const tree = (contact = {}) => ({ contact: { mobile: leaf(PROFILE.contact.mobile), email: leaf(PROFILE.contact.email), ...contact } });
    const fresh = async (p, js = null) => {
      await load(p);
      if (js) await mutate(p, js);
      const tabId = await tabIdOf(p);
      const d = await send(tabId, { type: "MC_DETECT", v: V });
      return { tabId, nonce: d.nonce, d };
    };
    const trialPreview = (c, fields = tree()) => send(c.tabId, { type: "MC_TRIAL_PREVIEW", v: V, nonce: c.nonce, fields });
    const trialFill = (c, previewId, approved) => send(c.tabId, { type: "MC_TRIAL_FILL", v: V, nonce: c.nonce, previewId, approved, confirmed: true });
    const readyIds = (pv) => pv.fields.filter((f) => f.status === "ready").map((f) => f.id);

    let c = await fresh(gst);
    const info = await send(c.tabId, { type: "MC_TRIAL_DETECT", v: V });
    check(
      "Detection: supervised portal reports no form and filling unavailable; trial info carries the declared trial and the same nonce",
      c.d.form === null && c.d.formFilling === "unavailable" && c.d.portal.status === "test_fixture" && info?.type === "MC_TRIAL_INFO" && info.nonce === c.nonce &&
        JSON.stringify(info.trial.fields.map((f) => f.selector)) === JSON.stringify(gst.selectors) && info.trial.adapterVersion === "1.0.0" && info.trial.form.id === "part-a",
      JSON.stringify([c.d, info])
    );
    const normal = await send(c.tabId, { type: "MC_PREVIEW", v: V, nonce: c.nonce, fields: tree() });
    const normalFill = await send(c.tabId, { type: "MC_FILL", v: V, nonce: c.nonce, previewId: "a".repeat(32), approved: ["f1"], confirmed: true });
    check("Normal preview refused on a supervised adapter (FORM_NOT_RECOGNISED); normal fill has no preview", normal?.code === "FORM_NOT_RECOGNISED" && normalFill?.code === "NO_PREVIEW");
    const realm = await inContentScript(
      gst,
      `(() => { const out = {}; const a = MCEngine.adapters.forOrigin(location.origin);
        out.mode = a.mode; out.trial = MCEngine.adapters.trialFor(a).fields.map((f) => f.selector);
        try { MCEngine.adapters.register(${JSON.stringify(gst.spec)}); out.production = "registered"; } catch (e) { out.production = e.message; }
        const wider = ${JSON.stringify({ ...gst.local, id: "gst-wider-local", origins: ["http://127.0.0.1:1"], supervisedTrial: { ...gst.trial, fields: [...gst.trial.fields, { ...gst.trial.fields[0], selector: "#pan", key: "identity.panMasked" }] } })};
        try { MCEngine.adapters.register(wider); out.wider = "registered"; } catch (e) { out.wider = e.message; }
        const moded = ${JSON.stringify({ ...gst.local, id: "gst-moded-local", origins: ["http://127.0.0.1:2"], mode: "production" })};
        try { MCEngine.adapters.register(moded); out.moded = "registered"; } catch (e) { out.moded = e.message; }
        out.entry = MCEngine.registry.byId("gst").status; return out; })()`
    );
    check(
      "Content-script realm: the stand-in adapter is supervised for exactly email and mobile; the production GST adapter is refused (registry not verified)",
      realm.mode === "supervised" && JSON.stringify(realm.trial) === JSON.stringify(gst.selectors) && /not verified_supported/.test(realm.production) && realm.entry === "adapter_pending_verification",
      JSON.stringify(realm)
    );
    check("A trial wider than the adapter's mappings, or a spec that sets its own mode, is refused", /does not match this adapter/.test(realm.wider) && /engine decides an adapter's mode/.test(realm.moded), JSON.stringify(realm));

    const MUTATIONS = [
      ["hidden", `document.getElementById("mobile").closest("div").hidden = true`, "hidden"],
      ["disabled", `document.getElementById("mobile").disabled = true`, "disabled"],
      ["read-only", `document.getElementById("mobile").readOnly = true`, "read_only"],
      ["relabelled", `document.querySelector('label[for="mobile"]').textContent = "Alternate Mobile Number"`, "changed"],
      ["maximum length changed", `document.getElementById("mobile").maxLength = 12`, "changed"],
      ["type changed", `document.getElementById("mobile").type = "tel"`, "changed"],
      ["OTP placeholder", `document.getElementById("mobile").placeholder = "Enter OTP sent to this number"`, "protected"],
      ["a second element with the same id", `const x = document.getElementById("mobile").cloneNode(); document.getElementById("mobile").after(x)`, "ambiguous"],
      ["removed", `document.getElementById("mobile").remove()`, "absent"],
    ];
    for (const [what, js, want] of MUTATIONS) {
      c = await fresh(gst, js);
      const before = await pageState(gst);
      const pv = await trialPreview(c);
      const m = pv?.fields?.[1];
      const fillMobile = m?.id ? await trialFill(c, pv.previewId, [m.id]) : null;
      check(
        `Mobile ${what} → ${want}, no value offered, cannot be approved; email still ready; nothing filled`,
        m?.check === want && m.status === "rejected" && m.display === null && pv.fields[0].status === "ready" && (m.id === null || fillMobile?.code === "BAD_REQUEST") &&
          (await pageState(gst)).html === before.html,
        JSON.stringify([m, fillMobile])
      );
    }

    c = await fresh(gst);
    let pv = await trialPreview(c);
    const unknownId = await trialFill(c, pv.previewId, ["f999"]);
    pv = await trialPreview(c);
    const mixed = await trialFill(c, pv.previewId, [...readyIds(pv), "f999"]);
    check("Approving an id outside the ready trial fields → BAD_REQUEST, nothing filled (even mixed with ready ids)", unknownId?.code === "BAD_REQUEST" && mixed?.code === "BAD_REQUEST" && (await pageState(gst)).trial.every((v) => v === ""));
    const mixedReplay = await trialFill(c, pv.previewId, readyIds(pv));
    check("A refused trial fill still consumes the preview (replay → NO_PREVIEW)", mixedReplay?.code === "NO_PREVIEW");

    const changedAfter = [
      ["locked after preview", `document.getElementById("email").readOnly = true`],
      ["a field added after preview", `const i = document.createElement("input"); i.id = "added_after"; document.querySelector("form").append(i)`],
      ["hidden after preview", `document.getElementById("email").closest("div").hidden = true`],
    ];
    for (const [what, js] of changedAfter) {
      c = await fresh(gst);
      pv = await trialPreview(c);
      await mutate(gst, js);
      const r = await trialFill(c, pv.previewId, readyIds(pv));
      check(
        `Page ${what}: every field skipped as form_changed, pageChanged, trial failed`,
        r?.summary?.filled === 0 && r.results.every((x) => x.reason === "form_changed") && r.evidence.pageChanged === true && r.evidence.passed === false && (await pageState(gst)).trial.every((v) => v === ""),
        JSON.stringify(r?.evidence)
      );
    }

    c = await fresh(gst, `const m = document.getElementById("mobile"); m.addEventListener("change", () => setTimeout(() => { m.value = ""; }, 50))`);
    pv = await trialPreview(c);
    let r = await trialFill(c, pv.previewId, readyIds(pv));
    check(
      "The page clears a filled value straight away → that field not filled, trial failed",
      r?.evidence?.fields?.[0]?.filled === true && r.evidence.fields[1].filled === false && r.evidence.passed === false && r.evidence.pageChanged === false,
      JSON.stringify(r?.evidence)
    );
    c = await fresh(gst, `document.getElementById("email").addEventListener("change", () => { const i = document.createElement("input"); i.id = "appeared"; document.querySelector("form").append(i); })`);
    pv = await trialPreview(c);
    r = await trialFill(c, pv.previewId, readyIds(pv));
    check("The page adds a field in reaction to the fill → pageChanged, trial failed", r?.evidence?.pageChanged === true && r.evidence.passed === false, JSON.stringify(r?.evidence));

    c = await fresh(gst);
    pv = await trialPreview(c);
    await inContentScript(gst, `(() => { const real = Date.now.bind(Date); Date.__real = real; Date.now = () => real() + 3 * 60 * 1000; return true; })()`);
    const expired = await trialFill(c, pv.previewId, readyIds(pv));
    await inContentScript(gst, `(() => { Date.now = Date.__real; delete Date.__real; return true; })()`);
    const afterExpiry = await trialFill(c, pv.previewId, readyIds(pv));
    check("Trial preview older than two minutes → PREVIEW_EXPIRED, nothing filled; it cannot be used afterwards", expired?.code === "PREVIEW_EXPIRED" && afterExpiry?.code === "NO_PREVIEW" && (await pageState(gst)).trial.every((v) => v === ""));

    await inContentScript(gst, `(() => { const real = setTimeout; globalThis.__realSetTimeout = real; globalThis.setTimeout = (fn, ms, ...a) => real(fn, ms > 60000 ? 50 : ms, ...a); return true; })()`);
    pv = await trialPreview(c);
    await inContentScript(gst, `(() => { globalThis.setTimeout = globalThis.__realSetTimeout; delete globalThis.__realSetTimeout; return true; })()`);
    await sleep(2000); // background tabs run timers at most once a second
    const dropped = await trialFill(c, pv.previewId, readyIds(pv));
    check("Once the trial lifetime passes, its values are dropped from the page (PREVIEW_EXPIRED without any clock change)", dropped?.code === "PREVIEW_EXPIRED" && (await pageState(gst)).trial.every((v) => v === ""), JSON.stringify(dropped));

    pv = await trialPreview(c);
    const discard = await send(c.tabId, { type: "MC_DISCARD", v: V, nonce: c.nonce });
    const afterDiscard = await trialFill(c, pv.previewId, readyIds(pv));
    check("Discard drops the trial preview at once (NO_PREVIEW afterwards)", discard?.type === "MC_DISCARD" && afterDiscard?.code === "NO_PREVIEW");
    const first = await trialPreview(c);
    const second = await trialPreview(c);
    const superseded = await trialFill(c, first.previewId, readyIds(first));
    check("A newer trial preview replaces the older one (older → NO_PREVIEW)", superseded?.code === "NO_PREVIEW" && second.previewId !== first.previewId);
    const normalAfter = await send(c.tabId, { type: "MC_PREVIEW", v: V, nonce: c.nonce, fields: tree() });
    const stillThere = await trialFill(c, second.previewId, readyIds(second));
    check("A refused normal preview does not disturb the trial preview", normalAfter?.code === "FORM_NOT_RECOGNISED" && stillThere?.summary?.filled === 2);

    c = await fresh(gst);
    pv = await trialPreview(c, tree({ mobile: { status: "missing", value: null }, email: { status: "invalid", value: null } }));
    const missingFill = await trialFill(c, pv.previewId, pv.fields.map((f) => f.id));
    check(
      "Missing mobile and invalid email: matched fields offered no value; approving them → BAD_REQUEST",
      pv.fields[0].check === "ok" && pv.fields[0].status === "invalid" && pv.fields[1].check === "ok" && pv.fields[1].status === "missing" && pv.fields.every((f) => f.display === null) && missingFill?.code === "BAD_REQUEST",
      JSON.stringify(pv.fields)
    );
    pv = await trialPreview(c, tree({ mobile: leaf("+91 90000 00611") }));
    check("A value longer than the captured maximum length → too_long, not offered", pv.fields[1].status === "too_long" && pv.fields[1].display === null);
    const hex = "0123456789abcdef0123456789abcdef";
    const malformed = {
      stalePreview: await send(c.tabId, { type: "MC_TRIAL_PREVIEW", v: V, nonce: hex, fields: tree() }),
      staleFill: await send(c.tabId, { type: "MC_TRIAL_FILL", v: V, nonce: hex, previewId: hex, approved: ["f1"], confirmed: true }),
      extraKey: await send(c.tabId, { type: "MC_TRIAL_PREVIEW", v: V, nonce: c.nonce, fields: tree(), submit: true }),
      sourceKey: await send(c.tabId, { type: "MC_TRIAL_PREVIEW", v: V, nonce: c.nonce, fields: { contact: { email: { status: "available", value: "x@test.local", source: "profile" } } } }),
      noConfirm: await send(c.tabId, { type: "MC_TRIAL_FILL", v: V, nonce: c.nonce, previewId: hex, approved: ["f1"] }),
      textConfirm: await send(c.tabId, { type: "MC_TRIAL_FILL", v: V, nonce: c.nonce, previewId: hex, approved: ["f1"], confirmed: "true" }),
      noneApproved: await send(c.tabId, { type: "MC_TRIAL_FILL", v: V, nonce: c.nonce, previewId: hex, approved: [], confirmed: true }),
      duplicate: await send(c.tabId, { type: "MC_TRIAL_FILL", v: V, nonce: c.nonce, previewId: hex, approved: ["f1", "f1"], confirmed: true }),
      selectorApproved: await send(c.tabId, { type: "MC_TRIAL_FILL", v: V, nonce: c.nonce, previewId: hex, approved: ["#email"], confirmed: true }),
      wrongVersion: await send(c.tabId, { type: "MC_TRIAL_DETECT", v: 2 }),
      detectExtra: await send(c.tabId, { type: "MC_TRIAL_DETECT", v: V, nonce: c.nonce }),
      submitType: await send(c.tabId, { type: "MC_SUBMIT", v: V, nonce: c.nonce }),
      proceedType: await send(c.tabId, { type: "MC_TRIAL_PROCEED", v: V, nonce: c.nonce }),
    };
    check("Stale page nonce → STALE_PAGE for trial preview and fill", malformed.stalePreview?.code === "STALE_PAGE" && malformed.staleFill?.code === "STALE_PAGE");
    check(
      "Malformed trial messages are ignored (extra keys, source key, no or text confirmation, empty or duplicate approval, selector as id, wrong version)",
      ["extraKey", "sourceKey", "noConfirm", "textConfirm", "noneApproved", "duplicate", "selectorApproved", "wrongVersion", "detectExtra"].every((k) => malformed[k] === null),
      JSON.stringify(malformed)
    );
    check("No submit or proceed message exists (MC_SUBMIT, MC_TRIAL_PROCEED ignored)", malformed.submitType === null && malformed.proceedType === null);
    check("Nothing filled by any rejected message", (await pageState(gst)).trial.every((v) => v === ""));

    await load(gst, "/other");
    c = { tabId: gstTabId, nonce: (await send(gstTabId, { type: "MC_DETECT", v: V })).nonce };
    const otherInfo = await send(c.tabId, { type: "MC_TRIAL_DETECT", v: V });
    const otherPv = await trialPreview(c);
    check("Same adapter origin, unrecognised page: no trial offered, trial preview → FORM_NOT_RECOGNISED", otherInfo?.trial === null && otherPv?.code === "FORM_NOT_RECOGNISED", JSON.stringify(otherInfo));
    const pageWorld = await evaluate(gst.tab.sessionId, `(() => { window.postMessage({ type: "MC_TRIAL_FILL", v: 1, approved: ["f1"], confirmed: true }, "*"); return { api: typeof window.chrome?.runtime?.sendMessage, engine: typeof MCEngine }; })()`);
    check("The page's own scripts cannot reach the extension or its engine", pageWorld.api === "undefined" && pageWorld.engine === "undefined");

    // 8. PMEGP: the four mapped communication-address fields, through the popup
    stage("8 PMEGP trial");
    await load(pmegp);
    const pInitial = await pageState(pmegp);
    popup = await openToolbarPopup(pmegp);
    st = await readPopup(popup);
    check(
      "PMEGP popup: normal preview disabled; trial lists the four communication fields in order",
      st.previewDisabled && st.form === "PMEGP application for new unit (new-unit)" && st.adapter === "pmegp-application-local version 1.0.0" &&
        st.fields.length === 4 && st.fields.every((f, i) => f.endsWith(`(${pmegp.selectors[i]})`)),
      JSON.stringify([st.form, st.adapter, st.fields])
    );
    await selectRequest(popup);
    st = await startTrial(popup);
    check(
      "PMEGP trial preview: four ready rows with the applicant's values",
      st.rows.length === 4 && st.rows.every((x) => x.status === "ready") && JSON.stringify(st.rows.map((x) => x.value)) === JSON.stringify(expected(pmegp)),
      JSON.stringify(st.rows.map((x) => [x.status, x.text, x.value]))
    );
    await setConfirm(popup, true);
    st = await fillTrial(popup);
    page = await pageState(pmegp);
    check("PMEGP trial passed; the four fields hold the approved values", /^Supervised trial passed/.test(st.headline) && JSON.stringify(page.trial) === JSON.stringify(expected(pmegp)), `${st.headline} ${JSON.stringify(page.trial)}`);
    check("PMEGP: every other control (Aadhaar, OTP, CAPTCHA, lists, declarations) is exactly as loaded", JSON.stringify(page.others) === JSON.stringify(pInitial.others) && page.others.length > 20);
    check("PMEGP: no submit, no click, no navigation", page.w.submit === 0 && page.w.click === 0 && page.w.sameUrl && page.w.sameHistory, JSON.stringify(page.w));
    check("PMEGP record valid, passing, without values", recordOk(pmegp, st.record).length === 0 && JSON.parse(st.record).result === "pass" && noValues(st.record), recordOk(pmegp, st.record).join("; "));

    // 9. Leakage, storage, logging, network
    stage("9 leakage / storage / network");
    for (const p of [gst, pmegp]) {
      const s = await pageState(p);
      check(`${p.scaffold} stand-in: no masked identity value reached the page; no page storage or cookie`, !MASKED.some((m) => s.html.includes(m)) && s.store.local === 0 && s.store.session === 0 && s.store.cookie === "", JSON.stringify(s.store));
      const reqs = sessions.get(p.tab.sessionId).requests.filter((x) => x.type !== "Document" && !x.url.startsWith("data:") && !x.url.endsWith("/favicon.ico"));
      check(`${p.scaffold} stand-in tab made no requests besides page loads (content script is offline)`, reqs.length === 0, reqs.map((x) => `${x.method} ${x.url}`).join(" | "));
    }
    check("Stand-in servers received GETs only (nothing submitted)", hits.every((h) => h.startsWith("GET ")), hits.filter((h) => !h.startsWith("GET ")).join(" "));
    const stored = await evaluate(popup, `(async () => ({ storage: typeof chrome.storage, cookies: typeof chrome.cookies, downloads: typeof chrome.downloads, local: localStorage.length, session: sessionStorage.length, idb: (await indexedDB.databases()).length }))()`);
    check("No extension storage, cookies or downloads API; nothing stored", stored.storage === "undefined" && stored.cookies === "undefined" && stored.downloads === "undefined" && stored.local === 0 && stored.session === 0 && stored.idb === 0, JSON.stringify(stored));
    const isWebsite = (s) => s.targetId === app.targetId || s.url.startsWith(APP) || s.url.startsWith(`blob:${APP}`);
    const noisy = [...sessions.values()].filter((s) => !isWebsite(s) && (s.console > 0 || s.exceptions > 0)).map((s) => `${s.url || s.targetId}: ${s.logs.join(" | ")}`);
    check("No console output or uncaught exceptions in popups, content scripts or pages", noisy.length === 0, noisy.join(" || "));
    const logs = [...sessions.values()].flatMap((s) => s.logs).join("\n");
    check("No applicant value in any captured log", noValues(logs));
  } catch (e) {
    log(`  FATAL during stage "${currentStage}": ${e.message}`);
    for (const line of diagnostics()) log(`    ${line}`);
    e.reported = true;
    throw e;
  } finally {
    await b.send("Target.setAutoAttach", { autoAttach: false, waitForDebuggerOnStart: false, flatten: true }).catch(() => {});
    b.proc.kill();
    vite?.kill();
    for (const p of Object.values(PORTALS)) p.site?.server.close();
    await backend.shutdown();
    await sleep(1000);
    fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    fs.rmSync(build.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
}

main()
  .catch((e) => {
    report.failed += 1;
    if (!e.reported) log(`  FATAL ${e.message}`);
  })
  .finally(() => {
    log(`\n=== Results (${browserName}): ${report.passed} passed, ${report.failed} failed ===\n`);
    process.exit(report.failed ? 1 : 0);
  });

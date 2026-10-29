/**
 * Real-browser end-to-end test of the universal form engine against LOCAL mock government forms.
 *   node extension/tests/portal-smoke.mjs --browser chrome|edge [--headed]
 *
 * - Builds a temporary TEST copy of the extension whose manifest adds one content script for the
 *   mock origin http://127.0.0.1:47811 (engine + tests/fixtures/mock-adapter.js + portal-content.js).
 *   The shipped manifest is never modified and has no portal content script.
 * - Starts the real API on an in-memory MongoDB with a synthetic applicant, Vite, the mock portal
 *   (adapter origin) and a second "unknown portal" origin, then drives the real toolbar popup.
 * - No real government site is contacted; production Mahabharat is blocked inside the browser.
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

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
const MOCK_PORT = 47811;
const MOCK = `http://127.0.0.1:${MOCK_PORT}`;
const PASSWORD = "P0rtalSmoke!x";
const fixtures = path.join(extDir, "tests", "fixtures");
const ENGINE = ["core", "registry", "adapters", "classify", "values", "preview", "protocol", "dom"];
const SECRETS = ["XXXX-XXXX-1234", "XXXXXX234F", "SYN-EXAM-7731", "SYN-ROLL-0042"]; // must never reach a page
const report = createReporter();
const { check } = report;

const PROFILE = {
  personal: {
    fullName: "Synthetic Applicant Kumar",
    fatherName: "Synthetic Father Kumar",
    dob: "2001-04-09",
    gender: "male",
    category: "obc",
    religion: "Synthetic Faith",
    maritalStatus: "unmarried",
    nationality: "Indian",
  },
  contact: { mobile: "9000000201", email: "synthetic.applicant@test.local" },
  permanentAddress: { line: "12 Test Lane", village: "Testpur", tehsil: "Test Tehsil", district: "Pune", state: "Maharashtra", pincode: "411001" },
  correspondenceAddress: { line: "12 Test Lane", village: "Testpur", tehsil: "Test Tehsil", district: "Pune", state: "Maharashtra", pincode: "411001" },
  education: {
    tenth: { board: "Synthetic State Board", rollNumber: "T10-001", passingYear: 2017, percentage: 82.5 },
    twelfth: { board: "Synthetic Higher Board", rollNumber: "T12-002", passingYear: 2019, percentage: 76 },
  },
  exams: [{ examName: "Synthetic Exam", applicationNumber: "SYN-EXAM-7731", rollNumber: "SYN-ROLL-0042", examCentre: "Test Centre", examDate: "2026-12-01" }],
  aadhaarRef: "XXXX-XXXX-1234",
  panRef: "XXXXXX234F",
};

// ── Test build of the extension (temporary directory) ────────────
function buildTestExtension() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-ext-portal-build-"));
  fs.cpSync(path.join(extDir, "src"), path.join(dir, "src"), { recursive: true });
  fs.mkdirSync(path.join(dir, "test-fixtures"));
  fs.copyFileSync(path.join(fixtures, "mock-adapter.js"), path.join(dir, "test-fixtures", "mock-adapter.js"));
  const manifest = JSON.parse(fs.readFileSync(path.join(extDir, "manifest.json"), "utf8"));
  manifest.name = `${manifest.name} (TEST BUILD)`;
  manifest.content_scripts.push({
    matches: [`${MOCK}/*`],
    js: [...ENGINE.map((f) => `src/engine/${f}.js`), "test-fixtures/mock-adapter.js", "src/portal-content.js"],
    run_at: "document_idle",
    all_frames: false,
  });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return { dir, manifest };
}

// ── Local fixture servers ────────────────────────────────────────
function startFixtureServer(port) {
  const files = {
    "/register": [path.join(fixtures, "mock-portal", "register.html"), "text/html"],
    "/status": [path.join(fixtures, "mock-portal", "status.html"), "text/html"],
    "/lab": [path.join(fixtures, "engine-lab.html"), "text/html"],
    "/fixtures/engine-lab.js": [path.join(fixtures, "engine-lab.js"), "text/javascript"],
    ...Object.fromEntries(ENGINE.map((f) => [`/engine/${f}.js`, [path.join(extDir, "src", "engine", `${f}.js`), "text/javascript"]])),
  };
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.method);
    const p = new URL(req.url, "http://x").pathname;
    if (req.method !== "GET" || !files[p]) {
      res.writeHead(req.method !== "GET" ? 405 : 404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": `${files[p][1]}; charset=utf-8`, "Cache-Control": "no-store" });
    res.end(fs.readFileSync(files[p][0]));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve({ server, hits, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function startBackend() {
  const api = await startApi("mahabharat_portal_smoke");
  const { ServiceRequest } = api.models;
  const { token: t1 } = await api.createCustomer("Portal Test Customer", "portal.smoke1@test.local", "9000000211", PASSWORD);
  const { token: t2 } = await api.createCustomer("Other Portal Customer", "portal.smoke2@test.local", "9000000212", PASSWORD);
  const prof = await apiCall("PUT", "/profile", { token: t1, body: PROFILE });
  const own = await apiCall("POST", "/requests", { token: t1, body: { serviceId: "pan-card" } });
  const closed = await apiCall("POST", "/requests", { token: t1, body: { serviceId: "pan-card" } });
  const foreign = await apiCall("POST", "/requests", { token: t2, body: { serviceId: "pan-card" } });
  if (prof.status !== 200 || own.status !== 201 || closed.status !== 201 || foreign.status !== 201) {
    throw new Error(`seed failed: ${prof.status}/${own.status}/${closed.status}/${foreign.status} ${prof.body?.message || ""}`);
  }
  await ServiceRequest.updateOne({ _id: own.body.request.id }, { $set: { "applicantDetails.referenceNumber": "REF-SYN-0001" } });
  await ServiceRequest.updateOne({ _id: closed.body.request.id }, { $set: { status: "delivered" } });
  const af = await apiCall("GET", `/requests/${own.body.request.id}/autofill`, { token: t1 });
  if (af.status !== 200) throw new Error(`autofill seed check failed: ${af.status}`);
  return { ...api, ids: { own: own.body.request.id, closed: closed.body.request.id, foreign: foreign.body.request.id }, autofill: af.body.autofill.fields };
}

// Expected first preview, in document order: [label prefix, status].
const EXPECTED_FIRST = [
  ["Name of the Candidate", "ready"], ["Father's Name", "ready"], ["Mother's Name", "missing"], ["Date of Birth", "ready"], ["Gender", "ready"],
  ["Category", "ready"], ["Marital Status", "ready"], ["Religion", "ready"], ["Nationality", "ready"], ["Nominee Name", "low_confidence"],
  ["Mobile Number", "ready"], ["Confirm Mobile Number", "confirmation"], ["Email ID", "ready"],
  ["House No. / Street", "ready"], ["Village / Town", "ready"], ["Tehsil", "ready"], ["State", "ready"], ["District", "no_matching_option"], ["PIN Code", "ready"],
  ["Correspondence address same as permanent address", "ready"],
  ["House No. / Street", "ready"], ["Village / Town", "ready"], ["Tehsil", "ready"], ["District", "ready"], ["State", "ready"], ["PIN Code", "ready"],
  ["Board / University", "ready"], ["Roll Number", "ready"], ["Year of Passing", "ready"], ["Percentage", "ready"],
  ["Board / University", "ready"], ["Roll Number", "ready"], ["Year of Passing", "ready"], ["Percentage", "ready"],
  ["Board / University", "missing"], ["Roll Number", "missing"], ["Year of Passing", "missing"], ["Percentage", "missing"],
  ["Mobile No.", "duplicate"], ["Your reference", "ready"], ["Application Number", "locked"], ["Aadhaar Number", "identity_manual"], ["PAN", "identity_manual"],
  ["Upload Photograph", "document"], ["Security answer", "protected"], ["Create Password", "protected"], ["Enter OTP", "protected"], ["UPI ID for fee", "protected"],
  ["Additional remarks", "unsupported"], ["Height in cm", "unsupported"], ["Preferred exam centres", "unsupported"],
  ["Enter the text in the image", "protected"], ["I hereby declare", "protected"],
];

async function main() {
  const exe = findBrowser(browserName);
  if (!exe) throw new Error(`${browserName} not found`);
  log(`\n=== Portal engine E2E (local mock forms): ${browserName} (${headed ? "headed" : "headless"}) ===\n`);

  const build = buildTestExtension();
  const mock = await startFixtureServer(MOCK_PORT).catch((e) => {
    throw new Error(`mock portal port ${MOCK_PORT} unavailable (${e.code || e.message})`);
  });
  const unknown = await startFixtureServer(0);
  const backend = await startBackend();
  let vite = await startVite();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-ext-portal-"));
  const b = launchBrowser(exe, profileDir, { headed });
  const { sessions, byTarget, stats, evaluate, navigate, openTab, targets, mark, diagnostics } = createDriver(b);
  const F = backend.autofill;
  let currentStage = "setup";
  const stage = (name) => {
    currentStage = name;
    mark("stage", name);
  };

  try {
    const shipped = JSON.parse(fs.readFileSync(path.join(extDir, "manifest.json"), "utf8"));
    check("Shipped manifest untouched: no mock origin", !JSON.stringify(shipped).includes("127.0.0.1"));
    check(
      "Test build keeps every shipped content script and adds exactly one, for the mock origin only; host permissions unchanged",
      build.manifest.content_scripts.length === shipped.content_scripts.length + 1 && JSON.stringify(build.manifest.content_scripts.slice(0, -1)) === JSON.stringify(shipped.content_scripts) &&
        JSON.stringify(build.manifest.content_scripts.at(-1).matches) === JSON.stringify([`${MOCK}/*`]) && JSON.stringify(build.manifest.host_permissions) === JSON.stringify(shipped.host_permissions)
    );
    const ext = await b.send("Extensions.loadUnpacked", { path: build.dir });
    check("Test build loads unpacked", /^[a-p]{32}$/.test(ext.id));
    const POPUP = `chrome-extension://${ext.id}/src/popup.html`;

    // ── Engine lab: DOM-level tests in a real page (unknown origin, no content script) ──
    stage("engine lab");
    const labTab = await openTab(`${unknown.origin}/lab`);
    const lab = await evaluate(labTab.sessionId, "window.runEngineLab()");
    for (const r of lab) check(`[lab] ${r.name}`, r.ok, r.detail);
    check("[lab] executed all groups", lab.length >= 30, `${lab.length} checks`);
    await b.send("Target.closeTarget", { targetId: labTab.targetId });

    // ── Website sign-in (first-party, browser cookie jar) ──
    stage("website sign-in");
    const app = await openTab(`${APP}/login`);
    const login = () =>
      evaluate(
        app.sessionId,
        `fetch("/api/auth/login", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ emailOrPhone: "portal.smoke1@test.local", password: ${JSON.stringify(PASSWORD)} }) }).then((r) => r.status)`
      );
    check("Website login succeeds (first-party)", (await login()) === 200);

    const control = await openTab(POPUP); // extension page used to open the toolbar popup and to probe the content script
    const portal = await openTab(`${MOCK}/register`);
    const other = await openTab(`${unknown.origin}/register`);
    await b.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });

    const readPopup = (s) =>
      evaluate(
        s,
        `(() => { const $ = (id) => document.getElementById(id); return {
          state: $("status").dataset.state, status: $("status-text").textContent, requestsMessage: $("requests-message").textContent,
          page: $("page-status").textContent, portalShown: !$("portal-info").hidden, portalName: $("portal-name").textContent,
          portalVerification: $("portal-verification").textContent, portalForm: $("portal-form").textContent,
          previewDisabled: $("preview-button").disabled, previewMessage: $("preview-message").textContent, previewShown: !$("preview").hidden,
          summary: $("preview-summary").textContent, fillDisabled: $("fill-button").disabled, confirm: $("approve-confirm").checked,
          rows: [...$("preview-rows").rows].map((tr) => { const t = tr.querySelector("input"); return { status: tr.dataset.status, id: t.dataset.id,
            tickDisabled: t.disabled, ticked: t.checked, label: tr.cells[1].textContent, value: tr.cells[2].textContent, text: tr.cells[3].textContent }; }),
          resultShown: !$("fill-result").hidden, headline: $("fill-headline").textContent,
          problems: [...$("fill-problems").children].map((li) => li.textContent), reminder: $("fill-reminder").textContent,
          html: document.body.innerText }; })()`
      );
    const popupTargets = async () => (await targets()).filter((t) => t.url.startsWith(POPUP) && t.targetId !== control.targetId);
    const openToolbarPopup = async (tab) => {
      for (const t of await popupTargets()) await b.send("Target.closeTarget", { targetId: t.targetId }).catch(() => {});
      await waitFor(async () => (await popupTargets()).length === 0, { timeout: 5000, label: "previous popup to close" });
      await b.send("Target.activateTarget", { targetId: tab.targetId });
      await evaluate(control.sessionId, `chrome.action.openPopup().then(() => true)`);
      const t = await waitFor(async () => (await popupTargets())[0], { timeout: 8000, label: "toolbar popup" });
      const sid = await waitFor(() => byTarget.get(t.targetId), { timeout: 5000, label: "popup session" });
      await waitFor(() => evaluate(sid, `document.readyState === "complete" && !!document.getElementById("origin-select").options.length`), { label: "popup ready" });
      // Popup starts on production (blocked here); switch to the local test server.
      await evaluate(sid, `(() => { const o = document.getElementById("origin-select"); o.value = ${JSON.stringify(APP)}; o.dispatchEvent(new Event("change")); return true; })()`);
      await sleep(1200);
      await waitFor(async () => {
        const st = await readPopup(sid);
        return st.state !== "checking" && st.requestsMessage !== "Loading requests…" && st.page !== "Checking this page…";
      }, { label: "popup to settle" });
      return sid;
    };
    const selectRequest = (s, id, { paste = false } = {}) =>
      evaluate(
        s,
        paste
          ? `(() => { const i = document.getElementById("request-id"); i.value = ${JSON.stringify(id)}; i.dispatchEvent(new Event("input")); return true; })()`
          : `(() => { const s = document.getElementById("request-select"); s.value = ${JSON.stringify(id)}; s.dispatchEvent(new Event("change")); return s.value; })()`
      );
    const clickPreview = async (s) => {
      await evaluate(s, `document.getElementById("preview-button").click(); true`);
      return waitFor(async () => {
        const st = await readPopup(s);
        return st.previewMessage !== "Preparing preview…" && (st.previewShown || st.previewMessage || st.state === "signed-out") ? st : null;
      }, { label: "preview result" });
    };
    const setTicks = (s, wantedLabels) =>
      evaluate(
        s,
        `(() => { const want = ${JSON.stringify(wantedLabels)};
          for (const tr of document.getElementById("preview-rows").rows) {
            const t = tr.querySelector("input"); if (t.disabled) continue;
            const on = want === null || want.some((w) => tr.cells[1].textContent.startsWith(w));
            if (t.checked !== on) { t.checked = on; t.dispatchEvent(new Event("change")); }
          } return true; })()`
      );
    const confirmAndFill = async (s) => {
      await evaluate(s, `(() => { const c = document.getElementById("approve-confirm"); c.checked = true; c.dispatchEvent(new Event("change")); return true; })()`);
      const before = await readPopup(s);
      await evaluate(s, `document.getElementById("fill-button").click(); true`);
      const after = await waitFor(async () => {
        const st = await readPopup(s);
        return st.resultShown || (st.previewMessage && st.previewMessage !== "Filling approved fields…") ? st : null;
      }, { label: "fill result" });
      return { before, after };
    };
    const pageState = () =>
      evaluate(
        portal.sessionId,
        `(() => { const v = (id) => document.getElementById(id)?.value ?? null; const c = (id) => !!document.getElementById(id)?.checked;
          return { mock: { ...window.__mock }, href: location.href,
            cand: v("cand_name"), father: v("father"), mother: v("mother"), dob: v("dob"), gender: document.querySelector("input[name=rdoGender]:checked")?.value || "",
            category: v("category"), marital: v("marital"), religion: v("religion"), nationality: v("nationality"), nominee: v("nominee"),
            mobile: v("mobile"), mobileConfirm: v("mobile_confirm"), email: v("email"), pLine: v("p_line"), pVillage: v("p_village"), pTehsil: v("p_tehsil"),
            pState: v("p_state"), pDistrict: v("p_district"), pPin: v("p_pin"), same: c("same_addr"), corrHidden: document.getElementById("corr_fields").hidden,
            corr: ["c_line", "c_village", "c_tehsil", "c_district", "c_state", "c_pin"].map(v),
            edu: [...document.querySelectorAll("#edu tbody input")].map((i) => i.value), mobile2: v("mobile2"), ref: v("ref_no"), appNo: v("app_no"),
            aadhaar: v("aadhaar"), pan: v("pan"), photo: document.getElementById("photo").files.length, sec: v("sec_answer"), pwd: v("pwd"), otp: v("otp"),
            upi: v("upi"), remarks: document.getElementById("remarks").textContent, captcha: v("captcha_text"), declaration: c("declaration"),
            html: document.documentElement.outerHTML }; })()`
      );

    // 1. Detection on the supported mock form
    stage("1 detection");
    const initial = await pageState();
    let popup = await openToolbarPopup(portal);
    let st = await readPopup(popup);
    check("Popup connected to the local account", st.state === "connected", st.status);
    check("Supported form detected", st.page === "Supported form detected." && st.portalShown, st.page);
    check(
      "Portal + form shown with honest verification status (test fixture, not a verified government portal)",
      st.portalName === "Mock Government Portal (local test fixture)" && /test fixture/i.test(st.portalVerification) && st.portalForm === "Mock candidate registration",
      `${st.portalName} | ${st.portalVerification} | ${st.portalForm}`
    );
    check("Preview disabled until a request is selected", st.previewDisabled);
    await selectRequest(popup, backend.ids.own);
    st = await readPopup(popup);
    check("Preview enabled once a request is selected; fill still disabled", !st.previewDisabled && st.fillDisabled);

    // 2. Preview: every field classified; nothing filled yet
    stage("2 first preview");
    st = await clickPreview(popup);
    const afterPreview = await pageState();
    check("Preview shown; page not modified by preview", st.previewShown && afterPreview.html === initial.html && afterPreview.mock.inputs === 0 && afterPreview.mock.changes === 0, st.previewMessage);
    const got = st.rows.map((r) => [r.label, r.status]);
    const mismatches = EXPECTED_FIRST.map(([label, status], i) => (got[i] && got[i][0].startsWith(label) && got[i][1] === status ? null : `#${i + 1} expected ${label}:${status} got ${got[i]?.join(":")}`)).filter(Boolean);
    check("Preview statuses match the mock form field-by-field (53 fields)", mismatches.length === 0 && got.length === EXPECTED_FIRST.length, mismatches.slice(0, 6).join(" | ") || `${got.length} rows`);
    const row = (label, nth = 0) => st.rows.filter((r) => r.label.startsWith(label))[nth];
    check(
      "Preview values formatted for this form (DD/MM/YYYY date, option text, adapter reference)",
      row("Date of Birth")?.value === "09/04/2001" && row("Gender")?.value === "Male" && row("Category")?.value === "OBC" && row("Marital Status")?.value === "Single" &&
        row("Your reference")?.value === "REF-SYN-0001" && row("Correspondence address same")?.value === "Tick" && row("Percentage")?.value === "82.5",
      ["Date of Birth", "Gender", "Category", "Marital Status", "Your reference", "Percentage"].map((l) => `${l}=${row(l)?.value}`).join(", ")
    );
    check("Required field marker shown (Name of the Candidate)", /\*$/.test(row("Name of the Candidate")?.label || ""));
    check("Summary counts ready fields", /: 31 of 53 fields can be filled\./.test(st.summary), st.summary);
    check("Only 'ready' rows can be ticked; all others disabled", st.rows.every((r) => (r.status === "ready") === !r.tickDisabled));
    check(
      "Protected rows explain the human step",
      /CAPTCHA/.test(row("Enter the text in the image")?.text) && /OTP/.test(row("Enter OTP")?.text) && /Password/.test(row("Create Password")?.text) &&
        /Payment/.test(row("UPI ID")?.text) && /Declaration/.test(row("I hereby declare")?.text) && /Reserved for you/.test(row("Security answer")?.text) &&
        /Identity number/.test(row("Aadhaar Number")?.text) && /Document upload/.test(row("Upload Photograph")?.text)
    );
    check("Protected / identity / document rows carry no proposed value", st.rows.filter((r) => ["protected", "identity_manual", "document"].includes(r.status)).every((r) => r.value === "—"));
    check("Popup never displays masked identity values or unmapped exam data", !SECRETS.some((s) => st.html.includes(s)));
    check("Fill button disabled before explicit confirmation", st.fillDisabled && !st.confirm);

    // 3. Approval gating: confirmation without ticks keeps fill disabled
    stage("3 approval gating");
    await setTicks(popup, []);
    await evaluate(popup, `(() => { const c = document.getElementById("approve-confirm"); c.checked = true; c.dispatchEvent(new Event("change")); return true; })()`);
    st = await readPopup(popup);
    check("Confirmation alone (no field ticked) keeps fill disabled", st.fillDisabled);
    await evaluate(popup, `(() => { const c = document.getElementById("approve-confirm"); c.checked = false; c.dispatchEvent(new Event("change")); return true; })()`);
    await setTicks(popup, null);
    await setTicks(popup, EXPECTED_FIRST.filter(([l, s]) => s === "ready" && l !== "Nationality").map(([l]) => l));
    st = await readPopup(popup);
    check("Ticks without confirmation keep fill disabled", st.fillDisabled && st.rows.find((r) => r.label.startsWith("Nationality")).ticked === false);

    // 4. Fill (approved fields only)
    stage("4 first fill");
    const { after: filled } = await confirmAndFill(popup);
    const p1 = await pageState();
    check("Fill result shown", filled.resultShown, filled.previewMessage);
    check("Fill result: 24 filled, 6 skipped (correspondence block hidden by the page after 'same as permanent')", filled.headline === "Filled 24 fields. Skipped 6, failed 0.", filled.headline);
    check("Skipped fields explained", filled.problems.length === 6 && filled.problems.every((p) => /the field is hidden/.test(p)), filled.problems.join(" | "));
    check("Manual-steps reminder shown", /CAPTCHA, OTP, declarations, uploads, payment and final submission yourself/.test(filled.reminder));
    check(
      "Text / date / radio / select values written",
      p1.cand === F.personal.fullName.value && p1.father === F.personal.fatherName.value && p1.dob === "09/04/2001" && p1.gender === "M" &&
        p1.category === "OBC" && p1.marital === "S" && p1.religion === "Synthetic Faith" && p1.mobile === "9000000201" && p1.email === "synthetic.applicant@test.local",
      JSON.stringify({ cand: p1.cand, dob: p1.dob, gender: p1.gender, category: p1.category, marital: p1.marital })
    );
    check(
      "Address + education written; same-as-permanent ticked; dependent district left empty",
      p1.pLine === "12 Test Lane" && p1.pVillage === "Testpur" && p1.pTehsil === "Test Tehsil" && p1.pState === "MH" && p1.pPin === "411001" && p1.pDistrict === "" &&
        p1.same && p1.corrHidden && JSON.stringify(p1.edu) === JSON.stringify(["Synthetic State Board", "T10-001", "2017", "82.5", "Synthetic Higher Board", "T12-002", "2019", "76", "", "", "", ""]) &&
        p1.ref === "REF-SYN-0001",
      JSON.stringify(p1.edu)
    );
    check("Unapproved field (Nationality) left untouched", p1.nationality === "");
    check(
      "Missing / low-confidence / confirmation / duplicate / locked fields untouched",
      p1.mother === "" && p1.nominee === "" && p1.mobileConfirm === "" && p1.mobile2 === "" && p1.appNo === "MOCK-APP-1" && p1.corr.every((v) => v === "")
    );
    check(
      "CAPTCHA, OTP, password, payment, declaration, identity, adapter-protected and file fields untouched",
      p1.captcha === "" && p1.otp === "" && p1.pwd === "" && p1.upi === "" && !p1.declaration && p1.aadhaar === "" && p1.pan === "" && p1.sec === "" && p1.photo === 0 && p1.remarks === ""
    );
    check("No submission, no button/link clicks, no navigation", p1.mock.submits === 0 && p1.mock.buttonClicks === 0 && p1.mock.loadId === initial.mock.loadId && p1.href === `${MOCK}/register`, JSON.stringify(p1.mock));
    check("Framework events dispatched while filling", p1.mock.inputs >= 20 && p1.mock.changes >= 20, JSON.stringify(p1.mock));

    // 5. Dynamic form: dependent dropdown becomes fillable after a fresh preview
    stage("5 re-preview after fill");
    st = await clickPreview(popup);
    const district = st.rows.find((r) => r.label.startsWith("District"));
    check("Re-preview: dependent district now ready with the new options", district?.status === "ready" && district.value === "Pune", JSON.stringify(district));
    check("Re-preview: hidden correspondence block excluded", st.rows.length === EXPECTED_FIRST.length - 6, `${st.rows.length} rows`);
    check("Re-preview: already-filled fields flagged as replacing current values", /replaces current value/.test(st.rows.find((r) => r.label.startsWith("Father's Name")).value));
    await setTicks(popup, ["District"]);
    const { after: filled2 } = await confirmAndFill(popup);
    const p2 = await pageState();
    check("Second fill: only the district", filled2.headline === "Filled 1 field. Skipped 0, failed 0." && p2.pDistrict === "Pune" && p2.father === p1.father, filled2.headline);

    // 6. Page changes between preview and fill → refused per field
    stage("6 form changed after preview");
    st = await clickPreview(popup);
    await evaluate(portal.sessionId, `document.querySelector("label[for=father]").textContent = "Guardian's Name"; document.getElementById("religion").remove(); true`);
    await setTicks(popup, ["Name of the Candidate", "Father's Name", "Religion"]);
    const { after: changed } = await confirmAndFill(popup);
    const p3 = await pageState();
    check(
      "Changed / removed fields skipped as 'form changed'; unchanged field filled",
      changed.headline === "Filled 1 field. Skipped 2, failed 0." && changed.problems.every((p) => /the form changed since the preview/.test(p)) && p3.father === p1.father,
      `${changed.headline} ${changed.problems.join(" | ")}`
    );

    // 6b. Cancel: the popup's Cancel button and a request change make the page drop the preview
    stage("6b cancel preview");
    const spied = await evaluate(
      popup,
      `(() => { const real = chrome.tabs.sendMessage.bind(chrome.tabs); window.__sent = [];
        chrome.tabs.sendMessage = (tabId, m, ...rest) => { window.__sent.push({ type: m && m.type });
          return Promise.resolve(real(tabId, m, ...rest)).then((r) => { if (r && r.previewId) window.__sent.push({ reply: r.type, previewId: r.previewId, nonce: r.nonce }); return r; }); };
        return chrome.tabs.sendMessage !== real; })()`
    );
    const sentLog = () => evaluate(popup, "window.__sent");
    const fillWith = (pv, approved) =>
      evaluate(
        control.sessionId,
        `(async () => { for (const t of await chrome.tabs.query({})) {
          const d = await chrome.tabs.sendMessage(t.id, { type: "MC_DETECT", v: 1 }).then((r) => r ?? null, () => null);
          if (d && d.nonce === ${JSON.stringify(pv.nonce)}) return chrome.tabs.sendMessage(t.id, { type: "MC_FILL", v: 1, nonce: d.nonce, previewId: ${JSON.stringify(pv.previewId)}, approved: ${JSON.stringify(approved)}, confirmed: true }).then((r) => r ?? null, () => null);
        } return "no tab"; })()`
      );
    const beforeCancel = await pageState();
    st = await clickPreview(popup);
    const cancelledPreview = (await sentLog()).find((m) => m.reply === "MC_PREVIEW_RESULT");
    const readyIds = st.rows.filter((r) => r.status === "ready").map((r) => r.id);
    await evaluate(popup, `document.getElementById("preview-cancel").click(); true`);
    st = await waitFor(async () => {
      const x = await readPopup(popup);
      return x.previewMessage === "Preview cancelled. Nothing was filled." && (await sentLog()).some((m) => m.type === "MC_DISCARD") ? x : null;
    }, { label: "preview cancel" });
    const afterCancelFill = await fillWith(cancelledPreview, readyIds);
    check("Popup can observe its page messages (test spy)", spied === true);
    check(
      "Cancel: preview closed in the popup, the page drops it (a fill with it → NO_PREVIEW), nothing written",
      !st.previewShown && st.fillDisabled && afterCancelFill?.code === "NO_PREVIEW" && (await pageState()).html === beforeCancel.html,
      JSON.stringify(afterCancelFill)
    );
    st = await clickPreview(popup);
    const switchedPreview = (await sentLog()).filter((m) => m.reply === "MC_PREVIEW_RESULT").at(-1);
    await selectRequest(popup, backend.ids.closed, { paste: true });
    await waitFor(async () => (await sentLog()).filter((m) => m.type === "MC_DISCARD").length === 2, { label: "discard on request change" });
    const afterSwitchFill = await fillWith(switchedPreview, readyIds);
    st = await readPopup(popup);
    check("Changing the request discards the open preview on the page too", !st.previewShown && afterSwitchFill?.code === "NO_PREVIEW" && (await pageState()).html === beforeCancel.html, JSON.stringify(afterSwitchFill));
    await selectRequest(popup, "", { paste: true });

    // 7. Messaging security (content script) — probed from the extension's own page
    stage("7 messaging security");
    const probe = await evaluate(
      control.sessionId,
      `(async () => {
        const send = (id, m) => chrome.tabs.sendMessage(id, m).then((r) => r ?? null, () => null);
        const tabs = await chrome.tabs.query({});
        const found = [];
        for (const t of tabs) { const d = await send(t.id, { type: "MC_DETECT", v: 1 }); if (d && d.type === "MC_DETECTION") found.push({ id: t.id, d }); }
        const { id, d } = found[0];
        const hex = "0123456789abcdef0123456789abcdef";
        const tree = { personal: { fullName: { status: "available", value: "Forged Value" } } };
        const out = { detections: found.length, nonceOk: /^[0-9a-f]{32}$/.test(d.nonce) };
        out.noConfirm = await send(id, { type: "MC_FILL", v: 1, nonce: d.nonce, previewId: hex, approved: ["f1"] });
        out.stringConfirm = await send(id, { type: "MC_FILL", v: 1, nonce: d.nonce, previewId: hex, approved: ["f1"], confirmed: "true" });
        out.wrongNonce = await send(id, { type: "MC_PREVIEW", v: 1, nonce: hex, fields: tree });
        out.badTree = await send(id, { type: "MC_PREVIEW", v: 1, nonce: d.nonce, fields: { personal: { fullName: { status: "available", value: "x", source: "profile" } } } });
        out.unknownPreview = await send(id, { type: "MC_FILL", v: 1, nonce: d.nonce, previewId: hex, approved: ["f1"], confirmed: true });
        out.unknownType = await send(id, { type: "MC_SUBMIT", v: 1, nonce: d.nonce });
        const pv = await send(id, { type: "MC_PREVIEW", v: 1, nonce: d.nonce, fields: tree });
        const decl = pv.items.find((i) => /hereby declare/.test(i.label));
        out.previewKeys = Object.keys(pv.items[0]).sort().join(",");
        out.first = await send(id, { type: "MC_FILL", v: 1, nonce: d.nonce, previewId: pv.previewId, approved: [decl.id], confirmed: true });
        out.replay = await send(id, { type: "MC_FILL", v: 1, nonce: d.nonce, previewId: pv.previewId, approved: [decl.id], confirmed: true });
        out.cspBlocked = await fetch(${JSON.stringify(`${MOCK}/register`)}).then(() => false, () => true);
        return out;
      })()`
    );
    check("Exactly one tab answers detection (the adapter origin)", probe.detections === 1 && probe.nonceOk);
    check("Fill without confirmed === true is ignored", probe.noConfirm === null && probe.stringConfirm === null);
    check("Wrong page nonce → STALE_PAGE", probe.wrongNonce?.code === "STALE_PAGE", JSON.stringify(probe.wrongNonce));
    check("Applicant tree with unexpected keys (e.g. source) rejected", probe.badTree === null);
    check("Fill for an unknown preview → NO_PREVIEW", probe.unknownPreview?.code === "NO_PREVIEW");
    check("Unknown message types (e.g. MC_SUBMIT) ignored", probe.unknownType === null);
    check("Preview items expose only public keys", probe.previewKeys === "confidence,display,hasValue,id,keyLabel,kind,label,reason,required,status", probe.previewKeys);
    check("Approved protected item (declaration) is refused", probe.first?.results?.[0]?.reason === "not_approvable", JSON.stringify(probe.first?.results));
    check("Previews are single-use (replay → NO_PREVIEW)", probe.replay?.code === "NO_PREVIEW");
    check("Extension pages cannot fetch the portal origin (CSP connect-src)", probe.cspBlocked === true);
    const pageWorld = await evaluate(
      portal.sessionId,
      `(() => { const before = document.getElementById("cand_name").value;
        window.postMessage({ type: "MC_FILL", v: 1, approved: ["f1"], confirmed: true }, "*");
        return { api: typeof window.chrome?.runtime?.sendMessage, unchanged: document.getElementById("cand_name").value === before,
          declaration: document.getElementById("declaration").checked }; })()`
    );
    check("Portal page cannot message the extension; window messages ignored", pageWorld.api === "undefined" && pageWorld.unchanged && !pageWorld.declaration, JSON.stringify(pageWorld));

    // 8. Unauthorized / closed requests
    stage("8 unauthorized and closed requests");
    await selectRequest(popup, backend.ids.foreign, { paste: true });
    st = await clickPreview(popup);
    check("Other customer's request → not available (no preview)", st.previewMessage === "Request not found or not available to your account." && !st.previewShown, st.previewMessage);
    await selectRequest(popup, backend.ids.closed, { paste: true });
    st = await clickPreview(popup);
    check("Closed request → closed message (no preview)", /closed/.test(st.previewMessage) && !st.previewShown, st.previewMessage);
    await selectRequest(popup, "", { paste: true });

    // 9. API error
    stage("9 API down");
    await backend.stop();
    st = await clickPreview(popup);
    check("API down → server error message (no preview)", /server had a problem/.test(st.previewMessage) && !st.previewShown, st.previewMessage);
    await backend.listen();

    // 10. Unrecognised form on the adapter origin + unknown portal origin
    stage("10 unrecognised form / unknown origin");
    await navigate(portal.sessionId, `${MOCK}/status`);
    popup = await openToolbarPopup(portal);
    st = await readPopup(popup);
    check("Unrecognised page on a known portal → not a supported form; preview disabled", st.page === "Portal detected, but this page is not a supported form." && st.portalForm === "Form not recognised on this page" && st.previewDisabled, st.page);
    const otherBefore = await evaluate(other.sessionId, "document.documentElement.outerHTML");
    popup = await openToolbarPopup(other);
    st = await readPopup(popup);
    check("Same form on an origin without an adapter → no supported portal; preview disabled", /^No supported government portal detected/.test(st.page) && !st.portalShown && st.previewDisabled, st.page);
    check("Unknown portal page untouched", (await evaluate(other.sessionId, "document.documentElement.outerHTML")) === otherBefore);

    // 11. Expired session during preview
    stage("11 expired session");
    await navigate(portal.sessionId, `${MOCK}/register`);
    popup = await openToolbarPopup(portal);
    await selectRequest(popup, backend.ids.own);
    const logout = await evaluate(
      app.sessionId,
      `fetch("/api/auth/logout", { method: "POST", credentials: "include", headers: { Accept: "application/json",
        "X-CSRF-Token": (document.cookie.match(/(?:^|; )mc_csrf=([^;]*)/) || [])[1] || "" } }).then((r) => r.status)`
    );
    st = await clickPreview(popup);
    st = await waitFor(async () => ((await readPopup(popup)).state === "signed-out" ? readPopup(popup) : null), { label: "signed out" });
    check("Session expired (logout) → popup signed out, no preview, page untouched", logout === 200 && !st.previewShown && (await pageState()).cand === "", st.status);

    // 12. Network failure
    stage("12 network failure");
    check("Re-login on the website", (await login()) === 200);
    popup = await openToolbarPopup(portal);
    await selectRequest(popup, backend.ids.own);
    await stopVite(vite);
    vite = null;
    st = await clickPreview(popup);
    check("Site unreachable → network error (no preview)", /Could not reach/.test(st.previewMessage) && !st.previewShown, st.previewMessage);

    // 13. Leakage, storage, logging, network
    stage("13 leakage / storage / network");
    const final = await pageState();
    check("Masked identity values and unmapped exam data never reached the portal page", !SECRETS.some((s) => final.html.includes(s)));
    const stored = await evaluate(
      popup,
      `(async () => ({ storageApi: typeof chrome.storage, cookiesApi: typeof chrome.cookies, local: localStorage.length, session: sessionStorage.length, idb: (await indexedDB.databases()).length }))()`
    );
    check("No extension storage used", stored.storageApi === "undefined" && stored.cookiesApi === "undefined" && stored.local === 0 && stored.session === 0 && stored.idb === 0, JSON.stringify(stored));
    const portalSession = sessions.get(portal.sessionId);
    // Document loads, inline data: images and the browser's own favicon fetch are not script traffic.
    const pageRequests = portalSession.requests.filter((r) => r.type !== "Document" && !r.url.startsWith("data:") && !r.url.endsWith("/favicon.ico"));
    check("Portal tab made no network requests besides page loads (content script is offline)", pageRequests.length === 0, pageRequests.map((r) => `${r.method} ${r.url}`).join(" | "));
    check("Mock portal received no POST / form submission", mock.hits.every((m) => m === "GET") && unknown.hits.every((m) => m === "GET"));
    // The Vite dev website (its tab and workers) is excluded — the dev server's own client logs.
    const isWebsite = (s) => s.targetId === app.targetId || s.url.startsWith(APP) || s.url.startsWith(`blob:${APP}`);
    const noisy = [...sessions.entries()].filter(([, s]) => !isWebsite(s) && (s.console > 0 || s.exceptions > 0)).map(([, s]) => `${s.url || s.targetId}: console=${s.console} exceptions=${s.exceptions}`);
    check("No console output or uncaught exceptions in popups, content scripts or pages", noisy.length === 0, noisy.join(" | "));
    log(`        production requests blocked inside the browser: ${stats.productionBlocked}`);
  } catch (e) {
    log(`  FATAL during stage "${currentStage}": ${e.message}`);
    log("  Diagnostics (browser target timeline and captured logs):");
    for (const line of diagnostics()) log(`    ${line}`);
    e.reported = true;
    throw e;
  } finally {
    await b.send("Target.setAutoAttach", { autoAttach: false, waitForDebuggerOnStart: false, flatten: true }).catch(() => {});
    b.proc.kill();
    vite?.kill();
    mock.server.close();
    unknown.server.close();
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

/**
 * Real-browser test of the local form-structure inspector.
 *   node extension/tests/inspect-smoke.mjs --browser chrome|edge [--headed]
 *
 * Serves synthetic pages on 127.0.0.1 only. A temporary copy of extension/inspect is allowed
 * to read the lab origin. A test build of the production extension (shipped code plus a test
 * adapter for the lab origin) runs its portal content script on the same tabs, to prove the two
 * extensions cannot reach each other. No government site is opened.
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { checkGateReadiness, loadEngine, loadInspector } from "./adapter-fixture-template.mjs";
import { compareRoundTrip, renderCaptureFixture } from "./capture-fixture.mjs";
import { createDriver, createReporter, extDir, findBrowser, launchBrowser, log, parseArgs, sleep, waitFor } from "./harness.mjs";

const { browserName, headed } = parseArgs();
const report = createReporter();
const { check } = report;
const SECRETS = [
  "SyntheticTypedName",
  "999988887777",
  "9999 8888 7777",
  "XXXX XXXX 1234",
  "synthetic.person@test.local",
  "SyntheticPassw0rd!",
  "OTPSECRET99",
  "CAPTCHASECRET",
  "VIEWSTATESECRETTOKEN",
  "SyntheticHiddenName",
  "SyntheticReadonlyValue",
  "SYNTHETICDISABLEDOPTION",
  "ABCDE1234F",
  "9876543210",
  "UPISECRET",
  "LOOSESECRET",
  "IFRAMESECRET",
  "QUERYSECRET",
  "FRAGSECRET",
  "COOKIESECRET",
  "JSCOOKIESECRET",
  "HEADERSECRET",
  "LSSECRET",
  "SSSECRET",
  "leaked.option@test.local",
  "session=",
  "SYNTHETICGREETNAME",
  "GDS26SYN123",
  "SHADOWSECRET",
  "FRAMESRCSECRET",
];
const leaks = (text) => SECRETS.filter((s) => text.includes(s));
const ENGINE = ["core", "registry", "adapters", "classify", "values", "preview", "protocol", "dom"];
const LAB = fs.readFileSync(path.join(extDir, "tests", "fixtures", "inspect-lab.html"));
// A session countdown and a news ticker outside the form: the capture must still settle.
const TICKER = `<!doctype html><title>Ticker</title><p>Session expires in <span id="clock">900</span> s</p><ul id="news"></ul>
<form id="t"><label for="a">Stable field</label><input id="a" name="a"></form>
<script>let n = 0; setInterval(() => { n += 1; document.getElementById("clock").textContent = String(900 - n);
  const li = document.createElement("li"); li.textContent = "Notice " + n; document.getElementById("news").replaceChildren(li); }, 100);</script>`;
// A label that keeps changing: the form never settles.
const RESTLESS = `<!doctype html><title>Restless</title><form id="r"><label for="a" id="l">Changing label</label><input id="a" name="a"></form>
<script>let n = 0; setInterval(() => { n += 1; document.getElementById("l").textContent = "Changing label " + (n % 2 ? "A" : "B"); }, 100);</script>`;
const FRAME = `<!doctype html><title>Frame</title><input name="f" value="FRAMESRCSECRET">`;
// A registration page before and after the applicant's own gate (as GST Proceed): the test plays the
// applicant, typing details, then "proceeding" to an OTP view that echoes a masked mobile and email.
const GATE_SECRETS = ["SyntheticGateName", "9000000777", "gate.person@test.local", "90XXXXXX77", "ga***@test.local", "482913", "517204", "GATETOKENSECRET", "GATECOOKIESECRET"];
const GATE = `<!doctype html><title>Synthetic gate lab | Registration</title>
<form name="preg" method="get" action="/gate"><h2>New Registration</h2>
<div><label for="g_name">Legal Name of the Business (As mentioned in PAN)</label><input id="g_name" name="g_name"></div>
<div><label for="g_pan">Permanent Account Number (PAN)</label><input id="g_pan" name="g_pan"></div>
<div><label for="g_email">Email Address</label><input id="g_email" name="g_email" maxlength="254"></div>
<div><label for="g_mobile">Mobile Number</label><input id="g_mobile" name="g_mobile" maxlength="10"></div>
<input type="hidden" name="csrf" value="GATETOKENSECRET"><button type="submit" id="g_proceed">Proceed</button></form>
<section id="otp" hidden><h2>Verify</h2>
<div><label for="mobile_otp" id="l_motp">Mobile OTP</label><input id="mobile_otp" name="mobile_otp"></div>
<div><label for="email_otp" id="l_eotp">Email OTP</label><input id="email_otp" name="email_otp"></div>
<button type="button" id="g_validate">Validate</button></section>
<script>
window.__gate = { submits: 0, clicks: 0 };
document.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); window.__gate.submits += 1; });
addEventListener("click", () => { window.__gate.clicks += 1; }, true);
const set = (id, v) => { document.getElementById(id).value = v; };
window.typeAsApplicant = () => { set("g_name", "SyntheticGateName"); set("g_pan", "ABCDE1234F"); set("g_email", "gate.person@test.local"); set("g_mobile", "9000000777"); };
window.proceedAsApplicant = () => {
  for (const id of ["g_name", "g_pan", "g_email", "g_mobile"]) document.getElementById(id).readOnly = true;
  document.getElementById("otp").hidden = false;
  document.getElementById("l_motp").textContent = "Mobile OTP sent to 90XXXXXX77";
  document.getElementById("l_eotp").textContent = "Email OTP sent to ga***@test.local";
  set("mobile_otp", "482913"); set("email_otp", "517204");
  document.cookie = "gate_session=GATECOOKIESECRET; path=/";
};
</script>`;

function serve(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

function buildInspector(origin) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-inspect-"));
  for (const name of fs.readdirSync(path.join(extDir, "inspect"))) {
    const src = path.join(extDir, "inspect", name);
    if (fs.statSync(src).isFile()) fs.copyFileSync(src, path.join(dir, name));
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  manifest.name = `${manifest.name} (TEST)`;
  manifest.content_scripts[0].matches.push(`${origin}/*`);
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  const origins = fs.readFileSync(path.join(dir, "origins.js"), "utf8").replace('"https://iafrecruitment.edcil.co.in",', `"https://iafrecruitment.edcil.co.in",\n    ${JSON.stringify(origin)},`);
  fs.writeFileSync(path.join(dir, "origins.js"), origins);
  return { dir, manifest, origins };
}

function buildProduction(origin) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-inspect-prod-"));
  fs.cpSync(path.join(extDir, "src"), path.join(dir, "src"), { recursive: true });
  fs.mkdirSync(path.join(dir, "test-fixtures"));
  const adapter = {
    id: "inspect-lab",
    testOnly: true,
    portal: { id: "inspect-lab", name: "Inspector lab (local test fixture)", category: "Test" },
    origins: [origin],
    forms: [{ id: "lab", name: "Inspector lab", match: { pathPrefix: "/lab", selector: "form#application" }, genericFields: true }],
  };
  fs.writeFileSync(path.join(dir, "test-fixtures", "lab-adapter.js"), `(function (root) {\n  "use strict";\n  root.MCEngine.adapters.register(${JSON.stringify(adapter)});\n})(globalThis);\n`);
  const manifest = JSON.parse(fs.readFileSync(path.join(extDir, "manifest.json"), "utf8"));
  manifest.name = `${manifest.name} (TEST BUILD)`;
  manifest.content_scripts.push({
    matches: [`${origin}/*`],
    js: [...ENGINE.map((f) => `src/engine/${f}.js`), "test-fixtures/lab-adapter.js", "src/portal-content.js"],
    run_at: "document_idle",
    all_frames: false,
  });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return { dir };
}

async function removeDir(dir) {
  for (let i = 0; i < 8; i += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      await sleep(400);
    }
  }
}

async function main() {
  const exe = findBrowser(browserName);
  if (!exe) throw new Error(`${browserName} not found`);
  log(`\n=== Form structure inspector: ${browserName} (${headed ? "headed" : "headless"}) ===\n`);

  const hits = [];
  let roundtripHtml = "<!doctype html><title>not rendered yet</title>";
  const pages = { "/lab": () => LAB, "/ticker": () => TICKER, "/restless": () => RESTLESS, "/frame": () => FRAME, "/roundtrip": () => roundtripHtml, "/gate": () => GATE };
  const lab = await serve((req, res) => {
    const p = new URL(req.url, "http://x").pathname;
    hits.push(`${req.method} ${p}`);
    if (req.method !== "GET" || !pages[p]) {
      res.writeHead(req.method === "GET" ? 404 : 405);
      res.end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": "lab_session=COOKIESECRET; Path=/; HttpOnly",
      "X-Secret-Header": "HEADERSECRET",
    });
    res.end(pages[p]());
  });
  const unknown = await serve((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<!doctype html><title>Unknown</title><form><label for='x'>Name</label><input id='x' name='x' value='UNKNOWNSECRET'></form>");
  });
  const build = buildInspector(lab.origin);
  const prodBuild = buildProduction(lab.origin);
  const shippedManifest = fs.readFileSync(path.join(extDir, "inspect", "manifest.json"), "utf8");
  const shippedOrigins = fs.readFileSync(path.join(extDir, "inspect", "origins.js"), "utf8");
  check("Shipped inspector has no loopback origin (manifest and origins.js)", !/127\.0\.0\.1|localhost/.test(shippedManifest + shippedOrigins));
  check("Test build adds exactly the lab origin to both allowlists", build.manifest.content_scripts[0].matches.at(-1) === `${lab.origin}/*` && build.origins.includes(JSON.stringify(lab.origin)));

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "mc-inspect-profile-"));
  const b = launchBrowser(exe, profile, { headed });
  const driver = createDriver(b);
  const { evaluate, openTab, targets, byTarget, sessions } = driver;

  try {
    await b.send("Browser.setDownloadBehavior", { behavior: "deny" }).catch(() => {});
    const ext = await b.send("Extensions.loadUnpacked", { path: build.dir });
    const prod = await b.send("Extensions.loadUnpacked", { path: prodBuild.dir });
    check("Inspector test build and production test build both load, with different ids", /^[a-p]{32}$/.test(ext.id) && /^[a-p]{32}$/.test(prod.id) && ext.id !== prod.id);
    const POPUP = `chrome-extension://${ext.id}/popup.html`;

    const labUrl = `${lab.origin}/lab?session=QUERYSECRET#FRAGSECRET`;
    const page = await openTab(labUrl);
    const ticker = await openTab(`${lab.origin}/ticker`);
    const restless = await openTab(`${lab.origin}/restless`);
    const other = await openTab(`${unknown.origin}/other`);
    const control = await openTab(POPUP);
    await evaluate(
      control.sessionId,
      `window.__send = async (msg) => {
        const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
        const started = Date.now();
        try { return { tabId: t.id, res: (await chrome.tabs.sendMessage(t.id, msg)) ?? null, ms: Date.now() - started }; }
        catch (e) { return { tabId: t.id, error: String(e && e.message).slice(0, 120), ms: Date.now() - started }; }
      }; true`
    );
    const sendTo = async (tab, msg = { type: "MC_INSPECT_CAPTURE" }) => {
      await b.send("Target.activateTarget", { targetId: tab.targetId });
      await sleep(250);
      return evaluate(control.sessionId, `window.__send(${JSON.stringify(msg)})`);
    };

    const snapshot = () =>
      evaluate(
        page.sessionId,
        `({ html: document.documentElement.outerHTML, href: location.href, history: history.length, lab: JSON.parse(JSON.stringify(window.__lab)),
           values: [...document.querySelectorAll("input,select,textarea")].map((e) => e.type === "file" ? e.files.length : e.type === "radio" || e.type === "checkbox" ? e.checked : e.value),
           active: document.activeElement && document.activeElement.id, resources: performance.getEntriesByType("resource").length })`
      );
    const pageRequests = () => sessions.get(page.sessionId)?.requests.length ?? 0;

    // ── 1. Static capture ──
    const before = await snapshot();
    const reqBefore = pageRequests();
    const r1 = await sendTo(page);
    const cap = r1.res?.capture;
    const dump = JSON.stringify(cap || {});
    const after = await snapshot();
    check("Capture returned for the allowed lab origin", r1.res?.type === "MC_INSPECT_RESULT" && cap?.origin === lab.origin && cap?.path === "/lab", JSON.stringify(r1).slice(0, 200));
    check("No planted secret, typed value, cookie, header, storage, query or fragment in the capture", leaks(dump).length === 0, leaks(dump).join(", "));
    check("Capture has no value, checked, selected, cookie or header keys", !/"(value|checked|selected|files|cookie|cookies|headers?|token|session)"\s*:\s*"?[^"]*SECRET/i.test(dump) && !/"(checked|selected|cookie|cookies|headers|storage)"\s*:/.test(dump));
    const f = (sel) => cap?.fields.find((x) => x.selector === sel);
    const byName = (n) => cap?.fields.find((x) => x.name === n);
    check(
      "Label, required marker, section, selector and validation for a text field",
      f("#full_name")?.label === "Name of the Candidate" && f("#full_name").required && f("#full_name").requiredSource === "asterisk" && f("#full_name").section === "Personal Details" &&
        f("#full_name").selectorStable && f("#full_name").validation?.maxLength === 50 && f("#full_name").validation?.pattern === "[A-Za-z ]+" && f("#full_name").autoComplete === "name",
      JSON.stringify(f("#full_name"))
    );
    check("Table-row label", f("#father")?.label === "Father's Name" && f("#father").labelSource === "table-cell");
    check("Date field: type, required attribute, min and max", f("#dob")?.type === "date" && f("#dob").requiredSource === "attribute" && f("#dob").validation?.min === "2005-01-01" && f("#dob").validation?.max === "2009-12-31");
    const gender = cap?.fields.find((x) => x.type === "radio-group" && x.name === "rdoGender");
    check(
      "Radio group: label, choices with codes and labels, required, no checked state",
      gender?.label === "Gender" && gender.required && JSON.stringify(gender.choices.map((c) => [c.value, c.label])) === JSON.stringify([["M", "Male"], ["F", "Female"], ["T", "Transgender"]]) &&
        gender.choices.every((c) => /rdoGender/.test(c.selector)),
      JSON.stringify(gender)
    );
    check("Conditional field hidden by CSS is recorded as not visible, with options", f("#trans_sub")?.visible === false && f("#trans_sub").options?.length === 3);
    check(
      "Select: wrapping label excludes option text, aria-required, applicant-like option redacted, no selected state",
      f("#category")?.label === "Category" && f("#category").requiredSource === "aria" &&
        JSON.stringify(f("#category").options) === JSON.stringify([{ value: "", text: "--Select--" }, { value: "UR", text: "UR" }, { value: "OBC", text: "OBC" }, { value: "", text: "" }]),
      JSON.stringify(f("#category"))
    );
    const gen = cap?.fields.find((x) => x.label === "Nationality");
    check("Framework-generated id recorded but flagged unstable", gen && gen.selectorStable === false && gen.labelSource === "placeholder", JSON.stringify(gen));
    check("Duplicate ids fall back to unique name selectors", f('input[name="txtMark"]')?.label === "Identification mark" && f('input[name="txtMark2"]')?.label === "Second identification mark");
    check("Disabled select: flagged, option list omitted", f("#disabled_state")?.disabled === true && f("#disabled_state").optionsOmitted === "disabled" && !f("#disabled_state").options && f("#disabled_state").optionCount === 1);
    check("Read-only prefilled field: flagged, value not captured", f("#ro_name")?.readOnly === true && !("value" in f("#ro_name")));
    check("Fieldset legend becomes the section; tel validation kept", f("#mobile")?.section === "Contact Details" && f("#mobile").validation?.pattern === "[6-9][0-9]{9}" && f("#mobile").validation?.inputMode === "numeric" && f("#mobile").required);
    check("Table caption becomes the section; select options kept", f("#yop")?.section === "Educational Qualification" && f("#yop").label === "Year of passing" && f("#yop").options.length === 4);
    const filtered = Object.fromEntries(["#aadhaar", "#pan", "#pwd", "#otp", "#captcha", "#photo", "#upi"].map((s) => [s, f(s)]));
    check(
      "Aadhaar, PAN, password, OTP, CAPTCHA, upload and UPI are filtered to structure only",
      filtered["#aadhaar"]?.filtered === "identity" && filtered["#pan"]?.filtered === "identity" && filtered["#pwd"]?.filtered === "password" && filtered["#otp"]?.filtered === "otp" &&
        filtered["#captcha"]?.filtered === "captcha" && filtered["#photo"]?.filtered === "file" && filtered["#upi"]?.filtered === "payment" &&
        Object.values(filtered).every((x) => !("placeholder" in x) && !("validation" in x) && !("options" in x)) && filtered["#photo"].accept === "image/jpeg,image/png",
      JSON.stringify(filtered).slice(0, 300)
    );
    check("Hidden inputs are left out and counted", !cap?.fields.some((x) => x.type === "hidden" || /VIEWSTATE|hidden|flag_code/i.test(x.name)) && cap?.counts.hiddenInputsOmitted === 3);
    check("A short hidden value (GEN) does not blank a label word that contains it (Gender)", gender?.label === "Gender");
    check("Field outside any form has form null", byName("loose_note")?.form === null);
    check("Greeting and registration-number headings never become a section", byName("loose_note")?.section === "" && !/welcome|logged in|registration no/i.test(dump), byName("loose_note")?.section);
    check("Frame contents are not read; frames counted with their origins only", cap?.counts.frames === 2 && JSON.stringify(cap.frameOrigins) === JSON.stringify(["inline", lab.origin]), JSON.stringify(cap?.frameOrigins));
    check("Open shadow DOM with fields is counted, its contents are not read", cap?.counts.shadowRootsWithFields === 1 && !cap.fields.some((x) => /Shadow field/.test(x.label)));
    const village = f('input[placeholder="Village / Town"]');
    const pin = f('input[data-testid="pincode"]');
    check("Control without id or name gets a placeholder selector (attribute kind, stable)", village?.label === "Village" && village.selectorKind === "attribute" && village.selectorStable && village.section === "Address", JSON.stringify(village));
    check("Control with a test hook gets a data-testid selector", pin?.label === "PIN Code" && pin.labelSource === "aria-label" && pin.selectorKind === "attribute" && pin.selectorStable && pin.validation?.inputMode === "numeric", JSON.stringify(pin));
    const positional = cap?.fields.filter((x) => x.selectorKind === "path") || [];
    check(
      "Control with no identifier gets a positional selector flagged unstable",
      positional.length === 1 && positional[0].selector.startsWith("#application > div:nth-of-type(") && positional[0].selectorStable === false && positional[0].section === "Address",
      JSON.stringify(positional)
    );
    const marital = cap?.fields.find((x) => x.type === "radio-group" && x.name === "rdoMarital");
    check(
      "Radio choices with generated ids are flagged unstable; the group name selector is stable",
      marital?.label === "Marital Status" && marital.selectorStable && marital.selectorKind === "name" && marital.choices.length === 2 && marital.choices.every((c) => c.selectorStable === false && /^#mui-4821\d$/.test(c.selector)),
      JSON.stringify(marital)
    );
    check("Unstable selectors are counted for review (generated id and positional only)", cap?.counts.unstableSelectors === 2, String(cap?.counts.unstableSelectors));
    check("Filtered fields are counted per kind", JSON.stringify(cap?.filteredByKind) === JSON.stringify({ password: 1, captcha: 1, otp: 1, identity: 2, payment: 1, file: 1 }), JSON.stringify(cap?.filteredByKind));
    check("Buttons recorded by label only", cap?.buttons.some((x) => x.label === "Save & Next" && x.type === "submit" && x.selector === "#save_next") && cap.buttons.some((x) => x.label === "Add Row" && x.type === "button"));
    check("Form recorded without query or fragment in its action", cap?.forms.length === 1 && cap.forms[0].selector === "form#application" && cap.forms[0].method === "post" && cap.forms[0].actionPath === "/apply");
    check("Text repeating a typed value is redacted (welcome heading never becomes a section)", !cap?.fields.some((x) => /welcome/i.test(x.section)) && cap?.counts.redactedTexts >= 1);
    check("Settled capture on a static page", cap?.settled === true && cap.waitedMs >= 450);
    check(
      "Capture changed nothing: DOM, values, focus, history and location identical",
      after.html === before.html && JSON.stringify(after.values) === JSON.stringify(before.values) && after.active === before.active && after.history === before.history && after.href === before.href && after.lab.loadId === before.lab.loadId
    );
    check("Capture fired no click, focus, input, change, submit, key or unload events", JSON.stringify(after.lab.events) === JSON.stringify(before.lab.events), JSON.stringify(after.lab.events));
    check("Capture made no network request from the page", pageRequests() === reqBefore && after.resources === before.resources, `${reqBefore}->${pageRequests()}`);
    const control1 = await evaluate(page.sessionId, `(() => { const n = window.__lab.events.focusin || 0; document.getElementById("religion").focus(); document.getElementById("religion").blur(); return (window.__lab.events.focusin || 0) - n; })()`);
    check("Control: the event counter does detect an element focus", control1 === 1, String(control1));

    // ── 2. Dynamic rendering ──
    await evaluate(page.sessionId, "window.startRender()");
    const r2 = await sendTo(page);
    const late = (r2.res?.capture?.fields || []).filter((x) => /^Late Field \d$/.test(x.label)).map((x) => x.label);
    check("Capture waits for burst rendering to finish (all 4 late fields present)", late.length === 4 && r2.res.capture.settled === true, `${late.join(",")} waited=${r2.res?.capture?.waitedMs}`);

    // ── 3. Clocks and tickers versus a form that never stops changing ──
    const r3 = await sendTo(ticker);
    check("A countdown and news ticker outside the form do not stop the capture settling", r3.res?.capture?.settled === true && r3.res.capture.waitedMs < 1500 && r3.res.capture.fields.length === 1, `waited=${r3.res?.capture?.waitedMs}`);
    const r3b = await sendTo(restless);
    check("A form whose label keeps changing returns at the wait limit, flagged not settled", r3b.res?.capture?.settled === false && r3b.res.capture.waitedMs >= 4900 && r3b.ms < 8000 && r3b.res.capture.fields.length === 1, `waited=${r3b.res?.capture?.waitedMs} ms=${r3b.ms}`);
    await b.send("Target.activateTarget", { targetId: ticker.targetId });
    await sleep(250);
    const pair = await evaluate(control.sessionId, `Promise.all([window.__send({ type: "MC_INSPECT_CAPTURE" }), window.__send({ type: "MC_INSPECT_CAPTURE" })])`);
    const kinds = pair.map((p) => (p.res?.type === "MC_INSPECT_ERROR" ? `error:${p.res.reason}` : p.res?.type)).sort();
    check("A second capture request while one is running is refused as busy", JSON.stringify(kinds) === JSON.stringify(["MC_INSPECT_RESULT", "error:busy"]), JSON.stringify(kinds));

    // ── 3b. Local stand-in rendered from the capture, recaptured ──
    roundtripHtml = renderCaptureFixture(cap);
    check("Rendered stand-in has no script and no planted secret", !/<script/i.test(roundtripHtml) && leaks(roundtripHtml).length === 0 && /action="\/fixture-submit"/.test(roundtripHtml));
    const rtTab = await openTab(`${lab.origin}/roundtrip`);
    const r5 = await sendTo(rtTab);
    const cmp = r5.res?.capture ? compareRoundTrip(cap, r5.res.capture) : { compared: 0, skipped: [], problems: ["no recapture"] };
    const skippable = cap.fields.filter((x) => !x.selector || x.selectorKind === "path").length;
    check(
      "Stand-in rendered from the capture recaptures with identical labels, sections, flags, options and selectors",
      cmp.problems.length === 0 && cmp.compared >= 20 && cmp.compared + skippable === cap.fields.length && cmp.skipped.length === skippable,
      `${cmp.compared} compared, ${skippable} skipped of ${cap.fields.length}; ${cmp.problems.slice(0, 6).join("; ")}`
    );
    await b.send("Target.closeTarget", { targetId: rtTab.targetId });

    // ── 3c. Before and after the applicant's own gate ──
    const gateTab = await openTab(`${lab.origin}/gate`);
    await evaluate(gateTab.sessionId, "window.typeAsApplicant(); true");
    const gBefore = (await sendTo(gateTab)).res?.capture;
    await evaluate(gateTab.sessionId, "window.proceedAsApplicant(); true");
    const gateValues = () => evaluate(gateTab.sessionId, `[...document.querySelectorAll("input")].map((e) => e.value).join("|")`);
    const valuesBefore = await gateValues();
    const gAfter = (await sendTo(gateTab)).res?.capture;
    const gateDump = JSON.stringify([gBefore, gAfter]);
    const gateLeaks = [...SECRETS, ...GATE_SECRETS].filter((s) => gateDump.includes(s));
    check("Gate lab: both captures returned and settled", gBefore?.settled === true && gAfter?.settled === true && gBefore.path === "/gate" && gAfter.path === "/gate");
    check("Gate lab: no typed detail, OTP, masked mobile or email echo, token or cookie in either capture", gateLeaks.length === 0, gateLeaks.join(", "));
    const gf = (c, sel) => c?.fields.find((x) => x.selector === sel);
    check(
      "Gate lab: the OTP boxes are filtered as OTP and their masked-echo labels are blanked",
      ["#mobile_otp", "#email_otp"].every((s) => gf(gAfter, s)?.filtered === "otp" && gf(gAfter, s).visible && gf(gAfter, s).label === "") && gAfter.counts.redactedTexts >= 2,
      JSON.stringify(["#mobile_otp", "#email_otp"].map((s) => gf(gAfter, s)))
    );
    check("Gate lab: PAN and legal name are filtered as identity in both states", [gBefore, gAfter].every((c) => gf(c, "#g_pan")?.filtered === "identity" && gf(c, "#g_name")?.filtered === "identity"));
    check(
      "Gate lab: email and mobile keep their labels; editable before the gate, recorded read-only after it",
      ["#g_email", "#g_mobile"].every((s) => gf(gBefore, s)?.readOnly === false && gf(gAfter, s)?.readOnly === true && gf(gBefore, s).label === gf(gAfter, s).label && gf(gAfter, s).label.length > 0)
    );
    const gateEvents = await evaluate(gateTab.sessionId, "({ ...window.__gate })");
    check("Gate lab: capturing changed no value and fired no submit or click", (await gateValues()) === valuesBefore && gateEvents.submits === 0 && gateEvents.clicks === 0, JSON.stringify(gateEvents));
    {
      const gateAdapter = {
        id: "gate-lab",
        testOnly: true,
        portal: { id: "gate-lab", name: "Gate lab" },
        origins: [lab.origin],
        forms: [
          {
            id: "part-a",
            name: "Gate lab part A",
            match: { pathPrefix: "/gate", selector: 'form[name="preg"]', titleIncludes: "Registration" },
            genericFields: false,
            fields: [{ selector: "#g_email", key: "contact.email" }, { selector: "#g_mobile", key: "contact.mobile" }],
            protectedSelectors: ["#g_pan", "#g_name", "#mobile_otp", "#email_otp"],
          },
        ],
      };
      const set = {
        kind: "capture-set",
        version: 1,
        scaffoldId: "gate-lab",
        steps: [{ id: "part-a", name: "Gate lab part A", captures: [{ file: "01.json", state: "details typed, before the gate", gate: "before" }, { file: "02.json", state: "after the gate", gate: "after" }] }],
      };
      const gate = checkGateReadiness(gateAdapter, set, [{ file: "01.json", capture: gBefore }, { file: "02.json", capture: gAfter }], { engine: loadEngine(), inspect: loadInspector(), allowTestOrigins: true, scaffoldId: "gate-lab" });
      check(
        "Gate lab: gate readiness on the real inspector output says email and mobile are the same fields, locked after the gate (verdict consistent)",
        gate.verdict === "consistent" && gate.fields.every((f) => f.results.length === 1 && f.results[0].outcome === "locked" && f.editableAfterGate === false),
        JSON.stringify(gate)
      );
    }
    await b.send("Target.closeTarget", { targetId: gateTab.targetId });

    // ── 4. Origin allowlist and message filtering ──
    const r4 = await sendTo(other);
    check("Origin outside the allowlist has no inspector (no receiver)", !r4.res && /Receiving end does not exist|Could not establish connection/i.test(r4.error || ""), r4.error);
    const odd = [];
    for (const msg of [{ type: "MC_DETECT", v: 1 }, { type: "MC_PING", v: 1 }, { type: "MC_FILL", v: 1, nonce: "a", previewId: "b", approved: ["f1"], confirmed: true }, { type: "MC_INSPECT_CAPTURE", fill: true }, { type: "MC_INSPECT_SUBMIT" }]) {
      odd.push(await sendTo(page, msg));
    }
    check("Inspector ignores engine, fill, submit and malformed messages", odd.every((o) => !o.res), JSON.stringify(odd.map((o) => o.res)).slice(0, 160));
    const pageSide = await evaluate(
      page.sessionId,
      `new Promise((resolve) => { const n = window.__lab.messages; window.postMessage({ type: "MC_INSPECT_CAPTURE" }, "*");
        setTimeout(() => resolve({ runtime: typeof chrome !== "undefined" && chrome.runtime ? typeof chrome.runtime.sendMessage : "undefined", replies: window.__lab.messages - n - 1 }), 800); })`
    );
    check("The web page cannot reach the inspector (no runtime API, window messages ignored)", pageSide.runtime === "undefined" && pageSide.replies === 0, JSON.stringify(pageSide));

    // ── 5. Isolation from the production extension ──
    const prodPage = await openTab(`chrome-extension://${prod.id}/src/popup.html`);
    const fromProd = await evaluate(
      prodPage.sessionId,
      `(async () => { const tabs = await chrome.tabs.query({}); const out = [];
        for (const t of tabs) { try { const r = await chrome.tabs.sendMessage(t.id, { type: "MC_INSPECT_CAPTURE" }); if (r) out.push(r.type || "reply"); } catch { /* none */ } }
        return { tabs: tabs.length, out }; })()`
    );
    check("Production extension cannot obtain an inspector capture from any tab", fromProd.tabs >= 4 && !fromProd.out.includes("MC_INSPECT_RESULT"), JSON.stringify(fromProd));
    const prodDetect = await evaluate(
      prodPage.sessionId,
      `chrome.tabs.sendMessage(${r1.tabId}, { type: "MC_DETECT", v: 1 }).then((r) => (r && r.type) || "none", (e) => "error: " + String(e && e.message).slice(0, 80))`
    );
    check("Control: the production portal content script is running on the same lab tab", prodDetect === "MC_DETECTION", prodDetect);
    const inspDetect = await sendTo(page, { type: "MC_DETECT", v: 1 });
    check("Inspector cannot reach the production content script on that tab", !inspDetect.res, JSON.stringify(inspDetect));
    const crossCall = (sid, target, msg) =>
      evaluate(sid, `chrome.runtime.sendMessage(${JSON.stringify(target)}, ${JSON.stringify(msg)}).then((r) => "reply: " + JSON.stringify(r ?? null), (e) => "error: " + String(e && e.message).slice(0, 80))`);
    const toProd = await crossCall(control.sessionId, prod.id, { type: "MC_DETECT", v: 1 });
    const toInspector = await crossCall(prodPage.sessionId, ext.id, { type: "MC_INSPECT_CAPTURE" });
    check("Neither extension accepts runtime messages from the other", /^error: /.test(toProd) && /^error: /.test(toInspector), `${toProd} | ${toInspector}`);
    await b.send("Target.closeTarget", { targetId: prodPage.targetId });

    // ── 6. Toolbar popup: capture, download, recapture ──
    const popupTargets = async () => (await targets()).filter((t) => t.url.startsWith(POPUP) && t.targetId !== control.targetId);
    await b.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    const openPopup = async (tab) => {
      for (const t of await popupTargets()) await b.send("Target.closeTarget", { targetId: t.targetId }).catch(() => {});
      await waitFor(async () => (await popupTargets()).length === 0, { timeout: 5000, label: "old popup closed" });
      await b.send("Target.activateTarget", { targetId: tab.targetId });
      await sleep(200);
      await evaluate(control.sessionId, "chrome.action.openPopup().then(() => true)");
      const t = await waitFor(async () => (await popupTargets())[0], { timeout: 8000, label: "toolbar popup" });
      const sid = await waitFor(() => byTarget.get(t.targetId), { timeout: 5000, label: "popup session" });
      await waitFor(() => evaluate(sid, `document.readyState === "complete"`), { label: "popup ready" });
      return sid;
    };
    const readPopup = (sid) =>
      evaluate(
        sid,
        `({ status: document.getElementById("status-text").textContent, state: document.getElementById("status").dataset.state,
            summary: document.getElementById("summary").hidden ? "" : document.getElementById("summary").innerText,
            diff: document.getElementById("diff").hidden ? "" : document.getElementById("diff").textContent,
            captureLabel: document.getElementById("capture").textContent, download: document.getElementById("download").disabled, text: document.body.innerText })`
      );
    const clickCapture = async (sid) => {
      await evaluate(sid, `document.getElementById("capture").click(); true`);
      return waitFor(async () => {
        const st = await readPopup(sid);
        return st.state !== "checking" ? st : null;
      }, { timeout: 10000, label: "popup capture" });
    };

    let sid = await openPopup(page);
    let st = await clickCapture(sid);
    check("Popup capture succeeds and enables download", /Structure captured/.test(st.status) && !st.download && st.captureLabel === "Capture again", st.status);
    check("Popup summary shows counts and the settled state", /Origin/.test(st.summary) && /\/lab/.test(st.summary) && /hidden inputs/.test(st.summary) && /Page settled\s*Yes/.test(st.summary), st.summary.slice(0, 200));
    check(
      "Popup summary warns about unstable selectors, frames, shadow DOM and lists filtered kinds",
      /2 field\(s\) have no stable id or name/.test(st.summary) && new RegExp(`2 frame\\(s\\) from inline, ${lab.origin.replace(/[.]/g, "\\.")} were not read`).test(st.summary) &&
        /1 component\(s\) hide fields/.test(st.summary) && /2 ID number/.test(st.summary) && /1 CAPTCHA/.test(st.summary),
      st.summary
    );
    check("Popup shows no planted secret", leaks(st.text).length === 0, leaks(st.text).join(", "));
    await evaluate(sid, `window.__blobs = []; const o = URL.createObjectURL.bind(URL); URL.createObjectURL = (x) => { window.__blobs.push(x); return o(x); }; true`);
    await evaluate(sid, `document.getElementById("download").click(); true`);
    const exported = await waitFor(() => evaluate(sid, `window.__blobs.length ? window.__blobs[0].text() : null`), { timeout: 5000, label: "export blob" });
    let parsed = null;
    try {
      parsed = JSON.parse(exported);
    } catch {
      parsed = null;
    }
    check("Exported JSON parses and is a sanitised form-structure capture", parsed?.kind === "form-structure" && parsed.version === 3 && parsed.path === "/lab" && Array.isArray(parsed.fields) && parsed.fields.length >= 25);
    check("Exported JSON contains no secret, cookie, header or session data", leaks(exported).length === 0 && !/cookie|set-cookie|x-secret|authorization|sessionid/i.test(exported.replace(/"cookies",|"request headers",|"web storage",/g, "")), leaks(exported).join(", "));

    // A real toolbar popup closes when the user clicks the page; the comparison must survive that.
    sid = await openPopup(page);
    await evaluate(page.sessionId, "window.mutateForRecapture()");
    st = await clickCapture(sid);
    check(
      "Recapture after the popup closed and the form changed reports the exact difference",
      /1 added \(Nominee Name\)/.test(st.diff) && /1 removed \(Religion\)/.test(st.diff) && /1 changed \(Visible identification mark\)/.test(st.diff) && /Capture\s*Number \d+ since this page loaded/.test(st.summary),
      st.diff
    );
    st = await clickCapture(sid);
    check("Recapture of an unchanged form reports no changes", /No field changes/.test(st.diff), st.diff);

    sid = await openPopup(other);
    st = await clickCapture(sid);
    check("Popup on an unlisted origin refuses and offers no download", st.state === "error" && /not one of the official portals/.test(st.status) && st.download, st.status);

    const allRequests = [...sessions.values()].flatMap((s) => s.requests.map((r) => r.url));
    check("No request to any government or vendor host", allRequests.every((u) => !/gov\.in|nic\.in|digialm|edcil|navydmpr/i.test(u)));
    check("Lab server received only page GETs (nothing submitted)", hits.every((h) => /^GET \/(lab|ticker|restless|frame|roundtrip|gate)$/.test(h) || h === "GET /favicon.ico"), hits.join(" "));
  } finally {
    b.proc.kill();
    await sleep(400);
    await new Promise((r) => lab.server.close(() => r()));
    await new Promise((r) => unknown.server.close(() => r()));
    await removeDir(build.dir);
    await removeDir(prodBuild.dir);
    await removeDir(profile);
  }

  log(`\n=== Results (${browserName}): ${report.passed} passed, ${report.failed} failed ===\n`);
  process.exit(report.failed ? 1 : 0);
}

main().catch((e) => {
  log("FATAL", e?.stack || e);
  process.exit(1);
});

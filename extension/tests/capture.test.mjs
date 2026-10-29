/**
 * Inspector unit tests (Node, synthetic data only).
 *   node extension/tests/capture.test.mjs
 * The real-DOM path (labels, sections, visibility, rendering, popup) is extension/tests/inspect-smoke.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let passed = 0;
let failed = 0;
const out = console.log.bind(console);
function check(name, cond, detail = "") {
  if (cond) passed += 1;
  else failed += 1;
  out(`  ${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail ? ` — ${detail}` : ""}`);
}

const ctx = vm.createContext({ URL, Date, console });
vm.runInContext(read("inspect/origins.js"), ctx, { filename: "origins.js" });
vm.runInContext(read("inspect/capture.js"), ctx, { filename: "capture.js" });
const I = ctx.MCInspect;
const plain = (v) => JSON.parse(JSON.stringify(v));

out("\n=== Inspector: applicant-value detection ===\n");
{
  const yes = ["9999 8888 7777", "999988887777", "2345-6789-0123", "ABCDE1234F", "abcde1234f", "person@example.org", "9876543210", "+91 9876543210", "+91-9876543210", "01/02/2006", "1.2.2006", "123456789", "Welcome 999988887777"];
  const no = ["Name of the Candidate", "--Select--", "PIN Code", "Category", "2026-10-27", "[6-9][0-9]{9}", "UR", "Class 10", "Height (cm)", "Exam centre 1", "5551234", "12345678"];
  const missed = yes.filter((s) => !I.looksLikeApplicantValue(s));
  const flagged = no.filter((s) => I.looksLikeApplicantValue(s));
  check("Aadhaar, PAN, email, mobile, dd/mm/yyyy and long digit runs are detected", missed.length === 0, missed.join(" | "));
  check("Ordinary labels, ISO dates, patterns and short codes are not flagged", flagged.length === 0, flagged.join(" | "));
  const masked = ["OTP sent to 90XXXXXX77", "Mobile 98****12", "XXXXXX7777", "******7777", "XXXX XXXX 1234", "XXXX-XXXX-0000", "PAN XXXXX1234X", "Aadhaar ending ••••••••3456"];
  const maskLike = ["XXXXXXXXXX", "Enter mobile number (XXXXXXXXXX)", "DD/MM/YYYY", "Size XXL", "Class XII", "Form 16", "Part XX"];
  const maskedMissed = masked.filter((s) => !I.looksLikeApplicantValue(s));
  const maskFlagged = maskLike.filter((s) => I.looksLikeApplicantValue(s));
  check("Masked echoes of a mobile, Aadhaar or PAN (as shown after an OTP is sent) are detected", maskedMissed.length === 0, maskedMissed.join(" | "));
  check("Mask placeholders without digits, size codes and roman numerals are not flagged", maskFlagged.length === 0, maskFlagged.join(" | "));
  const account = ["Welcome SYNTHETIC NAME", "Welcome, Synthetic", "Hello Synthetic Person", "Dear Synthetic", "Welcome back Synthetic", "Logged in as Synthetic", "Registration No: GDS26SYN123", "Registration No. 2026/AB/77", "Application ID AGV-77", "Roll Number 4471", "User ID: syn42"];
  const labels = ["Welcome to Agniveer Recruitment", "Welcome", "Registration No.", "Registration Number *", "Roll No", "User ID", "Application ID", "Login ID (Registered Mobile)", "Highest Qualification", "Date of Birth"];
  const accMissed = account.filter((s) => !I.looksLikeApplicantValue(s));
  const accFlagged = labels.filter((s) => I.looksLikeApplicantValue(s));
  check("Greetings and account numbers shown on the page are detected", accMissed.length === 0, accMissed.join(" | "));
  check("Field labels that merely name an account number are not flagged", accFlagged.length === 0, accFlagged.join(" | "));
}

out("\n=== Inspector: sensitive-field classification ===\n");
{
  const cases = [
    [{ type: "password", label: "Anything" }, "password"],
    [{ label: "Create Password" }, "password"],
    [{ name: "txtPwd" }, "password"],
    [{ type: "file", label: "Photograph" }, "file"],
    [{ name: "txtCaptchaCode" }, "captcha"],
    [{ label: "Enter the text shown in below image" }, "captcha"],
    [{ placeholder: "Security code" }, "captcha"],
    [{ label: "Enter OTP" }, "otp"],
    [{ name: "mobileOtp" }, "otp"],
    [{ label: "One Time Password" }, "otp"],
    [{ label: "Aadhaar Number" }, "identity"],
    [{ name: "txtAadharNo" }, "identity"],
    [{ name: "pan" }, "identity"],
    [{ name: "photo_id_value" }, "identity"],
    [{ label: "Passport number" }, "identity"],
    [{ label: "Bank Account Number" }, "identity"],
    [{ label: "IFSC" }, "identity"],
    [{ name: "upi" }, "payment"],
    [{ label: "Card number" }, "payment"],
    [{ label: "PIN Code" }, null],
    [{ label: "Category" }, null],
    [{ label: "Name of the Candidate", name: "txtName" }, null],
    [{ label: "Panchayat", name: "panchayat" }, null],
    [{ label: "Company", name: "company" }, null],
    [{ label: "Upload centre", name: "centre" }, null],
  ];
  const wrong = cases.filter(([input, want]) => I.classifySensitivity(input) !== want).map(([input, want]) => `${JSON.stringify(input)} → ${I.classifySensitivity(input)} (want ${want})`);
  check(`All ${cases.length} classification cases match, including PIN Code and Panchayat not filtered`, wrong.length === 0, wrong.join(" | "));
  check("Filtered categories are exactly password, captcha, otp, identity, payment, file", JSON.stringify(plain(I.FILTERED)) === JSON.stringify(["password", "captcha", "otp", "identity", "payment", "file"]) && Object.isFrozen(I.FILTERED));
}

out("\n=== Inspector: export sanitiser ===\n");
{
  const dirty = {
    kind: "form-structure",
    version: 99,
    capturedOn: "2026-10-27",
    origin: "https://joinindianarmy.nic.in",
    path: "/Registration.aspx?session=QUERYSECRET#FRAGSECRET",
    title: "Welcome 9876543210",
    settled: "yes",
    waitedMs: -4,
    cookie: "ASP.NET_SessionId=COOKIESECRET",
    headers: { authorization: "Bearer HEADERSECRET" },
    token: "TOKENSECRET",
    forms: [{ index: 0, selector: "form#form1", id: "form1", name: "", method: "POST", actionPath: "/Registration.aspx?token=QUERYSECRET", extra: "EXTRASECRET" }],
    frameOrigins: ["https://cdn.digialm.com", "javascript:alert(1)", "inline", "https://x.gov.in/path?x=QUERYSECRET", 7],
    filteredByKind: { identity: 1, password: "x", evil: 5 },
    fields: [
      {
        form: 0, tag: "input", type: "text", id: "txtName", name: "txtName", selector: "#txtName", selectorStable: true, selectorKind: "id", label: "Name", labelSource: "label", section: "Personal",
        required: true, requiredSource: "asterisk", visible: true, disabled: false, readOnly: false, filtered: null, placeholder: "e.g. person@example.org", autoComplete: "name",
        value: "SyntheticTypedName", defaultValue: "SyntheticTypedName", validation: { pattern: "[A-Z ]+", maxLength: 50, evil: "EVILSECRET" },
      },
      { form: 0, tag: "input", type: "text", id: "txtAadhaar", name: "txtAadhaar", selector: "#txtAadhaar", label: "Aadhaar", filtered: "identity", placeholder: "XXXX XXXX 1234", validation: { pattern: "\\d{12}" }, value: "999988887777" },
      { form: 0, tag: "select", type: "select", id: "ddlState", selector: "#ddlState", label: "State", filtered: null, optionCount: 3, options: [{ value: "MH", text: "Maharashtra", selected: true }, { value: "x", text: "leaked.option@test.local" }] },
      { form: 0, tag: "select", type: "select", id: "ddlLocked", selector: "#ddlLocked", label: "Locked", disabled: true, optionCount: 1, options: [{ value: "Z", text: "SYNTHETICDISABLEDOPTION" }] },
      { form: 0, tag: "input", type: "radio-group", name: "g", selector: 'input[type="radio"][name="g"]', label: "Gender", choices: [{ value: "M", label: "Male", checked: true }], checked: true },
      { form: 0, tag: "input", type: "file", id: "photo", label: "Photograph", filtered: "file", accept: "image/jpeg", files: ["photo.jpg"], placeholder: "PLACEHOLDERSECRET" },
      { form: "0", tag: "script", type: "text", filtered: "made-up", labelSource: "made-up", requiredSource: "made-up", selector: "#junk", selectorKind: "made-up" },
      { form: 0, tag: "input", type: "text", label: "No selector", selectorStable: true, selectorKind: "id" },
    ],
    buttons: [{ form: 0, type: "submit", label: "Save", selector: "#btnSave", onclick: "ONCLICKSECRET" }],
    counts: { forms: 1, fields: 7, redactedTexts: "lots", secret: 5 },
    omitted: ["nothing"],
  };
  const clean = plain(I.sanitizeCapture(dirty));
  const blob = JSON.stringify(clean);
  const secrets = ["QUERYSECRET", "FRAGSECRET", "9876543210", "COOKIESECRET", "HEADERSECRET", "TOKENSECRET", "EXTRASECRET", "SyntheticTypedName", "person@example.org", "EVILSECRET", "999988887777", "XXXX XXXX 1234", "leaked.option@test.local", "SYNTHETICDISABLEDOPTION", "photo.jpg", "PLACEHOLDERSECRET", "ONCLICKSECRET"];
  const found = secrets.filter((s) => blob.includes(s));
  check("Unknown keys, values, cookies, headers and tokens are dropped; applicant-like strings blanked", found.length === 0, found.join(", "));
  check(
    "No field-level value and no checked, selected, files, cookie or headers key survives",
    clean.fields.every((f) => !("value" in f)) && !/"(defaultValue|checked|selected|files|cookie|headers|token|onclick|extra|evil|secret)":/.test(blob)
  );
  check("Path and form action lose query and fragment", clean.path === "/Registration.aspx" && clean.forms[0].actionPath === "/Registration.aspx" && clean.forms[0].method === "get");
  check("Version is forced, settled and counts are type-checked", clean.version === I.CAPTURE_VERSION && clean.settled === null && clean.waitedMs === null && clean.counts.redactedTexts === 0 && !("secret" in clean.counts));
  check("Omitted list is the inspector's own, not the input's", clean.omitted.includes("cookies") && clean.omitted.includes("typed values") && !clean.omitted.includes("nothing"));
  const [name, aadhaar, state, locked, radio, file, junk, noSelector] = clean.fields;
  check("Ordinary field keeps label, section, selector and validation", name.label === "Name" && name.section === "Personal" && name.selector === "#txtName" && name.validation.pattern === "[A-Z ]+" && name.validation.maxLength === 50 && name.placeholder === "");
  check("Selector kind is kept when known, coerced when unknown, and cleared without a selector", name.selectorKind === "id" && junk.selectorKind === null && noSelector.selectorKind === null && noSelector.selectorStable === false);
  check("Frame origins keep bare origins and 'inline' only", JSON.stringify(clean.frameOrigins) === JSON.stringify(["https://cdn.digialm.com", "inline"]), JSON.stringify(clean.frameOrigins));
  check("Filtered counts keep the six known kinds as integers only", JSON.stringify(clean.filteredByKind) === JSON.stringify({ password: 0, captcha: 0, otp: 0, identity: 1, payment: 0, file: 0 }));
  check("Sanitising is idempotent", JSON.stringify(I.sanitizeCapture(clean)) === blob);
  check("Filtered field keeps structure only (no placeholder or validation)", aadhaar.filtered === "identity" && !("placeholder" in aadhaar) && !("validation" in aadhaar));
  check("Select options keep value and text only", JSON.stringify(state.options) === JSON.stringify([{ value: "MH", text: "Maharashtra" }, { value: "x", text: "" }]));
  check("Disabled select options are omitted even if supplied", locked.optionsOmitted === "disabled" && !("options" in locked));
  check("Radio choices keep value and label only", JSON.stringify(radio.choices) === JSON.stringify([{ value: "M", label: "Male", selector: "", selectorStable: false }]));
  check("File field keeps accept and multiple only", file.accept === "image/jpeg" && file.multiple === false && !("placeholder" in file));
  check("Invalid tag, filter class and sources are coerced", junk.tag === "input" && junk.filtered === null && junk.labelSource === null && junk.requiredSource === null && junk.form === null);
  check("Buttons keep form, type, label and selector only", JSON.stringify(clean.buttons) === JSON.stringify([{ form: 0, type: "submit", label: "Save", selector: "#btnSave" }]));
  check("Non-capture input is rejected", I.sanitizeCapture({ kind: "cookies" }) === null && I.sanitizeCapture(null) === null);
  check("Unsafe origin is blanked", I.sanitizeCapture({ kind: "form-structure", origin: "javascript:alert(1)" }).origin === "");
  check("exportJson is the sanitised capture", I.exportJson(dirty) === JSON.stringify(I.sanitizeCapture(dirty), null, 2));
}

out("\n=== Inspector: recapture diff ===\n");
{
  const field = (selector, label, extra = {}) => ({ selector, label, type: "text", section: "S", required: false, visible: true, disabled: false, readOnly: false, filtered: null, ...extra });
  const a = { origin: "https://x.gov.in", path: "/a", fields: [field("#name", "Name"), field("#religion", "Religion"), field("#mark", "Identification mark"), field("#cat", "Category", { options: [1, 2] })] };
  const b = { origin: "https://x.gov.in", path: "/a", fields: [field("#name", "Name"), field("#mark", "Visible identification mark"), field("#cat", "Category", { options: [1, 2, 3] }), field("#nominee", "Nominee Name")] };
  const d = plain(I.diffCaptures(a, b));
  check("Added, removed and changed fields reported by label", JSON.stringify(d) === JSON.stringify({ samePage: true, added: ["Nominee Name"], removed: ["Religion"], changed: ["Visible identification mark", "Category"] }), JSON.stringify(d));
  check("Identical captures have no differences", JSON.stringify(plain(I.diffCaptures(a, a))) === JSON.stringify({ samePage: true, added: [], removed: [], changed: [] }));
  check("Different page is flagged", I.diffCaptures(a, { ...b, path: "/b" }).samePage === false && I.diffCaptures(null, a) === null);
  const hidden = { ...a, fields: a.fields.map((f) => (f.selector === "#religion" ? { ...f, visible: false } : f)) };
  check("A field becoming hidden counts as changed", JSON.stringify(plain(I.diffCaptures(a, hidden).changed)) === JSON.stringify(["Religion"]));
  const p1 = { ...a, fields: [field("body > div:nth-of-type(2) > input", "District", { selectorKind: "path", name: "" })] };
  const p2 = { ...a, fields: [field("body > div:nth-of-type(1) > input", "Village", { selectorKind: "path", name: "" }), field("body > div:nth-of-type(3) > input", "District", { selectorKind: "path", name: "" })] };
  check("Positional selectors that shift are compared by structure, not reported as removed", JSON.stringify(plain(I.diffCaptures(p1, p2))) === JSON.stringify({ samePage: true, added: ["Village"], removed: [], changed: [] }), JSON.stringify(plain(I.diffCaptures(p1, p2))));
  const sd = plain(I.sanitizeDiff({ samePage: "yes", added: ["Nominee", "person@example.org", 5], removed: "x", changed: ["Welcome Synthetic"], extra: ["EXTRASECRET"] }));
  check("A diff from the content script keeps only sanitised labels", JSON.stringify(sd) === JSON.stringify({ samePage: false, added: ["Nominee"], removed: [], changed: [] }) && I.sanitizeDiff(null) === null, JSON.stringify(sd));
}

out("\n=== Inspector: content-script gatekeeping ===\n");
const EXT_ID = "a".repeat(32);
const POPUP_URL = `chrome-extension://${EXT_ID}/popup.html`;
const element = ({ matches = false, contains = false, inside = false } = {}) => ({ nodeType: 1, matches: () => matches, querySelector: () => (contains ? {} : null), closest: () => (inside ? {} : null) });
const RECORDS = {
  // An attribute change on a form control: the form is still rendering.
  form: () => [{ type: "attributes", target: element({ matches: true }) }],
  // A clock or ticker text node outside any label: must not delay a capture.
  ticker: () => [{ type: "characterData", target: { nodeType: 3, parentElement: element() } }, { type: "childList", target: element(), addedNodes: [{ nodeType: 3 }], removedNodes: [{ nodeType: 3 }] }],
};
async function runContent({ origin = "https://joinindianarmy.nic.in", framed = false, readyState = "complete", mutateFor = 0, records = "form" } = {}) {
  const listeners = [];
  const observers = [];
  const doc = { readyState, documentElement: {} };
  const fakeCapture = {
    kind: "form-structure",
    origin,
    path: "/Registration.aspx",
    fields: [{ tag: "input", type: "text", label: "Name", value: "SyntheticTypedName", selector: "#n" }, { tag: "input", type: "text", label: "person@example.org" }],
    counts: {},
    cookie: "COOKIESECRET",
  };
  let captured = 0;
  const win = {
    URL,
    Date,
    setTimeout,
    clearTimeout,
    document: doc,
    location: { origin, pathname: "/Registration.aspx", search: "?s=QUERYSECRET" },
    MutationObserver: class {
      constructor(cb) {
        this.cb = cb;
        this.on = false;
        observers.push(this);
      }
      observe() {
        this.on = true;
      }
      disconnect() {
        this.on = false;
      }
    },
    chrome: { runtime: { id: EXT_ID, getURL: (p) => `chrome-extension://${EXT_ID}/${p}`, onMessage: { addListener: (fn) => listeners.push(fn) } } },
  };
  win.globalThis = win;
  win.self = win;
  win.top = framed ? {} : win;
  const page = vm.createContext(win);
  vm.runInContext(read("inspect/origins.js"), page, { filename: "origins.js" });
  vm.runInContext(read("inspect/capture.js"), page, { filename: "capture.js" });
  page.MCInspect.captureFormStructure = () => {
    captured += 1;
    return fakeCapture;
  };
  vm.runInContext(read("inspect/content.js"), page, { filename: "content.js" });
  const ext = { id: EXT_ID, url: POPUP_URL };
  const send = (message, sender = ext) =>
    new Promise((resolve) => {
      if (!listeners.length) return resolve({ listener: false });
      const started = Date.now();
      let done = false;
      let reply = null;
      let keep;
      keep = listeners[0](message, sender, (r) => {
        done = true;
        reply = plain(r);
        if (keep !== undefined) resolve({ listener: true, keep, response: reply, ms: Date.now() - started });
      });
      if (keep !== true) resolve({ listener: true, keep, response: reply });
      else
        setTimeout(() => {
          if (!done) resolve({ listener: true, keep, response: null, timedOut: true });
        }, 7000);
    });
  if (mutateFor) {
    const stop = Date.now() + mutateFor;
    const tick = () => {
      for (const o of observers) if (o.on) o.cb(RECORDS[records]());
      if (Date.now() < stop) setTimeout(tick, 100);
    };
    setTimeout(tick, 50);
  }
  return { send, ext, listeners, observers, doc, captured: () => captured };
}

{
  check("No listener on an origin outside the allowlist", (await runContent({ origin: "https://example.com" })).listeners.length === 0);
  check("No listener on a look-alike origin", (await runContent({ origin: "https://joinindianarmy.nic.in.example.com" })).listeners.length === 0);
  check("No listener on the http variant of an allowed host", (await runContent({ origin: "http://joinindianarmy.nic.in" })).listeners.length === 0);
  check("No listener on the shared vendor host", (await runContent({ origin: "https://cdn.digialm.com" })).listeners.length === 0);
  check("No listener inside a frame of an allowed origin", (await runContent({ framed: true })).listeners.length === 0);

  const r = await runContent();
  check("Listener registered on an allowed origin in the top frame", r.listeners.length === 1);
  const rejects = [
    ["a web page tab", { type: "MC_INSPECT_CAPTURE" }, { ...r.ext, tab: { id: 1 } }],
    ["another extension", { type: "MC_INSPECT_CAPTURE" }, { id: "b".repeat(32), url: `chrome-extension://${"b".repeat(32)}/popup.html` }],
    ["another page of this extension", { type: "MC_INSPECT_CAPTURE" }, { id: EXT_ID, url: `chrome-extension://${EXT_ID}/other.html` }],
    ["a sender without a URL", { type: "MC_INSPECT_CAPTURE" }, { id: EXT_ID }],
    ["no sender", { type: "MC_INSPECT_CAPTURE" }, null],
    ["an extra key", { type: "MC_INSPECT_CAPTURE", fill: true }, r.ext],
    ["an engine fill message", { type: "MC_FILL", v: 1 }, r.ext],
    ["an engine detect message", { type: "MC_DETECT", v: 1 }, r.ext],
    ["a string message", "MC_INSPECT_CAPTURE", r.ext],
    ["null", null, r.ext],
  ];
  for (const [what, msg, sender] of rejects) {
    const res = await r.send(msg, sender);
    check(`Ignores ${what} without replying or capturing`, res.keep === false && res.response === null && r.captured() === 0);
  }
  const ok = await r.send({ type: "MC_INSPECT_CAPTURE" });
  const blob = JSON.stringify(ok.response);
  check("Answers its own popup asynchronously after the quiet period", ok.keep === true && ok.response?.type === "MC_INSPECT_RESULT" && ok.ms >= 450 && ok.response.capture.settled === true, JSON.stringify({ keep: ok.keep, ms: ok.ms }));
  check("Reply is re-sanitised (no typed value, email, cookie or query)", !/SyntheticTypedName|person@example\.org|COOKIESECRET|QUERYSECRET|"value"|"cookie"/.test(blob), blob.slice(0, 200));
  check("Observer is disconnected after capture", r.observers.every((o) => !o.on) && r.captured() === 1);
  check("First capture on a page load has sequence 1 and no comparison", ok.response?.sequence === 1 && ok.response.diff === null);
  const again = await r.send({ type: "MC_INSPECT_CAPTURE" });
  check("Recapture is compared with the previous capture held by the content script", again.response?.sequence === 2 && JSON.stringify(again.response.diff) === JSON.stringify({ samePage: true, added: [], removed: [], changed: [] }), JSON.stringify(again.response?.diff));
  const [first, second] = await Promise.all([r.send({ type: "MC_INSPECT_CAPTURE" }), r.send({ type: "MC_INSPECT_CAPTURE" })]);
  check(
    "A second request while a capture is running is refused immediately",
    first.response?.type === "MC_INSPECT_RESULT" && second.response?.type === "MC_INSPECT_ERROR" && second.response.reason === "busy" && second.keep === false && r.captured() === 3,
    JSON.stringify([first.response?.type, second.response])
  );

  const busy = await runContent({ mutateFor: 1200 });
  const b = await busy.send({ type: "MC_INSPECT_CAPTURE" });
  check("Waits for form mutations to stop before capturing", b.response?.capture.settled === true && b.ms >= 1500, String(b.ms));
  const ticking = await runContent({ mutateFor: 3000, records: "ticker" });
  const t = await ticking.send({ type: "MC_INSPECT_CAPTURE" });
  check("Clock and ticker mutations outside the form do not delay the capture", t.response?.capture.settled === true && t.ms < 1200, String(t.ms));

  const loading = await runContent({ readyState: "loading" });
  setTimeout(() => {
    loading.doc.readyState = "complete";
  }, 900);
  const l = await loading.send({ type: "MC_INSPECT_CAPTURE" });
  check("Waits for the document to finish loading", l.response?.capture.settled === true && l.ms >= 900, String(l.ms));
}

out("\n=== Inspector: manifests, allowlist and fixtures ===\n");
{
  const inspectManifest = JSON.parse(read("inspect/manifest.json"));
  const productManifest = JSON.parse(read("manifest.json"));
  const cs = inspectManifest.content_scripts;
  const matches = cs[0].matches;
  const expected = ["https://joinindianarmy.nic.in", "https://www.joinindianarmy.nic.in", "https://gdsrect.indiapost.gov.in", "https://www.joinindiannavy.gov.in", "https://iafrecruitment.edcil.co.in", "https://pmegp.msme.gov.in", "https://reg.gst.gov.in"];
  const expectedMatches = [...expected.slice(0, -2).map((o) => `${o}/*`), "https://pmegp.msme.gov.in/Home/HomePage*", "https://reg.gst.gov.in/registration*"];
  check("Inspector manifest matches are the exact official origins, and only the application page on PMEGP and GST", JSON.stringify(matches) === JSON.stringify(expectedMatches), JSON.stringify(matches));
  check(
    "origins.js allowlist has one exact origin per manifest match and is frozen",
    JSON.stringify(plain(I.ALLOWED_ORIGINS)) === JSON.stringify(expected) && JSON.stringify(matches.map((m) => new URL(m.replace(/\*$/, "")).origin)) === JSON.stringify(expected) && Object.isFrozen(I.ALLOWED_ORIGINS)
  );
  check("One content script, top frame only, loads origins.js then capture.js then content.js", cs.length === 1 && cs[0].all_frames === false && !cs[0].match_about_blank && JSON.stringify(cs[0].js) === JSON.stringify(["origins.js", "capture.js", "content.js"]));
  check("No API or host permissions", JSON.stringify(inspectManifest.permissions) === "[]" && JSON.stringify(inspectManifest.host_permissions) === "[]" && !inspectManifest.optional_permissions && !inspectManifest.optional_host_permissions);
  check("No background, web-accessible resources or externally_connectable", !inspectManifest.background && !inspectManifest.web_accessible_resources && !inspectManifest.externally_connectable);
  check("Strict extension CSP", /script-src 'self'/.test(inspectManifest.content_security_policy?.extension_pages || "") && /object-src 'none'/.test(inspectManifest.content_security_policy.extension_pages) && !/unsafe/.test(inspectManifest.content_security_policy.extension_pages));
  check("No wildcard host, scheme or shared vendor host", matches.every((m) => !m.includes("*.") && !m.startsWith("*") && !m.startsWith("http:") && !/digialm|navydmpr|<all_urls>/.test(m)));
  check(
    "Production extension has no government portal access beyond the PMEGP and GST application pages",
    !JSON.stringify(productManifest).replace('"https://pmegp.msme.gov.in/Home/HomePage*"', "").replace('"https://reg.gst.gov.in/registration*"', "").match(/gov\.in|nic\.in|joinindianarmy|gdsrect|edcil|digialm|navydmpr|cdac\.in|pmegp|gst/i)
  );
  check("Inspector and production extension reach the same single PMEGP page", JSON.stringify(productManifest.content_scripts.flatMap((c) => c.matches).filter((m) => /pmegp/.test(m))) === JSON.stringify(matches.filter((m) => /pmegp/.test(m))));
  check("Inspector and production extension reach the same single GST registration page", JSON.stringify(productManifest.content_scripts.flatMap((c) => c.matches).filter((m) => /gst/.test(m))) === JSON.stringify(matches.filter((m) => /gst/.test(m))));

  const observed = JSON.parse(read("inspect/fixtures/observed-public-forms.json"));
  const blob = JSON.stringify(observed);
  check("Observed fixture declares no application form and no adapter", observed.applicationFormInspected === false && observed.adapterImplemented === false && observed.portals.every((p) => p.applicationFormInspected === false));
  check("Observed fixture has Army, Postal, Navy and Air Force", ["army", "postal-recruitment", "navy", "airforce"].every((id) => observed.portals.some((p) => p.id === id)));
  check("Observed fixture records the Army CAPTCHA gate that was actually seen", blob.includes("txtCaptchaCode") && blob.includes("form1"));
  check("Observed fixture records the Postal recovery controls, not an application adapter", blob.includes("identifierType") && blob.includes("account recovery"));
  check("Observed fixture records the Navy register controls that were actually seen", blob.includes("photo_id_option") && blob.includes("PAN Card") && blob.includes("optionValues"));
  check("Observed fixture has no email, Aadhaar-shaped number or viewstate blob", !/[^\s@]+@[^\s@]+\.[^\s@]+/.test(blob) && !/\b[2-9]\d{11}\b/.test(blob) && !/__VIEWSTATE"\s*:\s*"[A-Za-z0-9+/=]{20,}/.test(blob));
}

out("\n=== Inspector: static source scan ===\n");
{
  const files = ["origins.js", "capture.js", "content.js", "popup.js", "popup.html"];
  const src = Object.fromEntries(files.map((f) => [f, read(`inspect/${f}`)]));
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
  const scan = (names, re) => names.filter((f) => re.test(code(src[f])));
  const all = files;
  const page = ["origins.js", "capture.js", "content.js"];
  let bad = scan(all, /localStorage|sessionStorage|indexedDB|chrome\.storage|caches\./);
  check("No extension or web storage anywhere in the inspector", bad.length === 0, bad.join(", "));
  bad = scan(all, /document\.cookie|chrome\.cookies/);
  check("No cookie access", bad.length === 0, bad.join(", "));
  bad = scan(all, /\bfetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|navigator\.connection|new Image\(/);
  check("No network API anywhere in the inspector", bad.length === 0, bad.join(", "));
  bad = scan(all, /innerHTML|outerHTML\s*=|insertAdjacentHTML|document\.write|\beval\(|new Function\(/);
  check("No HTML injection or dynamic code", bad.length === 0, bad.join(", "));
  bad = scan(page, /\.submit\(|requestSubmit|\.click\(|dispatchEvent|\.focus\(|\.blur\(|\.select\(\)|scrollIntoView/);
  check("Page-side scripts never submit, click, dispatch events, focus or scroll", bad.length === 0, bad.join(", "));
  bad = scan(page, /\.(value|checked|selectedIndex|textContent|innerText|src|href|action)\s*=[^=]|\.setAttribute\(|\.removeAttribute\(|\.append(Child)?\(|\.remove\(\)|\.replaceChildren\(/);
  check("Page-side scripts never write to the page", bad.length === 0, bad.join(", "));
  bad = scan(page, /location\s*=|location\.(assign|replace|reload)|history\.|window\.open|\.postMessage\(/);
  check("Page-side scripts never navigate or post messages", bad.length === 0, bad.join(", "));
  bad = scan(all, /MCEngine|MC_FILL|MC_DETECT|MC_PREVIEW|chrome\.runtime\.(sendMessage|connect)|onMessageExternal|onConnect/);
  check("No link to the production engine and no outbound runtime messaging", bad.length === 0, bad.join(", "));
  check("Popup has no inline script or handler and loads only local scripts", !/<script(?![^>]*\bsrc=)/i.test(src["popup.html"]) && !/\son[a-z]+=/i.test(src["popup.html"]) && [...src["popup.html"].matchAll(/<script[^>]*src="([^"]+)"/g)].every((m) => /^[a-z-]+\.js$/.test(m[1])));
  check("Popup downloads only the sanitised export", /exportJson\(last\)/.test(src["popup.js"]) && !/JSON\.stringify\(/.test(code(src["popup.js"])));
  check("Popup re-checks origin and personal-looking content before download", /ALLOWED_ORIGINS\.includes\(capture\.origin\)/.test(src["popup.js"]) && /looksLikeApplicantValue\(I\.exportJson\(capture\)\)/.test(src["popup.js"]));
  check("No test hook left in shipped inspector", !/__mcInspect|__test/i.test(Object.values(src).join("\n")));
}

out(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed ? 1 : 0);

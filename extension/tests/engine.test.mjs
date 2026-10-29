/**
 * Universal form engine tests (Node, synthetic data only). Run: node extension/tests/engine.test.mjs
 * DOM discovery/filling is exercised in real Chrome/Edge by extension/tests/portal-smoke.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { createApiClient, sanitizeFields, summarizeAutofill } from "../src/api.js";
import {
  buildTrialRecord,
  discardOnPage,
  describeFillResult,
  describeGaps,
  describeItemStatus,
  describePortal,
  describeTrial,
  describeTrialItem,
  describeTrialResult,
  fillApproved,
  fillTrial,
  preparePreview,
  prepareTrial,
  probePage,
} from "../src/popup-controller.js";

const E = globalThis.MCEngine;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const ENGINE_FILES = ["core", "registry", "adapters", "classify", "values", "preview", "protocol", "dom"].map((f) => `src/engine/${f}.js`);

let passed = 0;
let failed = 0;
const out = console.log.bind(console);
function check(name, cond, detail = "") {
  if (cond) passed += 1;
  else failed += 1;
  out(`  ${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail ? `: ${detail}` : ""}`);
}
const throws = (fn) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};
const consoleCalls = [];
for (const m of ["log", "info", "warn", "error", "debug"]) console[m] = (...a) => consoleCalls.push([m, a]);

function response(status, body, type = "application/json") {
  return { ok: status >= 200 && status < 300, status, headers: { get: (h) => (h.toLowerCase() === "content-type" ? type : null) }, json: async () => body };
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

// Synthetic applicant (fake values only).
const A = (value) => ({ status: "available", value });
const M = { status: "missing", value: null };
const I = { status: "invalid", value: null };
const addr = (o) => ({ line: A(o.line), village: A(o.village), tehsil: A(o.tehsil), district: A(o.district), state: A(o.state), pincode: A(o.pincode) });
const FIELDS = {
  personal: {
    fullName: A("Test Applicant"), fatherName: A("Test Father"), motherName: M, dob: A("2004-05-17"), gender: A("male"),
    category: A("obc"), religion: A("Hindu"), maritalStatus: A("unmarried"), nationality: A("Indian"),
  },
  contact: { mobile: A("9876500001"), email: I },
  permanentAddress: addr({ line: "1 Test Road", village: "Testpur", tehsil: "Testtehsil", district: "Belagavi", state: "Karnataka", pincode: "590001" }),
  correspondenceAddress: addr({ line: "1 Test Road", village: "Testpur", tehsil: "Testtehsil", district: "Belagavi", state: "Karnataka", pincode: "590001" }),
  education: {
    tenth: { board: A("Test Board"), rollNumber: A("R-10"), passingYear: A(2020), percentage: A(88.5) },
    twelfth: { board: A("Test PU Board"), rollNumber: M, passingYear: A(2022), percentage: A(76) },
    graduation: { board: M, rollNumber: M, passingYear: M, percentage: M },
  },
  exams: [{ examName: A("Mock Exam"), applicationNumber: A("APP-1"), rollNumber: M, examCentre: M, examDate: A("2026-09-01") }],
  identity: { aadhaarMasked: A("XXXX-XXXX-1234"), panMasked: A("XXXXXX234F") },
  requestDetails: { referenceNumber: A("REF-TEST-1") },
};

let seq = 0;
function desc(o) {
  const d = {
    id: `f${(seq += 1)}`, tag: "input", type: "text", name: "", domId: "", autocomplete: "", label: "", accessibleName: "", section: "",
    placeholder: "", title: "", pattern: "", required: false, disabled: false, readOnly: false, visible: true, maxLength: 0,
    options: null, choices: null, nearCaptcha: false, hasValue: false, ...o,
  };
  d.kind = o.kind || E.classify.controlKind(d);
  d.signature = `sig-${d.id}`;
  return d;
}
const opts = (...texts) => [{ value: "", text: "-- Select --" }, ...texts.map((t, i) => ({ value: typeof t === "string" ? `v${i}` : t.value, text: typeof t === "string" ? t : t.text }))];

async function main() {
  out("\n=== Universal form engine tests ===\n");

  // ── Registry ───────────────────────────────────────────────────
  {
    const R = E.registry;
    const ids = R.list().map((p) => p.id);
    check("Registry: structurally valid", R.validate().length === 0, R.validate().join("; "));
    check(
      "Registry: all 12 required categories present",
      ["army", "navy", "airforce", "india-post", "postal-recruitment", "pmegp", "pan", "gst", "police-verification", "domicile", "khata", "other"].every((id) => ids.includes(id)) && ids.length === 12
    );
    check(
      "Registry: every entry has service, status, verification, limitations and coverage",
      R.list().every((p) => p.service && Object.values(R.STATUS).includes(p.status) && p.verification?.checkedOn && p.limitations.length && p.testCoverage.length)
    );
    check("Registry: no portal claimed verified_supported and no adapter attached", R.list().every((p) => p.status !== R.STATUS.VERIFIED_SUPPORTED && p.adapterId === null));
    const verifiedUrls = Object.fromEntries(R.list().filter((p) => p.officialUrl).map((p) => [p.id, p.officialUrl]));
    check(
      "Registry: official URLs are exactly the verified set (no unverified additions)",
      JSON.stringify(verifiedUrls) ===
        JSON.stringify({
          army: "https://joinindianarmy.nic.in/",
          navy: "https://www.joinindiannavy.gov.in/",
          airforce: "https://iafrecruitment.edcil.co.in/agniveervayu/",
          "india-post": "https://www.indiapost.gov.in/",
          "postal-recruitment": "https://gdsrect.indiapost.gov.in/gdscandidate",
          pmegp: "https://pmegp.msme.gov.in/",
          pan: "https://eportal.incometax.gov.in/iec/foservices/",
          gst: "https://reg.gst.gov.in/registration/",
          domicile: "https://serviceonline.gov.in/",
        }),
      JSON.stringify(verifiedUrls)
    );
    check("Registry: no portal recorded as unreachable keeps an official URL", R.list().every((p) => p.status !== R.STATUS.NOT_ACCESSIBLE || p.officialUrl === null));
    check(
      "Registry: PAN is manual, points at the Income Tax portal and grants no origin (agency hosts not inspected)",
      R.byId("pan").status === R.STATUS.MANUAL && R.byId("pan").origins.length === 0 && /Aadhaar e-KYC or OTP, e-sign and online payment/.test(R.byId("pan").limitations.join(" "))
    );
    {
      const p = R.byId("pmegp");
      check(
        "Registry: PMEGP is adapter-pending (not verified), origin-scoped and records the Aadhaar gate",
        p.status === R.STATUS.ADAPTER_PENDING && p.adapterId === null && JSON.stringify(p.origins) === JSON.stringify(["https://pmegp.msme.gov.in"]) && /Aadhaar validation and OTP/.test(p.limitations.join(" "))
      );
      check(
        "Registry: PMEGP readiness records public form inspected, four-field adapter written and local tests passed; post-validation state and real-page fill not verified",
        JSON.stringify(p.readiness) ===
          JSON.stringify({ publicFormInspected: true, adapterImplemented: true, localFixtureTestsPassed: true, postValidationVerified: false, realPageFillVerified: false }) &&
          Object.isFrozen(p.readiness) && JSON.stringify(R.READINESS) === JSON.stringify(Object.keys(p.readiness)),
        JSON.stringify(p.readiness)
      );
      check(
        "Registry: PMEGP limitations say filling is off, name the page match and what must be verified first",
        /Filling is off/.test(p.limitations.join(" ")) && p.limitations.join(" ").includes("https://pmegp.msme.gov.in/Home/HomePage*") && /after Aadhaar validation/.test(p.limitations.join(" ")) &&
          /supervised fill on the real page/.test(p.limitations.join(" ")) && !p.limitations.some((l) => /does not run on this portal/.test(l))
      );
      check("Registry: PMEGP status label does not claim support", /filling off until verified/.test(R.STATUS_LABELS[p.status]) && !/supported/i.test(R.STATUS_LABELS[p.status]));
      check("Registry: only PMEGP and GST have a readiness record", R.list().every((e) => (e.id === "pmegp" || e.id === "gst") === (e.readiness !== null)));
      const asSupported = (patch) => R.validate([{ ...p, status: R.STATUS.VERIFIED_SUPPORTED, adapterId: "pmegp-application", supportedForms: ["new-unit"], supportedFields: ["contact.mobile"], ...patch }]);
      const done = { publicFormInspected: true, adapterImplemented: true, localFixtureTestsPassed: true, postValidationVerified: true, realPageFillVerified: true };
      check(
        "Registry: PMEGP cannot become verified_supported while post-validation or real-page fill is unverified",
        asSupported({}).some((m) => /every readiness check/.test(m)) && asSupported({ readiness: { ...done, realPageFillVerified: false } }).some((m) => /every readiness check/.test(m)) &&
          asSupported({ readiness: { ...done, postValidationVerified: false } }).some((m) => /every readiness check/.test(m)) && asSupported({ readiness: done }).length === 0,
        JSON.stringify(asSupported({ readiness: done }))
      );
      check("Registry: verified_supported without any readiness record is rejected", asSupported({ readiness: null }).some((m) => /every readiness check/.test(m)));
      check(
        "Registry: malformed readiness records and a pending status with nothing pending are rejected",
        R.validate([{ ...p, readiness: { ...p.readiness, extra: true } }]).some((m) => /readiness must be/.test(m)) &&
          R.validate([{ ...p, readiness: { ...p.readiness, postValidationVerified: "yes" } }]).some((m) => /readiness must be/.test(m)) &&
          R.validate([{ ...p, readiness: done }]).some((m) => /unfinished readiness/.test(m)) &&
          R.validate([{ ...p, readiness: { ...p.readiness, adapterImplemented: false } }]).some((m) => /written adapter/.test(m)) &&
          R.validate([{ ...p, status: R.STATUS.RESEARCHED }]).some((m) => /pending, supervised or supported adapter/.test(m))
      );
      check("Registry: a pending portal may not name an adapter (the engine would register it)", R.validate([{ ...p, adapterId: "pmegp-application" }]).some((m) => /requires an adapter/.test(m)));
    }
    {
      const g = R.byId("gst");
      check(
        "Registry: GST is adapter-pending (not verified), origin-scoped and records the Proceed gate",
        g.status === R.STATUS.ADAPTER_PENDING && g.adapterId === null && JSON.stringify(g.origins) === JSON.stringify(["https://reg.gst.gov.in"]) && /Proceed/.test(g.limitations.join(" "))
      );
      check(
        "Registry: GST readiness records the public form and the two-field adapter; the page after Proceed and real-page fill are not verified",
        JSON.stringify(g.readiness) ===
          JSON.stringify({ publicFormInspected: true, adapterImplemented: true, localFixtureTestsPassed: true, postValidationVerified: false, realPageFillVerified: false })
      );
      check(
        "Registry: GST limitations say filling is off, name the page match and what must be verified first",
        /Filling is off/.test(g.limitations.join(" ")) && g.limitations.join(" ").includes("https://reg.gst.gov.in/registration*") && /after Proceed/.test(g.limitations.join(" ")) &&
          /supervised fill on the real page/.test(g.limitations.join(" ")) && !g.limitations.some((l) => /does not run on this portal/.test(l))
      );
      const asSupported = (patch) => R.validate([{ ...g, status: R.STATUS.VERIFIED_SUPPORTED, adapterId: "gst-registration", supportedForms: ["part-a"], supportedFields: ["contact.email"], testCoverage: ["gst fixture"], ...patch }]);
      const done = { publicFormInspected: true, adapterImplemented: true, localFixtureTestsPassed: true, postValidationVerified: true, realPageFillVerified: true };
      check(
        "Registry: GST cannot become verified_supported while the page after Proceed or real-page fill is unverified",
        asSupported({}).some((m) => /every readiness check/.test(m)) && asSupported({ readiness: done }).length === 0
      );
    }
    check(
      "Registry: official URLs are the verified https hosts only",
      Object.entries(verifiedUrls).every(([id, u]) =>
        id === "airforce" ? u === "https://iafrecruitment.edcil.co.in/agniveervayu/" : /^https:\/\/[a-z0-9.-]+\.(gov|nic)\.in\//.test(u)
      )
    );
    check(
      "Registry: army, navy, air force and postal recruitment were researched and are not verified adapters",
      ["army", "navy", "airforce", "postal-recruitment"].every((id) => {
        const p = R.byId(id);
        return p.status === R.STATUS.RESEARCHED && p.adapterId === null && /not inspected|no adapter is registered/i.test(`${p.verification.result} ${p.limitations.join(" ")}`);
      })
    );
    check(
      "Registry: identify() matches exact origin",
      R.identify("https://joinindianarmy.nic.in/Authentication.aspx")?.id === "army" &&
        R.identify("https://www.joinindianarmy.nic.in/Authentication.aspx")?.id === "army" &&
        R.identify("https://gdsrect.indiapost.gov.in/gdscandidate/forgot-registration")?.id === "postal-recruitment" &&
        R.identify("https://iafrecruitment.edcil.co.in/agniveervayu/")?.id === "airforce" &&
        R.identify("https://reg.gst.gov.in/registration/new")?.id === "gst" &&
        R.identify("https://cdn.digialm.com/EForms/configuredHtml/1258/101256/login.html") === null
    );
    check(
      "Registry: identify() rejects look-alike / http / embedded / garbage URLs",
      ["https://joinindianarmy.nic.in.evil.com/", "http://joinindianarmy.nic.in/", "https://evil.example/?u=https://joinindianarmy.nic.in", "https://nic.in/", "not a url", ""].every((u) => R.identify(u) === null)
    );
    const bad = R.validate([{ ...R.byId("army"), status: R.STATUS.VERIFIED_SUPPORTED }, { ...R.byId("pan"), officialUrl: "http://pan.example/" }]);
    check("Registry: validate() rejects supported-without-adapter and non-https URLs", bad.some((p) => p.includes("adapter")) && bad.some((p) => p.includes("https")));
  }

  // ── Adapter registration ───────────────────────────────────────
  {
    const AD = E.adapters;
    check("Adapters: no production adapters registered (no government portal is verified)", AD.list().length === 0);
    const base = {
      id: "unit-mock", testOnly: true, portal: { id: "unit", name: "Unit mock portal" }, origins: ["http://127.0.0.1:47999"],
      forms: [{ id: "reg", name: "Registration", match: { pathPrefix: "/register", selector: "form#reg" }, genericFields: true, fields: [{ selector: "#dob", key: "personal.dob", dateFormat: "DD/MM/YYYY" }] }],
    };
    const a = AD.register(base);
    check("Adapters: valid test adapter registers and is frozen", Object.isFrozen(a) && Object.isFrozen(a.forms[0]) && AD.forOrigin("http://127.0.0.1:47999") === a);
    check("Adapters: origin lookup is exact", AD.forOrigin("http://127.0.0.1:4799") === null && AD.forOrigin("http://127.0.0.1:47999/") === null && AD.forOrigin("https://127.0.0.1:47999") === null);
    check("Adapters: test portal metadata marked test_fixture", AD.portalFor(a).status === "test_fixture");
    const reject = (patch, label) => check(`Adapters: rejects ${label}`, throws(() => AD.register({ ...base, id: `x-${(seq += 1)}`, ...patch })));
    reject({ id: "unit-mock" }, "duplicate id");
    reject({ origins: ["https://joinindianarmy.nic.in"] }, "non-loopback origin on a test adapter");
    reject({ testOnly: false, portal: undefined, portalId: "army", origins: ["https://joinindianarmy.nic.in"] }, "production adapter for a portal not verified_supported");
    reject({ forms: [{ ...base.forms[0], fields: [{ selector: "#x", key: "identity.aadhaarMasked" }] }] }, "identity keys");
    reject({ forms: [{ ...base.forms[0], fields: [{ selector: "#x", key: "personal.shoeSize" }] }] }, "unknown applicant keys");
    reject({ forms: [{ ...base.forms[0], fields: [{ selector: "#x", key: "personal.dob", dateFormat: "YY/MM/DD" }] }] }, "unknown date formats");
    reject({ forms: [{ ...base.forms[0], match: { selector: "form" } }] }, "forms without pathPrefix");
    reject({ forms: [{ ...base.forms[0], onFill: () => true }] }, "function hooks (adapters are declarative)");
    reject({ forms: [] }, "adapters without forms");
    const page = (pathname, sel = true, title = "") => ({ pathname, title, hasSelector: () => sel });
    check("Form identification: path + selector must both match", AD.matchForm(a, page("/register/step1"))?.id === "reg" && AD.matchForm(a, page("/register", false)) === null && AD.matchForm(a, page("/login")) === null);
  }

  // ── Field classification ───────────────────────────────────────
  {
    const C = E.classify;
    const kinds = [["text", "text"], ["search", "text"], ["email", "email"], ["tel", "tel"], ["number", "number"], ["date", "date"], ["radio", "radio"], ["checkbox", "checkbox"], ["file", "file"], ["password", "password"], ["range", "unsupported"], ["color", "unsupported"], ["time", "unsupported"], ["datetime-local", "unsupported"]];
    check("Classify: input types → kinds (unknown types unsupported)", kinds.every(([t, k]) => C.controlKind({ tag: "input", type: t }) === k));
    check("Classify: textarea / select / multi-select / custom widgets", C.controlKind({ tag: "textarea" }) === "textarea" && C.controlKind({ tag: "select" }) === "select" && C.controlKind({ tag: "select", multiple: true }) === "unsupported" && C.controlKind({ tag: "custom" }) === "unsupported");
    const map = (o) => C.mapField(desc(o));
    const strongCases = [
      [{ label: "Full Name" }, "personal.fullName"], [{ label: "Name of the Candidate *" }, "personal.fullName"], [{ label: "Father's Name" }, "personal.fatherName"],
      [{ label: "Mother’s Name" }, "personal.motherName"], [{ label: "Date of Birth", placeholder: "DD/MM/YYYY" }, "personal.dob"], [{ label: "Mobile Number", type: "tel" }, "contact.mobile"],
      [{ label: "E-mail ID", type: "email" }, "contact.email"], [{ name: "txtFatherName" }, "personal.fatherName"], [{ autocomplete: "email", type: "email" }, "contact.email"],
      [{ label: "Gender", tag: "select", type: null, options: opts("Male", "Female") }, "personal.gender"], [{ label: "Marital Status", tag: "select", type: null, options: opts("Married") }, "personal.maritalStatus"],
    ];
    const bad = strongCases.filter(([o, key]) => {
      const m = map(o);
      return m.key !== key || m.reason !== null || m.confidence < E.core.CONFIDENCE_THRESHOLD;
    });
    check("Classify: label / name / autocomplete mapping above threshold", bad.length === 0, JSON.stringify(bad.map(([o]) => o.label || o.name || o.autocomplete)));
    const weak = map({ label: "Name" });
    check("Classify: generic 'Name' stays below threshold", weak.key === "personal.fullName" && weak.confidence < E.core.CONFIDENCE_THRESHOLD && weak.reason === "low_confidence");
    check("Classify: 'Nominee Name' not confidently mapped", map({ label: "Nominee Name" }).reason !== null);
    check(
      "Classify: address fields need section context",
      map({ label: "PIN Code", section: "Permanent Address" }).key === "permanentAddress.pincode" &&
        map({ label: "PIN Code", section: "Address for Correspondence" }).key === "correspondenceAddress.pincode" &&
        map({ label: "PIN Code" }).reason === "no_section_context" &&
        map({ label: "District", tag: "select", type: null, options: opts("Belagavi"), section: "Permanent Address" }).key === "permanentAddress.district"
    );
    check(
      "Classify: education level from label or section; never guessed",
      map({ label: "Year of Passing", section: "10th / Matriculation" }).key === "education.tenth.passingYear" &&
        map({ label: "Board", section: "12th (Higher Secondary)" }).key === "education.twelfth.board" &&
        map({ label: "Percentage", section: "SSC" }).key === "education.tenth.percentage" &&
        !String(map({ label: "Year of Passing" }).key || "").startsWith("education.")
    );
    const confident = (o, key) => {
      const m = map(o);
      return m.key === key && m.reason === null && m.confidence >= E.core.CONFIDENCE_THRESHOLD;
    };
    check(
      "Classify: context word inside the label ('Permanent Address', 'Correspondence PIN Code', '10th Percentage')",
      confident({ label: "Permanent Address", tag: "textarea", type: null }, "permanentAddress.line") &&
        confident({ label: "Correspondence PIN Code" }, "correspondenceAddress.pincode") &&
        confident({ label: "10th Percentage" }, "education.tenth.percentage") &&
        map({ label: "Address" }).reason === "no_section_context"
    );
    check("Classify: conflicting address context → not confident", map({ label: "Address", section: "Permanent and Present Address" }).reason !== null);
    check("Classify: near-equal candidates flagged ambiguous", map({ label: "Mobile or Email" }).ambiguous === true);
    check("Classify: kind compatibility (DOB select not mapped to dob)", map({ label: "Date of Birth", tag: "select", type: null, options: opts("1") }).key !== "personal.dob");
    const prot = (o) => C.protection(desc(o));
    const protCases = [
      [{ label: "Enter Captcha" }, "captcha"], [{ label: "Type the code", nearCaptcha: true }, "captcha"], [{ label: "Security Code" }, "captcha"], [{ label: "Enter OTP" }, "otp"],
      [{ label: "One Time Password" }, "otp"], [{ type: "password", label: "Choose" }, "password"], [{ label: "Password" }, "password"], [{ label: "Card Number" }, "payment"],
      [{ label: "UPI ID" }, "payment"], [{ type: "checkbox", label: "I hereby declare that the information is true" }, "declaration"],
      [{ type: "checkbox", label: "I agree", section: "Declaration" }, "declaration"], [{ type: "radio", label: "Accept terms", choices: [] }, "declaration"],
      [{ label: "Aadhaar Number" }, "identity"], [{ name: "panNo" }, "identity"], [{ label: "Permanent Account Number" }, "identity"], [{ type: "file", label: "Upload photograph" }, "document"],
    ];
    const protBad = protCases.filter(([o, reason]) => prot(o)?.reason !== reason);
    check("Classify: CAPTCHA, OTP, password, payment, declaration, identity, document protected", protBad.length === 0, JSON.stringify(protBad.map(([o]) => o.label || o.name)));
    check("Classify: ordinary fields are not protected ('PIN Code', 'Pincode', 'Category')", [{ label: "PIN Code" }, { label: "Pincode" }, { label: "Category" }].every((o) => prot(o) === null));
    check("Classify: confirmation fields detected", C.isConfirmation(desc({ label: "Confirm Email" })) && C.isConfirmation(desc({ label: "Re-enter Mobile Number" })) && !C.isConfirmation(desc({ label: "Mobile Number" })));
  }

  // ── Values ─────────────────────────────────────────────────────
  {
    const Vv = E.values;
    check("Values: read available / missing / invalid / nested exam", Vv.read(FIELDS, "personal.fullName").value === "Test Applicant" && Vv.read(FIELDS, "personal.motherName").status === "missing" && Vv.read(FIELDS, "contact.email").status === "invalid" && Vv.read(FIELDS, "exams[0].examName").value === "Mock Exam" && Vv.read(FIELDS, "nope.x").status === "missing");
    const differs = { ...FIELDS, correspondenceAddress: { ...FIELDS.correspondenceAddress, pincode: A("560001") } };
    const absent = { ...FIELDS, correspondenceAddress: { line: M, village: M, tehsil: M, district: M, state: M, pincode: M } };
    check(
      "Values: derived 'same as permanent' true / false / missing (never assumed)",
      Vv.read(FIELDS, "derived.correspondenceSameAsPermanent").value === true && Vv.read(differs, "derived.correspondenceSameAsPermanent").value === false && Vv.read(absent, "derived.correspondenceSameAsPermanent").status === "missing"
    );
    const f = (o, key, value, override) => Vv.format(desc(o), key, value, override);
    check(
      "Values: date formats (ISO, DD/MM/YYYY, dd-mm-yyyy, MM/DD/YYYY, override)",
      f({ type: "date" }, "personal.dob", "2004-05-17").value === "2004-05-17" && f({ placeholder: "DD/MM/YYYY" }, "personal.dob", "2004-05-17").value === "17/05/2004" &&
        f({ placeholder: "dd-mm-yyyy" }, "personal.dob", "2004-05-17").value === "17-05-2004" && f({ title: "MM/DD/YYYY" }, "personal.dob", "2004-05-17").value === "05/17/2004" &&
        f({}, "personal.dob", "2004-05-17", { dateFormat: "DD.MM.YYYY" }).value === "17.05.2004"
    );
    check("Values: unknown date format is never guessed", f({ label: "Date of Birth" }, "personal.dob", "2004-05-17").status === "format_unknown");
    check("Values: over-long value not truncated", f({ maxLength: 5 }, "personal.fullName", "Test Applicant").status === "too_long");
    const sel = (options, key, value) => f({ tag: "select", type: null, options }, key, value);
    check("Values: select option matching incl. synonyms, placeholder excluded", sel(opts("Male", "Female"), "personal.gender", "male").display === "Male" && sel(opts("General (UR)", "Other Backward Classes"), "personal.category", "obc").display === "Other Backward Classes" && sel(opts("Single", "Married"), "personal.maritalStatus", "unmarried").display === "Single");
    check("Values: no matching / ambiguous options are not filled", sel(opts("Female"), "personal.gender", "male").status === "no_matching_option" && sel(opts("Male", "M"), "personal.gender", "male").status === "ambiguous_option");
    const radio = Vv.format(desc({ type: "radio", choices: [{ value: "M", text: "Male" }, { value: "F", text: "Female" }] }), "personal.gender", "male");
    check("Values: radio choice matching", radio.status === "ready" && radio.value === "M");
    check("Values: checkbox only for booleans", f({ type: "checkbox" }, "derived.correspondenceSameAsPermanent", true).value === true && f({ type: "checkbox" }, "personal.fullName", "x").status === "incompatible");
    check("Values: mobile digits, email/number validation", f({ type: "tel" }, "contact.mobile", "98765-00001").value === "9876500001" && f({ type: "number" }, "personal.fullName", "abc").status === "incompatible" && f({ type: "email" }, "contact.email", "not-an-email").status === "incompatible");
  }

  // ── Preview generation ─────────────────────────────────────────
  {
    seq = 0;
    const D = [
      desc({ label: "Full Name", required: true }),
      desc({ label: "Mother's Name", required: true }),
      desc({ label: "Email", type: "email" }),
      desc({ label: "Name" }),
      desc({ label: "Favourite colour" }),
      desc({ label: "Mobile Number", type: "tel" }),
      desc({ label: "Mobile Number", type: "tel" }),
      desc({ label: "Confirm Mobile Number", type: "tel" }),
      desc({ label: "Enter Captcha", required: true }),
      desc({ label: "Enter OTP" }),
      desc({ type: "checkbox", label: "I hereby declare the above is true", required: true }),
      desc({ label: "Aadhaar Number" }),
      desc({ type: "file", label: "Upload photo" }),
      desc({ tag: "custom", type: null, label: "Rich text" }),
      desc({ label: "Father's Name", disabled: true }),
      desc({ label: "Hidden full name", visible: false }),
      desc({ label: "Your reference" }),
      desc({ label: "Security answer" }),
      desc({ label: "Gender", tag: "select", type: null, options: opts("Male", "Female") }),
    ];
    const form = { genericFields: true };
    const plan = E.preview.buildPlan({ descriptors: D, form, overrides: { f17: { key: "requestDetails.referenceNumber" } }, protectedIds: ["f18"], fields: FIELDS });
    const st = Object.fromEntries(plan.items.map((i) => [i.id, i.status]));
    const expected = {
      f1: "ready", f2: "missing", f3: "invalid", f4: "low_confidence", f5: "unmapped", f6: "ready", f7: "duplicate", f8: "confirmation", f9: "protected", f10: "protected",
      f11: "protected", f12: "identity_manual", f13: "document", f14: "unsupported", f15: "locked", f17: "ready", f18: "protected", f19: "ready",
    };
    const mismatch = Object.entries(expected).filter(([id, s]) => st[id] !== s);
    check("Preview: every field gets the expected status", mismatch.length === 0, JSON.stringify(mismatch.map(([id, s]) => `${id}:${st[id]}≠${s}`)));
    check("Preview: hidden fields excluded and counted", !("f16" in st) && plan.summary.hiddenSkipped === 1);
    check("Preview: adapter override has confidence 1", plan.items.find((i) => i.id === "f17").confidence === 1);
    check("Preview: all ready items at/above the confidence threshold", plan.items.filter((i) => i.status === "ready").every((i) => i.confidence >= E.core.CONFIDENCE_THRESHOLD));
    check("Preview: summary counts + required fields left for the user", plan.summary.ready === 4 && plan.summary.requiredNotReady.includes("Mother's Name") && plan.summary.requiredNotReady.includes("Enter Captcha"));
    check("Preview: protected / identity / document items never carry values", plan.items.filter((i) => i.status !== "ready").every((i) => i.value === null && i.display === null));
    const pub = plan.items.map(E.preview.publicItem);
    check("Preview: public items expose display text only (no raw values, keys or match candidates)", pub.every((p) => JSON.stringify(Object.keys(p)) === JSON.stringify(E.preview.PUBLIC_KEYS) && E.protocol.isPublicItem(p)));
    const adapterOnly = E.preview.buildPlan({ descriptors: [desc({ label: "Full Name" })], form: { genericFields: false }, fields: FIELDS });
    check("Preview: adapter with genericFields=false maps nothing heuristically", adapterOnly.items[0].status === "unmapped" && adapterOnly.items[0].reason === "adapter_only");
  }

  // ── Protocol / message validation ──────────────────────────────
  {
    const P = E.protocol;
    const nonce = "a".repeat(32);
    const det = { type: "MC_DETECTION", v: 1, nonce, portal: { id: "x", name: "X", category: "Test", status: "test_fixture" }, form: { id: "reg", name: "Reg" }, fieldCount: 10, formFilling: "available" };
    check("Protocol: detect request / detection validated", P.isDetectRequest(P.createDetect()) && P.isDetection(det) && !P.isDetection({ ...det, extra: 1 }) && !P.isDetection({ ...det, nonce: "short" }) && !P.isDetection({ ...det, portal: { ...det.portal, secret: 1 } }));
    const tree = sanitizeFields(FIELDS);
    check("Protocol: preview request accepts sanitised applicant tree", P.isPreviewRequest(P.createPreview(nonce, tree)));
    const badTrees = [
      { personal: { fullName: { status: "available", value: "x", source: "profile" } } },
      { personal: { fullName: { status: "available", value: null } } },
      { personal: { fullName: { status: "available", value: "x".repeat(301) } } },
      { a: { b: { c: { d: { e: { status: "missing", value: null } } } } } },
      { exams: Array.from({ length: 11 }, () => ({})) },
      JSON.parse('{"__proto__": {"status": "missing", "value": null}}'),
      { personal: { fullName: { status: "available", value: { nested: true } } } },
    ];
    check("Protocol: malformed / oversized / prototype-polluting trees rejected", badTrees.every((t) => !P.isPreviewRequest(P.createPreview(nonce, t))));
    const big = { personal: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`f${"x".repeat(i % 20)}${String.fromCharCode(65 + (i % 26))}`, A("y".repeat(290))])) };
    check("Protocol: total payload size capped", !P.isPreviewRequest(P.createPreview(nonce, { a: big, b: big, c: big, d: big, e: big, f: big })));
    const fill = P.createFill(nonce, "b".repeat(32), ["f1", "f2"]);
    check("Protocol: fill request requires confirmed === true", P.isFillRequest(fill) && !P.isFillRequest({ ...fill, confirmed: false }) && !P.isFillRequest({ ...fill, confirmed: "true" }) && !P.isFillRequest(Object.fromEntries(Object.entries(fill).filter(([k]) => k !== "confirmed"))));
    check(
      "Protocol: fill request ids validated (non-empty, unique, bounded, well-formed)",
      !P.isFillRequest({ ...fill, approved: [] }) && !P.isFillRequest({ ...fill, approved: ["f1", "f1"] }) && !P.isFillRequest({ ...fill, approved: ["#submit"] }) &&
        !P.isFillRequest({ ...fill, approved: Array.from({ length: 501 }, (_, i) => `f${i}`) }) && !P.isFillRequest({ ...fill, previewId: "x" })
    );
    check("Protocol: error codes are a closed set", P.isError(P.createError("STALE_PAGE")) && !P.isError({ type: "MC_ERROR", v: 1, code: "ANYTHING" }));
  }

  // ── API: autofill data, auth and errors ────────────────────────
  {
    const id = "6ae06d1ab63bd6ce1baad6dc";
    const autofill = {
      requestNumber: "MC-1", service: { name: "Mock" }, profileFound: true,
      fields: { ...FIELDS, personal: { ...FIELDS.personal, fullName: { status: "available", value: "Test Applicant", source: "request" } }, "bad-key": { status: "available", value: "x" } },
      missing: ["personal.motherName", "<script>", "exams"], invalid: ["contact.email"],
    };
    const f = mockFetch(() => response(200, { success: true, autofill }));
    const data = await createApiClient("https://www.mahabharat.net.in", f).getAutofillData(id);
    check("API: autofill data fetched with GET + session cookie from the request-scoped endpoint", f.calls[0].url === `https://www.mahabharat.net.in/api/requests/${id}/autofill` && f.calls[0].opts.method === "GET" && f.calls[0].opts.credentials === "include");
    check("API: sources and unexpected keys dropped; leaves are {status,value}", !JSON.stringify(data).includes("source") && !("bad-key" in data.fields) && E.protocol.isFieldTree(data.fields));
    const s = summarizeAutofill(autofill);
    check("API: readiness lists only well-formed missing/invalid paths", JSON.stringify(s.missingKeys) === JSON.stringify(["personal.motherName", "exams"]) && JSON.stringify(s.invalidKeys) === JSON.stringify(["contact.email"]));
    const codes = { 401: "AUTH_REQUIRED", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "REQUEST_CLOSED", 429: "RATE_LIMITED", 500: "SERVER" };
    let allOk = true;
    for (const [status, code] of Object.entries(codes)) {
      try {
        await createApiClient("https://www.mahabharat.net.in", mockFetch(() => response(Number(status), {}))).getAutofillData(id);
        allOk = false;
      } catch (e) {
        if (e.code !== code) allOk = false;
      }
    }
    check("API: 401/403/404/409/429/500 mapped for autofill data", allOk);
    const noFetch = mockFetch(() => response(200, {}));
    let rejected = false;
    try {
      await createApiClient("https://www.mahabharat.net.in", noFetch).getAutofillData("../auth/me");
    } catch (e) {
      rejected = e.code === "INVALID_REQUEST_ID";
    }
    check("API: invalid request id rejected before any request", rejected && noFetch.calls.length === 0);
  }

  // ── Popup controller: detection, preview, approval ────────────
  {
    const nonce = "c".repeat(32);
    const det = { type: "MC_DETECTION", v: 1, nonce, portal: { id: "x", name: "Mock portal", category: "Test", status: "test_fixture" }, form: { id: "reg", name: "Registration" }, fieldCount: 3, formFilling: "available" };
    check("Controller: detection → portal state", (await probePage(async (m) => (m.type === "MC_DETECT" ? det : null))).state === "portal");
    check("Controller: unknown page → inactive", (await probePage(async () => null)).state === "inactive" && (await probePage(async () => ({ type: "MC_DETECTION" }))).state === "inactive");
    check("Controller: unrecognised form disables preview", describePortal({ ...det, form: null, formFilling: "unavailable" }).canPreview === false && describePortal(det).canPreview === true);

    const sent = [];
    const send = (reply) => async (m) => {
      sent.push(m);
      return typeof reply === "function" ? reply(m) : reply;
    };
    const apiOk = { getAutofillData: async () => ({ requestNumber: "MC-1", serviceName: "Mock", fields: sanitizeFields(FIELDS) }) };
    const previewReply = (m) => ({
      type: "MC_PREVIEW_RESULT", v: 1, nonce: m.nonce, previewId: "d".repeat(32), form: { id: "reg", name: "Registration" },
      items: [{ id: "f1", label: "Full Name", kind: "text", required: true, keyLabel: "Full name", confidence: 0.95, status: "ready", reason: null, display: "Test Applicant", hasValue: false }],
      summary: { total: 1, ready: 1, byStatus: { ready: 1 }, requiredNotReady: [], hiddenSkipped: 0 },
    });
    const ok = await preparePreview(apiOk, send(previewReply), "6ae06d1ab63bd6ce1baad6dc", nonce);
    check("Controller: preview prepared; message carries only the field tree", ok.state === "preview" && JSON.stringify(Object.keys(sent.at(-1)).sort()) === JSON.stringify(["fields", "nonce", "type", "v"]));
    const n0 = sent.length;
    const expired = await preparePreview({ getAutofillData: async () => { const e = new Error("x"); e.code = "AUTH_REQUIRED"; throw Object.assign(e, { name: "ExtensionApiError" }); } }, send(previewReply), "6ae06d1ab63bd6ce1baad6dc", nonce);
    check("Controller: expired session during preview → no page message", sent.length === n0 && (expired.state === "signed_out" || expired.state === "error"));
    const realApi401 = createApiClient("https://www.mahabharat.net.in", mockFetch(() => response(401, {})));
    check("Controller: 401 from the API → signed_out", (await preparePreview(realApi401, send(previewReply), "6ae06d1ab63bd6ce1baad6dc", nonce)).state === "signed_out" && sent.length === n0);
    const real404 = createApiClient("https://www.mahabharat.net.in", mockFetch(() => response(404, {})));
    check("Controller: unauthorized request → not-available message", (await preparePreview(real404, send(previewReply), "6ae06d1ab63bd6ce1baad6dc", nonce)).message === "Request not found or not available to your account.");
    const offline = createApiClient("https://www.mahabharat.net.in", async () => { throw new TypeError("Failed to fetch"); });
    check("Controller: network failure → network message", /Could not reach/.test((await preparePreview(offline, send(previewReply), "6ae06d1ab63bd6ce1baad6dc", nonce)).message));
    check("Controller: stale page error surfaced", /changed or reloaded/.test((await preparePreview(apiOk, send({ type: "MC_ERROR", v: 1, code: "STALE_PAGE" }), "6ae06d1ab63bd6ce1baad6dc", nonce)).message));
    check("Controller: malformed / wrong-nonce preview rejected", (await preparePreview(apiOk, send((m) => ({ ...previewReply(m), nonce: "e".repeat(32) })), "6ae06d1ab63bd6ce1baad6dc", nonce)).state === "error" && (await preparePreview(apiOk, send({ junk: true }), "6ae06d1ab63bd6ce1baad6dc", nonce)).state === "error");

    const n1 = sent.length;
    const fillReply = (m) => ({ type: "MC_FILL_RESULT", v: 1, nonce: m.nonce, results: [{ id: "f1", status: "filled", reason: null }], summary: { filled: 1, skipped: 0, failed: 0 } });
    const noConfirm = await fillApproved(send(fillReply), { nonce, previewId: "d".repeat(32), approved: ["f1"], confirmed: false });
    const noneTicked = await fillApproved(send(fillReply), { nonce, previewId: "d".repeat(32), approved: [], confirmed: true });
    check("Approval: no fill message without explicit confirmation or selection", noConfirm.state === "error" && noneTicked.state === "error" && sent.length === n1);
    const filled = await fillApproved(send(fillReply), { nonce, previewId: "d".repeat(32), approved: ["f1"], confirmed: true });
    check("Approval: confirmed fill sends exactly the approved ids", filled.state === "filled" && JSON.stringify(sent.at(-1).approved) === '["f1"]' && sent.at(-1).confirmed === true);
    check("Approval: page rejecting the preview id is reported", /Preview again/.test((await fillApproved(send({ type: "MC_ERROR", v: 1, code: "NO_PREVIEW" }), { nonce, previewId: "d".repeat(32), approved: ["f1"], confirmed: true })).message));
    check("Popup text: protected items tell the user to act", /you must/.test(describeItemStatus({ status: "protected", reason: "captcha" })) && /OTP/.test(describeItemStatus({ status: "protected", reason: "otp" })));
    const fr = describeFillResult({ results: [{ id: "f1", status: "filled", reason: null }, { id: "f2", status: "skipped", reason: "form_changed" }], summary: { filled: 1, skipped: 1, failed: 0 } }, [{ id: "f2", label: "District" }]);
    check("Popup text: fill result lists skipped fields and the manual-steps reminder", fr.problems[0] === "District: the form changed since the preview" && /final submission yourself/.test(fr.reminder));
    check("Popup text: gaps described by label, not value", describeGaps({ missingKeys: ["personal.motherName", "exams"], invalidKeys: ["contact.email"] }).missing.join("|") === "Mother's name|Exam details");
  }

  // ── Supervised verification mode ───────────────────────────────
  {
    const R = E.registry;
    const P = E.protocol;
    const loadSpec = (file) => {
      const specs = [];
      const c = vm.createContext({ MCEngine: { adapters: { register: (s) => specs.push(s) } } });
      c.globalThis = c;
      vm.runInContext(read(file), c, { filename: file });
      return JSON.parse(JSON.stringify(specs[0]));
    };
    const gstSpec = loadSpec("adapters/gst-registration.js");
    const pmSpec = loadSpec("adapters/pmegp-application.js");
    const g = R.byId("gst");
    const pm = R.byId("pmegp");
    const DONE = { publicFormInspected: true, adapterImplemented: true, localFixtureTestsPassed: true, postValidationVerified: true, realPageFillVerified: true };
    const asSupervised = (e, patch = {}) => ({
      ...e, status: R.STATUS.SUPERVISED, adapterId: e.id === "gst" ? "gst-registration" : "pmegp-application", readiness: { ...e.readiness, postValidationVerified: true }, ...patch,
    });
    const sels = (t) => JSON.stringify(t.fields.map((f) => f.selector));

    check(
      "Supervised: the status is supervised_verification_only and its label says normal filling is off, not verified",
      R.STATUS.SUPERVISED === "supervised_verification_only" && /normal filling off/.test(R.STATUS_LABELS.supervised_verification_only) && !/verified/i.test(R.STATUS_LABELS.supervised_verification_only)
    );
    check("Supervised: no portal is supervised or verified in the shipped registry", R.list().every((p) => p.status !== R.STATUS.SUPERVISED && p.status !== R.STATUS.VERIFIED_SUPPORTED));
    check(
      "Supervised: GST trial is #email and #mobile only, PMEGP its four communication fields only, each exactly its adapter's mappings at version 1.0.0",
      sels(g.supervisedTrial) === '["#email","#mobile"]' &&
        sels(pm.supervisedTrial) === '["#ux_communication_taluk_block","#ux_communication_pin","#ux_communication_mobileNo","#ux_communication_emailId"]' &&
        R.trialMatches(g.supervisedTrial, gstSpec) && R.trialMatches(pm.supervisedTrial, pmSpec) && gstSpec.version === "1.0.0" && pmSpec.version === "1.0.0" &&
        R.list().every((p) => (p.supervisedTrial !== null) === (p.id === "gst" || p.id === "pmegp")) && Object.isFrozen(g.supervisedTrial.fields[0])
    );
    check("Supervised: a GST entry whose state after Proceed is verified validates as supervised", R.validate([asSupervised(g)]).length === 0 && R.validate([asSupervised(pm)]).length === 0, R.validate([asSupervised(g)]).join("; "));
    check(
      "Supervised: refused without the verified state after the applicant's step, an adapter id or a trial",
      R.validate([asSupervised(g, { readiness: g.readiness })]).some((m) => /supervised_verification_only requires publicFormInspected/.test(m)) &&
        R.validate([asSupervised(g, { adapterId: null })]).some((m) => /requires an adapter/.test(m)) &&
        R.validate([asSupervised(g, { supervisedTrial: null })]).some((m) => /requires a supervisedTrial/.test(m)) &&
        R.validate([asSupervised(g, { readiness: null })]).some((m) => /requires publicFormInspected/.test(m))
    );
    const t0 = g.supervisedTrial;
    const badTrials = [
      { ...t0, extra: 1 },
      { ...t0, adapterVersion: "1" },
      { ...t0, form: "Part A" },
      { ...t0, fields: [] },
      { ...t0, fields: Array.from({ length: 11 }, (_, i) => ({ ...t0.fields[0], selector: `#f${i}`, key: `contact.k${"x".repeat(i)}` })) },
      { ...t0, fields: [t0.fields[0], { ...t0.fields[1], selector: "#email" }] },
      { ...t0, fields: [t0.fields[0], { ...t0.fields[1], key: "contact.email" }] },
      { ...t0, fields: [{ ...t0.fields[0], tag: "div" }] },
      { ...t0, fields: [{ ...t0.fields[0], label: "" }] },
      { ...t0, fields: [{ ...t0.fields[0], value: "x" }] },
      { ...t0, fields: [{ ...t0.fields[0], maxLength: -1 }] },
    ];
    check("Supervised: malformed trial declarations are rejected", badTrials.every((t) => R.validate([asSupervised(g, { supervisedTrial: t })]).some((m) => /supervisedTrial/.test(m))));
    check("Supervised: a trial on a portal without a readiness record is rejected", R.validate([{ ...R.byId("army"), supervisedTrial: t0 }]).some((m) => /readiness record/.test(m)));
    check(
      "Supervised: a passed real-page fill keeps the status supervised (still valid, still trial-only); normal filling needs verified_supported",
      R.validate([asSupervised(g, { readiness: DONE })]).length === 0 && R.fillMode(asSupervised(g, { readiness: DONE }), gstSpec) === "supervised"
    );
    const asVerified = { ...g, status: R.STATUS.VERIFIED_SUPPORTED, adapterId: "gst-registration", readiness: DONE, supportedForms: ["part-a"], supportedFields: ["contact.email", "contact.mobile"], testCoverage: ["gst fixture"] };
    check(
      "fillMode: pending → none; supervised with the matching adapter → supervised; verified_supported → production",
      R.fillMode(g, gstSpec) === null && R.fillMode(pm, pmSpec) === null && R.fillMode(asSupervised(g), gstSpec) === "supervised" && R.fillMode(asSupervised(pm), pmSpec) === "supervised" && R.fillMode(asVerified, gstSpec) === "production"
    );
    const form0 = gstSpec.forms[0];
    const variants = [
      { ...gstSpec, version: "1.0.1" },
      { ...gstSpec, version: undefined },
      { ...gstSpec, forms: [{ ...form0, fields: [...form0.fields, { selector: "#bnm", key: "personal.fullName" }] }] },
      { ...gstSpec, forms: [{ ...form0, fields: [form0.fields[0]] }] },
      { ...gstSpec, forms: [{ ...form0, fields: [{ ...form0.fields[0], selector: "#pan_card" }, form0.fields[1]] }] },
      { ...gstSpec, forms: [{ ...form0, genericFields: true }] },
      { ...gstSpec, forms: [form0, { ...form0, id: "part-b" }] },
      { ...gstSpec, forms: [{ ...form0, id: "part-b" }] },
      { ...gstSpec, id: "gst-other" },
    ];
    check(
      "fillMode: supervised refuses another version, an added, removed or swapped field, heuristics, another form, another adapter, or an invalid entry",
      variants.every((a) => R.fillMode(asSupervised(g), a) === null) && R.fillMode(asSupervised(g, { readiness: g.readiness }), gstSpec) === null && R.fillMode(asSupervised(pm), gstSpec) === null
    );

    // Engine realms whose registry answers byId() with simulated entries (the shipped registry is unchanged).
    const engineWith = (entries, extra = {}) => {
      const ctx = vm.createContext({ URL, setTimeout, ...extra });
      for (const f of ["core", "registry"]) vm.runInContext(read(`src/engine/${f}.js`), ctx, { filename: f });
      const real = ctx.MCEngine.registry;
      ctx.MCEngine.registry = Object.freeze({ ...real, byId: (id) => entries[id] || real.byId(id) });
      for (const f of ["adapters", "classify", "values", "preview", "protocol"]) vm.runInContext(read(`src/engine/${f}.js`), ctx, { filename: f });
      return ctx;
    };
    const supCtx = engineWith({ gst: asSupervised(g) });
    const supReg = supCtx.MCEngine.adapters.register(gstSpec);
    check(
      "Adapters: a supervised entry registers its adapter in supervised mode, limited to the registry's trial",
      supReg.mode === "supervised" && JSON.stringify(supCtx.MCEngine.adapters.trialFor(supReg)) === JSON.stringify(t0) && Object.isFrozen(supReg)
    );
    check("Adapters: with the shipped registry the GST and PMEGP adapters are refused", E.adapters.validate(gstSpec).includes("registry entry is not verified_supported for this adapter") && E.adapters.validate(pmSpec).includes("registry entry is not verified_supported for this adapter"));
    const supA = engineWith({ gst: asSupervised(g) }).MCEngine.adapters;
    const noVersion = { ...gstSpec };
    delete noVersion.version;
    check(
      "Adapters: a spec cannot choose its mode, bring its own trial or omit its version",
      supA.validate({ ...gstSpec, mode: "production" }).includes("the engine decides an adapter's mode") &&
        supA.validate({ ...gstSpec, supervisedTrial: t0 }).includes("production adapters take the supervised trial from the registry") && supA.validate(noVersion).includes("production adapters need a version")
    );
    check("Adapters: a supervised entry refuses an adapter that differs from its trial", supA.validate({ ...gstSpec, version: "1.1.0" }).includes("adapter does not match the supervised trial in the registry entry"));
    check("Adapters: a verified_supported entry registers in production mode", engineWith({ gst: asVerified }).MCEngine.adapters.register(gstSpec).mode === "production");
    const testTrial = { adapterVersion: "1.0.0", form: "form-a", fields: [{ selector: "#email", key: "contact.email", tag: "input", type: "text", maxLength: 0, label: "Email" }] };
    const testSpec = {
      id: "unit-trial", testOnly: true, version: "1.0.0", portal: { id: "unit", name: "Unit trial portal" }, origins: ["http://127.0.0.1:47998"],
      forms: [{ id: "form-a", name: "Form A", match: { pathPrefix: "/" }, genericFields: false, fields: [{ selector: "#email", key: "contact.email" }] }], supervisedTrial: testTrial,
    };
    const ta = engineWith({}).MCEngine.adapters;
    check(
      "Adapters: a test fixture with a matching trial registers supervised; a mismatched trial is refused; without one it is a plain test fixture",
      ta.register(testSpec).mode === "supervised" && ta.validate({ ...testSpec, id: "unit-trial-2", supervisedTrial: { ...testTrial, adapterVersion: "2.0.0" } }).includes("test supervisedTrial does not match this adapter") &&
        ta.register({ ...testSpec, id: "unit-plain", supervisedTrial: undefined }).mode === "test"
    );

    // Protocol: trial messages carry identifiers and outcomes only.
    const nonce = "a".repeat(32);
    const pid = "b".repeat(32);
    const keyLabel = (k) => E.core.labelForPath(k);
    const meta = {
      adapterId: "gst-registration", adapterVersion: "1.0.0", origin: "https://reg.gst.gov.in", form: { id: "part-a", name: "GST new registration, part A" },
      fields: [{ selector: "#email", key: "contact.email", keyLabel: keyLabel("contact.email") }, { selector: "#mobile", key: "contact.mobile", keyLabel: keyLabel("contact.mobile") }],
    };
    const item = (o = {}) => ({ id: "f1", selector: "#email", key: "contact.email", keyLabel: keyLabel("contact.email"), label: "Email Address", check: "ok", status: "ready", display: "x@test.local", hasValue: false, ...o });
    const item2 = item({ id: "f2", selector: "#mobile", key: "contact.mobile", keyLabel: keyLabel("contact.mobile"), label: "Mobile Number", display: "9000000000" });
    const tpr = { type: "MC_TRIAL_PREVIEW_RESULT", v: 1, nonce, previewId: pid, ttlMs: 120000, trial: meta, fields: [item(), item2] };
    const badResults = [
      { ...tpr, extra: 1 },
      { ...tpr, ttlMs: 11 * 60 * 1000 },
      { ...tpr, fields: [item()] },
      { ...tpr, fields: [item2, item()] },
      { ...tpr, fields: [item({ check: "read_only" }), item2] },
      { ...tpr, fields: [item({ check: "read_only", status: "rejected" }), item2] },
      { ...tpr, fields: [item({ id: null }), item2] },
      { ...tpr, fields: [item({ status: "missing" }), item2] },
      { ...tpr, fields: [{ ...item(), value: "x@test.local" }, item2] },
      { ...tpr, fields: [item({ id: "f2" }), item2] },
      { ...tpr, fields: [item({ check: "guessed", status: "rejected", display: null }), item2] },
      { ...tpr, trial: { ...meta, origin: "http://reg.gst.gov.in" } },
      { ...tpr, trial: { ...meta, adapterVersion: "latest" } },
    ];
    check(
      "Protocol: trial preview results are validated strictly (order, checks, statuses, no extra keys, display only when ready)",
      P.isTrialPreviewResult(tpr) && !badResults.some(P.isTrialPreviewResult) &&
        P.isTrialPreviewResult({ ...tpr, fields: [item({ check: "read_only", status: "rejected", display: null }), item2] }) &&
        P.isTrialPreviewResult({ ...tpr, fields: [item({ id: null, check: "ambiguous", status: "rejected", display: null }), item2] }) &&
        P.isTrialPreviewResult({ ...tpr, fields: [item({ status: "missing", display: null }), item2] })
    );
    const tf = P.createTrialFill(nonce, pid, ["f1"]);
    const unconfirmed = { ...tf };
    delete unconfirmed.confirmed;
    check(
      "Protocol: a trial fill needs confirmed: true and 1-10 unique item ids, and is distinct from a normal fill",
      P.isTrialFillRequest(tf) &&
        ![{ ...tf, confirmed: false }, unconfirmed, { ...tf, approved: [] }, { ...tf, approved: Array.from({ length: 11 }, (_, i) => `f${i}`) }, { ...tf, approved: ["f1", "f1"] }, { ...tf, approved: ["#email"] }, { ...tf, extra: 1 }].some(P.isTrialFillRequest) &&
        !P.isFillRequest(tf) && !P.isTrialFillRequest(P.createFill(nonce, pid, ["f1"]))
    );
    const ev = { adapterId: "gst-registration", adapterVersion: "1.0.0", origin: "https://reg.gst.gov.in", form: "part-a", fields: [{ selector: "#email", key: "contact.email", editable: true, approved: true, filled: true }], pageChanged: false, passed: true };
    check(
      "Protocol: trial evidence is consistent and carries no values",
      P.isTrialEvidence(ev) && P.isTrialEvidence({ ...ev, pageChanged: true, passed: false }) &&
        ![{ ...ev, passed: false }, { ...ev, pageChanged: true }, { ...ev, fields: [{ ...ev.fields[0], approved: false }] }, { ...ev, value: "x" }, { ...ev, fields: [{ ...ev.fields[0], value: "9000000000" }] }].some(P.isTrialEvidence)
    );
    check(
      "Protocol: trial info is null or exact metadata",
      P.isTrialInfo({ type: "MC_TRIAL_INFO", v: 1, nonce, trial: null }) && P.isTrialInfo({ type: "MC_TRIAL_INFO", v: 1, nonce, trial: meta }) &&
        ![{ ...meta, fields: [] }, { ...meta, extra: 1 }, { ...meta, fields: [{ ...meta.fields[0], value: "x" }] }].some((t) => P.isTrialInfo({ type: "MC_TRIAL_INFO", v: 1, nonce, trial: t }))
    );

    // portal-content.js with a supervised adapter: real engine and adapter file, stubbed DOM layer and clock.
    const EXT_ID = "abcdefghijklmnopabcdefghijklmnop";
    const D = (id, o) => ({
      id, kind: "text", tag: "input", type: "text", name: "", domId: "", label: "", accessibleName: "", section: "New Registration", placeholder: "", title: "", autocomplete: "",
      pattern: "", required: true, disabled: false, readOnly: false, visible: true, options: null, choices: null, nearCaptcha: false, hasValue: false, maxLength: 0, ...o,
    });
    const loadTrialPortal = ({ entries = { gst: asSupervised(g) }, adapterFile = "adapters/gst-registration.js", origin = "https://reg.gst.gov.in", pathname = "/registration/", title = "Goods & Services Tax (GST) | Registration" } = {}) => {
      let now = 1_000_000;
      const listeners = [];
      class FakeDate extends Date {
        static now() {
          return now;
        }
      }
      const state = {
        descriptors: [
          D("f1", { domId: "email", name: "email", label: "Email Address", maxLength: 254 }),
          D("f2", { domId: "mobile", name: "mobile", label: "Mobile Number", maxLength: 10 }),
          D("f3", { domId: "pan_card", name: "pan_card", label: "Permanent Account Number (PAN)", maxLength: 10 }),
        ],
        ids: { "#email": "f1", "#mobile": "f2" },
        counts: { "#email": 1, "#mobile": 1 },
        holds: true,
        filled: [],
        calls: [],
      };
      const ctx = engineWith(entries, { crypto: globalThis.crypto, Date: FakeDate, location: { origin, pathname, href: `${origin}${pathname}` }, document: { title }, __state: state });
      ctx.chrome = { runtime: { id: EXT_ID, onMessage: { addListener: (fn) => listeners.push(fn) } } };
      vm.runInContext(
        `MCEngine.dom = {
          pageInfo: () => ({ pathname: location.pathname, title: document.title, hasSelector: (s) => s === 'form[name="preg"]' }),
          discover: () => { __state.calls.push("discover"); const descriptors = __state.descriptors.map((d) => ({ ...d, signature: d.id + "|" + d.label })); return { descriptors, refs: new Map(descriptors.map((d) => [d.id, { el: d.id }])) }; },
          resolveAdapterForm: (form) => ({ overrides: Object.fromEntries((form.fields || []).filter((m) => __state.ids[m.selector]).map((m) => [__state.ids[m.selector], { key: m.key }])), protectedIds: ["f3"] }),
          matchCount: (doc, s) => __state.counts[s] ?? 0,
          fill: async (plan, refs, approved) => { __state.calls.push("fill"); __state.filled.push(...approved); return { results: approved.map((id) => ({ id, status: "filled", reason: null })), summary: { filled: approved.length, skipped: 0, failed: 0 } }; },
          holds: () => __state.holds,
        };`,
        ctx
      );
      if (adapterFile) vm.runInContext(read(adapterFile), ctx, { filename: adapterFile });
      vm.runInContext(read("src/portal-content.js"), ctx, { filename: "portal-content.js" });
      const send = (message, sender = { id: EXT_ID }) =>
        new Promise((resolve) => {
          if (!listeners.length) return resolve({ noListener: true });
          let replied = false;
          const keepOpen = listeners[0](message, sender, (r) => {
            replied = true;
            resolve(r);
          });
          if (!keepOpen && !replied) resolve(null);
        });
      return { send, state, ctx, advance: (ms) => (now += ms) };
    };
    const gtree = { contact: { email: A("trial.unit@test.local"), mobile: A("9000000777") } };
    const SECRET = ["trial.unit@test.local", "9000000777"];
    const tp = loadTrialPortal();
    const det = await tp.send(P.createDetect());
    check(
      "Portal content (supervised): detection reports supervised_verification_only with no normal form",
      P.isDetection(det) && det.portal.status === "supervised_verification_only" && det.portal.id === "gst" && det.form === null && det.formFilling === "unavailable" && det.fieldCount === 0,
      JSON.stringify(det)
    );
    check(
      "Portal content (supervised): normal preview refused (FORM_NOT_RECOGNISED) and normal fill refused (NO_PREVIEW)",
      (await tp.send(P.createPreview(det.nonce, gtree)))?.code === "FORM_NOT_RECOGNISED" && (await tp.send(P.createFill(det.nonce, pid, ["f1"])))?.code === "NO_PREVIEW" && tp.state.filled.length === 0
    );
    const info = await tp.send(P.createTrialDetect());
    check("Portal content (supervised): trial info names the exact origin, form, adapter version and the two fields", P.isTrialInfo(info) && info.nonce === det.nonce && JSON.stringify(info.trial) === JSON.stringify(meta), JSON.stringify(info));
    const preview = (fields = gtree) => tp.send(P.createTrialPreview(det.nonce, fields));
    const trialFill = (previewId, approved) => tp.send(P.createTrialFill(det.nonce, previewId, approved));
    const pv = await preview();
    check(
      "Portal content (supervised): trial preview offers exactly #email and #mobile, both ready; PAN is not offered; nothing filled",
      P.isTrialPreviewResult(pv) && pv.ttlMs === 120000 && pv.fields.map((f) => `${f.selector}:${f.id}:${f.check}:${f.status}`).join() === "#email:f1:ok:ready,#mobile:f2:ok:ready" &&
        !JSON.stringify(pv).includes("pan_card") && !tp.state.calls.includes("fill"),
      JSON.stringify(pv?.fields)
    );
    const done1 = await trialFill(pv.previewId, ["f1", "f2"]);
    check(
      "Portal content (supervised): an approved trial fills only the approved ids and returns passing evidence without values",
      P.isTrialFillResult(done1) && done1.evidence.passed === true && done1.evidence.pageChanged === false && tp.state.filled.join() === "f1,f2" &&
        JSON.stringify(done1.evidence.fields) === JSON.stringify([{ selector: "#email", key: "contact.email", editable: true, approved: true, filled: true }, { selector: "#mobile", key: "contact.mobile", editable: true, approved: true, filled: true }]) &&
        !SECRET.some((s) => JSON.stringify(done1).includes(s)),
      JSON.stringify(done1)
    );
    check("Portal content (supervised): a trial preview is single-use (replay → NO_PREVIEW)", (await trialFill(pv.previewId, ["f1"]))?.code === "NO_PREVIEW" && tp.state.filled.length === 2);
    const pvBad = await preview();
    check(
      "Portal content (supervised): approving a protected or unknown field refuses the whole trial; nothing filled; the preview is spent",
      (await trialFill(pvBad.previewId, ["f1", "f3"]))?.code === "BAD_REQUEST" && tp.state.filled.length === 2 && (await trialFill(pvBad.previewId, ["f1"]))?.code === "NO_PREVIEW" &&
        (await trialFill((await preview()).previewId, ["f9"]))?.code === "BAD_REQUEST" && tp.state.filled.length === 2
    );
    const pvOld = await preview();
    tp.advance(2 * 60 * 1000 + 1);
    check("Portal content (supervised): trial previews expire after 2 minutes, then are gone", (await trialFill(pvOld.previewId, ["f1"]))?.code === "PREVIEW_EXPIRED" && (await trialFill(pvOld.previewId, ["f1"]))?.code === "NO_PREVIEW" && tp.state.filled.length === 2);
    const pvDrop = await preview();
    check("Portal content (supervised): cancel (discard) drops the trial at once", (await tp.send(P.createDiscard(det.nonce)))?.type === "MC_DISCARD" && (await trialFill(pvDrop.previewId, ["f1"]))?.code === "NO_PREVIEW" && tp.state.filled.length === 2);
    const pvNew = await preview();
    const pvNewer = await preview();
    check("Portal content (supervised): a fresh preview replaces the previous one", (await trialFill(pvNew.previewId, ["f1"]))?.code === "NO_PREVIEW" && P.isTrialPreviewResult(pvNewer));
    await tp.send(P.createDiscard(det.nonce));
    const pvMiss = await preview({ contact: { mobile: A("9000000777"), email: M } });
    const partial = await trialFill(pvMiss.previewId, ["f2"]);
    const pvInv = await preview({ contact: { mobile: I, email: I } });
    check(
      "Portal content (supervised): missing or invalid applicant data is never ready",
      pvMiss.fields[0].status === "missing" && pvMiss.fields[0].display === null && pvMiss.fields[1].status === "ready" && pvInv.fields[0].status === "invalid" && pvInv.fields.every((f) => f.status !== "ready"),
      JSON.stringify([pvMiss.fields, pvInv.fields])
    );
    check("Portal content (supervised): a trial that leaves a declared field out cannot pass", partial.evidence.passed === false && partial.evidence.fields[0].approved === false && partial.evidence.fields[1].filled === true);
    check(
      "Portal content (supervised): malformed applicant data or an unconfirmed fill gets no answer",
      (await tp.send({ type: "MC_TRIAL_PREVIEW", v: 1, nonce: det.nonce, fields: { contact: { email: { status: "available", value: "x".repeat(301) } } } })) === null &&
        (await tp.send({ ...P.createTrialFill(det.nonce, pid, ["f1"]), confirmed: false })) === null
    );
    const mutations = [
      ["read-only", (d) => (d.readOnly = true), "read_only"],
      ["disabled", (d) => (d.disabled = true), "disabled"],
      ["hidden", (d) => (d.visible = false), "hidden"],
      ["relabelled", (d) => (d.label = "Alternate Mobile Number"), "changed"],
      ["maxlength changed", (d) => (d.maxLength = 12), "changed"],
      ["type changed", (d) => ((d.type = "number"), (d.kind = "number")), "changed"],
      ["turned into an OTP box", (d) => (d.placeholder = "Enter OTP"), "protected"],
      ["duplicated", () => (tp.state.counts["#mobile"] = 2), "ambiguous"],
      ["removed", () => (tp.state.counts["#mobile"] = 0), "absent"],
    ];
    const rejected = [];
    for (const [name, mutate, want] of mutations) {
      const saved = { ...tp.state.descriptors[1] };
      mutate(tp.state.descriptors[1]);
      const r = await preview();
      const f = r.fields[1];
      rejected.push(`${name}:${f.check}:${f.status}:${f.id}`);
      const okId = want === "ambiguous" || want === "absent" ? f.id === null : f.id === "f2";
      check(`Portal content (supervised): a ${name} trial field is rejected (${want}) and cannot be approved`, f.check === want && f.status === "rejected" && f.display === null && okId && (await trialFill(r.previewId, ["f2"]))?.code === "BAD_REQUEST");
      tp.state.descriptors[1] = saved;
      tp.state.counts["#mobile"] = 1;
    }
    const nBefore = tp.state.calls.filter((c) => c === "fill").length;
    const pvLock = await preview();
    tp.state.descriptors[1].readOnly = true;
    const locked = await trialFill(pvLock.previewId, ["f1", "f2"]);
    tp.state.descriptors[1].readOnly = false;
    check(
      "Portal content (supervised): a field that becomes read-only after the preview stops the whole trial; nothing filled; recorded as page changed",
      P.isTrialFillResult(locked) && locked.results.every((r) => r.status === "skipped" && r.reason === "form_changed") && locked.evidence.pageChanged === true && locked.evidence.passed === false &&
        locked.evidence.fields[1].editable === false && tp.state.calls.filter((c) => c === "fill").length === nBefore
    );
    const pvGrow = await preview();
    tp.state.descriptors.push(D("f4", { domId: "otp", label: "Enter OTP" }));
    const grown = await trialFill(pvGrow.previewId, ["f1", "f2"]);
    tp.state.descriptors.pop();
    check("Portal content (supervised): a page that gains a field after the preview stops the trial", grown.evidence.pageChanged === true && grown.evidence.passed === false && tp.state.calls.filter((c) => c === "fill").length === nBefore);
    tp.state.holds = false;
    const lost = await trialFill((await preview()).previewId, ["f1", "f2"]);
    tp.state.holds = true;
    check("Portal content (supervised): a value the page does not keep is recorded as not filled; the trial fails", lost.evidence.passed === false && lost.evidence.fields.every((f) => f.filled === false && f.approved));
    check(
      "Portal content (supervised): trial messages from other extensions or tabs are ignored; a stale page nonce → STALE_PAGE",
      (await tp.send(P.createTrialDetect(), { id: "z".repeat(32) })) === null && (await tp.send(P.createTrialPreview(det.nonce, gtree), { id: EXT_ID, tab: { id: 1 } })) === null &&
        (await tp.send(P.createTrialPreview("0".repeat(32), gtree)))?.code === "STALE_PAGE"
    );
    const pmTp = loadTrialPortal({ entries: { pmegp: asSupervised(pm) }, adapterFile: "adapters/pmegp-application.js", origin: "https://pmegp.msme.gov.in", pathname: "/Home/HomePage", title: "PMEGP Home" });
    const pmInfo = await pmTp.send(P.createTrialDetect());
    check(
      "Portal content (supervised PMEGP): the trial names exactly the four communication fields",
      P.isTrialInfo(pmInfo) && pmInfo.trial.adapterId === "pmegp-application" && pmInfo.trial.form.id === "new-unit" && JSON.stringify(pmInfo.trial.fields.map((f) => f.selector)) === sels(pm.supervisedTrial)
    );
    const shipped = loadTrialPortal({ entries: {}, adapterFile: null });
    const shippedInfo = await shipped.send(P.createTrialDetect());
    check(
      "Portal content (GST as shipped): no trial offered, trial preview refused, the page is never read",
      P.isTrialInfo(shippedInfo) && shippedInfo.trial === null && (await shipped.send(P.createTrialPreview(shippedInfo.nonce, gtree)))?.code === "FORM_NOT_RECOGNISED" &&
        (await shipped.send(P.createTrialFill(shippedInfo.nonce, pid, ["f1"])))?.code === "NO_PREVIEW" && shipped.state.calls.length === 0
    );
    let refusedAsShipped = null;
    try {
      loadTrialPortal({ entries: {} });
    } catch (e) {
      refusedAsShipped = e.message;
    }
    check("Portal content (GST as shipped): even with the adapter file loaded the engine refuses it", /registry entry is not verified_supported/.test(refusedAsShipped || ""), refusedAsShipped);
    const testMode = loadTrialPortal({ entries: { gst: asVerified } });
    const prodInfo = await testMode.send(P.createTrialDetect());
    check("Portal content (verified_supported): no trial is offered; normal preview works instead", prodInfo.trial === null && (await testMode.send(P.createTrialPreview(prodInfo.nonce, gtree)))?.code === "FORM_NOT_RECOGNISED" && P.isPreviewResult(await testMode.send(P.createPreview(prodInfo.nonce, gtree))));

    // Popup controller: trial detection, preview, approval, record.
    const sent = [];
    const sender = (reply) => async (m) => {
      sent.push(m);
      return typeof reply === "function" ? reply(m) : reply;
    };
    const detMsg = { ...det };
    const infoMsg = { type: "MC_TRIAL_INFO", v: 1, nonce: det.nonce, trial: meta };
    const probe = await probePage(sender((m) => (m.type === "MC_DETECT" ? detMsg : m.type === "MC_TRIAL_DETECT" ? infoMsg : null)));
    const probeWrong = await probePage(sender((m) => (m.type === "MC_DETECT" ? detMsg : m.type === "MC_TRIAL_DETECT" ? { ...infoMsg, nonce: "e".repeat(32) } : null)));
    check("Controller: probePage returns the trial only from the same page (nonce)", probe.state === "portal" && JSON.stringify(probe.trial) === JSON.stringify(meta) && probeWrong.trial === null);
    const view = describePortal(detMsg, meta);
    const tv = describeTrial(meta);
    check(
      "Controller: supervised page → normal preview disabled; the trial shows exact origin, form, adapter version and field names, and says it is not production",
      view.canPreview === false && /supervised verification trial only/.test(view.form) && /Normal filling is off/.test(view.pageStatus) && view.status === E.registry.STATUS_LABELS.supervised_verification_only &&
        tv.origin === "https://reg.gst.gov.in" && tv.form === "GST new registration, part A (part-a)" && tv.adapter === "gst-registration version 1.0.0" &&
        JSON.stringify(tv.fields) === JSON.stringify([`${keyLabel("contact.email")} (#email)`, `${keyLabel("contact.mobile")} (#mobile)`]) && /not normal filling/.test(tv.notice) && /production/.test(tv.notice),
      JSON.stringify([view, tv])
    );
    const RID = "6ae06d1ab63bd6ce1baad6dc";
    const apiT = { getAutofillData: async () => ({ requestNumber: "MC-9", serviceName: "GST", fields: sanitizeFields(gtree) }) };
    const replyPreview = (m) => ({ ...tpr, nonce: m.nonce });
    const n0 = sent.length;
    check("Controller: trial preview refused for a bad request id or missing trial, before anything is sent", (await prepareTrial(apiT, sender(replyPreview), "nope", nonce, meta)).state === "error" && (await prepareTrial(apiT, sender(replyPreview), RID, nonce, null)).state === "error" && sent.length === n0);
    const okTrial = await prepareTrial(apiT, sender(replyPreview), RID, nonce, meta);
    check("Controller: trial preview sends only the field tree as a trial message", okTrial.state === "preview" && sent.at(-1).type === "MC_TRIAL_PREVIEW" && JSON.stringify(Object.keys(sent.at(-1)).sort()) === JSON.stringify(["fields", "nonce", "type", "v"]));
    check(
      "Controller: a page offering a different trial, a malformed reply or a page error is refused",
      (await prepareTrial(apiT, sender((m) => ({ ...tpr, nonce: m.nonce, trial: { ...meta, adapterVersion: "1.0.1" } })), RID, nonce, meta)).state === "error" &&
        (await prepareTrial(apiT, sender({ junk: true }), RID, nonce, meta)).state === "error" &&
        /expired/.test((await prepareTrial(apiT, sender({ type: "MC_ERROR", v: 1, code: "PREVIEW_EXPIRED" }), RID, nonce, meta)).message)
    );
    const evidence = (o = {}) => ({ adapterId: "gst-registration", adapterVersion: "1.0.0", origin: "https://reg.gst.gov.in", form: "part-a", fields: [{ selector: "#email", key: "contact.email", editable: true, approved: true, filled: true }, { selector: "#mobile", key: "contact.mobile", editable: true, approved: true, filled: true }], pageChanged: false, passed: true, ...o });
    const replyFill = (m) => ({ type: "MC_TRIAL_FILL_RESULT", v: 1, nonce: m.nonce, results: m.approved.map((id) => ({ id, status: "filled", reason: null })), summary: { filled: m.approved.length, skipped: 0, failed: 0 }, evidence: evidence() });
    const base = { nonce, preview: tpr, approved: ["f1", "f2"], confirmed: true, startedAt: 1000, now: 2000 };
    const n1 = sent.length;
    const refusals = await Promise.all([
      fillTrial(sender(replyFill), { ...base, confirmed: false }),
      fillTrial(sender(replyFill), { ...base, approved: [] }),
      fillTrial(sender(replyFill), { ...base, preview: { ...tpr, fields: [item({ status: "missing", display: null }), item2] } }),
      fillTrial(sender(replyFill), { ...base, approved: ["f3"] }),
      fillTrial(sender(replyFill), { ...base, now: 1000 + 120001 }),
      fillTrial(sender(replyFill), { ...base, startedAt: undefined }),
    ]);
    check("Approval (trial): no message without confirmation, a selection of ready fields only, or after the preview expired", refusals.every((r) => r.state === "error") && sent.length === n1, JSON.stringify(refusals));
    const okFill = await fillTrial(sender(replyFill), base);
    check("Approval (trial): a confirmed trial sends exactly the approved ids as a trial fill", okFill.state === "filled" && sent.at(-1).type === "MC_TRIAL_FILL" && JSON.stringify(sent.at(-1).approved) === '["f1","f2"]' && sent.at(-1).confirmed === true);
    check(
      "Approval (trial): evidence for another adapter, version or field set is refused",
      (await fillTrial(sender((m) => ({ ...replyFill(m), evidence: evidence({ adapterVersion: "1.0.1" }) })), base)).state === "error" &&
        (await fillTrial(sender((m) => ({ ...replyFill(m), evidence: evidence({ fields: [evidence().fields[1], evidence().fields[0]] }) })), base)).state === "error"
    );
    const rec = buildTrialRecord(evidence(), new Date("2026-10-28T10:00:00.000Z"));
    const failRec = buildTrialRecord(evidence({ pageChanged: true, passed: false }), new Date("2026-10-28T10:00:00.000Z"));
    check(
      "Record: only adapter, version, origin, form, field outcomes, page change, pass/fail and time",
      JSON.stringify(Object.keys(rec)) === JSON.stringify(["kind", "version", "adapterId", "adapterVersion", "origin", "form", "fields", "pageChanged", "result", "recordedAt"]) &&
        rec.result === "pass" && failRec.result === "fail" && rec.recordedAt === "2026-10-28T10:00:00.000Z" && !/nonce|preview|request|cookie|token|value/i.test(JSON.stringify(rec))
    );
    const trFail = describeTrialResult({ evidence: evidence({ fields: [evidence().fields[0], { ...evidence().fields[1], editable: false, filled: false }], passed: false }) }, tpr);
    const trPass = describeTrialResult({ evidence: evidence() }, tpr);
    check(
      "Popup text (trial): a failure names the field; a pass still says normal filling is not enabled; checks are described",
      /failed/.test(trFail.headline) && trFail.problems[0] === "Mobile Number: no longer editable or changed" && /still not enabled/.test(trPass.headline) && /Proceed/.test(trPass.reminder) &&
        /Rejected: Read-only/.test(describeTrialItem(item({ check: "read_only", status: "rejected", display: null }))) && describeTrialItem(item()) === "Ready"
    );
    const unfilled = { ...evidence().fields[1], filled: false };
    const trChanged = describeTrialResult({ evidence: evidence({ fields: [evidence().fields[0], unfilled], pageChanged: true, passed: false }) }, tpr);
    const trReset = describeTrialResult({ evidence: evidence({ fields: [evidence().fields[0], unfilled], passed: false }) }, tpr);
    check(
      "Popup text (trial): a field skipped because the page changed is not described as a value that did not stay",
      JSON.stringify(trChanged.problems) === JSON.stringify(["Mobile Number: not filled because the page changed", "The page changed during the trial."]) &&
        JSON.stringify(trReset.problems) === JSON.stringify(["Mobile Number: the value did not stay in the field"]),
      JSON.stringify([trChanged.problems, trReset.problems])
    );
    const n2 = sent.length;
    check(
      "Controller: cancel sends a discard for this page and reports whether the page confirmed it",
      (await discardOnPage(sender((m) => ({ type: "MC_DISCARD", v: 1, nonce: m.nonce })), nonce)) === true && sent.at(-1).type === "MC_DISCARD" && sent.at(-1).nonce === nonce && sent.length === n2 + 1 &&
        (await discardOnPage(sender(null), nonce)) === false
    );
  }

  // ── Production manifest + source safety ────────────────────────
  {
    const scripts = manifest.content_scripts.flatMap((c) => c.js);
    const portalScripts = manifest.content_scripts.filter((c) => c.js.includes("src/portal-content.js"));
    check(
      "Manifest: portal content scripts run only on the PMEGP and GST application pages, with the engine loaded first",
      portalScripts.length === 2 && JSON.stringify(portalScripts.map((c) => c.matches)) === JSON.stringify([["https://pmegp.msme.gov.in/Home/HomePage*"], ["https://reg.gst.gov.in/registration*"]]) &&
        portalScripts.every((c) => JSON.stringify(c.js) === JSON.stringify([...ENGINE_FILES, "src/portal-content.js"]))
    );
    check("Manifest: no portal adapter file is shipped (PMEGP and GST filling stay off)", !scripts.some((s) => s.startsWith("adapters/") || /adapter/i.test(s.replace("src/engine/adapters.js", ""))));
    check(
      "Manifest: an adapter file may be shipped only for a verified_supported or supervised_verification_only portal",
      E.registry.list().every((p) => p.status === E.registry.STATUS.VERIFIED_SUPPORTED || p.status === E.registry.STATUS.SUPERVISED || !scripts.includes(`adapters/${p.adapterId}.js`)) &&
        scripts.filter((s) => s.startsWith("adapters/")).every((s) => E.registry.list().some((p) => p.adapterId && s === `adapters/${p.adapterId}.js`)) &&
        !scripts.includes("adapters/pmegp-application.js") && !scripts.includes("adapters/gst-registration.js")
    );
    check("Manifest: host permissions unchanged (Mahabharat origins only)", JSON.stringify(manifest.host_permissions) === JSON.stringify(["https://www.mahabharat.net.in/*", "http://localhost:5173/*"]) && manifest.permissions.length === 0);
    const regOrigins = E.registry.list().flatMap((p) => p.origins);
    const manifestText = JSON.stringify(manifest).replace('"https://pmegp.msme.gov.in/Home/HomePage*"', "").replace('"https://reg.gst.gov.in/registration*"', "");
    check("Manifest: no registry portal origin is granted beyond the PMEGP and GST application pages", !regOrigins.some((o) => manifestText.includes(o.replace("https://", ""))));

    const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
    const src = walk("src").filter((f) => /\.(js|html)$/.test(f)).map((f) => [f, read(f)]);
    const scan = (re, allow = []) => src.filter(([f, s]) => re.test(s) && !allow.includes(f)).map(([f]) => f);
    check("Source: no logging, storage, cookie access or HTML injection anywhere in src/", scan(/console\.|localStorage|sessionStorage|indexedDB|chrome\.storage|document\.cookie|chrome\.cookies|innerHTML|outerHTML|insertAdjacentHTML|\beval\(|new Function/).length === 0);
    check("Source: no form submission or submit simulation", scan(/\.submit\(|requestSubmit|KeyboardEvent|keydown|keypress|"Enter"/).length === 0);
    const clicks = src.flatMap(([f, s]) => [...s.matchAll(/\.click\(/g)].map(() => f));
    check("Source: the only .click() is the guarded radio/checkbox activation in dom.js", clicks.filter((f) => f !== "src/engine/dom.js").length === 0 && clicks.length === 1);
    check("Source: no file-upload or CAPTCHA-solving machinery", scan(/DataTransfer|\.files\s*=|tesseract|ocr\b|solveCaptcha|captchaSolver|recaptcha/i).length === 0);
    check("Source: engine and content scripts make no network requests", scan(/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/, ["src/api.js"]).length === 0);
    check("Source: popup builds DOM with textContent only (no HTML strings)", !/\.innerHTML|insertAdjacent/.test(read("src/popup.js")));

    // Content-script parity: engine files load as classic scripts in a fresh realm with the same API.
    const ctx = vm.createContext({ URL, setTimeout });
    for (const f of ENGINE_FILES) vm.runInContext(read(f), ctx, { filename: f });
    const keys = (o) => Object.keys(o).sort().join(",");
    check(
      "Engine: classic-script load exposes the same modules as the ES import",
      keys(ctx.MCEngine) === keys({ ...E, dom: 1 }) && ["registry", "adapters", "classify", "values", "preview", "protocol"].every((m) => keys(ctx.MCEngine[m]) === keys(E[m]))
    );
  }

  {
    // portal-content.js in an isolated realm: real engine + test adapter, stubbed DOM layer and clock.
    const EXT_ID = "abcdefghijklmnopabcdefghijklmnop";
    const loadPortal = ({ origin = "http://127.0.0.1:47811", pathname = "/register", title = "Mock Candidate Registration", withAdapter = true, withDom = true, adapterFiles = [] } = {}) => {
      let now = 1_000_000;
      const filled = [];
      const domCalls = [];
      const listeners = [];
      class FakeDate extends Date {
        static now() {
          return now;
        }
      }
      const ctx = vm.createContext({
        URL,
        setTimeout,
        crypto: globalThis.crypto,
        Date: FakeDate,
        location: { origin, pathname },
        document: { title },
        chrome: { runtime: { id: EXT_ID, onMessage: { addListener: (fn) => listeners.push(fn) } } },
      });
      for (const f of ENGINE_FILES.filter((f) => !f.endsWith("dom.js"))) vm.runInContext(read(f), ctx, { filename: f });
      if (withDom) {
        vm.runInContext(
          `MCEngine.dom = {
            pageInfo: () => (__domCalls.push("pageInfo"), { pathname: location.pathname, title: document.title, hasSelector: () => true }),
            discover: () => (__domCalls.push("discover"), { descriptors: [
              { id: "f1", kind: "text", tag: "input", type: "text", name: "", domId: "", label: "Full Name", accessibleName: "Full Name", section: "", placeholder: "", title: "", autocomplete: "", required: true, disabled: false, readOnly: false, visible: true, options: null, choices: null, nearCaptcha: false, hasValue: false, maxLength: 0, signature: "s1" },
              { id: "f2", kind: "text", tag: "input", type: "text", name: "", domId: "", label: "Enter OTP", accessibleName: "Enter OTP", section: "", placeholder: "", title: "", autocomplete: "", required: true, disabled: false, readOnly: false, visible: true, options: null, choices: null, nearCaptcha: false, hasValue: false, maxLength: 0, signature: "s2" },
            ], refs: new Map() }),
            resolveAdapterForm: () => (__domCalls.push("resolveAdapterForm"), { overrides: {}, protectedIds: [] }),
            fill: async (plan, refs, approved) => { __domCalls.push("fill"); __filled.push(...approved); return { results: approved.map((id) => ({ id, status: "filled", reason: null })), summary: { filled: approved.length, skipped: 0, failed: 0 } }; },
          };`,
          Object.assign(ctx, { __filled: filled, __domCalls: domCalls })
        );
      }
      if (withAdapter) vm.runInContext(read("tests/fixtures/mock-adapter.js"), ctx, { filename: "mock-adapter.js" });
      for (const f of adapterFiles) vm.runInContext(read(f), ctx, { filename: f });
      vm.runInContext(read("src/portal-content.js"), ctx, { filename: "portal-content.js" });
      const send = (message, sender = { id: EXT_ID }) =>
        new Promise((resolve) => {
          if (!listeners.length) return resolve({ noListener: true });
          let replied = false;
          const keepOpen = listeners[0](message, sender, (r) => {
            replied = true;
            resolve(r);
          });
          if (!keepOpen && !replied) resolve(null);
        });
      return { send, filled, domCalls, listeners, ctx, advance: (ms) => (now += ms) };
    };
    const P = E.protocol;
    const tree = { personal: { fullName: { status: "available", value: "Synthetic Applicant" } } };

    check("Portal content: no listener on an origin without an adapter", loadPortal({ origin: "http://127.0.0.1:9" }).listeners.length === 0);
    check("Portal content: no listener when the engine is incomplete", loadPortal({ withDom: false }).listeners.length === 0);
    const pc = loadPortal();
    const det = await pc.send(P.createDetect());
    check("Portal content: detection reports the adapter portal + form", P.isDetection(det) && det.form?.id === "registration" && det.portal.status === "test_fixture" && det.formFilling === "available");
    check(
      "Portal content: ignores other extensions and messages from tabs",
      (await pc.send(P.createDetect(), { id: "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz" })) === null && (await pc.send(P.createDetect(), { id: EXT_ID, tab: { id: 1 } })) === null
    );
    const pv = await pc.send(P.createPreview(det.nonce, tree));
    check(
      "Portal content: preview marks OTP protected, proposes the name, exposes public keys only",
      P.isPreviewResult(pv) && pv.items.find((i) => i.id === "f1").status === "ready" && pv.items.find((i) => i.id === "f2").status === "protected" &&
        pv.items.every((i) => Object.keys(i).sort().join() === [...E.preview.PUBLIC_KEYS].sort().join())
    );
    const filledRes = await pc.send(P.createFill(det.nonce, pv.previewId, ["f1"]));
    check("Portal content: confirmed fill passes only approved ids to the DOM layer", P.isFillResult(filledRes) && pc.filled.join() === "f1");
    check("Portal content: preview is single-use", (await pc.send(P.createFill(det.nonce, pv.previewId, ["f1"])))?.code === "NO_PREVIEW" && pc.filled.length === 1);
    const pv2 = await pc.send(P.createPreview(det.nonce, tree));
    pc.advance(5 * 60 * 1000 + 1);
    check("Portal content: previews expire after 5 minutes", (await pc.send(P.createFill(det.nonce, pv2.previewId, ["f1"])))?.code === "PREVIEW_EXPIRED" && pc.filled.length === 1);
    check("Portal content: expired preview is discarded", (await pc.send(P.createFill(det.nonce, pv2.previewId, ["f1"])))?.code === "NO_PREVIEW");
    const pv3 = await pc.send(P.createPreview(det.nonce, tree));
    check(
      "Portal content: discard clears the preview",
      (await pc.send(P.createDiscard(det.nonce)))?.type === P.T.DISCARD && (await pc.send(P.createFill(det.nonce, pv3.previewId, ["f1"])))?.code === "NO_PREVIEW"
    );
    check("Portal content: other page nonce → STALE_PAGE", (await pc.send(P.createPreview("0".repeat(32), tree)))?.code === "STALE_PAGE");

    // PMEGP as shipped: engine + portal content script, no adapter file.
    const pm = loadPortal({ origin: "https://pmegp.msme.gov.in", pathname: "/Home/HomePage", title: "PMEGP", withAdapter: false });
    const pmDet = await pm.send(P.createDetect());
    check(
      "Portal content (PMEGP, filling off): detection reports the registry status, no form, no field count, filling unavailable",
      P.isDetection(pmDet) && JSON.stringify(pmDet.portal) === JSON.stringify({ id: "pmegp", name: "Prime Minister's Employment Generation Programme", category: "PMEGP", status: "adapter_pending_verification" }) &&
        pmDet.form === null && pmDet.fieldCount === 0 && pmDet.formFilling === "unavailable",
      JSON.stringify(pmDet)
    );
    const pmPreview = await pm.send(P.createPreview(pmDet.nonce, tree));
    const pmFill = await pm.send(P.createFill(pmDet.nonce, "b".repeat(32), ["f1"]));
    check("Portal content (PMEGP, filling off): preview refused (FORM_NOT_RECOGNISED), fill refused (NO_PREVIEW)", pmPreview?.code === "FORM_NOT_RECOGNISED" && pmFill?.code === "NO_PREVIEW");
    check("Portal content (PMEGP, filling off): wrong nonce → STALE_PAGE; other extensions and tabs ignored", (await pm.send(P.createPreview("0".repeat(32), tree)))?.code === "STALE_PAGE" && (await pm.send(P.createDetect(), { id: "z".repeat(32) })) === null && (await pm.send(P.createDetect(), { id: EXT_ID, tab: { id: 1 } })) === null);
    check("Portal content (PMEGP, filling off): the page is never read or written (no DOM-layer call)", pm.domCalls.length === 0 && pm.filled.length === 0, pm.domCalls.join(","));
    check("Portal content (PMEGP, filling off): no adapter registered in the content-script realm", pm.ctx.MCEngine.adapters.list().length === 0 && pm.ctx.MCEngine.adapters.forOrigin("https://pmegp.msme.gov.in") === null);
    let refused = null;
    try {
      loadPortal({ origin: "https://pmegp.msme.gov.in", pathname: "/Home/HomePage", title: "PMEGP", withAdapter: false, adapterFiles: ["adapters/pmegp-application.js"] });
    } catch (e) {
      refused = e.message;
    }
    check("Portal content (PMEGP): even if the adapter file were loaded, the engine refuses to register it", /registry entry is not verified_supported/.test(refused || ""), refused);
    check(
      "Portal content: no listener for an unknown origin or a PMEGP look-alike, even with the engine loaded",
      ["https://pmegp.msme.gov.in.example.com", "http://pmegp.msme.gov.in", "https://www.pmegp.msme.gov.in"].every((o) => loadPortal({ origin: o, withAdapter: false }).listeners.length === 0)
    );
    const pmView = describePortal(pmDet);
    check(
      "Popup text (PMEGP, filling off): preview disabled; says filling is off until checked after Aadhaar validation and on the live page",
      pmView.canPreview === false && pmView.status === E.registry.STATUS_LABELS.adapter_pending_verification && /Filling is off/.test(pmView.form) && /after Aadhaar validation/.test(pmView.pageStatus) && /live page/.test(pmView.pageStatus),
      JSON.stringify(pmView)
    );

    const gst = loadPortal({ origin: "https://reg.gst.gov.in", pathname: "/registration/", title: "Goods & Services Tax (GST) | Registration", withAdapter: false });
    const gstDet = await gst.send(P.createDetect());
    check(
      "Portal content (GST, filling off): detection reports the registry status, no form, no field count, filling unavailable",
      P.isDetection(gstDet) && JSON.stringify(gstDet.portal) === JSON.stringify({ id: "gst", name: "GST new registration", category: "GST", status: "adapter_pending_verification" }) &&
        gstDet.form === null && gstDet.fieldCount === 0 && gstDet.formFilling === "unavailable",
      JSON.stringify(gstDet)
    );
    const gstPreview = await gst.send(P.createPreview(gstDet.nonce, tree));
    const gstFill = await gst.send(P.createFill(gstDet.nonce, "b".repeat(32), ["f1"]));
    check("Portal content (GST, filling off): preview refused (FORM_NOT_RECOGNISED), fill refused (NO_PREVIEW), page never read", gstPreview?.code === "FORM_NOT_RECOGNISED" && gstFill?.code === "NO_PREVIEW" && gst.domCalls.length === 0);
    check("Portal content (GST, filling off): no adapter registered", gst.ctx.MCEngine.adapters.list().length === 0 && gst.ctx.MCEngine.adapters.forOrigin("https://reg.gst.gov.in") === null);
    let gstRefused = null;
    try {
      loadPortal({ origin: "https://reg.gst.gov.in", pathname: "/registration/", title: "Registration", withAdapter: false, adapterFiles: ["adapters/gst-registration.js"] });
    } catch (e) {
      gstRefused = e.message;
    }
    check("Portal content (GST): even if the adapter file were loaded, the engine refuses to register it", /registry entry is not verified_supported/.test(gstRefused || ""), gstRefused);
    check(
      "Portal content: no listener for a GST look-alike",
      ["https://reg.gst.gov.in.example.com", "http://reg.gst.gov.in", "https://www.reg.gst.gov.in"].every((o) => loadPortal({ origin: o, withAdapter: false }).listeners.length === 0)
    );
    const gstView = describePortal(gstDet);
    check(
      "Popup text (GST, filling off): preview disabled; says filling is off until checked after the applicant continues and on the live page",
      gstView.canPreview === false && /Filling is off/.test(gstView.form) && /continue past this page yourself/.test(gstView.pageStatus) && /live page/.test(gstView.pageStatus) && !/Aadhaar/.test(gstView.pageStatus),
      JSON.stringify(gstView)
    );
  }

  check("No console output from extension code during tests", consoleCalls.length === 0, `${consoleCalls.length} call(s)`);
  out(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  out("FATAL", e?.stack || e);
  process.exit(1);
});

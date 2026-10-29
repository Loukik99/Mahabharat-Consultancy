/**
 * Disabled adapter scaffolds and the adapter-versus-capture template (Node, synthetic data only).
 *   node extension/tests/adapter-scaffolds.test.mjs
 * A portal reports PENDING until its real captures are placed in
 * extension/tests/fixtures/adapters/<scaffold-id>/.
 */
import fs from "node:fs";
import path from "node:path";

import { buildTrialRecord } from "../src/popup-controller.js";
import { renderCaptureFixture } from "./capture-fixture.mjs";
import {
  analyseCaptureSet,
  checkAdapterAgainstCaptures,
  checkAdapterAgainstCaptureSet,
  checkCapture,
  checkCaptureSet,
  checkGateReadiness,
  checkProductionReadiness,
  checkTrialEligibility,
  checkTrialRecord,
  extRoot,
  loadAdapterSpec,
  loadEngine,
  loadInspector,
  loadScaffolds,
  localAdapter,
  readCaptures,
  readCaptureSet,
  readTrialRecords,
  SYNTHETIC_ORIGIN,
  syntheticAdapter,
  syntheticCapture,
  syntheticCaptureSet,
  syntheticStepAdapter,
  trialFactsOf,
} from "./adapter-fixture-template.mjs";
import { GST_FIELD_DECISIONS } from "./gst-coverage.mjs";
import { coveredByProtection, PMEGP_FIELD_DECISIONS } from "./pmegp-coverage.mjs";

let passed = 0;
let failed = 0;
const pending = [];
const out = console.log.bind(console);
function check(name, cond, detail = "") {
  if (cond) passed += 1;
  else failed += 1;
  out(`  ${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail ? ` — ${detail}` : ""}`);
}
const read = (p) => fs.readFileSync(path.join(extRoot, p), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));

const engine = loadEngine();
const inspect = loadInspector();
const scaffolds = plain(loadScaffolds());
const EXPECTED = { "army-agniveer": "army", "navy-agniveer": "navy", "airforce-agniveervayu": "airforce", "postal-gds": "postal-recruitment", "pmegp-application": "pmegp", "gst-registration": "gst" };

out("\n=== Adapter scaffolds ===\n");
check("Exactly the six scaffolds exist", JSON.stringify(Object.keys(scaffolds).sort()) === JSON.stringify(Object.keys(EXPECTED).sort()), Object.keys(scaffolds).join(", "));
const hasKey = (v, key) => (v && typeof v === "object" ? Object.keys(v).some((k) => k === key || hasKey(v[k], key)) : false);
for (const [id, portalId] of Object.entries(EXPECTED)) {
  const s = scaffolds[id];
  const entry = engine.registry.byId(portalId);
  check(`${id}: disabled, unverified, no forms and no field mappings`, s?.id === id && s.portalId === portalId && s.enabled === false && s.verified === false && Array.isArray(s.forms) && s.forms.length === 0 && !hasKey(s, "selector") && !hasKey(s, "fields"));
  check(`${id}: origins are exact https origins from the registry entry`, s.origins.length > 0 && s.origins.every((o) => /^https:\/\/[a-z0-9.-]+$/.test(o) && entry.origins.includes(o)), s.origins.join(", "));
  check(`${id}: registry entry is not verified and names no adapter`, entry.status !== engine.registry.STATUS.VERIFIED_SUPPORTED && !entry.adapterId);
  const problems = engine.adapters.validate(s);
  check(`${id}: engine rejects the scaffold`, problems.some((m) => /not verified_supported/.test(m)) && problems.includes("forms required"), problems.join("; "));
  check(`${id}: records evidence, blockers and the captures still needed`, /^\d{4}-\d{2}-\d{2}$/.test(s.evidence?.checkedOn) && s.evidence.checkedOn === entry.verification.checkedOn && s.evidence.publicPages.length > 0 && s.blockers.length > 0 && s.capturesNeeded.length > 0);
  check(`${id}: scaffold source does not touch the engine, the page or the network`, !/MCEngine|document|chrome\.|fetch\(|XMLHttpRequest|addEventListener/.test(read(`adapters/scaffolds/${id}.js`)));
}
check("Postal scaffold excludes the account-recovery page", scaffolds["postal-gds"].excludedPaths.includes("/gdscandidate/forgot-registration"));
{
  const reg = engine.registry.byId("postal-recruitment").verification.monitoring;
  const fix = JSON.parse(read("inspect/fixtures/observed-public-forms.json")).portals.find((p) => p.id === "postal-recruitment").monitoring;
  check(
    "Postal monitoring status and evidence time agree in the registry and the observed fixture",
    reg?.status === "registration-closed" && fix?.status === reg.status && fix.checkedAt === reg.checkedAt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(reg.checkedAt),
    JSON.stringify({ reg: reg?.status, fix: fix?.status })
  );
  check("GDS status tool is single-shot: 6-hour guard, no retry loop, no POST, no cookies sent", (() => {
    const s = read("tools/gds-status.mjs");
    return /6 \* 60 \* 60 \* 1000/.test(s) && /--force/.test(s) && !/method:\s*"POST"|retry|setInterval|while\s*\(/i.test(s.replace(/no retries/gi, "")) && /credentials: "omit"/.test(s) && !/Cookie:/i.test(s);
  })());
}
check("Army and Air Force scaffolds record the shared vendor host blocker", ["army-agniveer", "airforce-agniveervayu"].every((id) => scaffolds[id].blockers.some((b) => b.includes("cdn.digialm.com"))));
check("Navy scaffold records the navydmpr host blocker", scaffolds["navy-agniveer"].blockers.some((b) => b.includes("agniveer.navydmpr.in")));
check(
  "PMEGP scaffold records the Aadhaar gate and asks for the post-validation capture",
  scaffolds["pmegp-application"].blockers.some((b) => /Aadhaar/.test(b)) && scaffolds["pmegp-application"].capturesNeeded.some((c) => /after you validate Aadhaar yourself/.test(c))
);
check("No scaffold origin is a shared vendor host", Object.values(scaffolds).every((s) => s.origins.every((o) => !/digialm|navydmpr/.test(o))));
check(
  "GST scaffold records the Proceed gate and does not invent a CAPTCHA selector",
  scaffolds["gst-registration"].blockers.some((b) => /Proceed was not clicked/.test(b)) &&
    scaffolds["gst-registration"].capturesNeeded.some((c) => /after you click Proceed yourself/.test(c)) &&
    !hasKey(scaffolds["gst-registration"], "selector")
);
{
  const manifests = ["manifest.json", "inspect/manifest.json"].map(read).join("\n");
  const shipped = [...fs.readdirSync(path.join(extRoot, "src"), { recursive: true })].filter((f) => /\.(js|html)$/.test(f)).map((f) => read(path.join("src", f))).join("\n");
  const inspector = ["origins.js", "capture.js", "content.js", "popup.js", "popup.html"].map((f) => read(`inspect/${f}`)).join("\n");
  check("No manifest, shipped script or inspector file loads a scaffold", !/scaffold/i.test(manifests) && !/scaffold|MCAdapterScaffolds/.test(shipped) && !/scaffold|MCAdapterScaffolds/.test(inspector));
  check("No manifest loads a portal adapter file (extension/adapters/)", !/adapters\//.test(manifests));
  check(
    "Shared DigiALM vendor host is absent from both manifests and the inspector allowlist",
    !/digialm/i.test(manifests) && !inspect.ALLOWED_ORIGINS.some((o) => /digialm/i.test(o)) && !/digialm/i.test(read("inspect/origins.js").replace(/^\/\/.*$/gm, "")),
    inspect.ALLOWED_ORIGINS.join(", ")
  );
  check(
    "navydmpr hosts are absent from both manifests and the inspector allowlist",
    !/navydmpr/i.test(manifests) && !inspect.ALLOWED_ORIGINS.some((o) => /navydmpr/i.test(o)),
    inspect.ALLOWED_ORIGINS.join(", ")
  );
  {
    const pmegpMatches = ["manifest.json", "inspect/manifest.json"].map((f) => JSON.parse(read(f)).content_scripts.flatMap((c) => c.matches).filter((m) => /pmegp/i.test(m)));
    check(
      "PMEGP is reached only at its application page: one exact match in each manifest, the exact origin in the inspector allowlist, no host permission",
      pmegpMatches.every((m) => JSON.stringify(m) === '["https://pmegp.msme.gov.in/Home/HomePage*"]') &&
        (manifests.match(/pmegp/gi) || []).length === 2 &&
        JSON.stringify(inspect.ALLOWED_ORIGINS.filter((o) => /pmegp/i.test(o))) === '["https://pmegp.msme.gov.in"]' &&
        ["manifest.json", "inspect/manifest.json"].every((f) => !JSON.stringify(JSON.parse(read(f)).host_permissions).includes("pmegp")),
      JSON.stringify(pmegpMatches)
    );
    const gstMatches = ["manifest.json", "inspect/manifest.json"].map((f) => JSON.parse(read(f)).content_scripts.flatMap((c) => c.matches).filter((m) => /gst/i.test(m)));
    check(
      "GST is reached only at its registration page: one exact match in each manifest, the exact origin in the inspector allowlist, no host permission",
      gstMatches.every((m) => JSON.stringify(m) === '["https://reg.gst.gov.in/registration*"]') &&
        JSON.stringify(inspect.ALLOWED_ORIGINS.filter((o) => /gst/i.test(o))) === '["https://reg.gst.gov.in"]' &&
        ["manifest.json", "inspect/manifest.json"].every((f) => !JSON.stringify(JSON.parse(read(f)).host_permissions).includes("gst")),
      JSON.stringify(gstMatches)
    );
  }
}
check(
  "Army scaffold asks for a capture set covering every application step and revealed state",
  scaffolds["army-agniveer"].capturesNeeded.some((c) => /capture-set\.json/.test(c)) && scaffolds["army-agniveer"].capturesNeeded.some((c) => /reveal|conditional/i.test(c))
);

out("\n=== Real-capture fixtures ===\n");
for (const [id, portalId] of Object.entries(EXPECTED)) {
  const caps = readCaptures(id);
  if (!caps.length) {
    pending.push(id);
    out(`  PENDING  ${id}: no capture in extension/tests/fixtures/adapters/${id}/ (${scaffolds[id].capturesNeeded.length} captures needed)`);
    continue;
  }
  for (const { file, capture } of caps) {
    const problems = checkCapture(capture, inspect);
    check(`${id}/${file}: sanitised, settled inspector export`, problems.length === 0, problems.join("; "));
    check(`${id}/${file}: origin belongs to the ${portalId} registry entry`, engine.registry.byId(portalId).origins.includes(capture.origin), capture.origin);
    if (id === "postal-gds") check(`${id}/${file}: not the account-recovery page`, !scaffolds[id].excludedPaths.some((p) => capture.path.startsWith(p)), capture.path);
    check(`${id}/${file}: renders to a script-free local stand-in`, !/<script/i.test(renderCaptureFixture(capture)));
  }
  const set = readCaptureSet(id);
  const setProblems = checkCaptureSet(set, caps, inspect, { scaffoldId: id });
  check(`${id}: capture-set.json lists every capture under an application step and state`, setProblems.length === 0, setProblems.join("; "));
  if (!setProblems.length) {
    for (const s of analyseCaptureSet(set, caps)) {
      out(`  INFO  ${id} step ${s.id}: ${s.states} state(s), ${s.fields} fields, conditional ${s.conditional.length}, dependent lists ${s.dependentSelects.length}, protected ${s.protected.length}`);
    }
  }
  const spec = loadAdapterSpec(id);
  if (!spec) {
    out(`  PENDING  ${id}: adapter not written (extension/adapters/${id}.js)`);
    continue;
  }
  const UNVERIFIED = "engine: registry entry is not verified_supported for this adapter";
  const adapterProblems = checkAdapterAgainstCaptureSet(spec, set, caps, { engine: loadEngine(), inspect, scaffoldId: id });
  check(`${id}: adapter matches the captures step by step`, adapterProblems.every((m) => m === UNVERIFIED), adapterProblems.filter((m) => m !== UNVERIFIED).join("; "));
  check(`${id}: adapter stays disabled (registry entry unverified, engine refuses to register it)`, adapterProblems.includes(UNVERIFIED) && engine.registry.byId(portalId).status !== engine.registry.STATUS.VERIFIED_SUPPORTED);
}

out("\n=== PMEGP adapter evidence ===\n");
{
  const spec = loadAdapterSpec("pmegp-application");
  const capture = readCaptures("pmegp-application")[0]?.capture;
  const form = spec?.forms?.[0];
  const D = PMEGP_FIELD_DECISIONS;
  const captured = capture.fields.map((f) => f.selector);
  const decided = Object.keys(D);
  const field = (s) => capture.fields.find((f) => f.selector === s);
  const of = (kind) => decided.filter((s) => D[s][0] === kind);
  check(
    "PMEGP: every captured field has exactly one recorded decision",
    captured.length === 98 && new Set(captured).size === 98 && JSON.stringify([...captured].sort()) === JSON.stringify([...decided].sort()),
    [...captured.filter((s) => !(s in D)), ...decided.filter((s) => !captured.includes(s))].join(", ")
  );
  check("PMEGP: one adapter form, the new-unit step, with generic heuristics off", spec.forms.length === 1 && form.id === "new-unit" && form.genericFields === false);
  check("PMEGP: mapped decisions are exactly the adapter's field mappings", JSON.stringify(of("mapped").sort()) === JSON.stringify(form.fields.map((m) => m.selector).sort()));
  check("PMEGP: protected decisions are exactly the fields the adapter protects", decided.every((s) => (D[s][0] === "protected") === coveredByProtection(form.protectedSelectors, s)), decided.filter((s) => (D[s][0] === "protected") !== coveredByProtection(form.protectedSelectors, s)).join(", "));
  check("PMEGP: every field the inspector filtered is protected", capture.fields.filter((f) => f.filtered).every((f) => D[f.selector][0] === "protected"));
  check(
    "PMEGP: each mapping is an id-selected, visible, enabled control with its own <label for> in Communication Address",
    form.fields.every((m) => {
      const f = field(m.selector);
      return f && f.selectorKind === "id" && f.labelSource === "label" && f.section === "Communication Address" && f.visible && !f.disabled && !f.readOnly && !f.filtered;
    })
  );
  check(
    "PMEGP: mapped keys are the communication taluka, PIN, primary mobile and email only",
    JSON.stringify(form.fields.map((m) => m.key)) === JSON.stringify(["correspondenceAddress.tehsil", "correspondenceAddress.pincode", "contact.mobile", "contact.email"])
  );
  check(
    "PMEGP: controls with mismatched labels are recorded and never mapped",
    ["#ux_communication_District", "#ux_financingBank_address", "#ux_UnitAddress_UnitAddress", "#ux_ProjectInformation_trainingInstnName", "#ux_alternateFinancing_bankAddress", "#ux_UnitAddress_LGDCode"].every((s) => D[s][0] === "protected" || D[s][0] === "ambiguous")
  );
  check(
    "PMEGP: secondary mobile, unit PIN, social category and qualification are not mapped",
    ["#ux_communication_secondary_mobileNo", "#ux_UnitAddress_pin", "#ux_social_category", "#ux_Qualification"].every((s) => !form.fields.some((m) => m.selector === s))
  );
  check("PMEGP: no mapping is a date or a list, so no date format or option is assumed", form.fields.every((m) => !m.dateFormat && field(m.selector).tag === "input" && field(m.selector).type !== "date"));
  out(`  INFO  PMEGP coverage of ${captured.length} captured fields: mapped ${of("mapped").length}, protected ${of("protected").length}, ambiguous ${of("ambiguous").length}, unsupported ${of("unsupported").length}`);
  const entry = engine.registry.byId("pmegp");
  check(
    "PMEGP: adapter stays disabled (registry pending verification, engine refuses it, no manifest loads it)",
    entry.status === engine.registry.STATUS.ADAPTER_PENDING && entry.adapterId === null && loadEngine().adapters.validate(spec).includes("registry entry is not verified_supported for this adapter") &&
      !/adapters\/pmegp-application\.js/.test(read("manifest.json") + read("inspect/manifest.json"))
  );
  check(
    "PMEGP: readiness says post-validation state and real-page filling are not verified, and the scaffold agrees",
    entry.readiness.postValidationVerified === false && entry.readiness.realPageFillVerified === false && entry.readiness.adapterImplemented === true &&
      scaffolds["pmegp-application"].enabled === false && scaffolds["pmegp-application"].verified === false
  );
  check(
    "PMEGP: capture set still holds only the public pre-validation state (nothing claims a post-validation capture)",
    readCaptureSet("pmegp-application").steps.flatMap((s) => s.captures).every((c) => /before Aadhaar validation/.test(c.state)) && readCaptures("pmegp-application").length === 1
  );
  check(
    "PMEGP: no unsupported, ambiguous or protected field is mapped, and every mapped field is unprotected",
    form.fields.every((m) => D[m.selector]?.[0] === "mapped" && !coveredByProtection(form.protectedSelectors, m.selector)) &&
      decided.filter((s) => D[s][0] !== "mapped").every((s) => !form.fields.some((m) => m.selector === s))
  );
  {
    const protectedSyntax = form.protectedSelectors.filter((s) => !/^(#[A-Za-z][\w-]*( input)?|input\[type="radio"\]\[name="[A-Za-z]+"\])$/.test(s));
    check("PMEGP: every protected selector is an id, an id-scoped input group or a named radio group", protectedSyntax.length === 0, protectedSyntax.join(", "));
  }
}

out("\n=== GST adapter evidence ===\n");
{
  const spec = loadAdapterSpec("gst-registration");
  const capture = readCaptures("gst-registration")[0]?.capture;
  const form = spec?.forms?.[0];
  const D = GST_FIELD_DECISIONS;
  const captured = capture.fields.map((f) => f.selector);
  const decided = Object.keys(D);
  const field = (s) => capture.fields.find((f) => f.selector === s);
  const of = (kind) => decided.filter((s) => D[s][0] === kind);
  check(
    "GST: every captured field has exactly one recorded decision",
    captured.length === 8 && new Set(captured).size === 8 && JSON.stringify([...captured].sort()) === JSON.stringify([...decided].sort()),
    [...captured.filter((s) => !(s in D)), ...decided.filter((s) => !captured.includes(s))].join(", ")
  );
  check("GST: one adapter form, part A, with generic heuristics off", spec.forms.length === 1 && form.id === "part-a" && form.genericFields === false && form.match.selector === 'form[name="preg"]' && form.match.pathPrefix === "/registration/");
  check("GST: mapped decisions are exactly the adapter's field mappings", JSON.stringify(of("mapped").sort()) === JSON.stringify(form.fields.map((m) => m.selector).sort()));
  check("GST: protected decisions are exactly the fields the adapter protects", decided.every((s) => (D[s][0] === "protected") === coveredByProtection(form.protectedSelectors, s)), decided.filter((s) => (D[s][0] === "protected") !== coveredByProtection(form.protectedSelectors, s)).join(", "));
  check("GST: every field the inspector filtered is protected", capture.fields.filter((f) => f.filtered).every((f) => D[f.selector][0] === "protected"));
  check(
    "GST: each mapping is an id-selected, visible, enabled control with its own <label for> in New Registration",
    form.fields.every((m) => {
      const f = field(m.selector);
      return f && f.selectorKind === "id" && f.labelSource === "label" && f.section === "New Registration" && f.visible && !f.disabled && !f.readOnly && !f.filtered;
    })
  );
  check("GST: mapped keys are the email and mobile only", JSON.stringify(form.fields.map((m) => m.key)) === JSON.stringify(["contact.email", "contact.mobile"]));
  check("GST: no select, radio, date or identity field is mapped", form.fields.every((m) => field(m.selector).tag === "input" && field(m.selector).type === "text"));
  check("GST: State/UT, District, taxpayer type and the TRN switch are not mapped", ["#applnState", "#applnDistr", "#applnType", 'input[type="radio"][name="typ"]'].every((s) => D[s][0] === "unsupported" && !form.fields.some((m) => m.selector === s)));
  check("GST: nothing on this capture is ambiguous", of("ambiguous").length === 0);
  out(`  INFO  GST coverage of ${captured.length} captured fields: mapped ${of("mapped").length}, protected ${of("protected").length}, ambiguous ${of("ambiguous").length}, unsupported ${of("unsupported").length}`);
  const entry = engine.registry.byId("gst");
  check(
    "GST: adapter stays disabled (registry pending verification, engine refuses it, no manifest loads it)",
    entry.status === engine.registry.STATUS.ADAPTER_PENDING && entry.adapterId === null && loadEngine().adapters.validate(spec).includes("registry entry is not verified_supported for this adapter") &&
      !/adapters\/gst-registration\.js/.test(read("manifest.json") + read("inspect/manifest.json"))
  );
  check(
    "GST: readiness says the page after Proceed and real-page filling are not verified, and the scaffold agrees",
    entry.readiness.postValidationVerified === false && entry.readiness.realPageFillVerified === false && entry.readiness.adapterImplemented === true &&
      scaffolds["gst-registration"].enabled === false && scaffolds["gst-registration"].verified === false
  );
  check(
    "GST: capture set still holds only the public page before Proceed",
    readCaptureSet("gst-registration").steps.flatMap((s) => s.captures).every((c) => /before Proceed/.test(c.state)) && readCaptures("gst-registration").length === 1
  );
}

out("\n=== Gate readiness (after the applicant's own step) ===\n");
{
  const GATED = { "gst-registration": ["gst", "Proceed"], "pmegp-application": ["pmegp", "Aadhaar validation"] };
  check("Exactly GST and PMEGP declare a gate (the portals with a written adapter)", JSON.stringify(Object.keys(scaffolds).filter((id) => scaffolds[id].gate).sort()) === JSON.stringify(Object.keys(GATED).sort()));
  for (const [id, [portalId, name]] of Object.entries(GATED)) {
    const s = scaffolds[id];
    const steps = s.gate.steps.join(" ");
    check(
      `${id}: gate workflow is done by the applicant, keeps OTP and identity values with them, and never has the tools click or submit`,
      s.gate.name === name && /Only (an applicant|the applicant)/.test(steps) && /[Nn]obody types/.test(steps) && /nobody asks them for those values/.test(steps) &&
        /never (enter an OTP|click Validate)/.test(steps) && /extension\/inspect/.test(steps) && /structure only/.test(steps) && /without anything after \? or #/.test(steps)
    );
    check(`${id}: gate workflow ends with the gate check and ties postValidationVerified to the verdict consistent`, new RegExp(`adapter:check -- ${id}`).test(steps) && /postValidationVerified may be set only on the verdict consistent/.test(steps));
    const set = readCaptureSet(id);
    const caps = readCaptures(id);
    check(`${id}: every capture-set entry says whether it was taken before or after ${name}`, set.steps.every((st) => st.captures.every((e) => e.gate === "before" || e.gate === "after")));
    const gate = checkGateReadiness(loadAdapterSpec(id), set, caps, { engine: loadEngine(), inspect, scaffoldId: id });
    check(`${id}: gate check finds no problem and is awaiting the capture after ${name}`, gate.verdict === "awaiting_capture" && gate.afterGateStates === 0 && gate.problems.length === 0 && gate.fields.every((f) => f.results.length === 0), JSON.stringify(gate.problems));
    const readiness = engine.registry.byId(portalId).readiness;
    check(`${id}: registry may claim the state after ${name} only when the gate check says consistent`, !readiness.postValidationVerified || gate.verdict === "consistent", `${readiness.postValidationVerified} / ${gate.verdict}`);
  }

  const base = syntheticCapture(inspect);
  const variant = (fn) => inspect.sanitizeCapture(fn(plain(base)));
  const edit = (patches) => variant((c) => ({ ...c, fields: c.fields.flatMap((f) => (f.selector in patches ? (patches[f.selector] === null ? [] : [{ ...f, ...patches[f.selector] }]) : [f])) }));
  const BEFORE = { file: "01-before.json", state: "before the applicant's own step", gate: "before" };
  const AFTER = { file: "02-after.json", state: "after the applicant's own step", gate: "after" };
  const setOf = (personal, more = []) => ({ kind: "capture-set", version: 1, scaffoldId: "synthetic", steps: [{ id: "personal", name: "Personal details", captures: personal }, ...more] });
  const caps = (after) => [{ file: "01-before.json", capture: base }, ...(after ? [{ file: "02-after.json", capture: after }] : [])];
  const gate = (set, c, a = syntheticAdapter()) => checkGateReadiness(a, set, c, { engine: loadEngine(), inspect, allowTestOrigins: true, scaffoldId: "synthetic" });
  const outcomes = (g) => Object.fromEntries(g.fields.map((f) => [f.selector, f.results.map((r) => r.outcome).join(",")]));
  const has = (g, re) => g.problems.some((m) => re.test(m));

  const none = gate(setOf([BEFORE]), caps());
  check("Gate: no capture after the gate → awaiting_capture, nothing claimed", none.verdict === "awaiting_capture" && none.fields.every((f) => f.results.length === 0 && f.editableAfterGate === false), JSON.stringify(none));
  const same = gate(setOf([BEFORE, AFTER]), caps(base));
  check("Gate: identical fields after the gate → consistent, every mapping same and editable", same.verdict === "consistent" && same.fields.every((f) => f.results[0].outcome === "same_editable" && f.editableAfterGate), JSON.stringify(outcomes(same)));
  const moved = gate(setOf([BEFORE, AFTER]), caps(edit({ "#mobile": { readOnly: true }, "#full_name": { visible: false }, "#dob_text": null })));
  check(
    "Gate: locked, hidden and removed mappings are reported as such and do not block (the engine never fills them there)",
    moved.verdict === "consistent" && outcomes(moved)["#mobile"] === "locked" && outcomes(moved)["#full_name"] === "hidden" && outcomes(moved)["#dob_text"] === "absent" && outcomes(moved)["#g_m"] === "same_editable" &&
      moved.fields.every((f) => (f.selector === "#g_m") === f.editableAfterGate),
    JSON.stringify(outcomes(moved))
  );
  const otherPage = variant((c) => ({ ...c, forms: [{ index: 0, selector: "form#otp", id: "otp", name: "", method: "post", actionPath: "/apply/verify" }], fields: [{ ...c.fields.find((f) => f.selector === "#captcha"), id: "otp_box", selector: "#otp_box", label: "One time password", filtered: "otp" }], buttons: [], filteredByKind: { otp: 1 }, counts: { forms: 1, fields: 1 } }));
  const away = gate(setOf([BEFORE], [{ id: "verify", name: "Verify", captures: [{ ...AFTER, state: "OTP page after the applicant's own step" }] }]), caps(otherPage));
  check("Gate: a different page after the gate, in its own step, is not matched by the adapter → consistent, outcome not_matched", away.verdict === "consistent" && Object.values(outcomes(away)).every((o) => o === "not_matched"), JSON.stringify(away.problems));
  const claimed = gate(setOf([BEFORE], [{ id: "verify", name: "Verify", captures: [{ ...AFTER, state: "page after the applicant's own step" }] }]), caps(base));
  check("Gate: the adapter claiming a page after the gate that belongs to another step → blocked", claimed.verdict === "blocked" && has(claimed, /matched by form personal, which belongs to another step/), claimed.problems.join("; "));
  const blocked = [
    ["relabelled mapping (a different field under the same selector)", edit({ "#mobile": { label: "Alternate mobile number" } }), /#mobile → contact\.mobile is a different field after the gate .*label/],
    ["changed maximum length", edit({ "#mobile": { validation: { maxLength: 12 } } }), /#mobile → contact\.mobile is a different field after the gate .*validation\.maxLength/],
    ["changed control type", edit({ "#full_name": { type: "email" } }), /#full_name → personal\.fullName is a different field after the gate .*type/],
    ["mapping that becomes an OTP box", edit({ "#mobile": { filtered: "otp" } }), /captured as otp|#mobile → contact\.mobile is a different field after the gate .*filtered/],
  ];
  for (const [what, after, re] of blocked) {
    const g = gate(setOf([BEFORE, AFTER]), caps(after));
    check(`Gate blocks: ${what}`, g.verdict === "blocked" && has(g, re) && g.fields.some((f) => f.results.some((r) => r.outcome === "changed")), g.problems.join("; "));
  }
  const otp = edit({});
  otp.fields.push({ ...otp.fields.find((f) => f.selector === "#captcha"), id: "mobile_otp", selector: "#mobile_otp", label: "Mobile OTP", filtered: "otp" });
  const unprotectedOtp = gate(setOf([BEFORE, AFTER]), caps(inspect.sanitizeCapture(otp)));
  check("Gate blocks: an OTP box that appears after the gate on the adapter's own form is not in protectedSelectors", unprotectedOtp.verdict === "blocked" && has(unprotectedOtp, /otp field #mobile_otp must be listed in protectedSelectors/), unprotectedOtp.problems.join("; "));
  const echo = plain(base);
  echo.fields = echo.fields.map((f) => (f.selector === "#mobile" ? { ...f, label: "OTP sent to 90XXXXXX77" } : f));
  const leaked = gate(setOf([BEFORE, AFTER]), caps(echo));
  check("Gate blocks: a hand-made capture that keeps a masked mobile echo is not an inspector export", leaked.verdict === "blocked" && has(leaked, /not exactly the inspector's sanitised export|looks like applicant data/), leaked.problems.join("; "));
  const unmarked = gate(setOf([BEFORE, { file: "02-after.json", state: "after the applicant's own step" }]), caps(base));
  check("Gate blocks: an entry that does not say before or after", unmarked.verdict === "blocked" && has(unmarked, /mark the entry "gate": "before" or "gate": "after"/), unmarked.problems.join("; "));
  const badValue = checkCaptureSet(setOf([BEFORE, { ...AFTER, gate: "later" }]), caps(base), inspect, { scaffoldId: "synthetic" });
  check("Capture set rejects a gate value other than before or after", badValue.some((m) => /gate must be "before" or "after"/.test(m)), badValue.join("; "));
  const onlyAfter = gate(setOf([{ ...BEFORE, gate: "after" }]), caps());
  check("Gate blocks: a mapping with no capture before the gate to compare with", onlyAfter.verdict === "blocked" && has(onlyAfter, /not visible in any capture taken before the gate/), onlyAfter.problems.join("; "));
}

out("\n=== Supervised verification (trial eligibility, trial records, production readiness) ===\n");
{
  const R = engine.registry;
  const manifestScripts = JSON.parse(read("manifest.json")).content_scripts.flatMap((c) => c.js);
  const TRIALS = { "gst-registration": ["gst", ["#email", "#mobile"]], "pmegp-application": ["pmegp", ["#ux_communication_taluk_block", "#ux_communication_pin", "#ux_communication_mobileNo", "#ux_communication_emailId"]] };
  check("Exactly GST and PMEGP declare a supervised trial workflow", JSON.stringify(Object.keys(scaffolds).filter((id) => scaffolds[id].trial).sort()) === JSON.stringify(Object.keys(TRIALS).sort()));
  for (const [id, [portalId, fields]] of Object.entries(TRIALS)) {
    const spec = loadAdapterSpec(id);
    const entry = R.byId(portalId);
    const set = readCaptureSet(id);
    const caps = readCaptures(id);
    const env = { engine: loadEngine(), inspect, scaffoldId: id };
    const steps = scaffolds[id].trial.steps.join(" ");
    check(
      `${id}: the trial is limited to ${fields.join(", ")} (registry, scaffold and adapter mappings agree; no mapping added)`,
      JSON.stringify(entry.supervisedTrial.fields.map((f) => f.selector)) === JSON.stringify(fields) && JSON.stringify(scaffolds[id].trial.limitedTo) === JSON.stringify(fields) &&
        JSON.stringify(spec.forms.flatMap((f) => f.fields.map((m) => m.selector))) === JSON.stringify(fields) && R.trialMatches(entry.supervisedTrial, spec)
    );
    const before = set.steps.flatMap((s) => s.captures.filter((e) => e.gate === "before").map((e) => caps.find((c) => c.file === e.file).capture));
    check(
      `${id}: the trial's recorded facts (tag, type, maximum length, label) are the captured facts`,
      entry.supervisedTrial.fields.every((t) => before.some((c) => JSON.stringify(trialFactsOf(c.fields.find((f) => f.selector === t.selector), t.key)) === JSON.stringify(t)))
    );
    const eligibility = checkTrialEligibility(spec, entry, set, caps, env);
    check(`${id}: trial eligibility has no problem and is awaiting the capture after the applicant's step`, eligibility.verdict === "awaiting_capture" && eligibility.problems.length === 0, eligibility.problems.join("; "));
    check(`${id}: the registry may be supervised_verification_only only when the trial is eligible`, (entry.status === R.STATUS.SUPERVISED) <= (eligibility.verdict === "eligible"), `${entry.status} / ${eligibility.verdict}`);
    const records = readTrialRecords(id);
    const prod = checkProductionReadiness({ adapter: spec, entry, set, caps, captures: caps, records, env });
    check(`${id}: realPageFillVerified may be set only when the latest valid supervised trial record passed`, !entry.readiness.realPageFillVerified || prod.passingRecord, `${entry.readiness.realPageFillVerified} / ${records.length} record(s)`);
    check(`${id}: verified_supported only when the production readiness check is complete`, entry.status !== R.STATUS.VERIFIED_SUPPORTED || prod.ready, prod.problems.join("; "));
    check(`${id}: every trial record on file is a valid, unedited popup export`, records.every((r) => checkTrialRecord(r.text, { adapter: spec, trial: entry.supervisedTrial, inspect }).length === 0));
    check(`${id}: the adapter file is shipped only once the entry is supervised or verified`, !manifestScripts.includes(`adapters/${id}.js`) || entry.status === R.STATUS.SUPERVISED || entry.status === R.STATUS.VERIFIED_SUPPORTED);
    check(`${id}: production readiness is not complete now (no capture after the applicant's step, no trial record)`, prod.ready === false && /awaiting_capture/.test(prod.problems.join(" ")));
    check(
      `${id}: trial workflow is run by the applicant, needs eligibility and an explicit registry change, and keeps production enablement separate`,
      /says the supervised trial is eligible/.test(steps) && /supervised_verification_only/.test(steps) && /The tests refuse it unless the trial is eligible/.test(steps) && /Only the applicant runs the trial/.test(steps) &&
        /Nobody asks them for/.test(steps) && /never requests or enters an OTP, never answers a CAPTCHA and never pays/.test(steps) && /Cancel trial stops it at once/.test(steps) &&
        new RegExp(`fixtures/adapters/${id}/trials/`).test(steps) && /realPageFillVerified may be set only when the latest valid record passed/.test(steps) && /production enablement is a separate decision/.test(steps)
    );
  }

  const withTrial = new Set(Object.values(TRIALS).map(([portalId]) => portalId));
  const claims = R.list().filter((e) => e.readiness?.postValidationVerified || e.readiness?.realPageFillVerified || e.status === R.STATUS.SUPERVISED || e.status === R.STATUS.VERIFIED_SUPPORTED || e.adapterId);
  check(
    "Every registry entry: post-gate, real-page fill, supervised or verified status, or a named adapter only for a portal whose trial evidence is checked above",
    claims.every((e) => withTrial.has(e.id)),
    claims.map((e) => e.id).join(", ")
  );
  for (const id of ["army", "navy", "airforce", "postal-recruitment"]) {
    const e = R.byId(id);
    check(`${id}: explicitly pending (researched_not_implemented, no adapter, no readiness record, no trial)`, e.status === "researched_not_implemented" && e.adapterId === null && e.readiness === null && e.supervisedTrial === null);
  }

  // Synthetic trial evidence: a two-text-field adapter on the synthetic capture.
  const base = syntheticCapture(inspect);
  const variant = (patches) => inspect.sanitizeCapture({ ...plain(base), fields: plain(base).fields.map((f) => (f.selector in patches ? { ...f, ...patches[f.selector] } : f)) });
  const TF = [{ selector: "#full_name", key: "personal.fullName" }, { selector: "#mobile", key: "contact.mobile" }];
  const tAdapter = { ...syntheticAdapter(TF), version: "1.0.0" };
  const tEntry = (o = {}) => ({
    id: "synthetic",
    readiness: { publicFormInspected: true, adapterImplemented: true, localFixtureTestsPassed: true, postValidationVerified: true, realPageFillVerified: true },
    supervisedTrial: { adapterVersion: "1.0.0", form: "personal", fields: TF.map((m) => trialFactsOf(base.fields.find((f) => f.selector === m.selector), m.key)) },
    ...o,
  });
  const BEFORE = { file: "01-before.json", state: "before the applicant's own step", gate: "before" };
  const AFTER = { file: "02-after.json", state: "after the applicant's own step", gate: "after" };
  const setOf = (entries, more = []) => ({ kind: "capture-set", version: 1, scaffoldId: "synthetic", steps: [{ id: "personal", name: "Personal details", captures: entries }, ...more] });
  const capsOf = (after) => [{ file: "01-before.json", capture: base }, ...(after ? [{ file: "02-after.json", capture: after }] : [])];
  const env = { engine: loadEngine(), inspect, allowTestOrigins: true, scaffoldId: "synthetic" };
  const elig = (after, entry = tEntry(), a = tAdapter, set = setOf(after ? [BEFORE, AFTER] : [BEFORE])) => checkTrialEligibility(a, entry, set, capsOf(after), env);
  check("Trial eligibility: before-gate captures only → awaiting_capture", elig(null).verdict === "awaiting_capture", elig(null).problems.join("; "));
  check("Trial eligibility: the same editable fields after the gate → eligible", elig(base).verdict === "eligible", elig(base).problems.join("; "));
  const notEligible = [
    ["a mapped field read-only after the gate", variant({ "#mobile": { readOnly: true } }), undefined, undefined, /not the same editable field in every state after the gate \(locked\)/],
    ["a mapped field hidden after the gate", variant({ "#mobile": { visible: false } }), undefined, undefined, /not the same editable field .*hidden/],
    ["a mapped field relabelled after the gate", variant({ "#mobile": { label: "Alternate mobile number" } }), undefined, undefined, /different field after the gate/],
    ["a registry fact that differs from the capture", base, tEntry({ supervisedTrial: { ...tEntry().supervisedTrial, fields: [tEntry().supervisedTrial.fields[0], { ...tEntry().supervisedTrial.fields[1], maxLength: 12 }] } }), undefined, /maxLength differ from capture/],
    ["a trial that declares a field the adapter does not map", base, tEntry({ supervisedTrial: { ...tEntry().supervisedTrial, fields: [tEntry().supervisedTrial.fields[0]] } }), undefined, /does not match adapter/],
    ["an adapter version the trial was not declared for", base, undefined, { ...tAdapter, version: "1.1.0" }, /does not match adapter/],
    ["no trial declared", base, tEntry({ supervisedTrial: null }), undefined, /no supervisedTrial/],
  ];
  for (const [what, after, entry, a, re] of notEligible) {
    const r = elig(after, entry, a);
    check(`Trial eligibility blocks: ${what}`, r.verdict === "blocked" && r.problems.some((m) => re.test(m)), r.problems.join("; ") || r.verdict);
  }
  const invalidCaptures = [
    ["an after-gate file that is not an inspector capture", { ...plain(base), kind: "page-dump" }, /not an inspector form-structure capture/],
    ["an after-gate capture edited by hand", { ...plain(base), note: "checked" }, /not exactly the inspector's sanitised export/],
    ["an after-gate capture holding applicant-like data", { ...plain(base), title: "Applicant 9876543210" }, /looks like applicant data/],
    ["an after-gate capture taken before the page settled", { ...plain(base), settled: false }, /before the page settled/],
  ];
  for (const [what, after, re] of invalidCaptures) {
    const r = elig(after);
    check(`Trial eligibility blocks: ${what}`, r.verdict === "blocked" && r.problems.some((m) => re.test(m)), r.problems.join("; ") || r.verdict);
  }
  const otherPage = inspect.sanitizeCapture({ ...plain(base), forms: [{ index: 0, selector: "form#otp", id: "otp", name: "", method: "post", actionPath: "/apply/verify" }], fields: [], buttons: [], filteredByKind: {}, counts: { forms: 1, fields: 0 } });
  const away = checkTrialEligibility(tAdapter, tEntry(), setOf([BEFORE], [{ id: "verify", name: "Verify", captures: [AFTER] }]), capsOf(otherPage), env);
  check("Trial eligibility blocks: the fields are not on the page after the gate (not matched there), so editability is unproven", away.verdict === "blocked" && away.problems.some((m) => /not_matched/.test(m)), away.problems.join("; "));

  const evidence = (o = {}) => ({ adapterId: tAdapter.id, adapterVersion: "1.0.0", origin: SYNTHETIC_ORIGIN, form: "personal", fields: TF.map((m) => ({ ...m, editable: true, approved: true, filled: true })), pageChanged: false, passed: true, ...o });
  const recordText = (ev = evidence(), at = "2026-10-28T10:00:00.000Z") => `${JSON.stringify(buildTrialRecord(ev, new Date(at)), null, 2)}\n`;
  const rec = (text) => checkTrialRecord(text, { adapter: tAdapter, trial: tEntry().supervisedTrial, inspect });
  check("Trial record: the popup's export of a passing trial is valid", rec(recordText()).length === 0, rec(recordText()).join("; "));
  check("Trial record: the popup's export of a failing trial is valid (and says fail)", rec(recordText(evidence({ pageChanged: true, passed: false }))).length === 0 && JSON.parse(recordText(evidence({ pageChanged: true, passed: false }))).result === "fail");
  const edited = (fn) => {
    const r = JSON.parse(recordText());
    fn(r);
    return JSON.stringify(r);
  };
  const badRecords = [
    ["an applicant value added", edited((r) => (r.fields[1].value = "9876543210")), /exactly selector/],
    ["an extra top-level note with a mobile number", edited((r) => (r.note = "9876543210")), /must hold exactly/],
    ["a mobile number inside a known field", edited((r) => (r.form = "personal 9876543210")), /looks like applicant data|not the trial form/],
    ["another adapter version", edited((r) => (r.adapterVersion = "1.0.1")), /adapter version/],
    ["another origin", edited((r) => (r.origin = "https://example.gov.in")), /not an adapter origin/],
    ["another form", edited((r) => (r.form = "education")), /not the trial form/],
    ["a field left out", edited((r) => r.fields.pop()), /not exactly the trial fields/],
    ["fields in another order", edited((r) => r.fields.reverse()), /not exactly the trial fields/],
    ["pass claimed although the page changed", edited((r) => (r.pageChanged = true)), /does not follow/],
    ["pass claimed although a field was not filled", edited((r) => (r.fields[0].filled = false)), /does not follow/],
    ["a field filled without approval", edited((r) => ((r.fields[0].approved = false), (r.result = "fail"))), /filled without being approved/],
    ["a malformed timestamp", edited((r) => (r.recordedAt = "yesterday")), /ISO timestamp/],
    ["not JSON", "{", /not JSON/],
  ];
  for (const [what, text, re] of badRecords) {
    const p = rec(text);
    check(`Trial record rejects: ${what}`, p.some((m) => re.test(m)), p.join("; ") || "(no problems)");
  }
  const prodOf = (records, entry = tEntry(), after = base) =>
    checkProductionReadiness({ adapter: tAdapter, entry, set: setOf([BEFORE, AFTER]), captures: capsOf(after), records: records.map((text, i) => ({ file: `0${i}.json`, text })), env });
  check("Production readiness: eligible captures, a passing record and every readiness flag → ready (a report only)", prodOf([recordText()]).ready === true, prodOf([recordText()]).problems.join("; "));
  check("Production readiness: no record → not ready", prodOf([]).ready === false && prodOf([]).problems.some((m) => /no valid supervised trial record/.test(m)));
  const laterFail = recordText(evidence({ pageChanged: true, passed: false }), "2026-10-29T10:00:00.000Z");
  check("Production readiness: a later failing trial outweighs an earlier pass", prodOf([recordText(), laterFail]).ready === false && prodOf([recordText(), laterFail]).problems.some((m) => /latest supervised trial .* failed/.test(m)));
  check("Production readiness: an invalid record is a problem", prodOf([recordText(), "{"]).ready === false && prodOf([recordText(), "{"]).problems.some((m) => /trial record 01\.json: not JSON/.test(m)));
  check("Production readiness: a readiness flag not recorded → not ready", prodOf([recordText()], tEntry({ readiness: { ...tEntry().readiness, realPageFillVerified: false } })).problems.some((m) => /realPageFillVerified/.test(m)));
  check("Production readiness: captures that are not eligible → not ready", prodOf([recordText()], tEntry(), variant({ "#mobile": { readOnly: true } })).ready === false);
}

out("\n=== Adapter-versus-capture template self-test ===\n");
const capture = syntheticCapture(inspect);
const adapter = syntheticAdapter;
const run = (a, caps = [capture]) => checkAdapterAgainstCaptures(a, caps, { engine: loadEngine(), inspect, allowTestOrigins: true });
const good = adapter();
check("Template: a correct adapter has no problems", run(good).length === 0, run(good).join("; "));
check("Template: native date input needs no dateFormat", run(adapter([{ selector: "#dob_native", key: "personal.dob" }])).length === 0);
const bad = [
  ["selector not in the capture", adapter([{ selector: "#invented", key: "personal.fullName" }]), /not in any capture/],
  ["field captured as filtered", adapter([{ selector: "#aadhaar", key: "personal.fullName" }]), /captured as identity/],
  ["field never visible", adapter([{ selector: "#later", key: "personal.fullName" }]), /never visible/],
  ["field disabled", adapter([{ selector: "#locked", key: "personal.fullName" }]), /disabled or read-only/],
  ["generated selector", adapter([{ selector: "#\\:r1\\:", key: "personal.fullName" }]), /looks generated/],
  ["positional selector", adapter([{ selector: "body > div:nth-of-type(2) > input", key: "personal.fullName" }]), /positional selector/],
  ["text date without dateFormat", adapter([{ selector: "#dob_text", key: "personal.dob" }]), /needs an explicit dateFormat/],
  ["wrong field kind", adapter([{ selector: "#dob_native", key: "personal.fullName" }]), /field kind date does not suit/],
  ["unknown key", adapter([{ selector: "#full_name", key: "personal.favouriteColour" }]), /unknown or forbidden key/],
  ["identity key", adapter([{ selector: "#full_name", key: "identity.aadhaar" }]), /unknown or forbidden key/],
  ["CAPTCHA not protected", adapter([{ selector: "#full_name", key: "personal.fullName" }], { protectedSelectors: [] }), /captcha field #captcha must be listed/],
  ["protected selector with a typo", adapter(undefined, { protectedSelectors: [...good.forms[0].protectedSelectors, "#captcha_txt"] }), /protected selector #captcha_txt matches no captured field/],
  ["form selector not captured", adapter([], { match: { pathPrefix: "/apply", selector: "form#other" } }), /not a captured form/],
  ["path outside the capture", adapter([], { match: { pathPrefix: "/elsewhere" } }), /no capture from an adapter origin/],
  ["function in adapter", adapter([{ selector: "#full_name", key: "personal.fullName", transform: () => "x" }]), /declarative/],
];
for (const [what, a, re] of bad) {
  const problems = run(a);
  check(`Template rejects: ${what}`, problems.some((m) => re.test(m)), problems.join("; ") || "(no problems reported)");
}
check("Template rejects an origin outside the adapter", run({ ...good, origins: ["http://127.0.0.1:9999"] }).some((m) => /no capture from an adapter origin/.test(m)));
check("Template rejects an edited capture (extra value key)", run(good, [{ ...capture, fields: capture.fields.map((f, i) => (i === 0 ? { ...f, value: "x" } : f)) }]).some((m) => /not exactly the inspector's sanitised export/.test(m)));
check("Template rejects a capture containing applicant-like text", run(good, [{ ...capture, title: "Welcome 9876543210" }]).some((m) => /sanitised export|looks like applicant/.test(m)));
check("Template rejects an unsettled capture", run(good, [{ ...capture, settled: false }]).some((m) => /before the page settled/.test(m)));
check("Template rejects a capture of a page with fields in shadow DOM", run(good, [inspect.sanitizeCapture({ ...capture, counts: { ...capture.counts, shadowRootsWithFields: 1 } })]).some((m) => /shadow DOM/.test(m)));
{
  const html = renderCaptureFixture(capture);
  check("Stand-in renderer reproduces ids, names, the radio group and the form", ['id="full_name"', 'id=":r1:"', 'name="g" value="M"', 'id="g_f"', '<form id="application" method="post" action="/fixture-submit">'].every((s) => html.includes(s)));
  check("Stand-in renderer hides invisible fields and keeps locked state", /<div hidden><label for="later">Conditional<\/label><input type="text" id="later"><\/div>/.test(html) && /id="locked"[^>]* disabled/.test(html));
  const hostile = inspect.sanitizeCapture({ ...capture, title: '</title><script>alert(1)</script>', fields: [{ ...capture.fields[0], label: '<img src=x onerror="alert(1)">', section: "</legend><script>x</script>" }] });
  const evil = renderCaptureFixture(hostile);
  check("Stand-in renderer escapes every captured string (no markup injection, no script)", !/<script|<img/i.test(evil) && evil.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"), evil.slice(0, 300));
  {
    const base = capture.fields.find((f) => f.selector === "#full_name");
    const withField = (f) => renderCaptureFixture(inspect.sanitizeCapture({ ...capture, fields: [{ ...base, ...f }] }));
    const labelled = withField({ id: "applicant", selector: "#applicant", label: "Name of Applicant", labelSource: "label", filtered: "identity" });
    const unlabelled = withField({ id: "applicant", selector: "#applicant", label: "", labelSource: null, filtered: "identity" });
    check(
      "Stand-in renderer restates a filtered field's kind only where the hint cannot become its label",
      /id="applicant" placeholder="ID number"/.test(labelled) && !/placeholder=/.test(unlabelled),
      labelled.match(/<input[^>]*applicant[^>]*>/)?.[0]
    );
    const radios = capture.fields.find((f) => f.type === "radio-group");
    const loose = renderCaptureFixture(inspect.sanitizeCapture({ ...capture, fields: [{ ...radios, label: "", labelSource: null, section: "Project" }] }));
    check("Stand-in renderer puts an unlabelled radio group under a heading, not a legend that would label it", /<h2>Project<\/h2>/.test(loose) && !/<legend>Project/.test(loose));
    const long = renderCaptureFixture(inspect.sanitizeCapture({ ...capture, fields: [{ ...base, tag: "select", type: "select", optionCount: 5, options: [{ value: "a", text: "A" }, { value: "b", text: "B" }] }] }));
    check("Stand-in renderer keeps the recorded option count of a truncated list", (long.match(/<option /g) || []).length === 5);
    const box = (sel, extra = {}) => ({ ...base, id: "", name: "", label: "", labelSource: null, selector: sel, selectorKind: "path", selectorStable: false, visible: false, ...extra });
    const boxes = renderCaptureFixture(inspect.sanitizeCapture({ ...capture, fields: [1, 2, 3].map((n) => box(`#otp_box > input:nth-of-type(${n})`)) }));
    const clash = renderCaptureFixture(inspect.sanitizeCapture({ ...capture, fields: [box("#application > input:nth-of-type(1)")] }));
    check(
      "Stand-in renderer rebuilds the id container of positional boxes (never one that would duplicate a form or field id)",
      /<div id="otp_box" hidden>\n<input type="text">\n<input type="text">\n<input type="text">\n<\/div>/.test(boxes) && (clash.match(/id="application"/g) || []).length === 1,
      boxes.slice(boxes.indexOf("<fieldset"), boxes.indexOf("</fieldset>"))
    );
  }
  let threw = false;
  try {
    renderCaptureFixture({ kind: "cookies" });
  } catch {
    threw = true;
  }
  check("Stand-in renderer refuses anything that is not a capture", threw);
}
check(
  "A portal adapter file exists only together with its captures and capture set",
  Object.keys(EXPECTED).every((id) => loadAdapterSpec(id) === null || (readCaptures(id).length > 0 && readCaptureSet(id) !== null)),
  Object.keys(EXPECTED).filter((id) => loadAdapterSpec(id) !== null).join(", ") || "no adapter files"
);
{
  const local = localAdapter({ id: "army-agniveer", portalId: "army", origins: ["https://joinindianarmy.nic.in"], forms: good.forms }, "http://127.0.0.1:4000");
  check(
    "Local stand-in copy of a production adapter is test-only, loopback-bound and passes engine validation",
    local.testOnly === true && !("portalId" in local) && JSON.stringify(local.origins) === JSON.stringify(["http://127.0.0.1:4000"]) && loadEngine().adapters.validate(local).length === 0,
    JSON.stringify(loadEngine().adapters.validate(local))
  );
}
check("Template rejects a loopback capture unless test origins are allowed", checkCapture(capture, inspect).includes("capture origin is not https") && checkCapture(capture, inspect, { allowTestOrigins: true }).length === 0);
check("Template rejects an empty capture list", JSON.stringify(run(good, [])) === JSON.stringify(["no captures supplied"]));
check("Template rejects a production adapter whose registry entry is unverified", run({ ...good, testOnly: undefined, portal: undefined, portalId: "army", origins: ["https://joinindianarmy.nic.in"] }).some((m) => /not verified_supported/.test(m)));

out("\n=== Multi-step and dynamic-field template self-test ===\n");
{
  const { set, captures } = syntheticCaptureSet(inspect);
  const runSet = (a, s = set, caps = captures) => checkAdapterAgainstCaptureSet(a, s, caps, { engine: loadEngine(), inspect, allowTestOrigins: true, scaffoldId: "synthetic" });
  const setOnly = (s, caps = captures) => checkCaptureSet(s, caps, inspect, { scaffoldId: "synthetic" });
  const has = (problems, re) => problems.some((m) => re.test(m));
  const edit = (file, fn) => captures.map((c) => (c.file === file ? { ...c, capture: inspect.sanitizeCapture(fn(plain(c.capture))) } : c));
  const withStates = (stepId, entries) => ({ ...set, steps: set.steps.map((s) => (s.id === stepId ? { ...s, captures: entries } : s)) });

  check("Steps: the synthetic two-step capture set is valid", setOnly(set).length === 0, setOnly(set).join("; "));
  const goodSteps = runSet(syntheticStepAdapter());
  check("Steps: a correct two-step adapter has no problems", goodSteps.length === 0, goodSteps.join("; "));
  const info = analyseCaptureSet(set, captures);
  check(
    "Steps: analysis finds the conditional field, the dependent list and the protected fields",
    info[0].conditional.some((s) => s.includes("#later")) && info[0].dependentSelects.some((s) => s.includes("#district")) && info[0].protected.length === 2 && info[1].conditional.length === 0,
    JSON.stringify(info)
  );

  const setBad = [
    ["capture file not listed", { ...set, steps: [set.steps[0]] }, captures, /03-education\.json is not listed/],
    ["capture listed twice", withStates("education", [{ file: "03-education.json", state: "as loaded" }, { file: "01-personal.json", state: "again" }]), captures, /01-personal\.json is listed more than once/],
    ["unknown capture file", withStates("education", [{ file: "99-missing.json", state: "as loaded" }]), captures, /99-missing\.json is not a capture file/],
    ["step without captures", withStates("education", []), captures, /step education: lists no captures/],
    ["duplicate state", withStates("personal", [{ file: "01-personal.json", state: "as loaded" }, { file: "02-personal-revealed.json", state: "as loaded" }]), captures, /listed twice/],
    ["applicant-like state text", withStates("education", [{ file: "03-education.json", state: "logged in as candidate 9876543210" }]), captures, /looks like applicant data/],
    ["unexpected key (for example a typed value)", withStates("education", [{ file: "03-education.json", state: "as loaded", value: "x" }]), captures, /unexpected key value/],
    ["wrong portal", { ...set, scaffoldId: "army-agniveer" }, captures, /not synthetic/],
    ["duplicate step id", { ...set, steps: [set.steps[0], { ...set.steps[1], id: "personal" }] }, captures, /bad or duplicate id/],
    ["states from different origins", set, edit("02-personal-revealed.json", (c) => ({ ...c, origin: "http://127.0.0.1:8766" })), /different origins/],
    ["form inside a frame", set, edit("03-education.json", (c) => ({ ...c, fields: [], counts: { ...c.counts, fields: 0, frames: 1 } })), /inside a frame/],
  ];
  for (const [what, s, caps, re] of setBad) check(`Steps rejects: ${what}`, has(setOnly(s, caps), re), setOnly(s, caps).join("; ") || "(no problems reported)");
  check("Steps rejects: a missing capture set", has(runSet(syntheticStepAdapter(), null), /missing or is not a capture set/));

  const agree = { ...captures[0].capture.fields[0], type: "checkbox", id: "agree", selector: "#agree", label: "I hereby declare that the above information is correct" };
  const withAgree = captures.map((c) => (c.file.includes("personal") ? { ...c, capture: inspect.sanitizeCapture({ ...c.capture, fields: [...c.capture.fields, agree] }) } : c));
  const oneState = withStates("personal", [{ file: "01-personal.json", state: "as loaded" }]);
  const firstOnly = captures.filter((c) => c.file !== "02-personal-revealed.json");
  const adapterBad = [
    ["ambiguous steps (education form claims the personal pages)", syntheticStepAdapter({ education: { match: { pathPrefix: "/apply" } }, order: ["education", "personal"] }), set, captures, /step personal \("as loaded"\): the engine would use form education/],
    ["ambiguous steps (personal form claims the education page)", syntheticStepAdapter({ personal: { match: { pathPrefix: "/apply" } } }), set, captures, /step education \("as loaded"\): the engine would use form personal/],
    ["form that matches no state of its step", syntheticStepAdapter({ education: { match: { pathPrefix: "/apply", titleIncludes: "Education" } } }), set, captures, /form education does not match this state/],
    ["adapter form that is not a captured step", syntheticStepAdapter({ education: { id: "qualifications" } }), set, captures, /form qualifications: no captured step/],
    ["mapping a field from another step", syntheticStepAdapter({ personal: { fields: [{ selector: "#board10", key: "education.tenth.board" }] } }), set, captures, /#board10 → education\.tenth\.board: selector not in any capture/],
    ["conditional field whose revealing state was not captured", syntheticStepAdapter(), oneState, firstOnly, /#later → personal\.fatherName: never visible/],
    ["dependent list never populated", syntheticStepAdapter(), oneState, firstOnly, /#district → permanentAddress\.district: options never populated/],
    [
      "selector that changes between states",
      syntheticStepAdapter(),
      set,
      edit("02-personal-revealed.json", (c) => ({ ...c, fields: c.fields.map((f) => (f.selector === "#mobile" ? { ...f, id: "mobile_v2", selector: "#mobile_v2" } : f)) })),
      /#mobile → contact\.mobile: selector changes between captures/,
    ],
    [
      "selector that is a different field in another state",
      syntheticStepAdapter(),
      set,
      edit("02-personal-revealed.json", (c) => ({ ...c, fields: c.fields.map((f) => (f.selector === "#district" ? { ...f, label: "Tehsil" } : f)) })),
      /#district → permanentAddress\.district: the same selector is a different field/,
    ],
    [
      "declaration checkbox",
      syntheticStepAdapter({ personal: { fields: [{ selector: "#agree", key: "derived.correspondenceSameAsPermanent" }] } }),
      set,
      withAgree,
      /#agree → derived\.correspondenceSameAsPermanent: the engine treats this field as declaration/,
    ],
    ["final-submission button (buttons are never captured as fields)", syntheticStepAdapter({ education: { fields: [{ selector: "#next", key: "education.tenth.board" }] } }), set, captures, /#next → education\.tenth\.board: selector not in any capture/],
    ["CAPTCHA of its step left unprotected", syntheticStepAdapter({ personal: { protectedSelectors: [] } }), set, captures, /form personal: captcha field #captcha must be listed/],
  ];
  for (const [what, a, s, caps, re] of adapterBad) check(`Steps rejects: ${what}`, has(runSet(a, s, caps), re), runSet(a, s, caps).join("; ") || "(no problems reported)");
  check("Steps: the education form is not blamed for the personal step's CAPTCHA", !has(goodSteps, /form education: captcha/));
}

out(`\n=== Results: ${passed} passed, ${failed} failed, ${pending.length} pending (${pending.join(", ") || "none"}) ===\n`);
process.exit(failed ? 1 : 0);

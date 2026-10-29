/**
 * Adapter-versus-capture check, shared by every portal adapter test.
 *
 * A capture is the sanitised JSON the local inspector exports (extension/inspect). Put the
 * captures for a portal in extension/tests/fixtures/adapters/<scaffold-id>/*.json, one per page
 * or page state, plus a capture-set.json that says which application step and state each file
 * shows (see checkCaptureSet). An adapter may only reference selectors that a capture of its own
 * step actually recorded. A portal adapter, once written, lives in
 * extension/adapters/<scaffold-id>.js as a classic script that calls
 * globalThis.MCEngine.adapters.register({...}); its form ids are the capture-set step ids.
 *
 *   import { loadEngine, loadInspector, checkAdapterAgainstCaptureSet } from "./adapter-fixture-template.mjs";
 *   const problems = checkAdapterAgainstCaptureSet(adapter, set, captures, { engine: loadEngine(), inspect: loadInspector() });
 *
 * The real-browser half (stand-in pages rendered from the captures, engine preview and fill on
 * them) is extension/tests/adapter-fixture-smoke.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

export const extRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(extRoot, p), "utf8");

/** Fresh engine realm (core, registry, adapters, classify) so test registrations never leak between tests. */
export function loadEngine() {
  const ctx = vm.createContext({ URL });
  for (const f of ["core", "registry", "adapters", "classify"]) vm.runInContext(read(`src/engine/${f}.js`), ctx, { filename: `${f}.js` });
  return ctx.MCEngine;
}

export function loadInspector() {
  const ctx = vm.createContext({ URL, Date });
  for (const f of ["origins", "capture"]) vm.runInContext(read(`inspect/${f}.js`), ctx, { filename: `${f}.js` });
  return ctx.MCInspect;
}

export function loadScaffolds() {
  const ctx = vm.createContext({});
  const dir = path.join(extRoot, "adapters", "scaffolds");
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".js")).sort()) vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx, { filename: f });
  return ctx.MCAdapterScaffolds || {};
}

/** The adapter spec registered by extension/adapters/<scaffoldId>.js, or null if not written yet. */
export function loadAdapterSpec(scaffoldId) {
  const file = path.join(extRoot, "adapters", `${scaffoldId}.js`);
  if (!fs.existsSync(file)) return null;
  const specs = [];
  const ctx = vm.createContext({ MCEngine: { adapters: { register: (spec) => specs.push(spec) } } });
  ctx.globalThis = ctx;
  vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: `${scaffoldId}.js` });
  if (specs.length !== 1) throw new Error(`${scaffoldId}.js must register exactly one adapter`);
  return JSON.parse(JSON.stringify(specs[0]));
}

/** A capture moved to a local loopback origin, for serving its stand-in page. */
export const localCapture = (capture, origin) => ({ ...capture, origin });

/** A test-only copy of an adapter bound to a local loopback origin. */
export function localAdapter(spec, origin) {
  const { portalId, ...rest } = spec;
  return { ...rest, id: `${spec.id}-local`.slice(0, 40), testOnly: true, portal: spec.portal || { id: portalId || spec.id, name: `${portalId || spec.id} (local stand-in)` }, origins: [origin] };
}

export const CAPTURE_SET_FILE = "capture-set.json";
const fixtureDir = (scaffoldId) => path.join(extRoot, "tests", "fixtures", "adapters", scaffoldId);

/** Capture files for one portal, or [] when none has been supplied yet. */
export function readCaptures(scaffoldId) {
  const dir = fixtureDir(scaffoldId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".json") && n !== CAPTURE_SET_FILE)
    .sort()
    .map((n) => ({ file: n, capture: JSON.parse(fs.readFileSync(path.join(dir, n), "utf8")) }));
}

/** The portal's capture-set.json, or null when none has been supplied yet. */
export function readCaptureSet(scaffoldId) {
  const file = path.join(fixtureDir(scaffoldId), CAPTURE_SET_FILE);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

const KIND_OF = { "radio-group": "radio", "select-multiple": "select", "datetime-local": "date" };
const ALWAYS_PROTECTED = new Set(["captcha", "otp", "password", "payment"]);

/** Problems with one capture file on its own. */
export function checkCapture(capture, inspect, { allowTestOrigins = false } = {}) {
  const p = [];
  if (!capture || capture.kind !== "form-structure") return ["not an inspector form-structure capture"];
  if (capture.version !== inspect.CAPTURE_VERSION) p.push(`capture version ${capture.version}, expected ${inspect.CAPTURE_VERSION}`);
  if (JSON.stringify(inspect.sanitizeCapture(capture)) !== JSON.stringify(capture)) p.push("capture is not exactly the inspector's sanitised export (edited or extra keys)");
  if (inspect.looksLikeApplicantValue(JSON.stringify(capture))) p.push("capture contains text that looks like applicant data");
  if (capture.settled !== true) p.push("capture was taken before the page settled");
  if (capture.counts?.shadowRootsWithFields > 0) p.push(`page has ${capture.counts.shadowRootsWithFields} shadow DOM component(s) with fields the capture cannot see`);
  const loopback = allowTestOrigins && /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(capture.origin);
  if (!/^https:\/\//.test(capture.origin) && !loopback) p.push("capture origin is not https");
  return p;
}

/**
 * Every problem that stops `adapter` from being trusted against `captures`.
 * @param {object} adapter declarative adapter (see src/engine/adapters.js)
 * @param {object[]} captures sanitised inspector captures, one per page or page state
 * @param {{ engine: object, inspect: object, allowTestOrigins?: boolean }} env
 */
export function checkAdapterAgainstCaptures(adapter, captures, { engine, inspect, allowTestOrigins = false, pagesFor = null }) {
  const p = [];
  if (!Array.isArray(captures) || !captures.length) return ["no captures supplied"];
  captures.forEach((c, i) => checkCapture(c, inspect, { allowTestOrigins }).forEach((m) => p.push(`capture ${i}: ${m}`)));

  for (const m of engine.adapters.validate(adapter)) p.push(`engine: ${m}`);
  const { FIELDS } = engine.core;

  for (const form of adapter.forms || []) {
    const pages = (pagesFor ? pagesFor(form) : captures).filter((c) => (adapter.origins || []).includes(c.origin) && String(c.path).startsWith(form.match?.pathPrefix ?? "\u0000"));
    if (!pages.length) {
      p.push(`form ${form.id}: no capture from an adapter origin under ${form.match?.pathPrefix}`);
      continue;
    }
    if (form.match?.selector && !pages.some((c) => c.forms.some((f) => f.selector === form.match.selector))) p.push(`form ${form.id}: match.selector ${form.match.selector} is not a captured form`);
    if (form.match?.titleIncludes && !pages.some((c) => c.title.includes(form.match.titleIncludes))) p.push(`form ${form.id}: no captured title includes "${form.match.titleIncludes}"`);

    const seen = (selector) => pages.flatMap((c) => c.fields.filter((f) => f.selector === selector || f.choices?.some((x) => x.selector === selector)));
    for (const m of form.fields || []) {
      const where = `form ${form.id}: ${m.selector} → ${m.key}`;
      const hits = seen(m.selector);
      if (!hits.length) {
        p.push(`${where}: selector not in any capture`);
        continue;
      }
      if (hits.some((f) => f.filtered)) p.push(`${where}: captured as ${hits.find((f) => f.filtered).filtered}, which is never filled`);
      if (!hits.some((f) => f.visible)) p.push(`${where}: never visible in a capture (capture the page state that shows it)`);
      if (hits.every((f) => f.disabled || f.readOnly)) p.push(`${where}: disabled or read-only in every capture`);
      if (hits.every((f) => f.selectorKind === "path" && f.selector === m.selector)) p.push(`${where}: positional selector; it breaks when the page layout changes`);
      else if (!hits.some((f) => f.selectorStable)) p.push(`${where}: selector looks generated and may change between sessions`);
      const spec = FIELDS[m.key];
      if (spec) {
        const kind = KIND_OF[hits[0].type] || hits[0].type;
        if (!spec.kinds.includes(kind)) p.push(`${where}: field kind ${kind} does not suit ${m.key} (${spec.kinds.join(", ")})`);
        if (spec.format === "date" && kind !== "date" && !m.dateFormat) p.push(`${where}: text date needs an explicit dateFormat`);
      }
      const prot = engine.classify.protection(descriptorOf(hits[0], engine));
      if (prot) p.push(`${where}: the engine treats this field as ${prot.reason}; it always stays with the applicant`);
      p.push(...dynamicProblems(where, m.selector, pages));
    }

    const protectedSel = new Set(form.protectedSelectors || []);
    const capturedSelectors = pages.flatMap((c) => c.fields.flatMap(selectorsOf));
    for (const s of protectedSel) {
      // "#box input" covers positional captures such as "#box > input:nth-of-type(2)".
      const within = /^(#[\w-]+) ([a-z]+)$/.exec(s);
      const covered = capturedSelectors.includes(s) || (within && capturedSelectors.some((c) => c.startsWith(`${within[1]} > ${within[2]}`)));
      if (!covered) p.push(`form ${form.id}: protected selector ${s} matches no captured field, so it protects nothing`);
    }
    for (const c of pages)
      for (const f of c.fields)
        if (ALWAYS_PROTECTED.has(f.filtered) && f.selector && !protectedSel.has(f.selector)) p.push(`form ${form.id}: ${f.filtered} field ${f.selector} must be listed in protectedSelectors`);
  }
  return [...new Set(p)];
}

const selectorsOf = (f) => [f.selector, ...(f.choices || []).map((c) => c.selector)].filter(Boolean);
// What identifies a field across page states when its selector is not trusted.
const logicalKey = (f) => [f.form, f.type, f.name, f.label, f.section].join("|");
const PLACEHOLDER_OPTION = (o) => o.value === "" || /^(-1|0)$/.test(o.value) || /^\W*(select|choose|please select)\b/i.test(o.text);

/** Whether the field behind `selector` could take a value in the page state a capture recorded. */
export function isFillableIn(capture, selector) {
  const f = capture.fields.find((x) => selectorsOf(x).includes(selector));
  if (!f || !f.visible || f.disabled || f.readOnly) return false;
  return f.tag !== "select" || (f.options || []).some((o) => !PLACEHOLDER_OPTION(o));
}

/** The engine's own descriptor shape for a captured field, so its protection rules apply unchanged. */
function descriptorOf(f, engine) {
  const d = {
    tag: f.tag,
    type: f.type === "radio-group" ? "radio" : f.type,
    multiple: f.type === "select-multiple",
    label: f.label,
    accessibleName: "",
    placeholder: f.placeholder || "",
    title: "",
    name: f.name,
    domId: f.id,
    autocomplete: f.autoComplete || "",
    section: f.section,
  };
  return { ...d, kind: engine.classify.controlKind(d) };
}

/** Problems with one mapped selector across the page states of its form (dynamic and conditional fields). */
function dynamicProblems(where, selector, pages) {
  const p = [];
  const hits = pages.flatMap((c) => c.fields.filter((f) => selectorsOf(f).includes(selector)).map((f) => ({ f, c })));
  if (!hits.length) return p;
  const labels = new Set(hits.map(({ f }) => logicalKey(f)));
  if (labels.size > 1) p.push(`${where}: the same selector is a different field in different captures (${[...new Set(hits.map(({ f }) => f.label || f.name))].join(" / ")})`);
  const key = logicalKey(hits[0].f);
  for (const c of pages) {
    if (c.fields.some((f) => selectorsOf(f).includes(selector))) continue;
    const moved = c.fields.find((f) => f.selector && f.selectorKind !== "path" && logicalKey(f) === key);
    if (moved) p.push(`${where}: selector changes between captures (${c.path} "${c.title}" has ${moved.selector})`);
  }
  const selects = hits.filter(({ f }) => f.tag === "select" && !f.optionsOmitted);
  if (selects.length && selects.every(({ f }) => !(f.options || []).some((o) => !PLACEHOLDER_OPTION(o)))) {
    p.push(`${where}: options never populated in a capture; capture the state after the field it depends on is chosen`);
  }
  return p;
}

// ── Capture sets: application steps and page states ──────────────
//
// extension/tests/fixtures/adapters/<scaffold-id>/capture-set.json, written by whoever took the
// captures. Free text is short, describes the page state only, and is checked for applicant data.
// {
//   "kind": "capture-set", "version": 1, "scaffoldId": "army-agniveer",
//   "steps": [
//     { "id": "personal", "name": "Personal details", "captures": [
//       { "file": "01-personal.json", "state": "as loaded" },
//       { "file": "02-personal-revealed.json", "state": "after answering the question that shows more fields" } ] },
//     { "id": "education", "name": "Education", "captures": [{ "file": "03-education.json", "state": "as loaded" }] }
//   ]
// }
// A portal whose scaffold names a gate (a step only the applicant performs, such as Aadhaar
// validation or GST Proceed) also marks every entry "gate": "before" or "gate": "after".
export const CAPTURE_SET_VERSION = 1;
const STEP_ID = /^[a-z0-9-]{2,40}$/;
export const GATE_STATES = Object.freeze(["before", "after"]);

/**
 * Problems with a capture set on its own: shape, free text, and that every capture file is listed
 * exactly once, every step has captures from one origin, and no step hides its form in a frame.
 * @param {object} set parsed capture-set.json
 * @param {{ file: string, capture: object }[]} captures from readCaptures()
 */
export function checkCaptureSet(set, captures, inspect, { scaffoldId = null } = {}) {
  const p = [];
  if (!set || typeof set !== "object" || set.kind !== "capture-set") return ["capture-set.json is missing or is not a capture set"];
  const extra = (obj, keys, where) => Object.keys(obj || {}).filter((k) => !keys.includes(k)).forEach((k) => p.push(`${where}: unexpected key ${k}`));
  const text = (v, max, where) => {
    if (typeof v !== "string" || !v.trim() || v.length > max) p.push(`${where}: must be text of 1-${max} characters`);
    else if (inspect.looksLikeApplicantValue(v)) p.push(`${where}: looks like applicant data`);
  };
  extra(set, ["kind", "version", "scaffoldId", "steps"], "capture set");
  if (set.version !== CAPTURE_SET_VERSION) p.push(`capture set version ${set.version}, expected ${CAPTURE_SET_VERSION}`);
  if (scaffoldId && set.scaffoldId !== scaffoldId) p.push(`capture set is for ${set.scaffoldId}, not ${scaffoldId}`);
  if (!Array.isArray(set.steps) || !set.steps.length) return [...p, "capture set has no steps"];

  const byFile = new Map(captures.map((c) => [c.file, c.capture]));
  const listed = new Map();
  const ids = new Set();
  set.steps.forEach((s, i) => {
    const where = `step ${s?.id ?? i}`;
    if (!s || typeof s !== "object") return p.push(`step ${i}: not an object`);
    extra(s, ["id", "name", "captures"], where);
    if (!STEP_ID.test(s.id || "") || ids.has(s.id)) p.push(`${where}: bad or duplicate id`);
    ids.add(s.id);
    text(s.name, 80, `${where} name`);
    if (!Array.isArray(s.captures) || !s.captures.length) return p.push(`${where}: lists no captures`);
    const states = new Set();
    const origins = new Set();
    const caps = [];
    for (const e of s.captures) {
      extra(e, ["file", "state", "gate"], `${where} entry`);
      text(e?.state, 120, `${where} state`);
      if (e && "gate" in e && !GATE_STATES.includes(e.gate)) p.push(`${where} entry: gate must be "before" or "after"`);
      if (states.has(e?.state)) p.push(`${where}: state "${e.state}" listed twice`);
      states.add(e?.state);
      listed.set(e?.file, (listed.get(e?.file) || 0) + 1);
      const c = byFile.get(e?.file);
      if (!c) p.push(`${where}: ${e?.file} is not a capture file in this folder`);
      else {
        origins.add(c.origin);
        caps.push(c);
      }
    }
    if (origins.size > 1) p.push(`${where}: captures come from different origins (${[...origins].join(", ")})`);
    if (caps.length && caps.every((c) => !c.fields.some((f) => f.visible && !f.filtered)) && caps.some((c) => c.counts?.frames > 0)) {
      p.push(`${where}: no visible fillable field, but the page has frames; the form may be inside a frame the inspector cannot read`);
    }
  });
  for (const [file, n] of listed) if (n > 1) p.push(`${file} is listed more than once`);
  for (const file of byFile.keys()) if (!listed.has(file)) p.push(`${file} is not listed in ${CAPTURE_SET_FILE}`);
  return [...new Set(p)];
}

/** Whether the engine's matchForm would pick `form` on the page a capture recorded. */
function formMatchesCapture(form, capture, origins) {
  const m = form.match || {};
  if (!origins.includes(capture.origin) || !String(capture.path).startsWith(m.pathPrefix ?? "\u0000")) return false;
  if (m.titleIncludes && !capture.title.includes(m.titleIncludes)) return false;
  if (m.selector && !capture.forms.some((f) => f.selector === m.selector) && !capture.fields.some((f) => selectorsOf(f).includes(m.selector))) return false;
  return true;
}

/**
 * Per step: fields that appear or disappear between states and dropdowns whose options change.
 * Informational; checkAdapterAgainstCaptureSet turns the parts that matter for a mapping into problems.
 */
export function analyseCaptureSet(set, captures) {
  const byFile = new Map(captures.map((c) => [c.file, c.capture]));
  return (set?.steps || []).map((s) => {
    const states = (s.captures || []).map((e) => byFile.get(e.file)).filter(Boolean);
    const seen = new Map();
    for (const c of states) {
      for (const f of c.fields) {
        if (!f.selector) continue;
        const r = seen.get(f.selector) || { label: f.label || f.name, visible: 0, optionCounts: new Set(), filtered: f.filtered };
        if (f.visible) r.visible += 1;
        if (f.tag === "select") r.optionCounts.add(f.optionCount ?? 0);
        seen.set(f.selector, r);
      }
    }
    const rows = [...seen.entries()];
    return {
      id: s.id,
      name: s.name,
      states: states.length,
      fields: rows.length,
      conditional: rows.filter(([, r]) => r.visible > 0 && r.visible < states.length).map(([sel, r]) => `${r.label} (${sel})`),
      neverVisible: rows.filter(([, r]) => r.visible === 0).map(([sel, r]) => `${r.label} (${sel})`),
      dependentSelects: rows.filter(([, r]) => r.optionCounts.size > 1).map(([sel, r]) => `${r.label} (${sel})`),
      protected: rows.filter(([, r]) => r.filtered).map(([sel, r]) => `${r.label || "(unlabelled)"} (${sel}, ${r.filtered})`),
    };
  });
}

/**
 * Everything checkAdapterAgainstCaptures reports, but with each adapter form checked only against
 * the captures of its own step (form.id === step.id), plus: every captured state of a step is matched
 * by that step's form and by no other form, and every adapter form corresponds to a captured step.
 */
export function checkAdapterAgainstCaptureSet(adapter, set, captures, { engine, inspect, allowTestOrigins = false, scaffoldId = null }) {
  const p = checkCaptureSet(set, captures, inspect, { scaffoldId });
  if (!captures.length) return [...p, "no captures supplied"];
  const byFile = new Map(captures.map((c) => [c.file, c.capture]));
  const steps = Array.isArray(set?.steps) ? set.steps.filter((s) => s && Array.isArray(s.captures)) : [];
  const stepCaptures = (id) => (steps.find((s) => s.id === id)?.captures || []).map((e) => ({ ...e, capture: byFile.get(e.file) })).filter((e) => e.capture);
  p.push(
    ...checkAdapterAgainstCaptures(
      adapter,
      captures.map((c) => c.capture),
      { engine, inspect, allowTestOrigins, pagesFor: (form) => stepCaptures(form.id).map((e) => e.capture) }
    )
  );
  const forms = adapter.forms || [];
  for (const f of forms) if (!steps.some((s) => s.id === f.id)) p.push(`form ${f.id}: no captured step with this id (adapter form ids are capture-set step ids)`);
  for (const s of steps) {
    const own = forms.find((f) => f.id === s.id) || null;
    for (const e of stepCaptures(s.id)) {
      const first = forms.find((f) => formMatchesCapture(f, e.capture, adapter.origins || [])) || null;
      if (own && first !== own) {
        p.push(
          first
            ? `step ${s.id} ("${e.state}"): the engine would use form ${first.id} here; give the forms a match.selector or titleIncludes that tells the steps apart`
            : `step ${s.id} ("${e.state}"): form ${own.id} does not match this state of its own step`
        );
      } else if (!own && first) p.push(`step ${s.id} ("${e.state}"): matched by form ${first.id}, which belongs to another step`);
    }
  }
  return [...new Set(p)];
}

// ── Gate readiness: is each mapping still the same field after the applicant's own step? ──
export const UNVERIFIED_PROBLEM = "engine: registry entry is not verified_supported for this adapter";
const GATE_SAME = ["tag", "type", "id", "name", "label", "section", "filtered"];
const GATE_SAME_VALIDATION = ["maxLength", "pattern", "inputMode"];
const fieldIn = (capture, selector) => capture.fields.find((f) => selectorsOf(f).includes(selector)) || null;

function gateDifferences(ref, refCapture, f, capture) {
  const d = GATE_SAME.filter((k) => (ref[k] ?? null) !== (f[k] ?? null));
  for (const k of GATE_SAME_VALIDATION) if ((ref.validation?.[k] ?? null) !== (f.validation?.[k] ?? null)) d.push(`validation.${k}`);
  const formOf = (x, c) => (x.form === null ? null : (c.forms[x.form]?.selector ?? null));
  if (formOf(ref, refCapture) !== formOf(f, capture)) d.push("form");
  return d;
}

/**
 * For every mapping, what each capture taken after the gate shows: "same_editable", "locked",
 * "hidden", "absent", "not_matched" (the adapter does not recognise that page, so nothing is filled
 * there) or "changed" (the selector now names a different field). Verdict "awaiting_capture" until
 * an after-gate capture exists, "blocked" on any problem or change, otherwise "consistent".
 * "consistent" is structural evidence only; the supervised real-page fill is a separate check.
 */
export function checkGateReadiness(adapter, set, captures, env) {
  const problems = checkAdapterAgainstCaptureSet(adapter, set, captures, env).filter((m) => m !== UNVERIFIED_PROBLEM);
  const byFile = new Map(captures.map((c) => [c.file, c.capture]));
  const entries = (Array.isArray(set?.steps) ? set.steps : []).flatMap((s) => (Array.isArray(s?.captures) ? s.captures : []).map((e) => ({ ...e, step: s.id, capture: byFile.get(e?.file) }))).filter((e) => e.capture);
  for (const e of entries) if (!GATE_STATES.includes(e.gate)) problems.push(`step ${e.step} ("${e.state}"): mark the entry "gate": "before" or "gate": "after"`);
  const after = entries.filter((e) => e.gate === "after");
  const fields = [];
  for (const form of adapter.forms || []) {
    const before = entries.filter((e) => e.step === form.id && e.gate === "before");
    for (const m of form.fields || []) {
      const refEntry = before.find((e) => fieldIn(e.capture, m.selector)?.visible);
      const ref = refEntry ? fieldIn(refEntry.capture, m.selector) : null;
      if (!ref) problems.push(`form ${form.id}: ${m.selector} → ${m.key} is not visible in any capture taken before the gate`);
      const results = after.map((e) => {
        const at = { step: e.step, state: e.state };
        if (!formMatchesCapture(form, e.capture, adapter.origins || [])) return { ...at, outcome: "not_matched" };
        const f = fieldIn(e.capture, m.selector);
        if (!f) return { ...at, outcome: "absent" };
        const changed = ref ? gateDifferences(ref, refEntry.capture, f, e.capture) : [];
        if (changed.length) return { ...at, outcome: "changed", changed };
        if (!f.visible) return { ...at, outcome: "hidden" };
        if (f.disabled || f.readOnly) return { ...at, outcome: "locked" };
        return { ...at, outcome: "same_editable" };
      });
      for (const r of results) if (r.outcome === "changed") problems.push(`form ${form.id}: ${m.selector} → ${m.key} is a different field after the gate ("${r.state}": ${r.changed.join(", ")} changed)`);
      fields.push({ form: form.id, selector: m.selector, key: m.key, results, editableAfterGate: results.length > 0 && results.every((r) => r.outcome === "same_editable") });
    }
  }
  const unique = [...new Set(problems)];
  return { verdict: unique.length ? "blocked" : after.length ? "consistent" : "awaiting_capture", afterGateStates: after.length, fields, problems: unique };
}

// ── Supervised verification: trial eligibility, trial records, production readiness ──
//
// A registry entry may move to supervised_verification_only only when checkTrialEligibility says
// "eligible". The supervised trial (popup → content script) produces a record that the applicant
// downloads into extension/tests/fixtures/adapters/<scaffold-id>/trials/. realPageFillVerified may be
// set only when a passing record for the current adapter version exists, and verified_supported only
// when checkProductionReadiness says ready. None of these checks changes the registry.

/** The facts a registry supervisedTrial records for one captured field. */
export const trialFactsOf = (f, key) => ({
  selector: f.selector, key, tag: f.tag, type: f.tag === "input" ? f.type : null, maxLength: f.validation?.maxLength ?? 0, label: f.label,
});

/**
 * Verdict "awaiting_capture" until an after-gate capture exists, "blocked" on any problem, else "eligible":
 * the gate check is consistent, every mapped field is the same and editable in every after-gate state,
 * and the registry trial declares exactly the adapter's mappings with the captured facts.
 */
export function checkTrialEligibility(adapter, entry, set, captures, env) {
  const gate = checkGateReadiness(adapter, set, captures, env);
  const problems = [...gate.problems];
  const t = entry?.supervisedTrial || null;
  const R = env.engine.registry;
  if (!t) problems.push(`${entry?.id ?? "portal"}: no supervisedTrial in the registry entry`);
  else {
    for (const m of R.validateTrial(t)) problems.push(`supervisedTrial: ${m}`);
    if (!R.trialMatches(t, adapter)) problems.push(`supervisedTrial does not match adapter ${adapter.id} ${adapter.version} (version, single form, mappings, genericFields false)`);
    const byFile = new Map(captures.map((c) => [c.file, c.capture]));
    const states = (set?.steps || []).flatMap((s) => (s.captures || []).filter((e) => s.id === t.form && byFile.has(e.file)).map((e) => ({ ...e, capture: byFile.get(e.file) })));
    for (const f of t.fields || []) {
      for (const e of states) {
        const c = fieldIn(e.capture, f.selector);
        if (!c) continue;
        const facts = trialFactsOf(c, f.key);
        const diff = Object.keys(facts).filter((k) => facts[k] !== f[k]);
        if (diff.length) problems.push(`supervisedTrial ${f.selector}: ${diff.join(", ")} differ from capture "${e.state}"`);
      }
    }
  }
  if (gate.verdict === "consistent") {
    for (const f of gate.fields) if (!f.editableAfterGate) problems.push(`${f.selector} → ${f.key} is not the same editable field in every state after the gate (${f.results.map((r) => r.outcome).join(", ")})`);
  }
  const unique = [...new Set(problems)];
  return { verdict: unique.length ? "blocked" : gate.verdict === "consistent" ? "eligible" : "awaiting_capture", gate, problems: unique };
}

export const TRIAL_RECORD_DIR = "trials";
const TRIAL_RECORD_KEYS = ["kind", "version", "adapterId", "adapterVersion", "origin", "form", "fields", "pageChanged", "result", "recordedAt"];
const TRIAL_RECORD_FIELD_KEYS = ["selector", "key", "editable", "approved", "filled"];

/** Supervised trial records for one portal, or [] when none has been supplied. */
export function readTrialRecords(scaffoldId) {
  const dir = path.join(fixtureDir(scaffoldId), TRIAL_RECORD_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .sort()
    .map((n) => ({ file: n, text: fs.readFileSync(path.join(dir, n), "utf8") }));
}

/** Problems with one trial record (the popup's download, unedited) for `adapter` and its trial declaration. */
export function checkTrialRecord(text, { adapter, trial, inspect }) {
  let r;
  try {
    r = JSON.parse(text);
  } catch {
    return ["not JSON"];
  }
  const p = [];
  if (!r || typeof r !== "object" || Array.isArray(r) || Object.keys(r).join() !== TRIAL_RECORD_KEYS.join()) return [`must hold exactly ${TRIAL_RECORD_KEYS.join(", ")}`];
  if (r.kind !== "supervised-trial" || r.version !== 1) p.push("not a version 1 supervised-trial record");
  if (inspect.looksLikeApplicantValue(text)) p.push("contains text that looks like applicant data");
  if (r.adapterId !== adapter.id) p.push(`adapter ${r.adapterId}, expected ${adapter.id}`);
  if (r.adapterVersion !== adapter.version) p.push(`adapter version ${r.adapterVersion}, expected ${adapter.version}`);
  if (!(adapter.origins || []).includes(r.origin)) p.push(`origin ${r.origin} is not an adapter origin`);
  if (!trial || r.form !== trial.form) p.push(`form ${r.form} is not the trial form`);
  const want = (trial?.fields || []).map((f) => `${f.selector}|${f.key}`);
  const fields = Array.isArray(r.fields) ? r.fields : [];
  if (fields.some((f) => !f || typeof f !== "object" || Object.keys(f).join() !== TRIAL_RECORD_FIELD_KEYS.join() || !["editable", "approved", "filled"].every((k) => typeof f[k] === "boolean"))) {
    p.push(`every field must hold exactly ${TRIAL_RECORD_FIELD_KEYS.join(", ")} with true/false results`);
  }
  if (JSON.stringify(fields.map((f) => `${f?.selector}|${f?.key}`)) !== JSON.stringify(want)) p.push("fields are not exactly the trial fields");
  if (fields.some((f) => f?.filled && !(f.approved && f.editable))) p.push("a field is filled without being approved and editable");
  if (typeof r.pageChanged !== "boolean") p.push("pageChanged must be true or false");
  const passed = r.pageChanged === false && fields.length > 0 && fields.every((f) => f?.editable && f.approved && f.filled);
  if (r.result !== (passed ? "pass" : "fail")) p.push(`result ${r.result} does not follow from the fields`);
  const at = Date.parse(r.recordedAt);
  if (typeof r.recordedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.recordedAt) || !Number.isFinite(at)) p.push("recordedAt must be an ISO timestamp");
  return p;
}

/**
 * Whether every piece of evidence a production decision needs is present. Reports only; enabling
 * normal filling (verified_supported, adapterId, manifest) stays a separate, explicit change.
 */
export function checkProductionReadiness({ adapter, entry, set, captures, records, env }) {
  const eligibility = checkTrialEligibility(adapter, entry, set, captures, env);
  const problems = eligibility.verdict === "eligible" ? [] : [`trial eligibility is ${eligibility.verdict}`];
  const trial = entry?.supervisedTrial || null;
  const checked = records.map((rec) => ({ ...rec, problems: checkTrialRecord(rec.text, { adapter, trial, inspect: env.inspect }) }));
  for (const rec of checked) for (const m of rec.problems) problems.push(`trial record ${rec.file}: ${m}`);
  const valid = checked.filter((rec) => !rec.problems.length).map((rec) => JSON.parse(rec.text)).sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  const latest = valid.at(-1) || null;
  if (!latest) problems.push("no valid supervised trial record");
  else if (latest.result !== "pass") problems.push(`the latest supervised trial (${latest.recordedAt}) failed`);
  const r = entry?.readiness;
  const R = env.engine.registry;
  const missing = R.READINESS.filter((k) => r?.[k] !== true);
  if (missing.length) problems.push(`readiness not recorded: ${missing.join(", ")}`);
  return { ready: problems.length === 0, eligibility: eligibility.verdict, passingRecord: latest?.result === "pass", problems: [...new Set(problems)] };
}

// ── Synthetic sample used by the template self-tests (Node and browser) ──
export const SYNTHETIC_ORIGIN = "http://127.0.0.1:8765";

const field = (selector, label, type, extra = {}) => ({
  form: 0, tag: type === "select" ? "select" : "input", type, id: selector.startsWith("#") ? selector.slice(1).replace(/\\/g, "") : "", name: "", selector, selectorStable: true,
  selectorKind: "id", label, labelSource: "label", section: "Personal Details", required: false, requiredSource: null, visible: true, disabled: false, readOnly: false, filtered: null,
  placeholder: "", autoComplete: "", ...extra,
});

export function syntheticCapture(inspect) {
  return inspect.sanitizeCapture({
    kind: "form-structure",
    capturedOn: "2026-10-27",
    origin: SYNTHETIC_ORIGIN,
    path: "/apply/personal",
    title: "Synthetic Application",
    settled: true,
    waitedMs: 600,
    forms: [{ index: 0, selector: "form#application", id: "application", name: "", method: "post", actionPath: "/apply/personal" }],
    fields: [
      field("#full_name", "Name of the Candidate", "text"),
      field("#dob_text", "Date of birth", "text"),
      field("#dob_native", "Date of birth (calendar)", "date"),
      {
        ...field("", "Gender", "radio-group"), name: "g", selector: 'input[type="radio"][name="g"]', selectorKind: "name", labelSource: "group",
        choices: [{ value: "M", label: "Male", selector: "#g_m", selectorStable: true }, { value: "F", label: "Female", selector: "#g_f", selectorStable: true }],
      },
      field("#mobile", "Mobile number", "tel"),
      field("#later", "Conditional", "text", { visible: false }),
      field("#locked", "Locked", "text", { disabled: true }),
      field("#\\:r1\\:", "Generated", "text", { selectorStable: false }),
      field("body > div:nth-of-type(2) > input", "Positional", "text", { selectorStable: false, selectorKind: "path" }),
      field("#aadhaar", "Aadhaar", "text", { filtered: "identity" }),
      field("#captcha", "Enter the text shown in below image", "text", { filtered: "captcha" }),
    ],
    buttons: [{ form: 0, type: "submit", label: "Save", selector: "#save" }],
    counts: { forms: 1, fields: 11 },
  });
}

export const SYNTHETIC_FIELDS = Object.freeze([
  { selector: "#full_name", key: "personal.fullName" },
  { selector: "#dob_text", key: "personal.dob", dateFormat: "DD/MM/YYYY" },
  { selector: "#g_m", key: "personal.gender" },
  { selector: "#mobile", key: "contact.mobile" },
]);

export const syntheticAdapter = (fields = SYNTHETIC_FIELDS, extra = {}) => ({
  id: "synthetic-adapter",
  testOnly: true,
  portal: { id: "synthetic", name: "Synthetic portal" },
  origins: [SYNTHETIC_ORIGIN],
  forms: [{ id: "personal", name: "Personal", match: { pathPrefix: "/apply", selector: "form#application" }, genericFields: false, protectedSelectors: ["#captcha"], fields: [...fields], ...extra }],
});

/**
 * Two-step synthetic application on one URL (as WebForms wizards do): the personal step in two
 * states (a conditional field revealed, a dependent district list populated) and an education step
 * told apart only by its form. Returns { set, captures } shaped like readCaptureSet / readCaptures.
 */
export function syntheticCaptureSet(inspect) {
  const base = syntheticCapture(inspect);
  const district = (options) => field("#district", "District", "select", { section: "Address", optionCount: options.length, options });
  const personal = (later, options) =>
    inspect.sanitizeCapture({
      ...base,
      fields: [...base.fields.map((f) => (f.selector === "#later" ? { ...f, visible: later } : f)), district(options)],
      counts: { ...base.counts, fields: base.fields.length + 1 },
    });
  const education = inspect.sanitizeCapture({
    ...base,
    forms: [{ index: 0, selector: "form#education", id: "education", name: "", method: "post", actionPath: "/apply/personal" }],
    fields: [field("#board10", "Board / University", "text", { section: "Class 10" }), field("#year10", "Year of passing", "text", { section: "Class 10" })],
    buttons: [{ form: 0, type: "submit", label: "Save and continue", selector: "#next" }],
    filteredByKind: {},
    counts: { forms: 1, fields: 2 },
  });
  const captures = [
    { file: "01-personal.json", capture: personal(false, [{ value: "", text: "Select" }]) },
    { file: "02-personal-revealed.json", capture: personal(true, [{ value: "", text: "Select" }, { value: "PUNE", text: "Pune" }, { value: "NGP", text: "Nagpur" }]) },
    { file: "03-education.json", capture: education },
  ];
  const set = {
    kind: "capture-set",
    version: CAPTURE_SET_VERSION,
    scaffoldId: "synthetic",
    steps: [
      { id: "personal", name: "Personal details", captures: [{ file: "01-personal.json", state: "as loaded" }, { file: "02-personal-revealed.json", state: "after choosing a state" }] },
      { id: "education", name: "Education", captures: [{ file: "03-education.json", state: "as loaded" }] },
    ],
  };
  return { set, captures };
}

export const syntheticStepAdapter = ({ personal = {}, education = {}, order = ["personal", "education"] } = {}) => {
  const forms = {
    personal: {
      id: "personal", name: "Personal", match: { pathPrefix: "/apply", selector: "form#application" }, genericFields: false, protectedSelectors: ["#captcha"],
      fields: [...SYNTHETIC_FIELDS, { selector: "#later", key: "personal.fatherName" }, { selector: "#district", key: "permanentAddress.district" }], ...personal,
    },
    education: {
      id: "education", name: "Education", match: { pathPrefix: "/apply", selector: "form#education" }, genericFields: false,
      fields: [{ selector: "#board10", key: "education.tenth.board" }, { selector: "#year10", key: "education.tenth.passingYear" }], ...education,
    },
  };
  return { ...syntheticAdapter(), forms: order.map((k) => forms[k]) };
};

// Portal adapter interface + registry.
// Adapters are declarative data (no functions), so a portal implementation can describe its
// forms and field mappings but can never change the engine's safety rules (no submit, no
// CAPTCHA/OTP/declaration/payment handling, approval before filling).
//
// Adapter shape:
// {
//   id: "army-agniveer",                    // [a-z0-9-]
//   version: "1.0.0",                       // required for production adapters
//   portalId: "army",                       // registry entry (verified_supported, or supervised_verification_only for a trial)
//   origins: ["https://example.gov.in"],    // exact https origins, subset of the registry entry
//   forms: [{
//     id: "registration", name: "Candidate registration",
//     match: { pathPrefix: "/register", selector: "form#reg", titleIncludes: "Registration" },
//     genericFields: true,                  // allow heuristic mapping for unlisted fields
//     fields: [{ selector: "#dob", key: "personal.dob", dateFormat: "DD/MM/YYYY" }],
//     protectedSelectors: ["#captchaText"], // always left to the user
//   }],
// }
// Test fixtures set testOnly: true with inline `portal` metadata and loopback origins; they
// are only ever loaded by the test build, never by the shipped manifest. A test fixture may carry
// its own `supervisedTrial` (registry shape) to stand in for a supervised_verification_only entry.
//
// Every registered adapter gets a `mode` decided here, never by the spec: "production" (normal
// filling), "supervised" (trial messages only, normal preview refused) or "test".
(function (root) {
  "use strict";
  const MC = root.MCEngine || (root.MCEngine = {});
  if (MC.adapters) return;
  const { FIELDS } = MC.core;
  const registry = MC.registry;

  const DATE_FORMATS = Object.freeze(["YYYY-MM-DD", "DD/MM/YYYY", "DD-MM-YYYY", "MM/DD/YYYY", "DD.MM.YYYY"]);
  const ORIGIN_RE = /^https:\/\/[a-z0-9.-]+$/;
  const TEST_ORIGIN_RE = /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/;
  const adapters = new Map();

  const isStr = (v, max = 200) => typeof v === "string" && v.length > 0 && v.length <= max;

  function deepFreeze(v) {
    if (v && typeof v === "object" && !Object.isFrozen(v)) {
      Object.freeze(v);
      for (const k of Object.keys(v)) deepFreeze(v[k]);
    }
    return v;
  }

  function hasFunctions(v) {
    if (typeof v === "function") return true;
    if (v && typeof v === "object") return Object.values(v).some(hasFunctions);
    return false;
  }

  function validate(a) {
    const p = [];
    if (!a || typeof a !== "object") return ["adapter must be an object"];
    if (hasFunctions(a)) p.push("adapters must be declarative (no functions)");
    if (!/^[a-z0-9-]{2,40}$/.test(a.id || "")) p.push("bad id");
    if (adapters.has(a.id)) p.push("duplicate adapter id");
    if (!Array.isArray(a.origins) || !a.origins.length) p.push("origins required");
    if ("mode" in a) p.push("the engine decides an adapter's mode");
    if (a.version !== undefined && !/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(a.version)) p.push("version must look like 1.0.0");

    if (a.testOnly === true) {
      if (!a.portal || !isStr(a.portal.id, 40) || !isStr(a.portal.name, 80)) p.push("test adapter needs portal metadata");
      if ((a.origins || []).some((o) => !TEST_ORIGIN_RE.test(o))) p.push("test adapters may only use loopback origins");
      if (a.supervisedTrial !== undefined && !registry.trialMatches(a.supervisedTrial, a)) p.push("test supervisedTrial does not match this adapter");
    } else {
      if (a.version === undefined) p.push("production adapters need a version");
      if ("supervisedTrial" in a) p.push("production adapters take the supervised trial from the registry");
      const entry = registry.byId(a.portalId);
      if (!entry) p.push("unknown portalId");
      else {
        if (!registry.fillMode(entry, a)) {
          p.push(
            entry.status === registry.STATUS.SUPERVISED && entry.adapterId === a.id
              ? "adapter does not match the supervised trial in the registry entry"
              : "registry entry is not verified_supported for this adapter"
          );
        }
        if ((a.origins || []).some((o) => !ORIGIN_RE.test(o) || !entry.origins.includes(o))) p.push("origins must be exact https origins listed in the registry entry");
      }
      if ("portal" in a) p.push("production adapters take metadata from the registry");
    }

    const formIds = new Set();
    if (!Array.isArray(a.forms) || !a.forms.length) p.push("forms required");
    for (const f of a.forms || []) {
      if (!/^[a-z0-9-]{2,40}$/.test(f.id || "") || formIds.has(f.id)) p.push(`form ${f.id}: bad or duplicate id`);
      formIds.add(f.id);
      if (!isStr(f.name, 80)) p.push(`form ${f.id}: name required`);
      if (!f.match || !isStr(f.match.pathPrefix) || !f.match.pathPrefix.startsWith("/")) p.push(`form ${f.id}: match.pathPrefix required`);
      if (f.match?.selector !== undefined && !isStr(f.match.selector)) p.push(`form ${f.id}: bad match.selector`);
      if (f.match?.titleIncludes !== undefined && !isStr(f.match.titleIncludes)) p.push(`form ${f.id}: bad match.titleIncludes`);
      if (typeof f.genericFields !== "boolean") p.push(`form ${f.id}: genericFields must be boolean`);
      for (const m of f.fields || []) {
        if (!isStr(m.selector)) p.push(`form ${f.id}: field selector required`);
        if (!FIELDS[m.key] || m.key.startsWith("identity.")) p.push(`form ${f.id}: unknown or forbidden key ${m.key}`);
        if (m.dateFormat !== undefined && !DATE_FORMATS.includes(m.dateFormat)) p.push(`form ${f.id}: bad dateFormat`);
      }
      for (const s of f.protectedSelectors || []) if (!isStr(s)) p.push(`form ${f.id}: bad protected selector`);
    }
    return p;
  }

  function register(spec) {
    const problems = validate(spec);
    if (problems.length) throw new Error(`Invalid adapter: ${problems.join("; ")}`);
    const mode = spec.testOnly ? (spec.supervisedTrial ? "supervised" : "test") : registry.fillMode(registry.byId(spec.portalId), spec);
    const a = deepFreeze({
      ...spec,
      forms: spec.forms.map((f) => ({ fields: [], protectedSelectors: [], ...f })),
      portal: spec.testOnly ? { category: "Test", ...spec.portal, status: "test_fixture" } : undefined,
      mode,
    });
    adapters.set(a.id, a);
    return a;
  }

  /** The trial declaration a supervised adapter is limited to (registry entry, or the test fixture's own). */
  function trialFor(adapter) {
    if (!adapter || adapter.mode !== "supervised") return null;
    return adapter.testOnly ? adapter.supervisedTrial : registry.byId(adapter.portalId)?.supervisedTrial || null;
  }

  function forOrigin(origin) {
    for (const a of adapters.values()) if (a.origins.includes(origin)) return a;
    return null;
  }

  function portalFor(adapter) {
    if (!adapter) return null;
    if (adapter.testOnly) return adapter.portal;
    const e = registry.byId(adapter.portalId);
    return e && { id: e.id, name: e.service, category: e.category, status: e.status };
  }

  /** page: { pathname, title, hasSelector(selector) → boolean } */
  function matchForm(adapter, page) {
    if (!adapter || !page) return null;
    for (const f of adapter.forms) {
      if (!String(page.pathname || "").startsWith(f.match.pathPrefix)) continue;
      if (f.match.titleIncludes && !String(page.title || "").includes(f.match.titleIncludes)) continue;
      if (f.match.selector && !page.hasSelector(f.match.selector)) continue;
      return f;
    }
    return null;
  }

  const list = () => [...adapters.values()];

  MC.adapters = Object.freeze({ DATE_FORMATS, validate, register, forOrigin, portalFor, matchForm, trialFor, list });
})(globalThis);

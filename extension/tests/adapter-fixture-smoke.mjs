/**
 * Real-browser adapter template. For every portal scaffold it renders each supplied capture to a
 * local stand-in page and checks that the inspector recaptures it identically. When the portal's
 * adapter exists (extension/adapters/<scaffold-id>.js) it also runs the real engine on every
 * stand-in: form match, selector resolution, preview with synthetic data and an approved fill,
 * and confirms that protected fields stay untouched and nothing is submitted.
 *   node extension/tests/adapter-fixture-smoke.mjs --browser chrome|edge [--headed]
 * Portals without captures report PENDING. A synthetic self-test always runs.
 * Pages are served on 127.0.0.1 only; no portal is opened.
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import {
  checkCapture,
  extRoot,
  isFillableIn,
  loadAdapterSpec,
  loadInspector,
  loadScaffolds,
  localAdapter,
  localCapture,
  readCaptures,
  readCaptureSet,
  syntheticAdapter,
  syntheticCapture,
  syntheticCaptureSet,
  syntheticStepAdapter,
} from "./adapter-fixture-template.mjs";
import { compareRoundTrip, renderCaptureFixture } from "./capture-fixture.mjs";
import { createDriver, createReporter, findBrowser, launchBrowser, log, parseArgs, sleep } from "./harness.mjs";

const { browserName, headed } = parseArgs();
const report = createReporter();
const { check } = report;
const inspect = loadInspector();
const read = (p) => fs.readFileSync(path.join(extRoot, p), "utf8");
const ENGINE = ["core", "registry", "adapters", "classify", "values", "preview", "protocol", "dom"];
const ENGINE_SRC = ENGINE.map((f) => read(`src/engine/${f}.js`)).join("\n;\n");
const INSPECT_SRC = ["origins", "capture"].map((f) => read(`inspect/${f}.js`)).join("\n;\n");

const leaf = (value) => ({ status: "available", value });
const address = (n) => ({ line: leaf(`${n} Stand-in Road`), village: leaf("Standinpur"), tehsil: leaf("Stand-in Tehsil"), district: leaf("Pune"), state: leaf("Maharashtra"), pincode: leaf("411001") });
const education = (year) => ({ board: leaf("Synthetic Board"), rollNumber: leaf(`SYN-${year}`), passingYear: leaf(year), percentage: leaf(75) });
const FIELDS = {
  personal: {
    fullName: leaf("Standin Applicant"), fatherName: leaf("Standin Father"), motherName: leaf("Standin Mother"), dob: leaf("2005-02-28"),
    gender: leaf("male"), category: leaf("general"), religion: leaf("Standin Religion"), maritalStatus: leaf("unmarried"), nationality: leaf("Indian"),
  },
  contact: { mobile: leaf("9000000401"), email: leaf("standin.applicant@test.local") },
  permanentAddress: address(1),
  correspondenceAddress: address(1),
  education: { tenth: education(2021), twelfth: education(2023), graduation: education(2026) },
  exams: [{ examName: leaf("Synthetic Exam"), applicationNumber: leaf("SYN-APP-1"), rollNumber: leaf("SYN-ROLL-1"), examCentre: leaf("Stand-in Centre"), examDate: leaf("2026-12-01") }],
  requestDetails: { referenceNumber: leaf("SYN-REF-1") },
  identity: { aadhaarMasked: leaf("XXXX-XXXX-0000"), panMasked: leaf("XXXXXX000X") },
};

function serve(routes, hits) {
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, "http://x").pathname;
    hits.push(`${req.method} ${p}`);
    if (req.method !== "GET" || !routes.has(p)) {
      res.writeHead(req.method === "GET" ? 404 : 405);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(routes.get(p));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

// Runs in the stand-in page. Returns plain data only.
const ENGINE_RUN = (adapter, fields, guarded) => `(async () => {
  const E = MCEngine;
  const adapter = E.adapters.register(${JSON.stringify(adapter)});
  const form = E.adapters.matchForm(adapter, E.dom.pageInfo(document, location));
  if (!form) return { matched: false };
  const { descriptors, refs } = E.dom.discover(document);
  const { overrides, protectedIds } = E.dom.resolveAdapterForm(form, document, refs);
  const built = E.preview.buildPlan({ descriptors, form, overrides, protectedIds, fields: ${JSON.stringify(fields)} });
  const signatures = {};
  for (const d of descriptors) signatures[d.id] = d.signature;
  const status = Object.fromEntries(built.items.map((i) => [i.id, i.status]));
  const idOf = (sel) => { try { const el = document.querySelector(sel); for (const [id, r] of refs) if (r.el === el || (r.els && r.els.includes(el))) return id; } catch {} return null; };
  const valueOf = (sel) => { const el = document.querySelector(sel); return !el ? null : el.type === "radio" || el.type === "checkbox" ? el.checked : el.value; };
  const counts = { submit: 0, otherClicks: 0 };
  addEventListener("submit", () => { counts.submit += 1; }, true);
  addEventListener("click", (e) => { if (!(e.target instanceof HTMLInputElement && (e.target.type === "radio" || e.target.type === "checkbox"))) counts.otherClicks += 1; }, true);
  const href = location.href;
  const ready = built.items.filter((i) => i.status === "ready").map((i) => i.id);
  const filled = await E.dom.fill({ items: built.items, signatures }, refs, ready, { settleMs: 20 });
  const result = Object.fromEntries(filled.results.map((r) => [r.id, r.status]));
  return {
    matched: true,
    form: form.id,
    mapped: form.fields.map((m) => { const id = idOf(m.selector); return { selector: m.selector, key: m.key, present: !!document.querySelector(m.selector), id, status: id ? status[id] || "not_visible" : null, fill: id ? result[id] || null : null }; }),
    protectedOnes: [...new Set([...form.protectedSelectors, ...${JSON.stringify(guarded)}])].map((s) => { const id = idOf(s); return { selector: s, status: id ? status[id] || "not_visible" : null, fill: id ? result[id] || null : null, value: valueOf(s) }; }),
    readyCount: ready.length,
    filledCount: filled.summary.filled,
    counts,
    sameUrl: location.href === href,
  };
})()`;

/** Problems from one engine run on one stand-in page. */
function engineProblems(run, capture) {
  if (!run?.matched) return ["adapter form did not match the stand-in page"];
  const p = [];
  const captured = new Set(capture.fields.flatMap((f) => [f.selector, ...(f.choices || []).map((c) => c.selector)]));
  for (const m of run.mapped) {
    if (!captured.has(m.selector)) continue;
    if (!m.id) p.push(`${m.selector} → ${m.key}: selector does not resolve on the stand-in`);
    else if (m.status !== "ready") p.push(`${m.selector} → ${m.key}: preview status ${m.status} with complete synthetic data`);
    else if (m.fill !== "filled") p.push(`${m.selector} → ${m.key}: approved fill ended as ${m.fill}`);
  }
  for (const s of run.protectedOnes) {
    if (s.status === "ready" || s.fill === "filled") p.push(`protected ${s.selector} was offered or filled`);
    if (s.value !== null && s.value !== "" && s.value !== false) p.push(`protected ${s.selector} has a value after fill`);
  }
  if (run.counts.submit || run.counts.otherClicks) p.push(`fill caused ${run.counts.submit} submit and ${run.counts.otherClicks} non-checkable click events`);
  if (!run.sameUrl) p.push("fill navigated the page");
  return p;
}

/**
 * Problems from one engine run on one state of a multi-step capture set. The step's form must be
 * the one matched; a mapping is filled where this state shows it ready, and left alone in states
 * that hide it or have not populated it yet, as long as another state of the step does.
 */
function stepEngineProblems(run, capture, stepId, stepStates) {
  if (!run?.matched) return [`no adapter form matched; expected ${stepId}`];
  if (run.form !== stepId) return [`engine used form ${run.form}; expected ${stepId}`];
  const p = [];
  for (const m of run.mapped) {
    if (isFillableIn(capture, m.selector)) {
      if (m.status !== "ready" || m.fill !== "filled") p.push(`${m.selector} → ${m.key}: ${m.status}/${m.fill} although this state shows it`);
    } else if (stepStates.some((c) => isFillableIn(c, m.selector))) {
      if (m.fill === "filled") p.push(`${m.selector} → ${m.key}: filled although this state hides it or has not populated it`);
    } else p.push(`${m.selector} → ${m.key}: not fillable in any captured state of step ${stepId}`);
  }
  return [...p, ...engineProblems({ ...run, mapped: [] }, capture)];
}

async function main() {
  const exe = findBrowser(browserName);
  if (!exe) throw new Error(`${browserName} not found`);
  log(`\n=== Adapter stand-in template: ${browserName} (${headed ? "headed" : "headless"}) ===\n`);

  const routes = new Map();
  const hits = [];
  const { server, origin } = await serve(routes, hits);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "mc-adapter-fixture-profile-"));
  const b = launchBrowser(exe, profile, { headed });
  const { evaluate, openTab } = createDriver(b);
  const pending = [];

  /** Serves a capture's stand-in, recaptures it, and (with an adapter) runs the engine on it. */
  async function standIn(label, capture, adapter) {
    const local = localCapture(capture, origin);
    routes.set(capture.path, renderCaptureFixture(local));
    const tab = await openTab(`${origin}${capture.path}`);
    try {
      const recaptured = await evaluate(tab.sessionId, `${INSPECT_SRC};\nMCInspect.captureFormStructure(document, { origin: location.origin, pathname: location.pathname })`);
      const cmp = compareRoundTrip(local, recaptured);
      const out = { cmp, run: null };
      if (adapter) {
        await evaluate(tab.sessionId, `${ENGINE_SRC};\ntrue`);
        const guarded = capture.fields.filter((f) => f.filtered && f.selector).map((f) => f.selector);
        out.run = await evaluate(tab.sessionId, ENGINE_RUN(adapter, FIELDS, guarded));
      }
      return out;
    } finally {
      await b.send("Target.closeTarget", { targetId: tab.targetId }).catch(() => {});
      log(`    (${label}: ${capture.path})`);
    }
  }

  try {
    // ── Self-test with the synthetic sample ──
    const sample = syntheticCapture(inspect);
    const good = await standIn("self-test", sample, localAdapter(syntheticAdapter(), origin));
    check("Self-test: stand-in recaptures identically (positional field skipped)", good.cmp.problems.length === 0 && good.cmp.compared === sample.fields.length - 1 && good.cmp.skipped.length === 1, good.cmp.problems.join("; "));
    const gp = engineProblems(good.run, sample);
    check("Self-test: correct adapter matches, resolves, previews ready and fills every mapping", gp.length === 0 && good.run.filledCount === 4 && good.run.readyCount === 4, gp.join("; ") || JSON.stringify(good.run));
    const statusOf = (run, sel) => run.protectedOnes.find((s) => s.selector === sel);
    check(
      "Self-test: CAPTCHA and Aadhaar are never offered and stay empty; no submit, no other click, no navigation",
      statusOf(good.run, "#captcha")?.status === "protected" && statusOf(good.run, "#aadhaar")?.status === "identity_manual" && good.run.protectedOnes.every((s) => s.value === "" && s.fill === null) &&
        good.run.counts.submit === 0 && good.run.counts.otherClicks === 0 && good.run.sameUrl,
      JSON.stringify(good.run.protectedOnes)
    );

    const hiddenMap = await standIn("self-test (bad)", sample, localAdapter(syntheticAdapter([{ selector: "#later", key: "personal.fullName" }]), origin));
    check("Self-test: a mapping to a field hidden on the page is reported", engineProblems(hiddenMap.run, sample).some((m) => /#later → personal\.fullName: preview status not_visible/.test(m)), engineProblems(hiddenMap.run, sample).join("; "));
    const unprotected = await standIn("self-test (bad)", sample, localAdapter(syntheticAdapter(undefined, { protectedSelectors: [] }), origin));
    check(
      "Self-test: engine still refuses the CAPTCHA when the adapter forgets to protect it",
      unprotected.run.filledCount === 4 && !["ready"].includes(statusOf(unprotected.run, "#captcha")?.status) && statusOf(unprotected.run, "#captcha")?.value === "" && engineProblems(unprotected.run, sample).length === 0,
      JSON.stringify(statusOf(unprotected.run, "#captcha"))
    );

    // ── Self-test: two steps on one URL, one step in two states ──
    const steps = syntheticCaptureSet(inspect);
    const stepRuns = [];
    for (const s of steps.set.steps) {
      const states = s.captures.map((e) => steps.captures.find((c) => c.file === e.file).capture);
      for (const [i, e] of s.captures.entries()) {
        const r = await standIn(`self-test steps: ${s.id}, ${e.state}`, states[i], localAdapter(syntheticStepAdapter(), origin));
        stepRuns.push({ step: s.id, state: e.state, r });
        const p = [...r.cmp.problems, ...stepEngineProblems(r.run, states[i], s.id, states)];
        check(`Self-test steps: ${s.id} "${e.state}" matches its own form, fills what it shows, leaves the rest`, p.length === 0, p.join("; "));
      }
    }
    const mappedIn = (state, sel) => stepRuns.find((x) => x.state === state)?.r.run?.mapped.find((m) => m.selector === sel);
    check(
      "Self-test steps: conditional field and dependent list are skipped before they appear and filled after",
      mappedIn("as loaded", "#later")?.status === "not_visible" && mappedIn("as loaded", "#district")?.fill === null &&
        mappedIn("after choosing a state", "#later")?.fill === "filled" && mappedIn("after choosing a state", "#district")?.fill === "filled",
      JSON.stringify(["#later", "#district"].map((sel) => [mappedIn("as loaded", sel), mappedIn("after choosing a state", sel)]))
    );
    const swapped = await standIn("self-test steps (bad)", steps.captures[0].capture, localAdapter(syntheticStepAdapter({ education: { match: { pathPrefix: "/apply" } }, order: ["education", "personal"] }), origin));
    check(
      "Self-test steps: an adapter that cannot tell the steps apart is reported (engine picks the wrong form)",
      stepEngineProblems(swapped.run, steps.captures[0].capture, "personal", [steps.captures[0].capture]).some((m) => /engine used form education; expected personal/.test(m))
    );

    // ── Portals ──
    const scaffolds = loadScaffolds();
    for (const id of Object.keys(scaffolds).sort()) {
      const captures = readCaptures(id);
      if (!captures.length) {
        pending.push(id);
        log(`  PENDING  ${id}: no capture in extension/tests/fixtures/adapters/${id}/`);
        continue;
      }
      const spec = loadAdapterSpec(id);
      const set = readCaptureSet(id);
      const stepOf = (file) => set?.steps?.find((s) => s.captures?.some((e) => e.file === file)) || null;
      for (const { file, capture } of captures) {
        const cp = checkCapture(capture, inspect);
        check(`${id}/${file}: sanitised, settled inspector export`, cp.length === 0, cp.join("; "));
        const r = await standIn(id, capture, spec ? localAdapter(spec, origin) : null);
        check(`${id}/${file}: stand-in recaptures identically`, r.cmp.problems.length === 0, r.cmp.problems.slice(0, 6).join("; "));
        const step = stepOf(file);
        if (!spec) log(`  PENDING  ${id}/${file}: adapter not written (extension/adapters/${id}.js)`);
        else if (!step) check(`${id}/${file}: listed under a step in capture-set.json`, false);
        else if (spec.forms.some((f) => f.id === step.id)) {
          const states = step.captures.map((e) => captures.find((c) => c.file === e.file)?.capture).filter(Boolean);
          const p = stepEngineProblems(r.run, capture, step.id, states);
          check(`${id}/${file}: step ${step.id} previews and fills on the stand-in without touching protected fields`, p.length === 0, p.join("; "));
        } else check(`${id}/${file}: no adapter form claims step ${step.id}`, !r.run?.matched, `matched form ${r.run?.form}`);
      }
    }
    check("Stand-in server received GETs only (nothing submitted)", hits.every((h) => h.startsWith("GET ")), hits.join(" "));
  } finally {
    b.proc.kill();
    await sleep(400);
    await new Promise((r) => server.close(() => r()));
    for (let i = 0; i < 8; i += 1) {
      try {
        fs.rmSync(profile, { recursive: true, force: true });
        break;
      } catch {
        await sleep(400);
      }
    }
  }

  log(`\n=== Results (${browserName}): ${report.passed} passed, ${report.failed} failed, ${pending.length} pending (${pending.join(", ") || "none"}) ===\n`);
  process.exit(report.failed ? 1 : 0);
}

main().catch((e) => {
  log("FATAL", e?.stack || e);
  process.exit(1);
});

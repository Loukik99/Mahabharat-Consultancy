/**
 * Offline report for one portal's sanitised captures, before and after its adapter is written.
 *   node extension/tools/adapter-check.mjs <scaffold-id>        e.g. army-agniveer
 *
 * Reads extension/tests/fixtures/adapters/<scaffold-id>/ (inspector captures + capture-set.json)
 * and, if present, extension/adapters/<scaffold-id>.js. Prints each step's fields as captured
 * (selector, kind, stability, visibility across states, protection) and every problem the adapter
 * template reports, then whether a supervised trial is allowed and whether production evidence is
 * complete (trials/*.json). Nothing is opened, fetched or written. Exit code 1 when there are problems.
 */
import {
  analyseCaptureSet,
  checkAdapterAgainstCaptureSet,
  checkCapture,
  checkCaptureSet,
  checkGateReadiness,
  checkProductionReadiness,
  checkTrialEligibility,
  loadAdapterSpec,
  loadEngine,
  loadInspector,
  loadScaffolds,
  readCaptures,
  readCaptureSet,
  readTrialRecords,
} from "../tests/adapter-fixture-template.mjs";

const id = process.argv[2];
const out = (s = "") => process.stdout.write(`${s}\n`);
const scaffold = loadScaffolds()[id];
if (!scaffold) {
  out(`Unknown scaffold "${id}". Known: ${Object.keys(loadScaffolds()).sort().join(", ")}`);
  process.exit(2);
}

const inspect = loadInspector();
const engine = loadEngine();
const captures = readCaptures(id);
out(`\n${scaffold.name} (${id}): enabled ${scaffold.enabled}, verified ${scaffold.verified}, registry status ${engine.registry.byId(scaffold.portalId).status}`);
const readiness = engine.registry.byId(scaffold.portalId).readiness;
if (readiness) out(`Readiness: ${engine.registry.READINESS.map((k) => `${k} ${readiness[k] ? "yes" : "NO"}`).join(", ")}`);
if (!captures.length) {
  out(`No captures in extension/tests/fixtures/adapters/${id}/. Still needed:`);
  for (const c of scaffold.capturesNeeded) out(`  - ${c}`);
  process.exit(0);
}

const problems = [];
for (const { file, capture } of captures) for (const m of checkCapture(capture, inspect)) problems.push(`${file}: ${m}`);
const set = readCaptureSet(id);
problems.push(...checkCaptureSet(set, captures, inspect, { scaffoldId: id }));

if (set?.steps) {
  const byFile = new Map(captures.map((c) => [c.file, c.capture]));
  for (const s of analyseCaptureSet(set, captures)) {
    out(`\nStep ${s.id} — ${s.name}: ${s.states} state(s), ${s.fields} fields`);
    const step = set.steps.find((x) => x.id === s.id);
    const states = (step.captures || []).map((e) => ({ state: e.state, c: byFile.get(e.file) })).filter((x) => x.c);
    const rows = new Map();
    for (const { state, c } of states) {
      for (const f of c.fields) {
        if (!f.selector) continue;
        const r = rows.get(f.selector) || { f, shownIn: [], options: [] };
        if (f.visible) r.shownIn.push(state);
        if (f.tag === "select") r.options.push(f.optionCount ?? 0);
        rows.set(f.selector, r);
      }
    }
    for (const [sel, { f, shownIn, options }] of rows) {
      const tags = [
        f.filtered ? `PROTECTED ${f.filtered}` : null,
        f.selectorStable ? null : "unstable selector",
        f.disabled || f.readOnly ? "locked" : null,
        shownIn.length === 0 ? "never visible" : shownIn.length < states.length ? `visible only: ${shownIn.join("; ")}` : null,
        f.tag === "select" ? `options per state: ${options.join(" / ")}` : null,
      ].filter(Boolean);
      out(`  ${sel.padEnd(42)} ${String(f.type).padEnd(12)} ${(f.label || "(no label)").slice(0, 50)}${tags.length ? `  [${tags.join(", ")}]` : ""}`);
    }
    if (s.dependentSelects.length) out(`  dependent lists: ${s.dependentSelects.join(", ")}`);
  }
}

const spec = loadAdapterSpec(id);
if (spec) {
  const UNVERIFIED = "engine: registry entry is not verified_supported for this adapter";
  const adapterProblems = checkAdapterAgainstCaptureSet(spec, set, captures, { engine, inspect, scaffoldId: id });
  problems.push(...adapterProblems.filter((m) => m !== UNVERIFIED));
  if (adapterProblems.includes(UNVERIFIED)) out("\nAdapter is written and stays disabled: the registry entry is not verified_supported.");
  if (scaffold.gate) {
    const gate = checkGateReadiness(spec, set, captures, { engine, inspect, scaffoldId: id });
    out(`\nAfter ${scaffold.gate.name} (${gate.afterGateStates} capture(s) marked "gate": "after"):`);
    for (const f of gate.fields) {
      const seen = f.results.length ? f.results.map((r) => `${r.outcome}${r.changed ? ` (${r.changed.join(", ")})` : ""} in "${r.state}"`).join("; ") : "not captured yet";
      out(`  ${f.selector.padEnd(42)} ${f.key.padEnd(32)} ${seen}${f.results.length ? `  — editable after ${scaffold.gate.name}: ${f.editableAfterGate ? "yes" : "no"}` : ""}`);
    }
    out(`Verdict: ${gate.verdict}`);
    problems.push(...gate.problems);
    if (gate.verdict === "awaiting_capture") {
      out(`\nWorkflow for the capture after ${scaffold.gate.name} (done by the applicant):`);
      scaffold.gate.steps.forEach((s, i) => out(`  ${i + 1}. ${s}`));
    }
    const entry = engine.registry.byId(scaffold.portalId);
    const trial = checkTrialEligibility(spec, entry, set, captures, { engine, inspect, scaffoldId: id });
    out(`\nSupervised trial (${(entry.supervisedTrial?.fields || []).map((f) => f.selector).join(", ") || "none declared"}): ${trial.verdict}`);
    if (trial.verdict === "eligible" && scaffold.trial) {
      out(`\nSupervised trial workflow (${entry.status === engine.registry.STATUS.SUPERVISED ? "the registry entry is supervised_verification_only" : "the registry change in step 2 is still to be made"}):`);
      scaffold.trial.steps.forEach((s, i) => out(`  ${i + 1}. ${s}`));
    }
    problems.push(...trial.problems.filter((m) => !gate.problems.includes(m)));
    const records = readTrialRecords(id);
    const prod = checkProductionReadiness({ adapter: spec, entry, set, captures, records, env: { engine, inspect, scaffoldId: id } });
    out(`Trial records: ${records.length}${records.length ? ` (latest valid record ${prod.passingRecord ? "passed" : "did not pass"})` : ""}`);
    out(`Production readiness: ${prod.ready ? "all evidence present — enabling normal filling is still a separate, explicit decision" : "not ready"}`);
    for (const m of prod.problems) out(`  - ${m}`);
    for (const m of prod.problems.filter((m) => m.startsWith("trial record "))) problems.push(m);
  }
} else out(`\nAdapter not written yet (extension/adapters/${id}.js). Map only selectors listed above that are stable, visible and unprotected.`);

out(problems.length ? `\n${problems.length} problem(s):` : "\nNo problems.");
for (const m of [...new Set(problems)]) out(`  - ${m}`);
process.exit(problems.length ? 1 : 0);

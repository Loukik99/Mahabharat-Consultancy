/**
 * GST adapter in a real browser, through the real portal content script and message protocol.
 *   node extension/tests/gst-adapter-smoke.mjs --browser chrome|edge [--headed]
 *
 * The page is the local stand-in rendered from the sanitised public capture
 * (tests/fixtures/adapters/gst-registration/), served on 127.0.0.1. A temporary TEST build adds one
 * content script for that origin: the engine, a test-only loopback copy of
 * extension/adapters/gst-registration.js, and src/portal-content.js. The shipped manifest is not
 * changed and the GST portal is never opened. Applicant data is synthetic.
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { extRoot, loadAdapterSpec, localAdapter, localCapture, readCaptures } from "./adapter-fixture-template.mjs";
import { renderCaptureFixture } from "./capture-fixture.mjs";
import { createDriver, createReporter, findBrowser, launchBrowser, log, parseArgs, sleep, waitFor } from "./harness.mjs";

const { browserName, headed } = parseArgs();
const report = createReporter();
const { check } = report;
const read = (p) => fs.readFileSync(path.join(extRoot, p), "utf8");
const ENGINE = ["core", "registry", "adapters", "classify", "values", "preview", "protocol", "dom"];
const ENGINE_SRC = ENGINE.map((f) => read(`src/engine/${f}.js`)).join("\n;\n");
const V = 1;

const spec = loadAdapterSpec("gst-registration");
const capture = readCaptures("gst-registration").find((c) => c.file === "01-part-a-public.json").capture;
const PATH = capture.path;
const MAPPED = spec.forms[0].fields.map((m) => m.selector);
const PROTECTED = spec.forms[0].protectedSelectors;

const leaf = (value) => ({ status: "available", value });
const MISSING = { status: "missing", value: null };
const INVALID = { status: "invalid", value: null };
const MASKED = ["XXXX-XXXX-0000", "XXXXXX000X"];
const tree = ({ contact = {} } = {}) => ({
  personal: { fullName: leaf("Standin Applicant"), dob: leaf("2005-02-28"), gender: leaf("male"), category: leaf("general") },
  contact: { mobile: leaf("9000000502"), email: leaf("standin.gst@test.local"), ...contact },
  permanentAddress: { line: leaf("5 Stand-in Road"), village: leaf("Standinpur"), tehsil: leaf("Standin Taluka"), district: leaf("Pune"), state: leaf("Maharashtra"), pincode: leaf("411005") },
  correspondenceAddress: { line: leaf("5 Stand-in Road"), village: leaf("Standinpur"), tehsil: leaf("Standin Taluka"), district: leaf("Pune"), state: leaf("Maharashtra"), pincode: leaf("411005") },
  education: { tenth: { board: leaf("Synthetic Board"), passingYear: leaf(2021), percentage: leaf(70) } },
  identity: { aadhaarMasked: leaf(MASKED[0]), panMasked: leaf(MASKED[1]) },
});
const SYNTHETIC = ["9000000502", "standin.gst@test.local", "Standin Applicant", "Standinpur", "5 Stand-in Road"];
const LABEL = {
  email: "Email Address",
  mobile: "Mobile Number",
  pan: "Permanent Account Number (PAN)",
  legal: "Legal Name of the Business (As mentioned in PAN)",
  state: "State/UT",
  district: "District",
  type: "I am a",
};
const BY_STATUS = { ready: 2, protected: 2, unmapped: 4 };

function serve(html, hits) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    hits.push(`${req.method} ${url.pathname}`);
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end();
      return;
    }
    let body = null;
    if (url.pathname === PATH) body = url.searchParams.get("variant") === "title" ? html.replace(/<title>[^<]*<\/title>/, "<title>Application Status</title>") : html;
    if (url.pathname === "/services") body = html;
    res.writeHead(body ? 200 : 404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(body || "");
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

function buildTestExtension(origin) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-ext-gst-build-"));
  fs.cpSync(path.join(extRoot, "src"), path.join(dir, "src"), { recursive: true });
  fs.mkdirSync(path.join(dir, "test-fixtures"));
  const local = localAdapter(spec, origin);
  fs.writeFileSync(path.join(dir, "test-fixtures", "gst-local-adapter.js"), `globalThis.MCEngine.adapters.register(${JSON.stringify(local)});\n`);
  fs.writeFileSync(path.join(dir, "test-fixtures", "control.html"), "<!doctype html><title>control</title>\n");
  const manifest = JSON.parse(read("manifest.json"));
  manifest.name = `${manifest.name} (TEST BUILD)`;
  manifest.content_scripts.push({
    matches: [`${origin}/*`],
    js: [...ENGINE.map((f) => `src/engine/${f}.js`), "test-fixtures/gst-local-adapter.js", "src/portal-content.js"],
    run_at: "document_idle",
    all_frames: false,
  });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return { dir, manifest, local };
}

async function main() {
  const exe = findBrowser(browserName);
  if (!exe) throw new Error(`${browserName} not found`);
  log(`\n=== GST adapter on its capture stand-in: ${browserName} (${headed ? "headed" : "headless"}) ===\n`);

  const html = renderCaptureFixture(localCapture(capture, "http://127.0.0.1"));
  const hits = [];
  const otherHits = [];
  const site = await serve(html, hits);
  const other = await serve(html, otherHits);
  const build = buildTestExtension(site.origin);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "mc-ext-gst-"));
  const b = launchBrowser(exe, profile, { headed });
  const { sessions, evaluate, navigate, openTab, diagnostics } = createDriver(b);
  const isolated = new Map();
  b.on((msg) => {
    if (msg.method === "Runtime.executionContextCreated" && msg.params.context.auxData?.type === "isolated") isolated.set(msg.sessionId, msg.params.context.id);
    if (msg.method === "Runtime.executionContextsCleared") isolated.delete(msg.sessionId);
  });

  try {
    const shipped = JSON.parse(read("manifest.json"));
    check(
      "Shipped manifest: no loopback origin; GST only as its registration page, without the adapter file",
      !/127\.0\.0\.1/.test(read("manifest.json")) && JSON.stringify(shipped.content_scripts.flatMap((c) => c.matches).filter((m) => /gst/.test(m))) === '["https://reg.gst.gov.in/registration*"]' &&
        !shipped.content_scripts.some((c) => c.js.some((f) => f.startsWith("adapters/")))
    );
    check(
      "Test build keeps every shipped content script and adds one for the stand-in origin only; host permissions unchanged",
      build.manifest.content_scripts.length === shipped.content_scripts.length + 1 && JSON.stringify(build.manifest.content_scripts.slice(0, -1)) === JSON.stringify(shipped.content_scripts) &&
        JSON.stringify(build.manifest.content_scripts.at(-1).matches) === JSON.stringify([`${site.origin}/*`]) && JSON.stringify(build.manifest.host_permissions) === JSON.stringify(shipped.host_permissions)
    );
    const ext = await b.send("Extensions.loadUnpacked", { path: build.dir });
    check("Test build loads unpacked", /^[a-p]{32}$/.test(ext.id));
    const control = await openTab(`chrome-extension://${ext.id}/test-fixtures/control.html`);
    const page = await openTab(`${site.origin}${PATH}`);
    const elsewhere = await openTab(`${other.origin}${PATH}`);
    const elsewhereBefore = await evaluate(elsewhere.sessionId, "document.documentElement.outerHTML");

    const detectAll = () =>
      evaluate(
        control.sessionId,
        `(async () => { const out = []; for (const t of await chrome.tabs.query({})) {
          const d = await chrome.tabs.sendMessage(t.id, { type: "MC_DETECT", v: ${V} }).then((r) => r ?? null, () => null);
          if (d) out.push({ tabId: t.id, d }); } return out; })()`
      );
    const send = (tabId, msg) => evaluate(control.sessionId, `chrome.tabs.sendMessage(${tabId}, ${JSON.stringify(msg)}).then((r) => r ?? null, () => null)`);
    const watch = () =>
      evaluate(
        page.sessionId,
        `(() => { window.__w = { submit: 0, clicks: 0, input: 0, change: 0, href: location.href };
          addEventListener("submit", () => { window.__w.submit += 1; }, true);
          addEventListener("click", () => { window.__w.clicks += 1; }, true);
          addEventListener("input", () => { window.__w.input += 1; }, true);
          addEventListener("change", () => { window.__w.change += 1; }, true); return true; })()`
      );
    const pageState = () =>
      evaluate(
        page.sessionId,
        `(() => { const v = (s) => { const el = document.querySelector(s); return el ? (el.type === "radio" || el.type === "checkbox" ? el.checked : el.value) : null; };
          return { w: { ...window.__w, sameUrl: window.__w && window.__w.href === location.href },
            email: v("#email"), mobile: v("#mobile"),
            selects: [...document.querySelectorAll("select")].map((s) => s.selectedIndex),
            radios: [...document.querySelectorAll('input[type="radio"][name="typ"]')].map((el) => el.checked),
            protectedValues: ${JSON.stringify(PROTECTED)}.flatMap((s) => [...document.querySelectorAll(s)].map((el) => el.value)),
            others: [...document.querySelectorAll("input,select,textarea")].filter((el) => !${JSON.stringify(MAPPED)}.some((s) => el.matches(s)))
              .map((el) => el.tagName === "SELECT" ? el.selectedIndex : el.type === "radio" || el.type === "checkbox" ? el.checked : el.value),
            html: document.documentElement.outerHTML }; })()`
      );
    const preview = async (fields = tree()) => {
      const [{ tabId, d }] = await detectAll();
      return { tabId, nonce: d.nonce, res: await send(tabId, { type: "MC_PREVIEW", v: V, nonce: d.nonce, fields }) };
    };
    const items = (res) => res.items;
    const byLabel = (res, label, nth = 0) => res.items.filter((i) => i.label === label)[nth];
    const fill = (tabId, nonce, previewId, approved) => send(tabId, { type: "MC_FILL", v: V, nonce, previewId, approved, confirmed: true });
    const inContentScript = async (expression) => {
      const contextId = await waitFor(() => isolated.get(page.sessionId), { timeout: 5000, label: "content-script context" });
      const r = await b.send("Runtime.evaluate", { expression, contextId, returnByValue: true }, page.sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
      return r.result.value;
    };
    const sorted = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).sort()));

    const reg = await evaluate(
      page.sessionId,
      `(() => { ${ENGINE_SRC};
        let production = null; try { MCEngine.adapters.register(${JSON.stringify(spec)}); } catch (e) { production = e.message; }
        const local = MCEngine.adapters.register(${JSON.stringify(build.local)});
        return { production, forLocal: MCEngine.adapters.forOrigin(location.origin)?.id ?? null, forPortal: MCEngine.adapters.forOrigin("https://reg.gst.gov.in")?.id ?? null,
          lookalike: MCEngine.adapters.forOrigin("https://reg.gst.gov.in.example.com")?.id ?? null, localId: local.id }; })()`
    );
    check("Engine refuses the production GST adapter (registry entry not verified_supported)", /not verified_supported/.test(reg.production || ""), reg.production);
    check("Loopback copy registers and is found only for its own origin", reg.forLocal === "gst-registration-local" && reg.forPortal === null && reg.lookalike === null, JSON.stringify(reg));
    await navigate(page.sessionId, `${site.origin}${PATH}`);

    let found = await detectAll();
    check("Exactly one tab answers: the stand-in origin (other origin has no content script)", found.length === 1, JSON.stringify(found.map((f) => f.d.form)));
    const det = found[0]?.d;
    check(
      "Detection names part A; filling available",
      det?.form?.id === "part-a" && det.form.name === "GST new registration, part A" && det.formFilling === "available" && det.portal.status === "test_fixture" && /^[0-9a-f]{32}$/.test(det.nonce),
      JSON.stringify(det)
    );
    await navigate(page.sessionId, `${site.origin}${PATH}?variant=title`);
    found = await detectAll();
    const titleRes = await send(found[0].tabId, { type: "MC_PREVIEW", v: V, nonce: found[0].d.nonce, fields: tree() });
    check("Same path, title without Registration → form not recognised, preview refused", found[0].d.form === null && found[0].d.formFilling === "unavailable" && titleRes?.code === "FORM_NOT_RECOGNISED");
    await navigate(page.sessionId, `${site.origin}/services`);
    found = await detectAll();
    check("Same page under another path → form not recognised", found[0].d.form === null && found[0].d.formFilling === "unavailable");
    await navigate(page.sessionId, `${site.origin}${PATH}`);
    await watch();

    const selectorReport = await evaluate(
      page.sessionId,
      `${JSON.stringify(PROTECTED)}.map((s) => { try { return [s, document.querySelectorAll(s).length]; } catch { return [s, -1]; } })`
    );
    check("Every protected selector resolves to at least one control on the stand-in", selectorReport.every(([, n]) => n >= 1), selectorReport.filter(([, n]) => n < 1).map(([s, n]) => `${s}:${n}`).join(", "));

    const initial = await pageState();
    let { tabId, nonce, res } = await preview();
    const ready = items(res).filter((i) => i.status === "ready");
    check(
      "Preview offers exactly email and mobile, with synthetic values",
      JSON.stringify(ready.map((i) => [i.label, i.display])) === JSON.stringify([[LABEL.email, "standin.gst@test.local"], [LABEL.mobile, "9000000502"]]),
      JSON.stringify(ready.map((i) => [i.label, i.display]))
    );
    check("Preview statuses are the two mapped fields, the two identity fields, and four manual fields", sorted(res.summary.byStatus) === sorted(BY_STATUS), JSON.stringify(res.summary.byStatus));
    check("PAN and the legal name are protected with no value", byLabel(res, LABEL.pan)?.status === "protected" && byLabel(res, LABEL.legal)?.status === "protected" && items(res).filter((i) => i.status === "protected").every((i) => i.display === null));
    check(
      "State, District and taxpayer type stay manual, and no list is offered",
      [LABEL.state, LABEL.district, LABEL.type].every((l) => byLabel(res, l)?.status === "unmapped" && byLabel(res, l)?.reason === "adapter_only") && items(res).filter((i) => i.kind === "select").every((i) => i.status !== "ready")
    );
    const radio = items(res).filter((i) => i.kind === "radio");
    check("The New Registration / TRN switch is not offered", radio.length === 1 && radio[0].status === "unmapped" && radio[0].display === null, JSON.stringify(radio));
    check("Preview exposes public keys only and no masked identity value", items(res).every((i) => Object.keys(i).sort().join(",") === "confidence,display,hasValue,id,keyLabel,kind,label,reason,required,status") && !MASKED.some((m) => JSON.stringify(res).includes(m)));
    let st = await pageState();
    check("Preview does not change the page (no value, no event, no submit)", st.html === initial.html && st.w.input === 0 && st.w.change === 0 && st.w.clicks === 0 && st.w.submit === 0);

    const id = (label) => byLabel(res, label)?.id;
    const noConfirm = await send(tabId, { type: "MC_FILL", v: V, nonce, previewId: res.previewId, approved: [id(LABEL.mobile)] });
    const textConfirm = await send(tabId, { type: "MC_FILL", v: V, nonce, previewId: res.previewId, approved: [id(LABEL.mobile)], confirmed: "true" });
    check("Fill without confirmed === true is ignored", noConfirm === null && textConfirm === null && (await pageState()).mobile === "");
    const notReady = items(res).filter((i) => i.status !== "ready").map((i) => i.id);
    const refused = await fill(tabId, nonce, res.previewId, notReady);
    check(
      "Approving every protected or unmapped row at once fills nothing",
      notReady.length === items(res).length - 2 && notReady.includes(id(LABEL.pan)) && refused?.summary?.filled === 0 && refused.results.every((r) => r.reason === "not_approvable") && (await pageState()).html === initial.html,
      JSON.stringify(refused?.summary)
    );
    const replayRefused = await fill(tabId, nonce, res.previewId, [id(LABEL.mobile)]);
    check("A preview is single use, even after a refused fill (replay → NO_PREVIEW)", replayRefused?.code === "NO_PREVIEW");

    ({ tabId, nonce, res } = await preview());
    const partial = await fill(tabId, nonce, res.previewId, [id(LABEL.mobile)]);
    st = await pageState();
    check("Only the approved row is filled (mobile); email stays empty", partial?.summary?.filled === 1 && st.mobile === "9000000502" && st.email === "", JSON.stringify(partial?.summary));
    check("Fill dispatches input/change events only; no submit, no click, no navigation", st.w.submit === 0 && st.w.clicks === 0 && st.w.sameUrl && st.w.input >= 1 && st.w.change >= 1, JSON.stringify(st.w));
    check("Lists and the TRN switch stay as the page loaded them", JSON.stringify(st.selects) === JSON.stringify(initial.selects) && JSON.stringify(st.radios) === JSON.stringify(initial.radios) && st.selects.every((i) => i === 0));
    const replay = await fill(tabId, nonce, res.previewId, [id(LABEL.email)]);
    check("Replayed preview → NO_PREVIEW, email still empty", replay?.code === "NO_PREVIEW" && (await pageState()).email === "");
    const stale = await send(tabId, { type: "MC_PREVIEW", v: V, nonce: "0123456789abcdef0123456789abcdef", fields: tree() });
    check("Wrong page nonce → STALE_PAGE", stale?.code === "STALE_PAGE");

    ({ tabId, nonce, res } = await preview());
    await inContentScript(`(() => { const real = Date.now.bind(Date); Date.__real = real; Date.now = () => real() + 6 * 60 * 1000; return true; })()`);
    const expired = await fill(tabId, nonce, res.previewId, [id(LABEL.email), id(LABEL.mobile)]);
    await inContentScript(`(() => { Date.now = Date.__real; delete Date.__real; return true; })()`);
    st = await pageState();
    check("Preview older than five minutes → PREVIEW_EXPIRED, email still empty", expired?.code === "PREVIEW_EXPIRED" && st.email === "", JSON.stringify(expired));
    await inContentScript(`(() => { const real = setTimeout; globalThis.__realSetTimeout = real; globalThis.setTimeout = (fn, ms, ...a) => real(fn, ms > 60000 ? 50 : ms, ...a); return true; })()`);
    ({ tabId, nonce, res } = await preview());
    await inContentScript(`(() => { globalThis.setTimeout = globalThis.__realSetTimeout; delete globalThis.__realSetTimeout; return true; })()`);
    await sleep(2000); // background tabs run timers at most once a second
    const dropped = await fill(tabId, nonce, res.previewId, [id(LABEL.email), id(LABEL.mobile)]);
    check("Once the preview lifetime passes, its values are dropped from the page (PREVIEW_EXPIRED without any clock change)", dropped?.code === "PREVIEW_EXPIRED" && (await pageState()).email === "", JSON.stringify(dropped));

    ({ tabId, nonce, res } = await preview());
    check("Re-preview flags the filled mobile and leaves email empty", byLabel(res, LABEL.mobile)?.hasValue === true && byLabel(res, LABEL.email)?.hasValue === false);
    await evaluate(
      page.sessionId,
      `document.querySelector('label[for="email"]').textContent = "Village"; document.getElementById("mobile").disabled = true; true`
    );
    const changed = await fill(tabId, nonce, res.previewId, [id(LABEL.email), id(LABEL.mobile)]);
    const reason = (label) => changed?.results?.find((r) => r.id === id(label))?.reason ?? null;
    st = await pageState();
    check(
      "Changed after preview: relabelled email → form_changed, disabled mobile → locked; nothing written over them",
      reason(LABEL.email) === "form_changed" && reason(LABEL.mobile) === "locked" && changed.summary.filled === 0 && st.email === "",
      JSON.stringify(changed?.results)
    );
    await navigate(page.sessionId, `${site.origin}${PATH}`);
    await watch();

    await evaluate(page.sessionId, `document.getElementById("email").closest("div").hidden = true; true`);
    ({ tabId, nonce, res } = await preview());
    check("Email hidden by the page before preview is left out (mobile still ready)", !byLabel(res, LABEL.email) && items(res).filter((i) => i.status === "ready").length === 1 && res.summary.hiddenSkipped > 0);
    await evaluate(page.sessionId, `document.getElementById("email").closest("div").hidden = false; true`);
    ({ tabId, nonce, res } = await preview());
    check("Shown again → offered again on a fresh preview", byLabel(res, LABEL.email)?.status === "ready");

    ({ res } = await preview(tree({ contact: { mobile: MISSING, email: INVALID } })));
    check("Missing mobile → missing; invalid email → invalid; neither offered", byLabel(res, LABEL.mobile)?.status === "missing" && byLabel(res, LABEL.email)?.status === "invalid");
    ({ res } = await preview(tree({ contact: { mobile: leaf("+91 90000 00502"), email: leaf(`${"a".repeat(250)}@test.local`) } })));
    check("Mobile with a country code and an email over 254 characters → too_long", byLabel(res, LABEL.mobile)?.status === "too_long" && byLabel(res, LABEL.email)?.status === "too_long", JSON.stringify([byLabel(res, LABEL.mobile)?.status, byLabel(res, LABEL.email)?.status]));
    ({ res } = await preview(tree({ contact: { email: leaf("not-an-email") } })));
    check(
      "A non-email string is still offered: the captured control is type text and has no HTML pattern (the live page's own check was not captured)",
      byLabel(res, LABEL.email)?.status === "ready" && byLabel(res, LABEL.email)?.display === "not-an-email"
    );

    await navigate(page.sessionId, `${site.origin}${PATH}`);
    await watch();
    ({ tabId, nonce, res } = await preview());
    const all = await fill(tabId, nonce, res.previewId, items(res).filter((i) => i.status === "ready").map((i) => i.id));
    st = await pageState();
    check("Approved fill writes email and mobile exactly", all?.summary?.filled === 2 && st.email === "standin.gst@test.local" && st.mobile === "9000000502", JSON.stringify(all?.summary));
    check("Every list stays on Select and the TRN switch stays as loaded", st.selects.every((i) => i === 0) && JSON.stringify(st.radios) === JSON.stringify(initial.radios));
    check("Every protected control is still empty", st.protectedValues.length === 2 && st.protectedValues.every((v) => v === ""), JSON.stringify(st.protectedValues));
    check(
      "Every control other than email and mobile is exactly as the page loaded it",
      st.others.length === initial.others.length && st.others.length === 7 && JSON.stringify(st.others) === JSON.stringify(initial.others),
      `${st.others.length} controls`
    );
    check("No submit, no click, no navigation during any fill", st.w.submit === 0 && st.w.clicks === 0 && st.w.sameUrl, JSON.stringify(st.w));
    check("Masked identity values never reached the page", !MASKED.some((m) => st.html.includes(m)));
    const requests = sessions.get(page.sessionId).requests.filter((r) => r.type !== "Document" && !r.url.startsWith("data:") && !r.url.endsWith("/favicon.ico"));
    check("Stand-in tab made no requests besides page loads (content script is offline)", requests.length === 0, requests.map((r) => `${r.method} ${r.url}`).join(" | "));
    check("Servers received GETs only (nothing submitted)", [...hits, ...otherHits].every((h) => h.startsWith("GET ")), [...hits, ...otherHits].join(" "));
    check("Tab on an origin without the adapter untouched", (await evaluate(elsewhere.sessionId, "document.documentElement.outerHTML")) === elsewhereBefore);
    const stored = await evaluate(control.sessionId, `(async () => ({ storage: typeof chrome.storage, local: localStorage.length, session: sessionStorage.length, idb: (await indexedDB.databases()).length }))()`);
    const pageStore = await evaluate(page.sessionId, `({ local: localStorage.length, session: sessionStorage.length })`);
    check("No extension storage and no page storage used", stored.storage === "undefined" && stored.local === 0 && stored.session === 0 && stored.idb === 0 && pageStore.local === 0 && pageStore.session === 0, JSON.stringify({ stored, pageStore }));
    const pageSession = sessions.get(page.sessionId);
    check("No console output or exceptions in the page or content script", pageSession.console === 0 && pageSession.exceptions === 0, pageSession.logs.join(" | "));
    const fixtureText = fs.readdirSync(path.join(extRoot, "tests", "fixtures", "adapters", "gst-registration")).map((f) => read(path.join("tests", "fixtures", "adapters", "gst-registration", f))).join("\n");
    check("Fixtures contain none of the synthetic applicant values", !SYNTHETIC.some((s) => fixtureText.includes(s)));
  } catch (e) {
    log(`  FATAL: ${e.message}`);
    for (const line of diagnostics()) log(`    ${line}`);
    e.reported = true;
    throw e;
  } finally {
    b.proc.kill();
    await sleep(500);
    site.server.close();
    other.server.close();
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
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

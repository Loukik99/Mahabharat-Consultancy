/**
 * PMEGP adapter in a real browser, through the real portal content script and message protocol.
 *   node extension/tests/pmegp-adapter-smoke.mjs --browser chrome|edge [--headed]
 *
 * The page is the local stand-in rendered from the sanitised public capture
 * (tests/fixtures/adapters/pmegp-application/), served on 127.0.0.1. A temporary TEST build adds one
 * content script for that origin: the engine, a test-only loopback copy of
 * extension/adapters/pmegp-application.js, and src/portal-content.js. The shipped manifest is not
 * changed and the PMEGP portal is never opened. Applicant data is synthetic.
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

const spec = loadAdapterSpec("pmegp-application");
const capture = readCaptures("pmegp-application").find((c) => c.file === "01-new-unit-public.json").capture;
const PATH = capture.path;

const leaf = (value) => ({ status: "available", value });
const MISSING = { status: "missing", value: null };
const INVALID = { status: "invalid", value: null };
const MASKED = ["XXXX-XXXX-0000", "XXXXXX000X"];
const tree = ({ contact = {}, corr = {} } = {}) => ({
  personal: { fullName: leaf("Standin Applicant"), dob: leaf("2005-02-28"), gender: leaf("male"), category: leaf("general") },
  contact: { mobile: leaf("9000000501"), email: leaf("standin.pmegp@test.local"), ...contact },
  permanentAddress: { line: leaf("5 Stand-in Road"), village: leaf("Standinpur"), tehsil: leaf("Standin Taluka"), district: leaf("Pune"), state: leaf("Maharashtra"), pincode: leaf("411005") },
  correspondenceAddress: { line: leaf("5 Stand-in Road"), village: leaf("Standinpur"), tehsil: leaf("Standin Taluka"), district: leaf("Pune"), state: leaf("Maharashtra"), pincode: leaf("411005"), ...corr },
  education: { tenth: { board: leaf("Synthetic Board"), passingYear: leaf(2021), percentage: leaf(70) } },
  identity: { aadhaarMasked: leaf(MASKED[0]), panMasked: leaf(MASKED[1]) },
});
const SYNTHETIC = ["9000000501", "standin.pmegp@test.local", "Standin Taluka", "411005", "Standin Applicant"];

const LABEL = {
  taluka: "Taluka / Block / तालुका / ब्लॉक",
  pin: "Pin Code / पिन कोड *",
  mobile: "Primary Mobile No / मोबाइल नंबर *",
  mobile2: "Secondary Mobile No / मोबाइल नंबर",
  email: "eMail / ई-मेल *",
  unitAddress: "Unit Address / पत्राचार हेतु पता *",
  aadhaar: "Aadhaar Card No / आधार नंबर *",
  category: "Social Category / सामाजिक श्रेणी *",
  qualification: "Qualification / शैक्षणिक योग्यता *",
};
// Statuses the engine gave the live page on 2026-10-28 (read-only preview, nothing filled). Its one
// "unsupported" item is the translation widget's <button role="combobox" aria-label="Language
// Translator">; captures record buttons without their role, so the stand-in has no such item.
const LIVE_BY_STATUS = { ready: 4, protected: 13, unmapped: 23, locked: 6, unsupported: 1 };
const STAND_IN_BY_STATUS = { ready: 4, protected: 13, unmapped: 23, locked: 6 };

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
    if (url.pathname === "/Home/Other") body = html;
    res.writeHead(body ? 200 : 404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(body || "");
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

function buildTestExtension(origin) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-ext-pmegp-build-"));
  fs.cpSync(path.join(extRoot, "src"), path.join(dir, "src"), { recursive: true });
  fs.mkdirSync(path.join(dir, "test-fixtures"));
  const local = localAdapter(spec, origin);
  fs.writeFileSync(path.join(dir, "test-fixtures", "pmegp-local-adapter.js"), `globalThis.MCEngine.adapters.register(${JSON.stringify(local)});\n`);
  fs.writeFileSync(path.join(dir, "test-fixtures", "control.html"), "<!doctype html><title>control</title>\n");
  const manifest = JSON.parse(read("manifest.json"));
  manifest.name = `${manifest.name} (TEST BUILD)`;
  manifest.content_scripts.push({
    matches: [`${origin}/*`],
    js: [...ENGINE.map((f) => `src/engine/${f}.js`), "test-fixtures/pmegp-local-adapter.js", "src/portal-content.js"],
    run_at: "document_idle",
    all_frames: false,
  });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return { dir, manifest, local };
}

async function main() {
  const exe = findBrowser(browserName);
  if (!exe) throw new Error(`${browserName} not found`);
  log(`\n=== PMEGP adapter on its capture stand-in: ${browserName} (${headed ? "headed" : "headless"}) ===\n`);

  const html = renderCaptureFixture(localCapture(capture, "http://127.0.0.1"));
  const hits = [];
  const otherHits = [];
  const site = await serve(html, hits);
  const other = await serve(html, otherHits);
  const build = buildTestExtension(site.origin);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "mc-ext-pmegp-"));
  const b = launchBrowser(exe, profile, { headed });
  const { sessions, evaluate, navigate, openTab, diagnostics } = createDriver(b);
  const isolated = new Map(); // sessionId -> content-script execution context id
  b.on((msg) => {
    if (msg.method === "Runtime.executionContextCreated" && msg.params.context.auxData?.type === "isolated") isolated.set(msg.sessionId, msg.params.context.id);
    if (msg.method === "Runtime.executionContextsCleared") isolated.delete(msg.sessionId);
  });

  try {
    const shipped = JSON.parse(read("manifest.json"));
    check(
      "Shipped manifest: no loopback origin; PMEGP only as its application page, without the adapter file",
      !/127\.0\.0\.1/.test(read("manifest.json")) && JSON.stringify(shipped.content_scripts.flatMap((c) => c.matches).filter((m) => /pmegp/.test(m))) === '["https://pmegp.msme.gov.in/Home/HomePage*"]' &&
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
            taluka: v("#ux_communication_taluk_block"), pin: v("#ux_communication_pin"), mobile: v("#ux_communication_mobileNo"), email: v("#ux_communication_emailId"),
            mobile2: v("#ux_communication_secondary_mobileNo"), unitPin: v("#ux_UnitAddress_pin"), unitAddress: v("#ux_UnitAddress_UnitAddress"),
            selects: [...document.querySelectorAll("select")].map((s) => s.selectedIndex),
            protectedValues: ${JSON.stringify(spec.forms[0].protectedSelectors)}.flatMap((s) => [...document.querySelectorAll(s)].map((el) => el.type === "radio" || el.type === "checkbox" ? el.checked : el.value)),
            others: [...document.querySelectorAll("input,select,textarea")].filter((el) => !${JSON.stringify(spec.forms[0].fields.map((m) => m.selector))}.some((s) => el.matches(s)))
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

    // ── Registration and origin matching ──
    const reg = await evaluate(
      page.sessionId,
      `(() => { ${ENGINE_SRC};
        let production = null; try { MCEngine.adapters.register(${JSON.stringify(spec)}); } catch (e) { production = e.message; }
        const local = MCEngine.adapters.register(${JSON.stringify(build.local)});
        return { production, forLocal: MCEngine.adapters.forOrigin(location.origin)?.id ?? null, forPortal: MCEngine.adapters.forOrigin("https://pmegp.msme.gov.in")?.id ?? null,
          lookalike: MCEngine.adapters.forOrigin("https://pmegp.msme.gov.in.example.com")?.id ?? null, localId: local.id }; })()`
    );
    check("Engine refuses the production PMEGP adapter (registry entry not verified_supported)", /not verified_supported/.test(reg.production || ""), reg.production);
    check("Loopback copy registers and is found only for its own origin", reg.forLocal === "pmegp-application-local" && reg.forPortal === null && reg.lookalike === null, JSON.stringify(reg));
    await navigate(page.sessionId, `${site.origin}${PATH}`);

    // ── Form and step identification ──
    let found = await detectAll();
    check("Exactly one tab answers: the stand-in origin (other origin has no content script)", found.length === 1, JSON.stringify(found.map((f) => f.d.form)));
    const det = found[0]?.d;
    check(
      "Detection names the new-unit form; filling available",
      det?.form?.id === "new-unit" && det.form.name === "PMEGP application for new unit" && det.formFilling === "available" && det.portal.status === "test_fixture" && /^[0-9a-f]{32}$/.test(det.nonce),
      JSON.stringify(det)
    );
    await navigate(page.sessionId, `${site.origin}${PATH}?variant=title`);
    found = await detectAll();
    const titleRes = await send(found[0].tabId, { type: "MC_PREVIEW", v: V, nonce: found[0].d.nonce, fields: tree() });
    check("Same path, title without PMEGP → form not recognised, preview refused", found[0].d.form === null && found[0].d.formFilling === "unavailable" && titleRes?.code === "FORM_NOT_RECOGNISED");
    await navigate(page.sessionId, `${site.origin}/Home/Other`);
    found = await detectAll();
    check("Same page under another path → form not recognised", found[0].d.form === null && found[0].d.formFilling === "unavailable");
    await navigate(page.sessionId, `${site.origin}${PATH}`);
    await watch();

    const selectorReport = await evaluate(
      page.sessionId,
      `${JSON.stringify(spec.forms[0].protectedSelectors)}.map((s) => { try { return [s, document.querySelectorAll(s).length]; } catch { return [s, -1]; } })`
    );
    check(
      "Every protected selector is valid CSS and resolves to at least one control on the stand-in",
      selectorReport.every(([, n]) => n >= 1),
      selectorReport.filter(([, n]) => n < 1).map(([s, n]) => `${s}:${n}`).join(", ")
    );

    // ── Preview ──
    const initial = await pageState();
    let { tabId, nonce, res } = await preview();
    const ready = items(res).filter((i) => i.status === "ready");
    check(
      "Preview offers exactly the four mapped fields, with synthetic values",
      JSON.stringify(ready.map((i) => [i.label, i.display])) === JSON.stringify([[LABEL.taluka, "Standin Taluka"], [LABEL.pin, "411005"], [LABEL.mobile, "9000000501"], [LABEL.email, "standin.pmegp@test.local"]]),
      JSON.stringify(ready.map((i) => [i.label, i.display]))
    );
    const sorted = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).sort()));
    check(
      "Preview statuses match the live page's read-only preview (2026-10-28), less the translation widget's combobox the capture cannot record",
      sorted(res.summary.byStatus) === sorted(STAND_IN_BY_STATUS) && LIVE_BY_STATUS.unsupported - 1 === (res.summary.byStatus.unsupported || 0),
      JSON.stringify(res.summary.byStatus)
    );
    const misleading = items(res).filter((i) => i.label === "Aadhaar Card No");
    check("Controls whose placeholder reads 'Aadhaar Card No' (district, bank address) are protected, no value", misleading.length === 3 && misleading.every((i) => i.status === "protected" && i.display === null), JSON.stringify(misleading));
    check("Unit Address (Hindi label says correspondence address) is not mapped", byLabel(res, LABEL.unitAddress)?.status === "unmapped" && byLabel(res, LABEL.unitAddress)?.reason === "adapter_only");
    check("Unit PIN (same label as the communication PIN) is not mapped", byLabel(res, LABEL.pin, 1)?.status === "unmapped");
    check("Secondary mobile never receives the primary mobile", byLabel(res, LABEL.mobile2)?.status === "unmapped");
    check(
      "Social category and qualification stay manual (no option is guessed)",
      byLabel(res, LABEL.category)?.status === "unmapped" && byLabel(res, LABEL.qualification)?.status === "unmapped" && items(res).filter((i) => i.kind === "select").every((i) => i.status !== "ready")
    );
    check("Date of birth (Aadhaar-derived) is protected; no date is proposed", byLabel(res, "DOB")?.status === "protected" && items(res).every((i) => !/^\d{2}[/-]\d{2}[/-]\d{4}$/.test(i.display || "")));
    check("Aadhaar and PAN are protected with no value", byLabel(res, LABEL.aadhaar)?.status === "protected" && items(res).filter((i) => i.status === "protected").every((i) => i.display === null));
    check("Preview exposes public keys only and no masked identity value", items(res).every((i) => Object.keys(i).sort().join(",") === "confidence,display,hasValue,id,keyLabel,kind,label,reason,required,status") && !MASKED.some((m) => JSON.stringify(res).includes(m)));
    let st = await pageState();
    check("Preview does not change the page (no value, no event)", st.html === initial.html && st.w.input === 0 && st.w.change === 0 && st.w.clicks === 0);

    // ── Explicit approval ──
    const id = (label, nth = 0) => byLabel(res, label, nth)?.id;
    const noConfirm = await send(tabId, { type: "MC_FILL", v: V, nonce, previewId: res.previewId, approved: [id(LABEL.mobile)] });
    const textConfirm = await send(tabId, { type: "MC_FILL", v: V, nonce, previewId: res.previewId, approved: [id(LABEL.mobile)], confirmed: "true" });
    check("Fill without confirmed === true is ignored", noConfirm === null && textConfirm === null && (await pageState()).mobile === "");
    const notReady = items(res).filter((i) => i.status !== "ready").map((i) => i.id);
    const refused = await fill(tabId, nonce, res.previewId, notReady);
    check(
      "Approving every protected, unmapped, locked or unsupported row at once fills nothing (all not_approvable)",
      notReady.length === items(res).length - 4 && notReady.includes(id(LABEL.aadhaar)) && refused?.summary?.filled === 0 && refused.results.length === notReady.length &&
        refused.results.every((r) => r.reason === "not_approvable") && (await pageState()).html === initial.html,
      JSON.stringify(refused?.summary)
    );
    const replayRefused = await fill(tabId, nonce, res.previewId, [id(LABEL.mobile)]);
    check("A preview is single use, even after a refused fill (replay → NO_PREVIEW)", replayRefused?.code === "NO_PREVIEW");

    ({ tabId, nonce, res } = await preview());
    const partial = await fill(tabId, nonce, res.previewId, [id(LABEL.mobile), id(LABEL.email)]);
    st = await pageState();
    check("Only approved rows are filled (mobile, email); taluka and PIN untouched", partial?.summary?.filled === 2 && st.mobile === "9000000501" && st.email === "standin.pmegp@test.local" && st.taluka === "" && st.pin === "", JSON.stringify(partial?.summary));
    check("Fill dispatches input/change events only; no submit, no click, no navigation", st.w.submit === 0 && st.w.clicks === 0 && st.w.sameUrl && st.w.input >= 2 && st.w.change >= 2, JSON.stringify(st.w));
    const replay = await fill(tabId, nonce, res.previewId, [id(LABEL.taluka)]);
    check("Replayed preview → NO_PREVIEW, nothing filled", replay?.code === "NO_PREVIEW" && (await pageState()).taluka === "");
    const stale = await send(tabId, { type: "MC_PREVIEW", v: V, nonce: "0123456789abcdef0123456789abcdef", fields: tree() });
    check("Wrong page nonce → STALE_PAGE", stale?.code === "STALE_PAGE");

    // ── Expired preview ──
    ({ tabId, nonce, res } = await preview());
    await inContentScript(`(() => { const real = Date.now.bind(Date); Date.__real = real; Date.now = () => real() + 6 * 60 * 1000; return true; })()`);
    const expired = await fill(tabId, nonce, res.previewId, [id(LABEL.taluka), id(LABEL.pin)]);
    await inContentScript(`(() => { Date.now = Date.__real; delete Date.__real; return true; })()`);
    st = await pageState();
    check("Preview older than five minutes → PREVIEW_EXPIRED, nothing filled", expired?.code === "PREVIEW_EXPIRED" && st.taluka === "" && st.pin === "", JSON.stringify(expired));

    // ── Revalidation immediately before filling ──
    ({ tabId, nonce, res } = await preview());
    check("Re-preview flags already-filled fields as replacing current values", byLabel(res, LABEL.mobile)?.hasValue === true && byLabel(res, LABEL.taluka)?.hasValue === false);
    await evaluate(
      page.sessionId,
      `document.querySelector('label[for="ux_communication_taluk_block"]').textContent = "Village"; document.getElementById("ux_communication_pin").disabled = true;
       document.getElementById("ux_communication_emailId").closest("div").hidden = true; true`
    );
    const changed = await fill(tabId, nonce, res.previewId, [id(LABEL.taluka), id(LABEL.pin), id(LABEL.mobile), id(LABEL.email)]);
    const reason = (label) => changed?.results?.find((r) => r.id === id(label))?.reason ?? null;
    st = await pageState();
    check(
      "Changed after preview: relabelled → form_changed, disabled → locked, hidden → hidden; unchanged mobile still filled",
      reason(LABEL.taluka) === "form_changed" && reason(LABEL.pin) === "locked" && reason(LABEL.email) === "hidden" && changed.summary.filled === 1 && st.taluka === "" && st.pin === "",
      JSON.stringify(changed?.results)
    );
    await navigate(page.sessionId, `${site.origin}${PATH}`);
    await watch();

    // ── Dynamic form changes ──
    await evaluate(page.sessionId, `document.getElementById("ux_communication_mobileNo").closest("div").hidden = true; true`);
    ({ tabId, nonce, res } = await preview());
    check("Field hidden by the page before preview is left out (three rows ready)", !byLabel(res, LABEL.mobile) && items(res).filter((i) => i.status === "ready").length === 3 && res.summary.hiddenSkipped > 0);
    await evaluate(page.sessionId, `document.getElementById("ux_communication_mobileNo").closest("div").hidden = false; true`);
    ({ tabId, nonce, res } = await preview());
    check("Shown again → offered again on a fresh preview", byLabel(res, LABEL.mobile)?.status === "ready");

    // ── Missing and invalid applicant data ──
    ({ res } = await preview(tree({ contact: { mobile: MISSING, email: INVALID } })));
    check("Missing mobile → missing; invalid email → invalid; neither offered", byLabel(res, LABEL.mobile)?.status === "missing" && byLabel(res, LABEL.email)?.status === "invalid");
    ({ res } = await preview(tree({ contact: { mobile: leaf("+91 90000 00501"), email: leaf("not-an-email") }, corr: { tehsil: leaf("Standin Taluka Extra Long"), pincode: leaf("4110055") } })));
    check(
      "Over-long taluka (maxlength 20), PIN (6) and mobile with country code (10) → too_long; malformed email → incompatible",
      byLabel(res, LABEL.taluka)?.status === "too_long" && byLabel(res, LABEL.pin)?.status === "too_long" && byLabel(res, LABEL.mobile)?.status === "too_long" && byLabel(res, LABEL.email)?.status === "incompatible",
      JSON.stringify([LABEL.taluka, LABEL.pin, LABEL.mobile, LABEL.email].map((l) => byLabel(res, l)?.status))
    );

    // ── Full approved fill ──
    ({ tabId, nonce, res } = await preview());
    const all = await fill(tabId, nonce, res.previewId, items(res).filter((i) => i.status === "ready").map((i) => i.id));
    st = await pageState();
    check(
      "Approved fill writes all four mapped fields exactly",
      all?.summary?.filled === 4 && st.taluka === "Standin Taluka" && st.pin === "411005" && st.mobile === "9000000501" && st.email === "standin.pmegp@test.local",
      JSON.stringify({ summary: all?.summary, taluka: st.taluka, pin: st.pin })
    );
    check("Unmapped look-alikes untouched (secondary mobile, unit PIN, unit address); every list still on its first option", st.mobile2 === "" && st.unitPin === "" && st.unitAddress === "" && st.selects.every((i) => i === 0));
    check("Every protected control is still empty or unticked", st.protectedValues.length > 0 && st.protectedValues.every((v) => v === "" || v === false), JSON.stringify(st.protectedValues));
    check(
      "Every control other than the four mapped fields is exactly as the page loaded it",
      st.others.length === initial.others.length && st.others.length > 90 && JSON.stringify(st.others) === JSON.stringify(initial.others),
      `${st.others.length} controls`
    );
    check("No submit, no click, no navigation during any fill", st.w.submit === 0 && st.w.clicks === 0 && st.w.sameUrl, JSON.stringify(st.w));

    // ── Leakage, storage, network ──
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
    const fixtureText = fs.readdirSync(path.join(extRoot, "tests", "fixtures", "adapters", "pmegp-application")).map((f) => read(path.join("tests", "fixtures", "adapters", "pmegp-application", f))).join("\n");
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

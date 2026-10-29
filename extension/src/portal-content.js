// Portal content script — injected only on the pages listed in the manifest content_scripts.
// Loaded after src/engine/*.js and any adapter files. State lives in this closure only and is
// never persisted. On a registry portal whose adapter is not registered (filling off), it
// answers detection with the registry status and nothing else: no form is read or filled.
// A supervised adapter (registry status supervised_verification_only) never fills through the
// normal preview; it answers only the trial messages, for exactly the fields its trial declares.
// It never submits forms, clicks buttons, solves CAPTCHA, enters OTPs, accepts declarations,
// uploads files or makes payments.
(() => {
  "use strict";
  const E = globalThis.MCEngine;
  if (!E?.dom || !E.protocol || !E.adapters || !E.registry) return;
  const adapter = E.adapters.forOrigin(globalThis.location?.origin);
  const pending = adapter ? null : E.registry.identify(globalThis.location?.origin);
  if (!adapter && !pending) return;

  const P = E.protocol;
  const PREVIEW_TTL_MS = 5 * 60 * 1000;
  const TRIAL_TTL_MS = 2 * 60 * 1000;
  const SETTLE_MS = 400;
  const hex = (bytes) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const nonce = hex(16);
  const trial = E.adapters.trialFor(adapter);
  let plan = null; // { previewId, createdAt, items, signatures, refs }
  let trialPlan = null; // { previewId, createdAt, items, signatures, refs, fingerprint }

  // A preview's applicant values leave this page's memory as soon as it can no longer be used;
  // only its id stays, so a late fill still gets PREVIEW_EXPIRED.
  function dropWhenExpired(previewId, ttlMs) {
    setTimeout(() => {
      if (plan?.previewId === previewId) plan = { previewId, expired: true };
      if (trialPlan?.previewId === previewId) trialPlan = { previewId, expired: true };
    }, ttlMs + 1000);
  }

  function matchedForm() {
    return adapter ? E.adapters.matchForm(adapter, E.dom.pageInfo(document, location)) : null;
  }

  function currentForm() {
    return trial ? null : matchedForm();
  }

  function trialForm() {
    const form = trial ? matchedForm() : null;
    return form && form.id === trial.form ? form : null;
  }

  function detection() {
    const form = currentForm();
    const portal = adapter ? E.adapters.portalFor(adapter) : { id: pending.id, name: pending.service, category: pending.category, status: pending.status };
    return {
      type: P.T.DETECTION,
      v: E.core.PROTOCOL_VERSION,
      nonce,
      portal: { id: portal.id, name: portal.name, category: portal.category, status: portal.status },
      form: form ? { id: form.id, name: form.name } : null,
      fieldCount: form ? Math.min(E.dom.discover(document).descriptors.length, 2000) : 0,
      formFilling: form ? "available" : "unavailable",
    };
  }

  function preview(fields) {
    const form = currentForm();
    if (!form) return P.createError("FORM_NOT_RECOGNISED");
    trialPlan = null;
    const { descriptors, refs } = E.dom.discover(document);
    const { overrides, protectedIds } = E.dom.resolveAdapterForm(form, document, refs);
    const built = E.preview.buildPlan({ descriptors, form, overrides, protectedIds, fields });
    const signatures = {};
    for (const d of descriptors) signatures[d.id] = d.signature;
    plan = { previewId: hex(16), createdAt: Date.now(), items: built.items, signatures, refs };
    dropWhenExpired(plan.previewId, PREVIEW_TTL_MS);
    return {
      type: P.T.PREVIEW_RESULT,
      v: E.core.PROTOCOL_VERSION,
      nonce,
      previewId: plan.previewId,
      form: { id: form.id, name: form.name },
      items: built.items.slice(0, 500).map(E.preview.publicItem),
      summary: built.summary,
    };
  }

  async function fill(msg) {
    if (!plan || plan.previewId !== msg.previewId) return P.createError("NO_PREVIEW");
    const current = plan;
    plan = null; // single use: a new preview is required for another fill
    if (current.expired || Date.now() - current.createdAt > PREVIEW_TTL_MS) return P.createError("PREVIEW_EXPIRED");
    const { results, summary } = await E.dom.fill(current, current.refs, msg.approved);
    return { type: P.T.FILL_RESULT, v: E.core.PROTOCOL_VERSION, nonce, results, summary };
  }

  // ── Supervised verification trial ───────────────────────────────
  function trialMeta(form) {
    return {
      adapterId: adapter.id,
      adapterVersion: trial.adapterVersion,
      origin: location.origin,
      form: { id: form.id, name: form.name },
      fields: trial.fields.map((t) => ({ selector: t.selector, key: t.key, keyLabel: E.core.labelForPath(t.key) })),
    };
  }

  /** Each trial field against the facts its captures recorded, plus a structure fingerprint (no values). */
  function inspectTrial(form) {
    const { descriptors, refs } = E.dom.discover(document);
    const { overrides, protectedIds } = E.dom.resolveAdapterForm(form, document, refs);
    const byId = new Map(descriptors.map((d) => [d.id, d]));
    const checks = trial.fields.map((t) => {
      const n = E.dom.matchCount(document, t.selector);
      if (n > 1) return { t, id: null, check: "ambiguous" };
      const id = n === 1 ? Object.keys(overrides).find((k) => overrides[k].key === t.key) || null : null;
      const d = id ? byId.get(id) : null;
      if (!d) return { t, id: null, check: "absent" };
      const same = d.tag === t.tag && (d.type ?? null) === t.type && d.maxLength === t.maxLength && E.core.normalize(d.label) === E.core.normalize(t.label);
      if (!same) return { t, id, d, check: "changed" };
      if (protectedIds.includes(id) || E.classify.protection(d)) return { t, id, d, check: "protected" };
      if (!d.visible) return { t, id, d, check: "hidden" };
      if (d.disabled) return { t, id, d, check: "disabled" };
      if (d.readOnly) return { t, id, d, check: "read_only" };
      return { t, id, d, check: "ok" };
    });
    const state = checks.map((c) => `${c.t.selector}=${c.check}:${c.id || ""}`);
    const fingerprint = [location.href, ...descriptors.map((d) => d.signature), ...state].join("\n");
    return { checks, descriptors, refs, overrides, protectedIds, fingerprint };
  }

  function trialPreview(fields) {
    const form = trialForm();
    if (!form) return P.createError("FORM_NOT_RECOGNISED");
    plan = null;
    trialPlan = null;
    const seen = inspectTrial(form);
    const ok = seen.checks.filter((c) => c.check === "ok");
    const overrides = Object.fromEntries(ok.map((c) => [c.id, seen.overrides[c.id]]));
    const built = E.preview.buildPlan({ descriptors: ok.map((c) => c.d), form, overrides, protectedIds: [], fields });
    const items = new Map(built.items.map((i) => [i.id, i]));
    const signatures = {};
    for (const c of ok) signatures[c.id] = c.d.signature;
    trialPlan = { previewId: hex(16), createdAt: Date.now(), items: built.items, signatures, refs: seen.refs, fingerprint: seen.fingerprint };
    dropWhenExpired(trialPlan.previewId, TRIAL_TTL_MS);
    return {
      type: P.T.TRIAL_PREVIEW_RESULT,
      v: E.core.PROTOCOL_VERSION,
      nonce,
      previewId: trialPlan.previewId,
      ttlMs: TRIAL_TTL_MS,
      trial: trialMeta(form),
      fields: seen.checks.map((c) => {
        const it = c.check === "ok" ? items.get(c.id) : null;
        const status = it ? it.status : "rejected";
        return {
          id: c.id,
          selector: c.t.selector,
          key: c.t.key,
          keyLabel: E.core.labelForPath(c.t.key),
          label: c.t.label,
          check: c.check,
          status,
          display: status === "ready" ? it.display : null,
          hasValue: !!c.d?.hasValue,
        };
      }),
    };
  }

  const settle = (ms) => new Promise((r) => setTimeout(r, ms));

  async function trialFill(msg) {
    if (!trialPlan || trialPlan.previewId !== msg.previewId) return P.createError("NO_PREVIEW");
    const current = trialPlan;
    trialPlan = null; // single use: a fresh preview is required for another trial
    if (current.expired || Date.now() - current.createdAt > TRIAL_TTL_MS) return P.createError("PREVIEW_EXPIRED");
    const ready = new Set(current.items.filter((i) => i.status === "ready").map((i) => i.id));
    if (!msg.approved.every((id) => ready.has(id))) return P.createError("BAD_REQUEST");
    const approved = new Set(msg.approved);
    const form = trialForm();
    const before = form ? inspectTrial(form) : null;
    const unchanged = !!before && before.fingerprint === current.fingerprint;
    let results = msg.approved.map((id) => ({ id, status: "skipped", reason: "form_changed" }));
    let after = before;
    if (unchanged) {
      ({ results } = await E.dom.fill(current, current.refs, msg.approved));
      await settle(SETTLE_MS);
      const formAfter = trialForm();
      after = formAfter ? inspectTrial(formAfter) : null;
    }
    const pageChanged = !unchanged || !after || after.fingerprint !== current.fingerprint;
    const status = new Map(results.map((r) => [r.id, r.status]));
    const itemFor = (id) => current.items.find((i) => i.id === id);
    const fields = trial.fields.map((t, n) => {
      const pre = before?.checks[n];
      const post = after?.checks[n];
      const id = pre?.id || null;
      const editable = pre?.check === "ok" && post?.check === "ok" && post.id === id;
      const isApproved = !!id && approved.has(id);
      const filled = isApproved && editable && status.get(id) === "filled" && E.dom.holds(itemFor(id), current.refs.get(id));
      return { selector: t.selector, key: t.key, editable, approved: isApproved, filled };
    });
    const passed = !pageChanged && fields.every((f) => f.editable && f.approved && f.filled);
    const count = (s) => results.filter((r) => r.status === s).length;
    return {
      type: P.T.TRIAL_FILL_RESULT,
      v: E.core.PROTOCOL_VERSION,
      nonce,
      results,
      summary: { filled: count("filled"), skipped: count("skipped"), failed: count("failed") },
      evidence: { adapterId: adapter.id, adapterVersion: trial.adapterVersion, origin: location.origin, form: trial.form, fields, pageChanged, passed },
    };
  }

  function trialInfo() {
    const form = trialForm();
    return { type: P.T.TRIAL_INFO, v: E.core.PROTOCOL_VERSION, nonce, trial: form ? trialMeta(form) : null };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Only this extension's own pages (popup) — never other extensions, tabs or web pages.
    if (!sender || sender.id !== chrome.runtime.id || sender.tab) return false;
    if (P.isDetectRequest(message)) {
      sendResponse(detection());
      return false;
    }
    if (P.isTrialDetectRequest(message)) {
      sendResponse(trialInfo());
      return false;
    }
    const known = P.isPreviewRequest(message) || P.isFillRequest(message) || P.isDiscardRequest(message) || P.isTrialPreviewRequest(message) || P.isTrialFillRequest(message);
    if (!known) return false;
    if (message.nonce !== nonce) {
      sendResponse(P.createError("STALE_PAGE"));
      return false;
    }
    if (P.isPreviewRequest(message)) {
      sendResponse(preview(message.fields));
      return false;
    }
    if (P.isTrialPreviewRequest(message)) {
      sendResponse(trialPreview(message.fields));
      return false;
    }
    if (P.isDiscardRequest(message)) {
      plan = null;
      trialPlan = null;
      sendResponse({ type: P.T.DISCARD, v: E.core.PROTOCOL_VERSION, nonce });
      return false;
    }
    const run = P.isTrialFillRequest(message) ? trialFill(message) : fill(message);
    run.then(sendResponse, () => sendResponse(P.createError("BAD_REQUEST")));
    return true;
  });
})();

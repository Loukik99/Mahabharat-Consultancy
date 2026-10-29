// Popup ↔ portal content-script protocol. Every message is validated on receipt with exact
// keys, types and size limits. Filling requires a preview id issued by the content script
// plus an explicit `confirmed: true` from the popup's approval step.
(function (root) {
  "use strict";
  const MC = root.MCEngine || (root.MCEngine = {});
  if (MC.protocol) return;
  const V = MC.core.PROTOCOL_VERSION;
  const { STATUSES, PUBLIC_KEYS } = MC.preview;

  const T = Object.freeze({
    DETECT: "MC_DETECT",
    DETECTION: "MC_DETECTION",
    PREVIEW: "MC_PREVIEW",
    PREVIEW_RESULT: "MC_PREVIEW_RESULT",
    FILL: "MC_FILL",
    FILL_RESULT: "MC_FILL_RESULT",
    DISCARD: "MC_DISCARD",
    ERROR: "MC_ERROR",
    // Supervised verification trial (supervised_verification_only adapters only).
    TRIAL_DETECT: "MC_TRIAL_DETECT",
    TRIAL_INFO: "MC_TRIAL_INFO",
    TRIAL_PREVIEW: "MC_TRIAL_PREVIEW",
    TRIAL_PREVIEW_RESULT: "MC_TRIAL_PREVIEW_RESULT",
    TRIAL_FILL: "MC_TRIAL_FILL",
    TRIAL_FILL_RESULT: "MC_TRIAL_FILL_RESULT",
  });
  const ERROR_CODES = Object.freeze(["STALE_PAGE", "FORM_NOT_RECOGNISED", "NO_PREVIEW", "PREVIEW_EXPIRED", "BAD_REQUEST"]);
  const FILL_STATUSES = Object.freeze(["filled", "skipped", "failed"]);
  // Outcome of checking one trial field against the facts its captures recorded. Only "ok" may be filled.
  const TRIAL_CHECKS = Object.freeze(["ok", "absent", "ambiguous", "changed", "protected", "hidden", "disabled", "read_only"]);
  const TRIAL_MAX_FIELDS = 10;
  const TRIAL_MAX_TTL_MS = 10 * 60 * 1000;
  const HEX32 = /^[a-f0-9]{32}$/;
  const ITEM_ID = /^f\d{1,4}$/;
  const MAX_FIELDS_JSON = 60000;
  const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  const TRIAL_ORIGIN = /^(https:\/\/[a-z0-9.-]+|http:\/\/(127\.0\.0\.1|localhost):\d{2,5})$/;
  const FIELD_KEY = /^[A-Za-z.]{1,60}$/;

  const isPlainObject = (v) => Object.prototype.toString.call(v) === "[object Object]" && !Array.isArray(v);
  const hasExactKeys = (o, keys) => {
    const actual = Object.keys(o);
    return actual.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(o, k));
  };
  const str = (v, max) => typeof v === "string" && v.length <= max;
  const optStr = (v, max) => v === null || str(v, max);
  const int = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
  const envelope = (m, type, keys) => isPlainObject(m) && hasExactKeys(m, ["type", "v", ...keys]) && m.type === type && m.v === V;

  function isLeaf(n) {
    if (!isPlainObject(n) || !hasExactKeys(n, ["status", "value"])) return false;
    if (n.status === "available") return (typeof n.value === "string" && n.value.length <= 300) || (typeof n.value === "number" && Number.isFinite(n.value));
    return (n.status === "missing" || n.status === "invalid") && n.value === null;
  }

  function isFieldTree(node, depth = 0) {
    if (depth > 4) return false;
    if (Array.isArray(node)) return node.length <= 10 && node.every((x) => isFieldTree(x, depth + 1));
    if (!isPlainObject(node)) return false;
    if ("status" in node) return isLeaf(node);
    const keys = Object.keys(node);
    return keys.length <= 40 && keys.every((k) => /^[A-Za-z]{1,40}$/.test(k) && isFieldTree(node[k], depth + 1));
  }

  function isPublicItem(i) {
    return (
      isPlainObject(i) && hasExactKeys(i, PUBLIC_KEYS) && ITEM_ID.test(i.id) && str(i.label, 80) && str(i.kind, 20) &&
      typeof i.required === "boolean" && optStr(i.keyLabel, 80) && typeof i.confidence === "number" && i.confidence >= 0 && i.confidence <= 1 &&
      STATUSES.includes(i.status) && optStr(i.reason, 40) && optStr(i.display, 300) && typeof i.hasValue === "boolean"
    );
  }

  const isPortal = (p) => isPlainObject(p) && hasExactKeys(p, ["id", "name", "category", "status"]) && str(p.id, 40) && str(p.name, 80) && str(p.category, 40) && str(p.status, 40);
  const isForm = (f) => f === null || (isPlainObject(f) && hasExactKeys(f, ["id", "name"]) && str(f.id, 40) && str(f.name, 80));

  const createDetect = () => ({ type: T.DETECT, v: V });
  const isDetectRequest = (m) => envelope(m, T.DETECT, []);
  const isDetection = (m) =>
    envelope(m, T.DETECTION, ["nonce", "portal", "form", "fieldCount", "formFilling"]) && HEX32.test(m.nonce) && isPortal(m.portal) &&
    isForm(m.form) && int(m.fieldCount, 2000) && (m.formFilling === "available" || m.formFilling === "unavailable");

  const createPreview = (nonce, fields) => ({ type: T.PREVIEW, v: V, nonce, fields });
  const isPreviewRequest = (m) => {
    if (!envelope(m, T.PREVIEW, ["nonce", "fields"]) || !HEX32.test(m.nonce) || !isFieldTree(m.fields)) return false;
    return JSON.stringify(m.fields).length <= MAX_FIELDS_JSON;
  };
  const isPreviewResult = (m) =>
    envelope(m, T.PREVIEW_RESULT, ["nonce", "previewId", "form", "items", "summary"]) && HEX32.test(m.nonce) && HEX32.test(m.previewId) &&
    isForm(m.form) && m.form !== null && Array.isArray(m.items) && m.items.length <= 500 && m.items.every(isPublicItem) &&
    isPlainObject(m.summary) && hasExactKeys(m.summary, ["total", "ready", "byStatus", "requiredNotReady", "hiddenSkipped"]) &&
    int(m.summary.total, 500) && int(m.summary.ready, 500) && int(m.summary.hiddenSkipped, 2000) && isPlainObject(m.summary.byStatus) &&
    Object.entries(m.summary.byStatus).every(([k, n]) => STATUSES.includes(k) && int(n, 500)) &&
    Array.isArray(m.summary.requiredNotReady) && m.summary.requiredNotReady.length <= 50 && m.summary.requiredNotReady.every((s) => str(s, 80));

  const createFill = (nonce, previewId, approved) => ({ type: T.FILL, v: V, nonce, previewId, approved: [...approved], confirmed: true });
  const isFillRequest = (m) =>
    envelope(m, T.FILL, ["nonce", "previewId", "approved", "confirmed"]) && HEX32.test(m.nonce) && HEX32.test(m.previewId) &&
    m.confirmed === true && Array.isArray(m.approved) && m.approved.length >= 1 && m.approved.length <= 500 &&
    m.approved.every((id) => typeof id === "string" && ITEM_ID.test(id)) && new Set(m.approved).size === m.approved.length;
  const isFillResult = (m) =>
    envelope(m, T.FILL_RESULT, ["nonce", "results", "summary"]) && HEX32.test(m.nonce) && Array.isArray(m.results) && m.results.length <= 500 &&
    m.results.every((r) => isPlainObject(r) && hasExactKeys(r, ["id", "status", "reason"]) && ITEM_ID.test(r.id) && FILL_STATUSES.includes(r.status) && optStr(r.reason, 40)) &&
    isPlainObject(m.summary) && hasExactKeys(m.summary, ["filled", "skipped", "failed"]) && int(m.summary.filled, 500) && int(m.summary.skipped, 500) && int(m.summary.failed, 500);

  const createDiscard = (nonce) => ({ type: T.DISCARD, v: V, nonce });
  const isDiscardRequest = (m) => envelope(m, T.DISCARD, ["nonce"]) && HEX32.test(m.nonce);
  const createError = (code) => ({ type: T.ERROR, v: V, code });
  const isError = (m) => envelope(m, T.ERROR, ["code"]) && ERROR_CODES.includes(m.code);

  // ── Supervised verification trial ───────────────────────────────
  // Metadata only: adapter, origin, form and field identifiers. Never applicant values.
  const isTrialField = (f) => isPlainObject(f) && hasExactKeys(f, ["selector", "key", "keyLabel"]) && str(f.selector, 120) && f.selector.length > 0 && FIELD_KEY.test(f.key) && str(f.keyLabel, 80);
  const isTrialMeta = (t) =>
    isPlainObject(t) && hasExactKeys(t, ["adapterId", "adapterVersion", "origin", "form", "fields"]) && /^[a-z0-9-]{2,40}$/.test(t.adapterId) &&
    VERSION.test(t.adapterVersion) && TRIAL_ORIGIN.test(t.origin) && isForm(t.form) && t.form !== null &&
    Array.isArray(t.fields) && t.fields.length >= 1 && t.fields.length <= TRIAL_MAX_FIELDS && t.fields.every(isTrialField) && new Set(t.fields.map((f) => f.selector)).size === t.fields.length;

  const createTrialDetect = () => ({ type: T.TRIAL_DETECT, v: V });
  const isTrialDetectRequest = (m) => envelope(m, T.TRIAL_DETECT, []);
  const isTrialInfo = (m) => envelope(m, T.TRIAL_INFO, ["nonce", "trial"]) && HEX32.test(m.nonce) && (m.trial === null || isTrialMeta(m.trial));

  const createTrialPreview = (nonce, fields) => ({ type: T.TRIAL_PREVIEW, v: V, nonce, fields });
  const isTrialPreviewRequest = (m) => envelope(m, T.TRIAL_PREVIEW, ["nonce", "fields"]) && HEX32.test(m.nonce) && isFieldTree(m.fields) && JSON.stringify(m.fields).length <= MAX_FIELDS_JSON;
  const isTrialItem = (i, f) =>
    isPlainObject(i) && hasExactKeys(i, ["id", "selector", "key", "keyLabel", "label", "check", "status", "display", "hasValue"]) &&
    i.selector === f.selector && i.key === f.key && i.keyLabel === f.keyLabel && str(i.label, 200) && TRIAL_CHECKS.includes(i.check) &&
    (i.id === null ? i.check === "absent" || i.check === "ambiguous" : ITEM_ID.test(i.id)) &&
    (i.check === "ok" ? STATUSES.includes(i.status) : i.status === "rejected") &&
    (i.status === "ready" ? str(i.display, 300) : i.display === null) && typeof i.hasValue === "boolean";
  const isTrialPreviewResult = (m) =>
    envelope(m, T.TRIAL_PREVIEW_RESULT, ["nonce", "previewId", "ttlMs", "trial", "fields"]) && HEX32.test(m.nonce) && HEX32.test(m.previewId) &&
    Number.isInteger(m.ttlMs) && m.ttlMs > 0 && m.ttlMs <= TRIAL_MAX_TTL_MS && isTrialMeta(m.trial) &&
    Array.isArray(m.fields) && m.fields.length === m.trial.fields.length && m.fields.every((i, n) => isTrialItem(i, m.trial.fields[n])) &&
    new Set(m.fields.filter((i) => i.id).map((i) => i.id)).size === m.fields.filter((i) => i.id).length;

  const createTrialFill = (nonce, previewId, approved) => ({ type: T.TRIAL_FILL, v: V, nonce, previewId, approved: [...approved], confirmed: true });
  const isTrialFillRequest = (m) =>
    envelope(m, T.TRIAL_FILL, ["nonce", "previewId", "approved", "confirmed"]) && HEX32.test(m.nonce) && HEX32.test(m.previewId) &&
    m.confirmed === true && Array.isArray(m.approved) && m.approved.length >= 1 && m.approved.length <= TRIAL_MAX_FIELDS &&
    m.approved.every((id) => typeof id === "string" && ITEM_ID.test(id)) && new Set(m.approved).size === m.approved.length;
  const isEvidenceField = (f) =>
    isPlainObject(f) && hasExactKeys(f, ["selector", "key", "editable", "approved", "filled"]) && str(f.selector, 120) && FIELD_KEY.test(f.key) &&
    typeof f.editable === "boolean" && typeof f.approved === "boolean" && typeof f.filled === "boolean" && (!f.filled || (f.approved && f.editable));
  const isTrialEvidence = (e) =>
    isPlainObject(e) && hasExactKeys(e, ["adapterId", "adapterVersion", "origin", "form", "fields", "pageChanged", "passed"]) && /^[a-z0-9-]{2,40}$/.test(e.adapterId) &&
    VERSION.test(e.adapterVersion) && TRIAL_ORIGIN.test(e.origin) && /^[a-z0-9-]{2,40}$/.test(e.form) && typeof e.pageChanged === "boolean" &&
    Array.isArray(e.fields) && e.fields.length >= 1 && e.fields.length <= TRIAL_MAX_FIELDS && e.fields.every(isEvidenceField) &&
    e.passed === (!e.pageChanged && e.fields.every((f) => f.editable && f.approved && f.filled));
  const isTrialFillResult = (m) =>
    envelope(m, T.TRIAL_FILL_RESULT, ["nonce", "results", "summary", "evidence"]) && HEX32.test(m.nonce) && Array.isArray(m.results) && m.results.length <= TRIAL_MAX_FIELDS &&
    m.results.every((r) => isPlainObject(r) && hasExactKeys(r, ["id", "status", "reason"]) && ITEM_ID.test(r.id) && FILL_STATUSES.includes(r.status) && optStr(r.reason, 40)) &&
    isPlainObject(m.summary) && hasExactKeys(m.summary, ["filled", "skipped", "failed"]) && int(m.summary.filled, 10) && int(m.summary.skipped, 10) && int(m.summary.failed, 10) &&
    isTrialEvidence(m.evidence);

  MC.protocol = Object.freeze({
    T, ERROR_CODES, FILL_STATUSES, TRIAL_CHECKS, isFieldTree, isPublicItem,
    createDetect, isDetectRequest, isDetection,
    createPreview, isPreviewRequest, isPreviewResult,
    createFill, isFillRequest, isFillResult,
    createDiscard, isDiscardRequest, createError, isError,
    isTrialMeta, createTrialDetect, isTrialDetectRequest, isTrialInfo,
    createTrialPreview, isTrialPreviewRequest, isTrialPreviewResult,
    createTrialFill, isTrialFillRequest, isTrialFillResult, isTrialEvidence,
  });
})(globalThis);

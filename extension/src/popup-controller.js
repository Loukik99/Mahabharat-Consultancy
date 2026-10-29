import "./engine/core.js";
import "./engine/registry.js";
import "./engine/adapters.js";
import "./engine/classify.js";
import "./engine/values.js";
import "./engine/preview.js";
import "./engine/protocol.js";
import { ExtensionApiError } from "./api.js";
import { createPing, isValidPong, isValidRequestId } from "./messages.js";

const E = globalThis.MCEngine;

// View-state logic for the popup, kept free of DOM and chrome.* so it can be tested in Node.
// Messages are fixed strings keyed by error code — server responses are never displayed.
const NOT_AVAILABLE = "Request not found or not available to your account.";
const MESSAGES = {
  AUTH_REQUIRED: "Not signed in. Sign in on the Mahabharat website in this browser, then reopen this popup.",
  FORBIDDEN: NOT_AVAILABLE,
  NOT_FOUND: NOT_AVAILABLE,
  REQUEST_CLOSED: "This request is closed. Autofill data is only available for open requests.",
  RATE_LIMITED: "Too many requests. Please wait a minute and try again.",
  NETWORK: "Could not reach the Mahabharat server. Check your connection.",
  SERVER: "The Mahabharat server had a problem. Try again later.",
  BAD_RESPONSE: "Unexpected response from the server.",
  UNTRUSTED_ORIGIN: "That address is not a trusted Mahabharat server.",
  INVALID_REQUEST_ID: "Enter a valid request ID (24 characters, 0-9 and a-f).",
  HTTP: "The request failed.",
};
const PAGE_ERRORS = {
  STALE_PAGE: "The page changed or reloaded. Preview again.",
  FORM_NOT_RECOGNISED: "This page is not a supported form.",
  NO_PREVIEW: "Preview again before filling.",
  PREVIEW_EXPIRED: "The preview expired. Preview again before filling.",
  BAD_REQUEST: "The page rejected the request.",
};

export function errorMessage(err) {
  const code = err instanceof ExtensionApiError ? err.code : "UNKNOWN";
  return MESSAGES[code] || "Something went wrong.";
}

const failureState = (e) => ({ state: e?.code === "AUTH_REQUIRED" ? "signed_out" : "error", message: errorMessage(e) });

export async function checkConnection(api) {
  try {
    return { state: "connected", user: await api.getSession() };
  } catch (e) {
    return failureState(e);
  }
}

export async function loadRequests(api) {
  try {
    const requests = await api.listOpenRequests();
    return requests.length ? { state: "ready", requests } : { state: "empty", requests: [] };
  } catch (e) {
    return { ...failureState(e), requests: [] };
  }
}

export async function checkReadiness(api, requestId) {
  const id = String(requestId || "").trim();
  if (!isValidRequestId(id)) {
    return { state: "error", message: errorMessage(new ExtensionApiError("INVALID_REQUEST_ID")) };
  }
  try {
    return { state: "ready", summary: await api.getAutofillReadiness(id) };
  } catch (e) {
    return failureState(e);
  }
}

/**
 * Identify the active tab: a Mahabharat page (ping), a portal with a registered adapter
 * (detection), or neither. Content scripts only exist on those origins, so silence = inactive.
 */
export async function probePage(sendToActiveTab) {
  try {
    if (isValidPong(await sendToActiveTab(createPing()))) return { state: "app_page" };
  } catch {
    /* not a Mahabharat page */
  }
  try {
    const det = await sendToActiveTab(E.protocol.createDetect());
    if (E.protocol.isDetection(det)) return { state: "portal", detection: det, trial: await probeTrial(sendToActiveTab, det.nonce) };
  } catch {
    /* no portal content script */
  }
  return { state: "inactive" };
}

/** Trial metadata from a page whose adapter is supervised_verification_only, else null. */
async function probeTrial(sendToActiveTab, nonce) {
  try {
    const info = await sendToActiveTab(E.protocol.createTrialDetect());
    return E.protocol.isTrialInfo(info) && info.nonce === nonce ? info.trial : null;
  } catch {
    return null;
  }
}

/** Fetch applicant values (memory only) and ask the portal page for a preview. Nothing is filled. */
export async function preparePreview(api, sendToActiveTab, requestId, nonce) {
  const id = String(requestId || "").trim();
  if (!isValidRequestId(id)) return { state: "error", message: errorMessage(new ExtensionApiError("INVALID_REQUEST_ID")) };
  let data;
  try {
    data = await api.getAutofillData(id);
  } catch (e) {
    return failureState(e);
  }
  let res = null;
  try {
    res = await sendToActiveTab(E.protocol.createPreview(nonce, data.fields));
  } catch {
    res = null;
  }
  if (E.protocol.isError(res)) return { state: "error", message: PAGE_ERRORS[res.code] };
  if (!E.protocol.isPreviewResult(res) || res.nonce !== nonce) {
    return { state: "error", message: "The page did not return a preview. Reload the page and try again." };
  }
  return { state: "preview", preview: res, requestNumber: data.requestNumber };
}

/** Fill only after explicit confirmation, only the approved preview items. */
export async function fillApproved(sendToActiveTab, { nonce, previewId, approved, confirmed }) {
  if (confirmed !== true) return { state: "error", message: "Tick the confirmation box after reviewing the values." };
  if (!Array.isArray(approved) || !approved.length) return { state: "error", message: "Select at least one field to fill." };
  let res = null;
  try {
    res = await sendToActiveTab(E.protocol.createFill(nonce, previewId, approved));
  } catch {
    res = null;
  }
  if (E.protocol.isError(res)) return { state: "error", message: PAGE_ERRORS[res.code] };
  if (!E.protocol.isFillResult(res) || res.nonce !== nonce) {
    return { state: "error", message: "The page did not confirm the fill. Check the form before continuing." };
  }
  return { state: "filled", result: res };
}

export function describeReadiness(s) {
  const head = [s.requestNumber, s.serviceName].filter(Boolean).join(" · ");
  const profile = s.profileFound ? "" : " No applicant profile saved yet.";
  return `${head}: ${s.available} values available, ${s.missing} missing, ${s.invalid} need correction.${profile}`;
}

/** Human labels for missing / invalid applicant paths (no values). */
export function describeGaps(s) {
  const label = (p) => E.core.labelForPath(p);
  return { missing: (s.missingKeys || []).map(label), invalid: (s.invalidKeys || []).map(label) };
}

export function describePortal(det, trial = null) {
  const canPreview = det.formFilling === "available" && !!det.form;
  const pending = det.portal.status === E.registry.STATUS.ADAPTER_PENDING;
  if (trial && !canPreview) {
    return {
      portal: det.portal.name,
      status: E.registry.STATUS_LABELS[det.portal.status] || det.portal.status,
      form: `${trial.form.name} (supervised verification trial only)`,
      canPreview: false,
      pageStatus: "Normal filling is off on this page. You can run a supervised verification trial of the fields listed below, once, after reviewing them.",
    };
  }
  return {
    portal: det.portal.name,
    status: E.registry.STATUS_LABELS[det.portal.status] || det.portal.status,
    form: det.form ? det.form.name : pending ? "Filling is off for this portal" : "Form not recognised on this page",
    canPreview,
    pageStatus: canPreview
      ? "Supported form detected."
      : pending
        ? det.portal.id === "gst"
          ? "Portal detected. Filling stays off until this form has been checked after you continue past this page yourself and on the live page."
          : "Portal detected. Filling stays off until this form has been checked after Aadhaar validation and on the live page."
        : "Portal detected, but this page is not a supported form.",
  };
}

// ── Supervised verification trial ─────────────────────────────────
export const TRIAL_RECORD_KIND = "supervised-trial";
export const TRIAL_RECORD_VERSION = 1;
const sameTrial = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** What the popup shows before a trial starts: exact origin, form, adapter version and field names. */
export function describeTrial(trial) {
  return {
    origin: trial.origin,
    form: `${trial.form.name} (${trial.form.id})`,
    adapter: `${trial.adapterId} version ${trial.adapterVersion}`,
    fields: trial.fields.map((f) => `${f.keyLabel} (${f.selector})`),
    notice: "This is not normal filling and does not verify the adapter for production. Stay on this page and watch it. Nothing is submitted.",
  };
}

/** Fetch applicant values (memory only) and ask the page for a fresh trial preview of the declared fields. */
export async function prepareTrial(api, sendToActiveTab, requestId, nonce, trial) {
  const id = String(requestId || "").trim();
  if (!isValidRequestId(id)) return { state: "error", message: errorMessage(new ExtensionApiError("INVALID_REQUEST_ID")) };
  if (!E.protocol.isTrialMeta(trial)) return { state: "error", message: "This page does not offer a supervised trial." };
  let data;
  try {
    data = await api.getAutofillData(id);
  } catch (e) {
    return failureState(e);
  }
  let res = null;
  try {
    res = await sendToActiveTab(E.protocol.createTrialPreview(nonce, data.fields));
  } catch {
    res = null;
  }
  if (E.protocol.isError(res)) return { state: "error", message: PAGE_ERRORS[res.code] };
  if (!E.protocol.isTrialPreviewResult(res) || res.nonce !== nonce) return { state: "error", message: "The page did not return a trial preview. Reload the page and try again." };
  if (!sameTrial(res.trial, trial)) return { state: "error", message: "The page offered a different trial from the one shown. Reload the page and start again." };
  return { state: "preview", preview: res, requestNumber: data.requestNumber };
}

/** Fill only approved, ready trial fields, only with explicit confirmation, only before the preview expires. */
export async function fillTrial(sendToActiveTab, { nonce, preview, approved, confirmed, startedAt, now = Date.now() }) {
  if (confirmed !== true) return { state: "error", message: "Tick the confirmation box after reviewing the trial fields." };
  if (!Array.isArray(approved) || !approved.length) return { state: "error", message: "Select at least one field for the trial." };
  const ready = new Set(preview.fields.filter((f) => f.status === "ready").map((f) => f.id));
  if (!approved.every((id) => ready.has(id))) return { state: "error", message: "Only fields shown as ready can be part of the trial." };
  if (!Number.isFinite(startedAt) || now - startedAt > preview.ttlMs) return { state: "error", message: PAGE_ERRORS.PREVIEW_EXPIRED };
  let res = null;
  try {
    res = await sendToActiveTab(E.protocol.createTrialFill(nonce, preview.previewId, approved));
  } catch {
    res = null;
  }
  if (E.protocol.isError(res)) return { state: "error", message: PAGE_ERRORS[res.code] };
  if (!E.protocol.isTrialFillResult(res) || res.nonce !== nonce) return { state: "error", message: "The page did not confirm the trial. Check the form before continuing." };
  const e = res.evidence;
  const declared = preview.trial;
  const matches =
    e.adapterId === declared.adapterId && e.adapterVersion === declared.adapterVersion && e.origin === declared.origin && e.form === declared.form.id &&
    sameTrial(e.fields.map((f) => [f.selector, f.key]), declared.fields.map((f) => [f.selector, f.key]));
  if (!matches) return { state: "error", message: "The page reported a different trial. Treat this trial as failed." };
  return { state: "filled", result: res };
}

/** Drop the page's prepared preview (normal or trial) at once. True when the page confirmed it. */
export async function discardOnPage(sendToActiveTab, nonce) {
  try {
    const r = await sendToActiveTab(E.protocol.createDiscard(nonce));
    return !!r && r.type === E.protocol.T.DISCARD && r.nonce === nonce;
  } catch {
    return false;
  }
}

/** The verification record: non-sensitive metadata only (no values, nonces, preview ids, URLs or request ids). */
export function buildTrialRecord(evidence, recordedAt = new Date()) {
  return {
    kind: TRIAL_RECORD_KIND,
    version: TRIAL_RECORD_VERSION,
    adapterId: evidence.adapterId,
    adapterVersion: evidence.adapterVersion,
    origin: evidence.origin,
    form: evidence.form,
    fields: evidence.fields.map((f) => ({ selector: f.selector, key: f.key, editable: f.editable, approved: f.approved, filled: f.filled })),
    pageChanged: evidence.pageChanged,
    result: evidence.passed ? "pass" : "fail",
    recordedAt: recordedAt.toISOString(),
  };
}

const TRIAL_CHECK_TEXT = {
  ok: "Matches the captured field",
  absent: "Not on this page",
  ambiguous: "More than one field matches",
  changed: "Differs from the captured field",
  protected: "Protected — left for you",
  hidden: "Hidden",
  disabled: "Disabled",
  read_only: "Read-only",
};

export function describeTrialItem(item) {
  if (item.check !== "ok") return `Rejected: ${TRIAL_CHECK_TEXT[item.check] || "not usable"}`;
  return item.status === "ready" ? "Ready" : STATUS_TEXT[item.status] || "Left for you";
}

export function describeTrialResult(result, preview) {
  const labels = new Map(preview.fields.map((f) => [f.selector, f.label]));
  const e = result.evidence;
  const problems = e.fields
    .filter((f) => !(f.editable && f.approved && f.filled))
    .map((f) => {
      const why = !f.approved ? "not part of this trial" : !f.editable ? "no longer editable or changed" : e.pageChanged ? "not filled because the page changed" : "the value did not stay in the field";
      return `${labels.get(f.selector) || f.selector}: ${why}`;
    });
  if (e.pageChanged) problems.push("The page changed during the trial.");
  return {
    headline: e.passed ? "Supervised trial passed. The adapter is still not enabled for normal filling." : "Supervised trial failed. Nothing more will be filled.",
    problems,
    reminder: "Check every value on the page. Complete CAPTCHA, OTP, Proceed, declarations, uploads, payment and final submission yourself.",
  };
}

export function registryOverview() {
  const counts = {};
  for (const p of E.registry.list()) counts[p.status] = (counts[p.status] || 0) + 1;
  return counts;
}

const STATUS_TEXT = {
  ready: "Ready",
  missing: "Missing in applicant profile",
  invalid: "Invalid in applicant profile — correct it on the website",
  low_confidence: "Not confident — fill manually",
  unmapped: "No matching applicant data",
  no_matching_option: "No matching option on the form",
  ambiguous_option: "Several options match — choose manually",
  format_unknown: "Date format unknown — fill manually",
  too_long: "Value longer than the field allows",
  incompatible: "Value does not fit this field",
  identity_manual: "Identity number — enter it yourself",
  document: "Document upload — do it yourself",
  unsupported: "Unsupported control",
  locked: "Read-only or disabled",
  confirmation: "Confirmation field — retype it yourself",
  duplicate: "Same data as another field — not filled",
};
const PROTECTED_TEXT = {
  captcha: "CAPTCHA — you must complete it",
  otp: "OTP — you must enter it",
  password: "Password — never filled",
  payment: "Payment — you must handle it",
  declaration: "Declaration — read and accept it yourself",
  adapter: "Reserved for you by the portal adapter",
};

export function describeItemStatus(item) {
  if (item.status === "protected") return PROTECTED_TEXT[item.reason] || "Left for you";
  const text = STATUS_TEXT[item.status] || "Left for you";
  return item.status === "ready" ? `${text} (${Math.round(item.confidence * 100)}%)` : text;
}

const FILL_REASON_TEXT = {
  form_changed: "the form changed since the preview",
  option_unavailable: "the option is no longer available",
  protected: "the field is protected",
  locked: "the field became read-only",
  hidden: "the field is hidden",
  not_applied: "the page rejected the value",
  not_approvable: "not approved",
  not_in_preview: "not part of the preview",
  error: "an unexpected error",
};

export function describeFillResult(result, items) {
  const labels = new Map(items.map((i) => [i.id, i.label]));
  const { filled, skipped, failed } = result.summary;
  const problems = result.results
    .filter((r) => r.status !== "filled")
    .map((r) => `${labels.get(r.id) || r.id}: ${FILL_REASON_TEXT[r.reason] || "not filled"}`);
  return {
    headline: `Filled ${filled} field${filled === 1 ? "" : "s"}. Skipped ${skipped}, failed ${failed}.`,
    problems,
    reminder: "Check every value on the page. Complete CAPTCHA, OTP, declarations, uploads, payment and final submission yourself.",
  };
}

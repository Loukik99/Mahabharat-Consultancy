import { TRUSTED_ORIGINS } from "./config.js";
import { createApiClient } from "./api.js";
import { isValidRequestId } from "./messages.js";
import {
  buildTrialRecord,
  checkConnection,
  checkReadiness,
  describeFillResult,
  describeGaps,
  describeItemStatus,
  describePortal,
  describeReadiness,
  describeTrial,
  describeTrialItem,
  describeTrialResult,
  discardOnPage,
  fillApproved,
  fillTrial,
  loadRequests,
  preparePreview,
  prepareTrial,
  probePage,
  registryOverview,
} from "./popup-controller.js";

// All state lives in this popup's memory and is discarded when it closes.
// Server-provided text is rendered with textContent only.
const $ = (id) => document.getElementById(id);
let origin = TRUSTED_ORIGINS[0].origin;
let api = null;
let connected = false;
// Bumped on every connect(); results from a superseded server/attempt are dropped.
let generation = 0;
let page = { state: "checking", tabId: null, detection: null, trial: null };
let preview = null; // { nonce, previewId, items } — display data only, cleared after one fill
let trialRun = null; // { nonce, preview, startedAt } — display data only, cleared after one fill or on cancel
let recordUrl = null;

function setStatus(state, text) {
  $("status").dataset.state = state;
  $("status-text").textContent = text;
}

function setText(id, text) {
  $(id).textContent = text || "";
}

function fillList(id, items) {
  $(id).replaceChildren(
    ...items.map((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      return li;
    })
  );
}

async function sendToTab(tabId, message) {
  if (typeof tabId !== "number") return null;
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    return null; // no content script on this page
  }
}

function selectedRequestId() {
  return $("request-id").value.trim() || $("request-select").value;
}

function updatePreviewButton() {
  const canPreview = page.state === "portal" && describePortal(page.detection, page.trial).canPreview;
  $("preview-button").disabled = !(connected && canPreview && isValidRequestId(selectedRequestId()));
  $("trial-start").disabled = !(connected && page.state === "portal" && page.trial && !trialRun && isValidRequestId(selectedRequestId()));
}

// ── Supervised verification trial ─────────────────────────────────
function clearTrial() {
  trialRun = null;
  $("trial-preview").hidden = true;
  $("trial-rows").replaceChildren();
  $("trial-confirm").checked = false;
  $("trial-fill").disabled = true;
}

function clearTrialRecord() {
  $("trial-result").hidden = true;
  $("trial-record").textContent = "";
  $("trial-download").removeAttribute("href");
  if (recordUrl) URL.revokeObjectURL(recordUrl);
  recordUrl = null;
}

function showTrialInfo() {
  $("trial").hidden = !page.trial;
  if (!page.trial) return;
  const t = describeTrial(page.trial);
  setText("trial-notice", t.notice);
  setText("trial-origin", t.origin);
  setText("trial-form", t.form);
  setText("trial-adapter", t.adapter);
  fillList("trial-fields", t.fields);
}

function updateTrialFillButton() {
  const ticked = [...$("trial-rows").querySelectorAll("input[type=checkbox]:checked")].length;
  $("trial-fill").disabled = !(trialRun && $("trial-confirm").checked && ticked > 0);
}

function renderTrial(res) {
  const rows = res.preview.fields.map((item) => {
    const tr = document.createElement("tr");
    tr.dataset.status = item.status;
    const tick = document.createElement("input");
    tick.type = "checkbox";
    tick.dataset.id = item.id || "";
    tick.setAttribute("aria-label", `Fill ${item.label}`);
    tick.disabled = item.status !== "ready";
    tick.checked = item.status === "ready";
    tick.addEventListener("change", updateTrialFillButton);
    const cells = [
      tick,
      `${item.label} (${item.selector})`,
      item.display ? `${item.display}${item.hasValue ? " (replaces current value)" : ""}` : "—",
      describeTrialItem(item),
    ].map((content) => {
      const td = document.createElement("td");
      if (typeof content === "string") td.textContent = content;
      else td.append(content);
      return td;
    });
    tr.append(...cells);
    return tr;
  });
  $("trial-rows").replaceChildren(...rows);
  $("trial-confirm").checked = false;
  $("trial-preview").hidden = false;
  updateTrialFillButton();
}

async function onTrialStart() {
  if (!page.trial) return;
  const gen = generation;
  clearPreview();
  clearTrial();
  clearTrialRecord();
  setText("trial-message", "Preparing the trial preview…");
  const nonce = page.detection.nonce;
  const res = await prepareTrial(api, (m) => sendToTab(page.tabId, m), selectedRequestId(), nonce, page.trial);
  if (gen !== generation) return;
  if (res.state === "preview") {
    trialRun = { nonce, preview: res.preview, startedAt: Date.now() };
    setText("trial-message", `${res.requestNumber}: nothing has been filled yet. This preview expires in ${Math.round(res.preview.ttlMs / 60000)} minutes.`);
    renderTrial(res);
  } else if (res.state === "signed_out") {
    setText("trial-message", "");
    await connect();
  } else {
    setText("trial-message", res.message);
  }
  updatePreviewButton();
}

async function onTrialCancel() {
  const current = trialRun;
  clearTrial();
  updatePreviewButton();
  if (!current) return;
  setText("trial-message", "Trial cancelled. Nothing was filled.");
  const dropped = await discardOnPage((m) => sendToTab(page.tabId, m), current.nonce);
  if (!dropped) setText("trial-message", "Trial cancelled here, but the page did not answer. Reload the page before doing anything else.");
}

async function onTrialFill() {
  if (!trialRun) return;
  const current = trialRun;
  const approved = [...$("trial-rows").querySelectorAll("input[type=checkbox]:checked")].map((c) => c.dataset.id);
  const confirmed = $("trial-confirm").checked;
  clearTrial();
  setText("trial-message", "Filling the trial fields…");
  const res = await fillTrial((m) => sendToTab(page.tabId, m), { nonce: current.nonce, preview: current.preview, approved, confirmed, startedAt: current.startedAt });
  updatePreviewButton();
  if (res.state !== "filled") {
    setText("trial-message", res.message);
    return;
  }
  const summary = describeTrialResult(res.result, current.preview);
  const json = `${JSON.stringify(buildTrialRecord(res.result.evidence), null, 2)}\n`;
  setText("trial-message", "");
  setText("trial-headline", summary.headline);
  fillList("trial-problems", summary.problems);
  setText("trial-reminder", summary.reminder);
  $("trial-record").textContent = json;
  recordUrl = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  $("trial-download").href = recordUrl;
  $("trial-result").hidden = false;
}

function clearPreview() {
  preview = null;
  $("preview").hidden = true;
  $("preview-rows").replaceChildren();
  $("approve-confirm").checked = false;
  $("fill-button").disabled = true;
}

async function onPreviewCancel() {
  const current = preview;
  clearPreview();
  if (!current) return;
  setText("preview-message", "Preview cancelled. Nothing was filled.");
  const dropped = await discardOnPage((m) => sendToTab(page.tabId, m), current.nonce);
  if (!dropped) setText("preview-message", "Preview cancelled here, but the page did not answer. Reload the page before doing anything else.");
}

function updateFillButton() {
  const ticked = [...$("preview-rows").querySelectorAll("input[type=checkbox]:checked")].length;
  $("fill-button").disabled = !(preview && $("approve-confirm").checked && ticked > 0);
}

async function refreshRequests(gen) {
  const select = $("request-select");
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select an open request…";
  select.replaceChildren(placeholder);
  setText("requests-message", "Loading requests…");

  const res = await loadRequests(api);
  if (gen !== generation) return;
  if (res.state === "ready") {
    for (const r of res.requests) {
      const option = document.createElement("option");
      option.value = r.id;
      option.textContent = `${r.requestNumber} · ${r.serviceName} (${r.status.replace(/_/g, " ")})`;
      select.append(option);
    }
    setText("requests-message", "");
  } else if (res.state === "empty") {
    setText("requests-message", "No open requests. You can paste a request ID instead.");
  } else {
    setText("requests-message", res.message);
  }
  updatePreviewButton();
}

async function connect() {
  const gen = ++generation;
  api = createApiClient(origin);
  connected = false;
  setStatus("checking", "Checking connection…");
  $("signin").hidden = true;
  $("requests-section").hidden = true;
  $("gaps").hidden = true;
  setText("connection-message", "");
  setText("readiness", "");
  await onPreviewCancel();
  if (trialRun) await onTrialCancel();
  updatePreviewButton();

  const conn = await checkConnection(api);
  if (gen !== generation) return;
  if (conn.state === "connected") {
    connected = true;
    setStatus("connected", `Connected as ${conn.user.name || "user"} (${conn.user.role})`);
    $("requests-section").hidden = false;
    await refreshRequests(gen);
  } else if (conn.state === "signed_out") {
    setStatus("signed-out", "Not signed in");
    setText("connection-message", conn.message);
    $("signin").hidden = false;
  } else {
    setStatus("error", "Connection failed");
    setText("connection-message", conn.message);
  }
}

async function onCheck(event) {
  event.preventDefault();
  const gen = generation;
  setText("readiness", "Checking…");
  $("gaps").hidden = true;
  const res = await checkReadiness(api, selectedRequestId());
  if (gen !== generation) return;
  if (res.state === "ready") {
    setText("readiness", describeReadiness(res.summary));
    const gaps = describeGaps(res.summary);
    fillList("missing-list", gaps.missing.length ? gaps.missing : ["None"]);
    fillList("invalid-list", gaps.invalid.length ? gaps.invalid : ["None"]);
    $("gaps").hidden = false;
  } else if (res.state === "signed_out") await connect();
  else setText("readiness", res.message);
}

function renderPreview(res) {
  const rows = res.preview.items.map((item) => {
    const tr = document.createElement("tr");
    tr.dataset.status = item.status;
    const tick = document.createElement("input");
    tick.type = "checkbox";
    tick.dataset.id = item.id;
    tick.setAttribute("aria-label", `Fill ${item.label}`);
    tick.disabled = item.status !== "ready";
    tick.checked = item.status === "ready";
    tick.addEventListener("change", updateFillButton);
    const cells = [
      tick,
      `${item.label}${item.required ? " *" : ""}`,
      item.display ? `${item.display}${item.hasValue ? " (replaces current value)" : ""}` : "—",
      describeItemStatus(item),
    ].map((content) => {
      const td = document.createElement("td");
      if (typeof content === "string") td.textContent = content;
      else td.append(content);
      return td;
    });
    tr.append(...cells);
    return tr;
  });
  $("preview-rows").replaceChildren(...rows);
  const s = res.preview.summary;
  const required = s.requiredNotReady.length ? ` Required fields left for you: ${s.requiredNotReady.join(", ")}.` : "";
  setText("preview-summary", `${res.requestNumber}: ${s.ready} of ${s.total} fields can be filled.${required}`);
  $("approve-confirm").checked = false;
  $("preview").hidden = false;
  updateFillButton();
}

async function onPreview() {
  const gen = generation;
  clearPreview();
  $("fill-result").hidden = true;
  setText("preview-message", "Preparing preview…");
  const nonce = page.detection.nonce;
  const res = await preparePreview(api, (m) => sendToTab(page.tabId, m), selectedRequestId(), nonce);
  if (gen !== generation) return;
  if (res.state === "preview") {
    preview = { nonce, previewId: res.preview.previewId, items: res.preview.items };
    setText("preview-message", "Nothing has been filled yet. Review the values below.");
    renderPreview(res);
  } else if (res.state === "signed_out") {
    setText("preview-message", "");
    await connect();
  } else {
    setText("preview-message", res.message);
    await detectPage();
  }
}

async function onFill() {
  if (!preview) return;
  const current = preview;
  const approved = [...$("preview-rows").querySelectorAll("input[type=checkbox]:checked")].map((c) => c.dataset.id);
  $("fill-button").disabled = true;
  setText("preview-message", "Filling approved fields…");
  const res = await fillApproved((m) => sendToTab(page.tabId, m), {
    nonce: current.nonce,
    previewId: current.previewId,
    approved,
    confirmed: $("approve-confirm").checked,
  });
  clearPreview();
  if (res.state !== "filled") {
    setText("preview-message", res.message);
    return;
  }
  const summary = describeFillResult(res.result, current.items);
  setText("preview-message", "");
  setText("fill-headline", summary.headline);
  fillList("fill-problems", summary.problems);
  setText("fill-reminder", summary.reminder);
  $("fill-result").hidden = false;
  $("preview-button").textContent = "Preview again";
}

async function detectPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tab && typeof tab.id === "number" ? tab.id : null;
  const p = await probePage((m) => sendToTab(tabId, m));
  page = { state: p.state, tabId, detection: p.detection || null, trial: p.trial || null };
  $("portal-info").hidden = p.state !== "portal";
  showTrialInfo();
  if (p.state === "app_page") {
    setText("page-status", "This is a Mahabharat page. Open a supported government form to fill it.");
  } else if (p.state === "portal") {
    const d = describePortal(p.detection, page.trial);
    setText("page-status", d.pageStatus);
    setText("portal-name", d.portal);
    setText("portal-verification", d.status);
    setText("portal-form", d.form);
  } else {
    const verified = registryOverview().verified_supported || 0;
    setText(
      "page-status",
      verified
        ? "No supported government portal detected on this page."
        : "No supported government portal detected on this page. No government portal is verified for automatic filling yet."
    );
  }
  updatePreviewButton();
}

function init() {
  const originSelect = $("origin-select");
  for (const t of TRUSTED_ORIGINS) {
    const option = document.createElement("option");
    option.value = t.origin;
    option.textContent = `${t.label} (${t.origin})`;
    originSelect.append(option);
  }
  originSelect.addEventListener("change", () => {
    origin = originSelect.value;
    connect();
  });
  $("signin").addEventListener("click", () => chrome.tabs.create({ url: `${origin}/login` }));
  $("request-form").addEventListener("submit", onCheck);
  const requestChanged = () => {
    onPreviewCancel();
    if (trialRun) onTrialCancel();
    updatePreviewButton();
  };
  $("request-select").addEventListener("change", requestChanged);
  $("request-id").addEventListener("input", requestChanged);
  $("preview-button").addEventListener("click", onPreview);
  $("approve-confirm").addEventListener("change", updateFillButton);
  $("fill-button").addEventListener("click", onFill);
  $("preview-cancel").addEventListener("click", onPreviewCancel);
  $("trial-start").addEventListener("click", onTrialStart);
  $("trial-confirm").addEventListener("change", updateTrialFillButton);
  $("trial-fill").addEventListener("click", onTrialFill);
  $("trial-cancel").addEventListener("click", onTrialCancel);

  detectPage();
  connect();
}

init();

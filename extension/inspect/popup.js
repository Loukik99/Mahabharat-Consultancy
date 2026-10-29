// Inspector popup. The capture lives in this popup's memory until it closes.
// Nothing is written to extension storage and nothing is sent to a server.
const I = globalThis.MCInspect;
const $ = (id) => document.getElementById(id);
let last = null;
let previous = null;

function setStatus(state, text) {
  $("status").dataset.state = state;
  $("status-text").textContent = text;
}

function row(term, value) {
  const wrap = document.createElement("div");
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = term;
  dd.textContent = value;
  wrap.append(dt, dd);
  return wrap;
}

function describeDiff(diff) {
  if (!diff) return "";
  if (!diff.samePage) return "This is a different page from the previous capture.";
  const parts = [];
  if (diff.added.length) parts.push(`${diff.added.length} added (${diff.added.slice(0, 5).join(", ")})`);
  if (diff.removed.length) parts.push(`${diff.removed.length} removed (${diff.removed.slice(0, 5).join(", ")})`);
  if (diff.changed.length) parts.push(`${diff.changed.length} changed (${diff.changed.slice(0, 5).join(", ")})`);
  return parts.length ? `Compared with the previous capture: ${parts.join("; ")}.` : "No field changes since the previous capture.";
}

const FILTER_NAMES = { password: "password", captcha: "CAPTCHA", otp: "OTP", identity: "ID number", payment: "payment", file: "upload" };

function filteredText(capture) {
  const parts = Object.entries(capture.filteredByKind)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${FILTER_NAMES[k] || k}`);
  return parts.length ? `${parts.join(", ")} (structure only, never filled)` : "None";
}

function show(capture, diff, sequence) {
  const c = capture.counts;
  const frames = capture.frameOrigins.length ? ` from ${capture.frameOrigins.join(", ")}` : "";
  $("summary").replaceChildren(
    row("Origin", capture.origin),
    row("Path", capture.path),
    row("Title", capture.title || "(none)"),
    row("Forms", String(c.forms)),
    row("Fields", `${c.fields} (${c.visibleFields} visible, ${c.requiredFields} required, ${c.disabledOrReadOnlyFields} locked)`),
    row("Left for you", filteredText(capture)),
    row("Left out", `${c.hiddenInputsOmitted} hidden inputs, ${c.redactedTexts} texts that looked personal`),
    row("Selectors", c.unstableSelectors ? `${c.unstableSelectors} field(s) have no stable id or name and need review` : "All stable"),
    row("Frames", c.frames ? `${c.frames} frame(s)${frames} were not read` : "None"),
    row("Shadow DOM", c.shadowRootsWithFields ? `${c.shadowRootsWithFields} component(s) hide fields this capture cannot see` : "None"),
    row("Page settled", capture.settled ? "Yes" : "No. The form kept changing. Capture again when it is still."),
    row("Capture", sequence ? `Number ${sequence} since this page loaded` : "1")
  );
  $("summary").hidden = false;
  $("diff").textContent = describeDiff(diff);
  $("diff").hidden = !diff;
}

async function captureActiveTab() {
  setStatus("checking", "Waiting for the page to finish rendering…");
  $("capture").disabled = true;
  $("download").disabled = true;
  let res = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && typeof tab.id === "number") res = await chrome.tabs.sendMessage(tab.id, { type: "MC_INSPECT_CAPTURE" });
  } catch {
    res = null;
  }
  $("capture").disabled = false;
  if (res && res.type === "MC_INSPECT_ERROR" && res.reason === "busy") {
    setStatus("error", "A capture is already running on this page. Wait a moment, then capture again.");
    $("download").disabled = !last;
    return;
  }
  const capture = res && res.type === "MC_INSPECT_RESULT" ? I.sanitizeCapture(res.capture) : null;
  if (!capture || !I.ALLOWED_ORIGINS.includes(capture.origin)) {
    setStatus("error", "This page is not one of the official portals this inspector may read. Open the portal, sign in yourself, then capture again.");
    $("summary").hidden = true;
    $("diff").hidden = true;
    last = null;
    return;
  }
  if (I.looksLikeApplicantValue(I.exportJson(capture))) {
    setStatus("error", "The capture still contains something that looks personal, so it cannot be downloaded.");
    last = null;
    return;
  }
  previous = last;
  last = capture;
  const sequence = Number.isInteger(res.sequence) && res.sequence > 0 ? res.sequence : 0;
  show(capture, I.sanitizeDiff(res.diff) || I.diffCaptures(previous, capture), sequence);
  $("capture").textContent = "Capture again";
  $("download").disabled = false;
  setStatus("ready", "Structure captured. Values you typed were not included.");
}

function download() {
  if (!last) return;
  const blob = new Blob([I.exportJson(last)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `form-structure-${last.path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "page"}.json`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

$("capture").addEventListener("click", captureActiveTab);
$("download").addEventListener("click", download);
setStatus("ready", "Sign in on the portal yourself, then capture.");

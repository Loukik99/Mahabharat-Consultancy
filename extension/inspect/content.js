// Inspector content script. Answers only this extension's own popup, only on the exact
// origins in origins.js, only in the top frame. Waits for the form to stop changing, then
// returns a sanitised structure capture. It does not store anything or change the page.
// The previous sanitised capture (structure only, no values) is kept in this closure until the
// page unloads, so a recapture can be compared even after the toolbar popup has closed.
(() => {
  "use strict";
  const I = globalThis.MCInspect;
  if (!I?.captureFormStructure || !Array.isArray(I.ALLOWED_ORIGINS)) return;
  if (globalThis.top !== globalThis.self) return;
  if (!I.ALLOWED_ORIGINS.includes(globalThis.location?.origin)) return;

  const QUIET_MS = 500;
  const MAX_WAIT_MS = 5000;
  const CONTROLS = "input,select,textarea";
  // Text inside these changes what a capture records (labels, options, sections).
  const TEXT_HOSTS = "label,legend,option,optgroup,caption,th,h1,h2,h3,h4,h5,h6,[role='heading'],.panel-heading,.card-header,.section-title";
  const STRUCTURE = `${CONTROLS},${TEXT_HOSTS},fieldset,form,button`;
  const WATCHED_ATTRIBUTES = [
    "class", "style", "hidden", "disabled", "readonly", "required", "type", "name", "id", "for", "open",
    "aria-hidden", "aria-required", "aria-disabled", "aria-label", "aria-labelledby", "placeholder",
  ];

  const holdsStructure = (n) => n?.nodeType === 1 && (n.matches(STRUCTURE) || !!n.querySelector(STRUCTURE));

  /** Clocks, tickers and countdowns outside the form do not delay a capture. */
  function relevant(m) {
    const target = m.target?.nodeType === 1 ? m.target : m.target?.parentElement;
    if (!target) return false;
    if (m.type === "attributes") return target.matches(STRUCTURE) || !!target.querySelector(CONTROLS);
    if (target.closest(TEXT_HOSTS)) return true;
    if (m.type === "childList") return [...m.addedNodes, ...m.removedNodes].some(holdsStructure);
    return false;
  }

  function settle(doc) {
    const started = Date.now();
    return new Promise((resolve) => {
      let quietTimer = null;
      let observer = null;
      const finish = (settled) => {
        clearTimeout(quietTimer);
        clearTimeout(maxTimer);
        observer?.disconnect();
        resolve({ settled, waitedMs: Date.now() - started });
      };
      const arm = () => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(() => {
          if (doc.readyState === "complete") finish(true);
          else arm();
        }, QUIET_MS);
      };
      const maxTimer = setTimeout(() => finish(false), MAX_WAIT_MS);
      observer = new MutationObserver((records) => {
        if (records.some(relevant)) arm();
      });
      observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: WATCHED_ATTRIBUTES, characterData: true });
      arm();
    });
  }

  const popupUrl = chrome.runtime.getURL("popup.html");
  const fromOwnPopup = (sender) =>
    !!sender && sender.id === chrome.runtime.id && !sender.tab && typeof sender.url === "string" && sender.url.split(/[?#]/)[0] === popupUrl;

  let busy = false;
  let previous = null;
  let sequence = 0;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!fromOwnPopup(sender)) return false;
    if (!message || typeof message !== "object" || message.type !== "MC_INSPECT_CAPTURE" || Object.keys(message).length !== 1) return false;
    if (busy) {
      sendResponse({ type: "MC_INSPECT_ERROR", reason: "busy" });
      return false;
    }
    busy = true;
    settle(document).then(({ settled, waitedMs }) => {
      let reply;
      try {
        const capture = I.sanitizeCapture({ ...I.captureFormStructure(document, { origin: location.origin, pathname: location.pathname }), settled, waitedMs });
        const diff = I.diffCaptures(previous, capture);
        previous = capture;
        sequence += 1;
        reply = { type: "MC_INSPECT_RESULT", capture, diff, sequence };
      } catch {
        reply = { type: "MC_INSPECT_ERROR", reason: "failed" };
      }
      busy = false;
      sendResponse(reply);
    });
    return true;
  });
})();

// Content script — injected ONLY on trusted Mahabharat pages (see manifest matches).
// It answers a version-tagged ping from this extension's popup and does nothing else:
// no DOM reading or writing, no page messaging, no applicant data, no form filling.
// Classic script (content scripts cannot use imports): the allowlist and ping shape
// mirror config.js / messages.js and are cross-checked by the extension tests.
(() => {
  const TRUSTED = ["https://www.mahabharat.net.in", "http://localhost:5173"];
  const PROTOCOL_VERSION = 1;

  if (!TRUSTED.includes(globalThis.location?.origin)) return;

  function isValidPing(msg) {
    if (Object.prototype.toString.call(msg) !== "[object Object]") return false;
    const keys = Object.keys(msg);
    return keys.length === 2 && msg.type === "MC_PING" && msg.v === PROTOCOL_VERSION && keys.includes("type") && keys.includes("v");
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Only this extension's own pages (popup) — not other extensions, tabs, or web pages.
    if (!sender || sender.id !== chrome.runtime.id || sender.tab) return false;
    if (!isValidPing(message)) return false;
    sendResponse({ type: "MC_PONG", v: PROTOCOL_VERSION, page: "mahabharat-app", formFilling: "unavailable" });
    return false;
  });
})();

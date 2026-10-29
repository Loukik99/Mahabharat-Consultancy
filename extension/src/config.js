// Exact Mahabharat application origins the extension may talk to.
// Must stay in sync with manifest.json host_permissions, content_scripts.matches,
// the CSP connect-src, and TRUSTED in content.js (enforced by extension tests).
export const TRUSTED_ORIGINS = Object.freeze([
  Object.freeze({ id: "production", label: "Mahabharat Consultancy", origin: "https://www.mahabharat.net.in" }),
  Object.freeze({ id: "local", label: "Local development", origin: "http://localhost:5173" }),
]);

export const API_PREFIX = "/api";
export const PROTOCOL_VERSION = 1;

// Mirrors server TERMINAL statuses: autofill is only served for open requests.
export const OPEN_STATUSES = Object.freeze([
  "submitted",
  "documents_required",
  "in_review",
  "in_progress",
  "waiting_otp",
  "waiting_payment",
  "completed",
]);

export function isTrustedOrigin(origin) {
  return typeof origin === "string" && TRUSTED_ORIGINS.some((t) => t.origin === origin);
}

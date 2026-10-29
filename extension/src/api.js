import { API_PREFIX, OPEN_STATUSES, isTrustedOrigin } from "./config.js";
import { isValidRequestId } from "./messages.js";

/**
 * Read-only client for the Mahabharat API.
 *
 * Auth: the browser's existing HttpOnly session cookie for the trusted origin is
 * attached via `credentials: "include"`. The extension never sees, stores, or
 * forwards the cookie, a password, or a token. Only GET is ever sent, so the
 * server's CSRF protection (non-GET only) is untouched. Errors carry a code only —
 * response bodies are never surfaced or logged.
 */
export class ExtensionApiError extends Error {
  constructor(code) {
    super(code);
    this.name = "ExtensionApiError";
    this.code = code;
  }
}

const STATUS_CODES = { 401: "AUTH_REQUIRED", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "REQUEST_CLOSED", 429: "RATE_LIMITED" };

export function createApiClient(origin, fetchImpl = globalThis.fetch?.bind(globalThis)) {
  if (!isTrustedOrigin(origin)) throw new ExtensionApiError("UNTRUSTED_ORIGIN");

  async function get(path) {
    let res;
    try {
      res = await fetchImpl(`${origin}${API_PREFIX}${path}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        redirect: "error", // never follow a redirect to another origin
        headers: { Accept: "application/json" },
      });
    } catch {
      throw new ExtensionApiError("NETWORK");
    }
    if (!res.ok) {
      throw new ExtensionApiError(STATUS_CODES[res.status] || (res.status >= 500 ? "SERVER" : "HTTP"));
    }
    if (!(res.headers.get("content-type") || "").includes("application/json")) {
      throw new ExtensionApiError("BAD_RESPONSE");
    }
    try {
      return await res.json();
    } catch {
      throw new ExtensionApiError("BAD_RESPONSE");
    }
  }

  return {
    /** Who is signed in on the website — name and role only. */
    async getSession() {
      const data = await get("/auth/me");
      const user = data?.user;
      if (!user || typeof user.role !== "string") throw new ExtensionApiError("BAD_RESPONSE");
      return { name: typeof user.name === "string" ? user.name : "", role: user.role };
    },

    /** Open requests visible to the caller (server scopes by role), reduced to picker fields. */
    async listOpenRequests() {
      const data = await get("/requests");
      if (!Array.isArray(data?.requests)) throw new ExtensionApiError("BAD_RESPONSE");
      return data.requests
        .filter((r) => r && OPEN_STATUSES.includes(r.status) && isValidRequestId(String(r.id)))
        .map((r) => ({
          id: String(r.id),
          requestNumber: String(r.requestNumber || ""),
          serviceName: String(r.serviceName || ""),
          status: r.status,
        }));
    },

    /** Autofill readiness for one request — counts and field paths only; applicant values are discarded. */
    async getAutofillReadiness(requestId) {
      if (!isValidRequestId(requestId)) throw new ExtensionApiError("INVALID_REQUEST_ID");
      const data = await get(`/requests/${requestId}/autofill`);
      return summarizeAutofill(data?.autofill);
    },

    /**
     * Applicant values for building a fill preview. Returned to the caller only (held in memory for
     * one preview, never stored): each leaf reduced to { status, value }, sources dropped.
     */
    async getAutofillData(requestId) {
      if (!isValidRequestId(requestId)) throw new ExtensionApiError("INVALID_REQUEST_ID");
      const data = await get(`/requests/${requestId}/autofill`);
      const summary = summarizeAutofill(data?.autofill);
      return { requestNumber: summary.requestNumber, serviceName: summary.serviceName, fields: sanitizeFields(data.autofill.fields) };
    },
  };
}

const PATH_RE = /^[a-zA-Z]{1,40}(\[\d{1,2}\])?(\.[a-zA-Z]{1,40}){0,3}$/;
const LEAF_STATUSES = ["available", "missing", "invalid"];

function sanitizeLeaf(n) {
  const status = LEAF_STATUSES.includes(n.status) ? n.status : "invalid";
  const ok = status === "available" && ((typeof n.value === "string" && n.value.length <= 300) || (typeof n.value === "number" && Number.isFinite(n.value)));
  return ok ? { status, value: n.value } : { status: status === "available" ? "invalid" : status, value: null };
}

/** Structural copy of the autofill field tree with bounded depth/size; anything unexpected is dropped. */
export function sanitizeFields(node, depth = 0) {
  if (depth > 4 || !node || typeof node !== "object") return depth === 0 ? {} : null;
  if (Array.isArray(node)) return node.slice(0, 10).map((x) => sanitizeFields(x, depth + 1)).filter(Boolean);
  if ("status" in node && "value" in node) return sanitizeLeaf(node);
  const out = {};
  for (const [k, v] of Object.entries(node).slice(0, 40)) {
    if (!/^[A-Za-z]{1,40}$/.test(k)) continue;
    const s = sanitizeFields(v, depth + 1);
    if (s) out[k] = s;
  }
  return out;
}

const paths = (list) => (Array.isArray(list) ? list.filter((p) => typeof p === "string" && PATH_RE.test(p)).slice(0, 100) : []);

function countAvailable(node) {
  if (Array.isArray(node)) return node.reduce((n, x) => n + countAvailable(x), 0);
  if (!node || typeof node !== "object") return 0;
  if ("status" in node && "value" in node) return node.status === "available" ? 1 : 0;
  return Object.values(node).reduce((n, x) => n + countAvailable(x), 0);
}

export function summarizeAutofill(a) {
  if (!a || typeof a !== "object" || !a.fields || !Array.isArray(a.missing) || !Array.isArray(a.invalid)) {
    throw new ExtensionApiError("BAD_RESPONSE");
  }
  return {
    requestNumber: String(a.requestNumber || ""),
    serviceName: String(a.service?.name || ""),
    profileFound: a.profileFound === true,
    available: countAvailable(a.fields),
    missing: a.missing.length,
    invalid: a.invalid.length,
    missingKeys: paths(a.missing),
    invalidKeys: paths(a.invalid),
  };
}

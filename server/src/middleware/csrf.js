const crypto = require("crypto");
const env = require("../config/env");
const { ApiError } = require("../utils/apiError");

const CSRF_COOKIE = process.env.CSRF_COOKIE_NAME || "mc_csrf";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function csrfCookieOpts() {
  return {
    // Readable by the SPA so it can mirror the value into X-CSRF-Token.
    httpOnly: false,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60 * 1000,
  };
}

/** Issue a fresh double-submit CSRF cookie. */
function setCsrfCookie(res) {
  const token = crypto.randomBytes(32).toString("hex");
  res.cookie(CSRF_COOKIE, token, csrfCookieOpts());
  return token;
}

function clearCsrfCookie(res) {
  res.clearCookie(CSRF_COOKIE, {
    httpOnly: false,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
  });
}

/**
 * CSRF for cookie-authenticated mutating requests.
 * Bearer Authorization skips CSRF (token is not auto-sent by browsers on
 * cross-site form posts). Unauthenticated requests also skip (login CSRF is
 * mitigated by SameSite=lax + rate limits).
 */
function csrfProtect(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return next();

  const hasAuthCookie = Boolean(req.cookies && req.cookies[env.cookieName]);
  if (!hasAuthCookie) return next();

  const header = req.headers["x-csrf-token"];
  const cookie = req.cookies && req.cookies[CSRF_COOKIE];
  if (!header || !cookie || String(header) !== String(cookie)) {
    return next(new ApiError(403, "CSRF validation failed"));
  }
  return next();
}

module.exports = { setCsrfCookie, clearCsrfCookie, csrfProtect, CSRF_COOKIE };

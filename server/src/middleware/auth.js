const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { User } = require("../models");
const { ApiError, asyncHandler } = require("../utils/apiError");
const { setCsrfCookie, clearCsrfCookie } = require("./csrf");

const COOKIE_OPTS = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: "lax",
  path: "/",
  // Align cookie maxAge roughly with JWT lifetime (8h default in prod).
  maxAge: 8 * 60 * 60 * 1000,
};

function signToken(user) {
  return jwt.sign(
    { id: user.id || String(user._id), role: user.role, tv: user.tokenVersion || 0 },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

/** Set HttpOnly auth cookie (primary session mechanism) + CSRF cookie. */
function setAuthCookie(res, token) {
  res.cookie(env.cookieName, token, COOKIE_OPTS);
  setCsrfCookie(res);
}

function clearAuthCookie(res) {
  res.clearCookie(env.cookieName, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
  });
  clearCsrfCookie(res);
}

function extractToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  if (req.cookies && req.cookies[env.cookieName]) return req.cookies[env.cookieName];
  return null;
}

// Verifies cookie or Bearer token and attaches req.user from the database.
// Role always comes from DB — never trust the JWT role claim for authorization.
const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw new ApiError(401, "Authentication required");

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new ApiError(401, "Invalid or expired token");
  }

  const user = await User.findById(payload.id);
  if (!user || !user.isActive) throw new ApiError(401, "Account not found or deactivated");

  // Invalidate tokens issued before password change / forced logout.
  // Tokens minted before tokenVersion existed must re-authenticate.
  const tv = user.tokenVersion || 0;
  if (payload.tv === undefined || payload.tv !== tv) {
    throw new ApiError(401, "Session expired. Please sign in again.");
  }
  if (user.passwordChangedAt && payload.iat) {
    const changed = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);
    if (payload.iat < changed) {
      throw new ApiError(401, "Session expired. Please sign in again.");
    }
  }

  req.user = user;
  next();
});

const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new ApiError(403, "You do not have permission to perform this action"));
  }
  next();
};

module.exports = {
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  requireRole,
  extractToken,
  setCsrfCookie,
  clearCsrfCookie,
};

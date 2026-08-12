const { ApiError } = require("./apiError");

/**
 * Strong server-side password policy.
 * Min 10 chars, upper + lower + digit; blocks common weak passwords.
 */
const COMMON = new Set([
  "password",
  "password123",
  "admin123",
  "agent123",
  "customer123",
  "1234567890",
  "qwerty1234",
  "welcome123",
  "changeme123",
  "letmein123",
]);

function validatePassword(password, { label = "Password" } = {}) {
  const p = String(password || "");
  if (p.length < 10) throw new ApiError(400, `${label} must be at least 10 characters`);
  if (p.length > 128) throw new ApiError(400, `${label} is too long`);
  if (!/[a-z]/.test(p)) throw new ApiError(400, `${label} must include a lowercase letter`);
  if (!/[A-Z]/.test(p)) throw new ApiError(400, `${label} must include an uppercase letter`);
  if (!/[0-9]/.test(p)) throw new ApiError(400, `${label} must include a number`);
  if (COMMON.has(p.toLowerCase())) throw new ApiError(400, `${label} is too common`);
  return p;
}

module.exports = { validatePassword };

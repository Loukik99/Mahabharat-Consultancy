const rateLimit = require("express-rate-limit");

const skipSuccessful = false;

/** Shared factory with safe defaults for proxied deploys. */
function makeLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: skipSuccessful,
    message: { success: false, message },
  });
}

// Broad auth surface (register + misc)
const authGeneral = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: "Too many authentication requests. Please try again later.",
});

// Login: tighter IP limit
const loginLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: "Too many login attempts. Please try again in 15 minutes.",
});

// Signup
const registerLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "Too many accounts created from this network. Try again later.",
});

// Forgot-password / OTP request
const forgotLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 8,
  message: "Too many password reset requests. Please try again later.",
});

// Reset-password (OTP verify)
const resetLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: "Too many password reset attempts. Please try again later.",
});

// File uploads
const uploadLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many uploads. Please try again later.",
});

// Expensive / mutating customer actions
const requestCreateLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many service requests. Please slow down.",
});

// Global API abuse brake (generous)
const apiGeneral = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 600,
  message: "Too many requests. Please try again later.",
});

module.exports = {
  authGeneral,
  loginLimiter,
  registerLimiter,
  forgotLimiter,
  resetLimiter,
  uploadLimiter,
  requestCreateLimiter,
  apiGeneral,
};

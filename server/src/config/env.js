require("dotenv").config();

const WEAK_SECRETS = new Set([
  "",
  "dev-insecure-secret-change-me",
  "change-me-to-a-long-random-string",
  "secret",
  "jwtsecret",
  "jwt-secret",
  "your-secret",
  "changeme",
]);

const nodeEnv = process.env.NODE_ENV || "development";
const isProd = nodeEnv === "production";
const rawJwtSecret = process.env.JWT_SECRET || "";
const rawClientUrl = process.env.CLIENT_URL || "";

function assertJwtSecret() {
  if (isProd) {
    if (!rawJwtSecret || WEAK_SECRETS.has(rawJwtSecret) || rawJwtSecret.length < 32) {
      console.error(
        "FATAL: JWT_SECRET must be set to a strong random value (≥32 chars) in production. Server refusing to start."
      );
      process.exit(1);
    }
    return rawJwtSecret;
  }
  // Development: allow missing secret only with an obvious insecure default,
  // and never reuse the old production fallback string in committed docs alone.
  if (!rawJwtSecret) {
    console.warn(
      "⚠️  JWT_SECRET not set — using ephemeral in-memory secret for this process only (dev)."
    );
    return require("crypto").randomBytes(48).toString("hex");
  }
  if (WEAK_SECRETS.has(rawJwtSecret) || rawJwtSecret.length < 16) {
    console.warn("⚠️  JWT_SECRET is weak. Set a long random secret before deploying.");
  }
  return rawJwtSecret;
}

function assertClientUrls() {
  if (isProd) {
    if (!rawClientUrl.trim()) {
      console.error(
        "FATAL: CLIENT_URL must be set in production (comma-separated trusted frontend origins). Server refusing to start."
      );
      process.exit(1);
    }
    return rawClientUrl
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return (rawClientUrl || "http://localhost:5173,http://localhost:5180")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const env = {
  port: parseInt(process.env.PORT || "5000", 10),
  nodeEnv,
  isProd,
  // Comma-separated list of allowed CORS origins.
  clientUrls: assertClientUrls(),
  // Optional explicit Vercel preview allowlist (comma-separated full origins).
  // Never use a blanket *.vercel.app matcher.
  vercelPreviewOrigins: (process.env.VERCEL_PREVIEW_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  mongoUri: process.env.MONGODB_URI || "",
  jwtSecret: assertJwtSecret(),
  // Short-lived access tokens; revoked via tokenVersion on password change.
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || (isProd ? "8h" : "12h"),
  cookieName: process.env.AUTH_COOKIE_NAME || "mc_auth",
  maxUploadBytes: parseInt(process.env.MAX_UPLOAD_MB || "5", 10) * 1024 * 1024,
  uploadDir: process.env.UPLOAD_DIR || "uploads",
  callProvider: process.env.CALL_PROVIDER || "stub",
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
  },
  email: {
    user: process.env.EMAIL_USER || "",
    pass: process.env.EMAIL_PASS || "",
    fromName: process.env.EMAIL_FROM_NAME || "Mahabharat Consultancy",
  },
  // If the old hardcoded fallback may have signed tokens, operators must rotate.
  jwtMustRotate: process.env.JWT_SECRET_ROTATED !== "true" && isProd,
};

env.emailEnabled = Boolean(env.email.user && env.email.pass);
env.storageMode =
  env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret ? "cloudinary" : "local";

if (env.isProd && env.jwtMustRotate) {
  console.warn(
    "SECURITY: Set JWT_SECRET_ROTATED=true only AFTER rotating JWT_SECRET to a new value that was never the old fallback."
  );
}

module.exports = env;

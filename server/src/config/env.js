require("dotenv").config();

const env = {
  port: parseInt(process.env.PORT || "5000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  // Comma-separated list of allowed CORS origins.
  clientUrls: (process.env.CLIENT_URL || "http://localhost:5173,http://localhost:5180")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  mongoUri: process.env.MONGODB_URI || "",
  jwtSecret: process.env.JWT_SECRET || "dev-insecure-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  maxUploadBytes: parseInt(process.env.MAX_UPLOAD_MB || "5", 10) * 1024 * 1024,
  uploadDir: process.env.UPLOAD_DIR || "uploads",
  callProvider: process.env.CALL_PROVIDER || "stub",
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
  },
};

env.isProd = env.nodeEnv === "production";
// Use Cloudinary when fully configured, else fall back to local disk storage.
env.storageMode =
  env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret ? "cloudinary" : "local";

module.exports = env;

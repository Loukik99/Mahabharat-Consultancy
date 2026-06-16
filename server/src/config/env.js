require("dotenv").config();

const env = {
  port: parseInt(process.env.PORT || "5000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5180",
  mongoUri: process.env.MONGODB_URI || "",
  jwtSecret: process.env.JWT_SECRET || "dev-insecure-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  maxUploadBytes: parseInt(process.env.MAX_UPLOAD_MB || "5", 10) * 1024 * 1024,
  uploadDir: process.env.UPLOAD_DIR || "uploads",
  callProvider: process.env.CALL_PROVIDER || "stub",
};

env.isProd = env.nodeEnv === "production";

module.exports = env;

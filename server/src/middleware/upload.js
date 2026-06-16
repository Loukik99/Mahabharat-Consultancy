const path = require("path");
const fs = require("fs");
const multer = require("multer");
const env = require("../config/env");
const { ApiError } = require("../utils/apiError");

const uploadRoot = path.join(__dirname, "..", "..", env.uploadDir);
fs.mkdirSync(uploadRoot, { recursive: true });

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safe}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (ALLOWED.has(file.mimetype)) return cb(null, true);
  cb(new ApiError(400, "Unsupported file type. Allowed: images, PDF, Word, Excel."));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.maxUploadBytes },
});

module.exports = { upload, uploadRoot };

const multer = require("multer");
const path = require("path");
const env = require("../config/env");
const { ApiError } = require("../utils/apiError");

// Client-declared MIME is only a first filter; magic-byte checks run after.
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const ALLOWED_EXT = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".mp4",
  ".webm",
  ".mov",
]);

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return cb(new ApiError(400, "Unsupported file extension"));
  }
  if (!ALLOWED.has(file.mimetype)) {
    return cb(new ApiError(400, "Unsupported file type. Allowed: images, PDF, Word, Excel, video."));
  }
  cb(null, true);
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: env.maxUploadBytes, files: 1 },
});

module.exports = { upload };

const multer = require("multer");
const env = require("../config/env");
const { ApiError } = require("../utils/apiError");

// In-memory storage so the buffer can be sent to Cloudinary (or written to
// disk by the storage layer). Keeps the storage backend swappable.
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

const fileFilter = (_req, file, cb) => {
  if (ALLOWED.has(file.mimetype)) return cb(null, true);
  cb(new ApiError(400, "Unsupported file type. Allowed: images, PDF, Word, Excel."));
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: env.maxUploadBytes },
});

module.exports = { upload };

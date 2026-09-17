const { ApiError } = require("./apiError");

/**
 * Validate file content via magic bytes. Do not trust client MIME types.
 * Returns a canonical MIME when detected.
 */
function detectMime(buffer) {
  if (!buffer || buffer.length < 4) return null;
  const b = buffer;

  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  // WEBP (RIFF....WEBP)
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return "image/webp";
  }
  // PDF
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  // ZIP-based (docx/xlsx) — OLE Compound Document for old .doc/.xls
  if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07)) {
    return "application/zip"; // refined by extension below
  }
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) {
    return "application/ms-ole"; // old Office
  }
  // MP4 / QuickTime (ftyp at offset 4)
  if (b.length >= 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    return "video/mp4";
  }
  // WebM (EBML)
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";

  return null;
}

const EXT_TO_MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

const ALLOWED_CANONICAL = new Set([
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

function extOf(name = "") {
  const i = String(name).lastIndexOf(".");
  return i >= 0 ? String(name).slice(i).toLowerCase() : "";
}

/**
 * Assert uploaded buffer matches an allowed type. Mutates file.mimetype to
 * the canonical server-detected type.
 */
function assertSafeUpload(file) {
  if (!file || !file.buffer) throw new ApiError(400, "No file uploaded");
  const detected = detectMime(file.buffer);
  if (!detected) throw new ApiError(400, "Unrecognized or disallowed file content");

  const ext = extOf(file.originalname);
  const expectedFromExt = EXT_TO_MIME[ext];
  if (!expectedFromExt) throw new ApiError(400, "File extension not allowed");

  let canonical = expectedFromExt;

  if (detected === "image/jpeg" || detected === "image/png" || detected === "image/webp") {
    if (detected !== expectedFromExt) throw new ApiError(400, "File content does not match extension");
    canonical = detected;
  } else if (detected === "application/pdf") {
    if (expectedFromExt !== "application/pdf") throw new ApiError(400, "File content does not match extension");
    canonical = "application/pdf";
  } else if (detected === "application/zip") {
    if (
      expectedFromExt !==
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
      expectedFromExt !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      throw new ApiError(400, "ZIP-based Office file required for this extension");
    }
    canonical = expectedFromExt;
  } else if (detected === "application/ms-ole") {
    if (expectedFromExt !== "application/msword" && expectedFromExt !== "application/vnd.ms-excel") {
      throw new ApiError(400, "Legacy Office file required for this extension");
    }
    canonical = expectedFromExt;
  } else if (detected === "video/mp4" || detected === "video/webm") {
    // ftyp covers mp4/mov; accept matching video extensions
    if (!expectedFromExt.startsWith("video/")) throw new ApiError(400, "File content does not match extension");
    canonical = expectedFromExt;
  } else {
    throw new ApiError(400, "Unsupported file type");
  }

  if (!ALLOWED_CANONICAL.has(canonical)) throw new ApiError(400, "Unsupported file type");

  // Block double extensions like file.pdf.exe
  const parts = String(file.originalname).toLowerCase().split(".");
  if (parts.length > 2) {
    const dangerous = ["exe", "js", "mjs", "bat", "cmd", "ps1", "sh", "php", "html", "htm", "svg"];
    if (parts.some((p) => dangerous.includes(p))) {
      throw new ApiError(400, "Dangerous filename rejected");
    }
  }

  file.mimetype = canonical;
  return canonical;
}

module.exports = { detectMime, assertSafeUpload, ALLOWED_CANONICAL };

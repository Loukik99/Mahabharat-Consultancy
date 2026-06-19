const path = require("path");
const fs = require("fs");
const env = require("../config/env");
const cloudinary = require("../config/cloudinary");
const { ApiError } = require("./apiError");

const uploadRoot = path.join(__dirname, "..", "..", env.uploadDir);
// Only local-disk mode needs this directory. On read-only serverless
// filesystems (e.g. Vercel) creating it throws — and Cloudinary mode never
// touches it — so guard the call.
if (env.storageMode !== "cloudinary") {
  try {
    fs.mkdirSync(uploadRoot, { recursive: true });
  } catch {
    /* read-only FS — ignore (Cloudinary mode doesn't use local disk) */
  }
}

const FOLDER = "mahabharat";

const WORD_MIMES = ["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const EXCEL_MIMES = ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];

// All subfolders we organise uploads into (pre-created so they're visible).
const SUBFOLDERS = ["images", "pdfs", "word", "excel", "videos", "documents"];

/**
 * Sort uploads by kind so they land in separate folders / Cloudinary types.
 * - images → resource_type "image"  (mahabharat/images)
 * - videos → resource_type "video"  (mahabharat/videos)
 * - pdfs   → "raw" (mahabharat/pdfs)        byte-exact
 * - word   → "raw" (mahabharat/word)        byte-exact
 * - excel  → "raw" (mahabharat/excel)       byte-exact
 * - other  → "raw" (mahabharat/documents)   byte-exact
 */
function classify(mime = "") {
  if (mime.startsWith("image/")) return { subfolder: "images", resourceType: "image" };
  if (mime.startsWith("video/")) return { subfolder: "videos", resourceType: "video" };
  if (mime === "application/pdf") return { subfolder: "pdfs", resourceType: "raw" };
  if (WORD_MIMES.includes(mime)) return { subfolder: "word", resourceType: "raw" };
  if (EXCEL_MIMES.includes(mime)) return { subfolder: "excel", resourceType: "raw" };
  return { subfolder: "documents", resourceType: "raw" };
}

/** Pre-create the type subfolders so they appear in the Media Library even
 *  before any file of that type is uploaded. Idempotent; safe to call on boot. */
async function ensureFolders() {
  if (env.storageMode !== "cloudinary") return;
  for (const sub of SUBFOLDERS) {
    try { await cloudinary.api.create_folder(`${FOLDER}/${sub}`); } catch { /* exists / ignore */ }
  }
}

/**
 * Persist an uploaded file (multer memoryStorage → req.file).
 * Returns storage metadata to embed on the request document/deliverable.
 */
async function persistFile(file) {
  const { subfolder, resourceType } = classify(file.mimetype);

  if (env.storageMode === "cloudinary") {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `${FOLDER}/${subfolder}`, resource_type: resourceType, type: "authenticated" },
        (err, res) => (err ? reject(err) : resolve(res))
      );
      stream.end(file.buffer);
    });
    return {
      provider: "cloudinary",
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      publicId: result.public_id,
      resourceType: result.resource_type,
      format: result.format,
    };
  }

  // Local disk fallback — mirror the same subfolder layout.
  const dir = path.join(uploadRoot, subfolder);
  fs.mkdirSync(dir, { recursive: true });
  const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedName = `${subfolder}/${Date.now()}-${Math.round(Math.random() * 1e6)}-${safe}`;
  await fs.promises.writeFile(path.join(uploadRoot, storedName), file.buffer);
  return {
    provider: "local",
    fileName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    storedName,
  };
}

/** Stream a stored file to the HTTP response (auth/payment checks happen first). */
async function sendStoredFile(res, meta) {
  if (meta.provider === "cloudinary" && meta.publicId) {
    // Signed, short-lived delivery URL for the private asset.
    const url = cloudinary.url(meta.publicId, {
      resource_type: meta.resourceType || "auto",
      type: "authenticated",
      sign_url: true,
      secure: true,
    });
    const r = await fetch(url);
    if (!r.ok) throw new ApiError(404, "File is no longer available");
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", meta.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${meta.fileName || "download"}"`);
    return res.send(buf);
  }

  // Local
  const full = path.join(uploadRoot, meta.storedName || "");
  if (!meta.storedName || !fs.existsSync(full)) throw new ApiError(404, "File is no longer available");
  return res.download(full, meta.fileName);
}

/** Best-effort deletion when a document is removed. */
async function removeStoredFile(meta) {
  try {
    if (meta.provider === "cloudinary" && meta.publicId) {
      await cloudinary.uploader.destroy(meta.publicId, { resource_type: meta.resourceType || "raw", type: "authenticated" });
    } else if (meta.storedName) {
      await fs.promises.unlink(path.join(uploadRoot, meta.storedName)).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

module.exports = { persistFile, sendStoredFile, removeStoredFile, ensureFolders, uploadRoot };

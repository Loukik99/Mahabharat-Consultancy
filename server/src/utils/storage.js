const path = require("path");
const fs = require("fs");
const env = require("../config/env");
const cloudinary = require("../config/cloudinary");
const { ApiError } = require("./apiError");
const { safeDownloadFilename } = require("./sanitize");

const uploadRoot = path.resolve(path.join(__dirname, "..", "..", env.uploadDir));
if (env.storageMode !== "cloudinary") {
  try {
    fs.mkdirSync(uploadRoot, { recursive: true });
  } catch {
    /* read-only FS */
  }
}

const FOLDER = "mahabharat";

const WORD_MIMES = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const EXCEL_MIMES = [
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const SUBFOLDERS = ["images", "pdfs", "word", "excel", "videos", "documents"];

function classify(mime = "") {
  if (mime.startsWith("image/")) return { subfolder: "images", resourceType: "image" };
  if (mime.startsWith("video/")) return { subfolder: "videos", resourceType: "video" };
  if (mime === "application/pdf") return { subfolder: "pdfs", resourceType: "raw" };
  if (WORD_MIMES.includes(mime)) return { subfolder: "word", resourceType: "raw" };
  if (EXCEL_MIMES.includes(mime)) return { subfolder: "excel", resourceType: "raw" };
  return { subfolder: "documents", resourceType: "raw" };
}

async function ensureFolders() {
  if (env.storageMode !== "cloudinary") return;
  for (const sub of SUBFOLDERS) {
    try {
      await cloudinary.api.create_folder(`${FOLDER}/${sub}`);
    } catch {
      /* exists / ignore */
    }
  }
}

function sanitizeOriginalName(name) {
  return safeDownloadFilename(String(name || "file").replace(/[^a-zA-Z0-9._-]/g, "_")).slice(0, 120);
}

async function persistFile(file) {
  const { subfolder, resourceType } = classify(file.mimetype);
  const safeName = sanitizeOriginalName(file.originalname);

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
      fileName: safeName,
      mimeType: file.mimetype,
      size: file.size,
      publicId: result.public_id,
      resourceType: result.resource_type,
      format: result.format,
    };
  }

  const dir = path.join(uploadRoot, subfolder);
  fs.mkdirSync(dir, { recursive: true });
  const storedName = `${subfolder}/${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeName}`;
  const full = path.resolve(uploadRoot, storedName);
  if (!full.startsWith(uploadRoot + path.sep) && full !== uploadRoot) {
    throw new ApiError(400, "Invalid storage path");
  }
  await fs.promises.writeFile(full, file.buffer);
  return {
    provider: "local",
    fileName: safeName,
    mimeType: file.mimetype,
    size: file.size,
    storedName,
  };
}

function resolveLocalPath(storedName) {
  if (!storedName || storedName.includes("\0")) return null;
  const full = path.resolve(uploadRoot, storedName);
  if (!full.startsWith(uploadRoot + path.sep)) return null;
  return full;
}

async function sendStoredFile(res, meta) {
  const downloadName = safeDownloadFilename(meta.fileName);

  if (meta.provider === "cloudinary" && meta.publicId) {
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
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.send(buf);
  }

  const full = resolveLocalPath(meta.storedName);
  if (!full || !fs.existsSync(full)) throw new ApiError(404, "File is no longer available");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.download(full, downloadName);
}

async function removeStoredFile(meta) {
  try {
    if (meta.provider === "cloudinary" && meta.publicId) {
      await cloudinary.uploader.destroy(meta.publicId, {
        resource_type: meta.resourceType || "raw",
        type: "authenticated",
      });
    } else if (meta.storedName) {
      const full = resolveLocalPath(meta.storedName);
      if (full) await fs.promises.unlink(full).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

module.exports = { persistFile, sendStoredFile, removeStoredFile, ensureFolders, uploadRoot };

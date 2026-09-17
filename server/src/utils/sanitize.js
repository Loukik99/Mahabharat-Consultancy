/** Escape a string for safe use inside a RegExp. */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Recursively strip MongoDB operator keys ($...) and prototype-pollution
 * keys from objects/arrays. Prevents operator injection via req.body/query.
 */
function stripMongoOperators(value, depth = 0) {
  if (depth > 20 || value == null) return value;
  if (Array.isArray(value)) {
    return value.map((v) => stripMongoOperators(v, depth + 1));
  }
  if (typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith("$") || k === "__proto__" || k === "constructor" || k === "prototype") {
        continue;
      }
      const cleaned = stripMongoOperators(v, depth + 1);
      // Drop objects that only contained operators (e.g. { $gt: "" } → {}).
      if (
        cleaned &&
        typeof cleaned === "object" &&
        !Array.isArray(cleaned) &&
        !(cleaned instanceof Date) &&
        !Buffer.isBuffer(cleaned) &&
        Object.keys(cleaned).length === 0
      ) {
        continue;
      }
      out[k] = cleaned;
    }
    return out;
  }
  return value;
}

/** Express middleware: sanitize body, query, and params. */
function mongoSanitize(req, _res, next) {
  if (req.body && typeof req.body === "object") req.body = stripMongoOperators(req.body);
  if (req.query && typeof req.query === "object") {
    // Express 4 query is mutable but sometimes a null-prototype object.
    const cleaned = stripMongoOperators(req.query);
    for (const key of Object.keys(req.query)) delete req.query[key];
    Object.assign(req.query, cleaned);
  }
  if (req.params && typeof req.params === "object") {
    const cleaned = stripMongoOperators(req.params);
    for (const key of Object.keys(req.params)) delete req.params[key];
    Object.assign(req.params, cleaned);
  }
  next();
}

/** Pick only allowlisted keys with defined values. */
function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

/** Safe Content-Disposition filename (strip quotes/CRLF/path separators). */
function safeDownloadFilename(name) {
  const base = String(name || "download")
    .replace(/[\r\n"\\]/g, "")
    .replace(/[/\\]/g, "_")
    .slice(0, 180);
  return base || "download";
}

module.exports = { escapeRegex, stripMongoOperators, mongoSanitize, pick, safeDownloadFilename };

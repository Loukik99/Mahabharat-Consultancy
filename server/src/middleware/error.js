const env = require("../config/env");

function notFound(req, res, _next) {
  res.status(404).json({ success: false, message: "Not found" });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let status = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  if (err.name === "ValidationError") {
    status = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(", ");
  }
  if (err.code === 11000) {
    status = 409;
    message = "Duplicate value";
  }
  if (err.name === "MulterError") {
    status = 400;
    if (err.code === "LIMIT_FILE_SIZE") message = "File too large";
    else message = "Upload failed";
  }

  // Never leak internals in production.
  if (status >= 500) {
    console.error("ERROR:", env.isProd ? err.message : err);
    if (env.isProd) message = "Internal Server Error";
  }

  res.status(status).json({
    success: false,
    message,
    ...(env.isProd ? {} : { stack: err.stack }),
  });
}

module.exports = { notFound, errorHandler };

const env = require("../config/env");

// 404 for unmatched API routes.
function notFound(req, res, _next) {
  res.status(404).json({ success: false, message: `Not found: ${req.method} ${req.originalUrl}` });
}

// Central error handler.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let status = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  if (err.name === "ValidationError") {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join(", ");
  }
  if (err.code === 11000) {
    status = 409;
    message = `Duplicate value for: ${Object.keys(err.keyValue || {}).join(", ")}`;
  }

  if (status >= 500) console.error("ERROR:", err);

  res.status(status).json({
    success: false,
    message,
    ...(env.isProd ? {} : { stack: err.stack }),
  });
}

module.exports = { notFound, errorHandler };

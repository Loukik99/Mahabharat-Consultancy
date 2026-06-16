const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const env = require("./config/env");
const routes = require("./routes");
const { notFound, errorHandler } = require("./middleware/error");

const app = express();

app.use(helmet());
app.use(compression());
app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
if (!env.isProd) app.use(morgan("dev"));

// Basic rate limit on auth to slow brute-force attempts.
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, max: 50 }));

app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;

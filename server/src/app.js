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
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow non-browser tools (no origin) and any configured/localhost origin in dev.
      if (!origin) return cb(null, true);
      if (env.clientUrls.includes(origin)) return cb(null, true);
      if (!env.isProd && /^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true);
      // Production site: the custom domain (with or without www) and any Vercel
      // deployment URL (single-project, same-origin deploy).
      if (/^https:\/\/([a-z0-9-]+\.)?mahabharat\.net\.in$/.test(origin)) return cb(null, true);
      if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return cb(null, true);
      return cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
if (!env.isProd) app.use(morgan("dev"));

// Basic rate limit on auth to slow brute-force attempts.
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, max: 50 }));

app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;

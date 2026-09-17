const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

const env = require("./config/env");
const routes = require("./routes");
const { notFound, errorHandler } = require("./middleware/error");
const { mongoSanitize } = require("./utils/sanitize");
const { apiGeneral, authGeneral } = require("./middleware/rateLimits");
const { csrfProtect } = require("./middleware/csrf");

const app = express();

// Accurate client IPs behind Vercel / reverse proxies (needed for rate limits).
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false, // API returns JSON; SPA CSP is set in vercel.json
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts: env.isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);
app.use(compression());
app.use(cookieParser());

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // curl / same-origin / server-to-server
      if (env.clientUrls.includes(origin)) return cb(null, true);
      if (!env.isProd && /^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true);
      if (/^https:\/\/([a-z0-9-]+\.)?mahabharat\.net\.in$/.test(origin)) return cb(null, true);
      // Explicit preview allowlist only — never blanket *.vercel.app
      if (env.vercelPreviewOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "200kb" }));
app.use(express.urlencoded({ extended: false, limit: "200kb" }));
app.use(mongoSanitize);
app.use(csrfProtect);
if (!env.isProd) app.use(morgan("dev"));

app.use("/api", apiGeneral);
app.use("/api/auth", authGeneral);

app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;

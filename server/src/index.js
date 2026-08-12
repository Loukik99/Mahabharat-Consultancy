const app = require("./app");
const env = require("./config/env");
const { connectDB } = require("./config/db");

(async () => {
  try {
    await connectDB();

    // Zero-setup dev convenience: in-memory DB only (never production / never remote URI).
    if (!env.mongoUri && !env.isProd) {
      process.env.CONFIRM_SEED = "YES";
      const { seedDatabase } = require("./seed");
      await seedDatabase();
    }

    const { ensureFolders } = require("./utils/storage");
    ensureFolders().catch(() => {});

    const server = app.listen(env.port, () => {
      console.log(`🚀 API running on http://localhost:${env.port}  (${env.nodeEnv})`);
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`Port ${env.port} is already in use. Stop the other process or set PORT.`);
        process.exit(1);
      }
      throw err;
    });
  } catch (err) {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  }
})();

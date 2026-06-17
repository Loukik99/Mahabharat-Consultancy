const app = require("./app");
const env = require("./config/env");
const { connectDB } = require("./config/db");

(async () => {
  try {
    await connectDB();

    // Zero-setup dev convenience: an in-memory DB starts empty, so seed it
    // automatically. With a real MONGODB_URI, use `npm run seed` instead.
    if (!env.mongoUri) {
      const { seedDatabase } = require("./seed");
      await seedDatabase();
    }

    // Ensure Cloudinary type subfolders exist (so they're visible when empty).
    const { ensureFolders } = require("./utils/storage");
    ensureFolders().catch(() => {});

    app.listen(env.port, () => {
      console.log(`🚀 API running on http://localhost:${env.port}  (${env.nodeEnv})`);
    });
  } catch (err) {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  }
})();

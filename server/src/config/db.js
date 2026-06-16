const mongoose = require("mongoose");
const env = require("./env");

let memoryServer = null;

/**
 * Connect to MongoDB.
 * - If MONGODB_URI is set, use it (e.g. MongoDB Atlas in production).
 * - Otherwise spin up an in-memory MongoDB for zero-setup local dev.
 */
async function connectDB() {
  let uri = env.mongoUri;

  if (!uri) {
    if (env.isProd) {
      throw new Error("MONGODB_URI is required in production");
    }
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri("mahabharat");
    console.log("⚙️  Using in-memory MongoDB (set MONGODB_URI for a persistent DB)");
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  console.log("✅ MongoDB connected");
  return uri;
}

async function disconnectDB() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}

module.exports = { connectDB, disconnectDB };

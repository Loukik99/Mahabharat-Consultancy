const dns = require("dns");
const mongoose = require("mongoose");
const env = require("./env");

let memoryServer = null;

/** Optional DNS override for mongodb+srv (SRV) when the system resolver refuses SRV queries. */
function applyMongoDnsServers() {
  const raw = process.env.MONGODB_DNS_SERVERS || "";
  const servers = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (servers.length) {
    dns.setServers(servers);
  }
}

/**
 * Connect to MongoDB.
 * - If MONGODB_URI is set, use it (e.g. MongoDB Atlas in production).
 * - Otherwise spin up an in-memory MongoDB for zero-setup local dev.
 */
async function connectDB() {
  applyMongoDnsServers();
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

/** Read-only readiness probe — does not open a new connection. */
async function getDatabaseHealth() {
  const state = mongoose.connection.readyState;
  const labels = ["disconnected", "connected", "connecting", "disconnecting"];
  if (state !== 1) {
    return { ok: false, state: labels[state] || String(state) };
  }
  try {
    await mongoose.connection.db.admin().ping();
    return { ok: true, state: "connected" };
  } catch (err) {
    return { ok: false, state: "connected", error: err.message };
  }
}

module.exports = { connectDB, disconnectDB, getDatabaseHealth };

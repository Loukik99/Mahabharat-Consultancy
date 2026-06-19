/* Vercel serverless entry for the API.
 *
 * The whole Express app (server/src/app.js) runs inside one serverless
 * function. vercel.json rewrites every /api/* request here, and the app's
 * routes are mounted at /api, so paths line up.
 *
 * The Mongo connection is cached on the Node global so it survives warm
 * invocations and we don't open a new Atlas connection on every request
 * (important on the free M0 tier's connection limit).
 */
const app = require("../server/src/app");
const { connectDB } = require("../server/src/config/db");

let connectionPromise = global.__mahabharatDb;

module.exports = async (req, res) => {
  if (!connectionPromise) {
    connectionPromise = connectDB();
    global.__mahabharatDb = connectionPromise;
  }
  try {
    await connectionPromise;
  } catch (err) {
    // Reset so the next invocation can retry a failed initial connection.
    connectionPromise = null;
    global.__mahabharatDb = null;
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ success: false, message: "Database unavailable" }));
  }
  return app(req, res);
};

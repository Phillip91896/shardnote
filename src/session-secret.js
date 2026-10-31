// Shared signing key for dashboard sessions and SellAuth route authentication.
const crypto = require("crypto");

const configured = String(process.env.SESSION_SECRET || "").trim();
const databaseSecret = String(process.env.DATABASE_URL || "").trim();

// Render restarts must not invalidate every signed-in browser. When SESSION_SECRET
// is not configured, derive a stable fallback from the private database connection
// string. An explicitly configured SESSION_SECRET always takes precedence.
const persistentFallback = databaseSecret
  ? crypto.createHmac("sha256", databaseSecret).update("shardnote-session-secret-v1").digest("hex")
  : "";

module.exports = configured || persistentFallback || crypto.randomBytes(32).toString("hex");

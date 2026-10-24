// Shared session-signing secret for the web app and SellAuth route hook.
// Set SESSION_SECRET in Render to keep sessions valid across restarts/deploys.
// If it is omitted, generate one strong per-process secret shared by both modules.
const crypto = require("crypto");

module.exports = String(process.env.SESSION_SECRET || "").trim() || crypto.randomBytes(32).toString("hex");

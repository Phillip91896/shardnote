const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public"), { maxAge: 0 }));

const startedAt = Date.now();

const state = {
  users: [],
  tickets: [
    { id: 1001, title: "Website support", user: "DemoUser", status: "open", priority: "high", createdAt: new Date().toISOString() },
    { id: 1002, title: "Bot command help", user: "Moderator", status: "pending", priority: "normal", createdAt: new Date(Date.now() - 3600000).toISOString() }
  ],
  messages: [],
  logs: [],
  settings: {
    prefix: "!",
    maintenance: false,
    autoReply: true,
    welcomeMessages: true
  }
};

function log(type, message) {
  state.logs.unshift({
    id: Date.now() + Math.random(),
    type,
    message,
    time: new Date().toISOString()
  });
  state.logs = state.logs.slice(0, 100);
}


const sessions = new Map();

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(header.split(";").filter(Boolean).map(part => {
    const i = part.indexOf("=");
    return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
  }));
}

function ensureAdmin() {
  if (!state.users.length) {
    const email = process.env.ADMIN_EMAIL || "admin@shardnote.local";
    const password = process.env.ADMIN_PASSWORD || "change-me-now";
    state.users.push({ id: 1, name: "Administrator", email, role: "admin", passwordHash: hashPassword(password), createdAt: new Date().toISOString() });
    log("security", "Initial admin account is ready");
  }
}
function currentUser(req) {
  const sid = parseCookies(req).shardnote_session;
  return sid ? sessions.get(sid) : null;
}
function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "Du skal logge ind." });
  req.user = user;
  next();
}
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Kun administratorer har adgang." });
  next();
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let discordReady = false;

client.once("ready", () => {
  discordReady = true;
  log("success", "Discord bot connected as " + client.user.tag);
});

client.on("messageCreate", (message) => {
  if (message.author.bot) return;
  const prefix = state.settings.prefix || "!";
  if (!message.content.startsWith(prefix)) return;

  const parts = message.content.slice(prefix.length).trim().split(/\s+/);
  const command = (parts.shift() || "").toLowerCase();

  if (command === "ping") {
    message.reply("Pong! ShardNote is online.");
    log("command", `!ping used by ${message.author.tag}`);
  }

  if (command === "ticket") {
    const ticket = {
      id: Date.now(),
      title: parts.join(" ") || "New Discord ticket",
      user: message.author.tag,
      status: "open",
      priority: "normal",
      createdAt: new Date().toISOString()
    };
    state.tickets.unshift(ticket);
    message.reply(`Ticket #${ticket.id} created.`);
    log("ticket", `Ticket #${ticket.id} created by ${message.author.tag}`);
  }
});

if (process.env.DISCORD_TOKEN) {
  client.login(process.env.DISCORD_TOKEN).catch((error) => {
    discordReady = false;
    log("error", "Discord login failed: " + error.message);
  });
} else {
  log("warning", "DISCORD_TOKEN is not configured. Dashboard runs in web-only mode.");
}


app.post("/api/login", (req, res) => {
  ensureAdmin();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = state.users.find(u => u.email.toLowerCase() === email && u.passwordHash === hashPassword(password));
  if (!user) {
    log("security", `Failed login attempt for ${email || "unknown user"}`);
    return res.status(401).json({ error: "Forkert email eller adgangskode." });
  }
  const sid = crypto.randomBytes(32).toString("hex");
  sessions.set(sid, { id: user.id, name: user.name, email: user.email, role: user.role });
  res.setHeader("Set-Cookie", `shardnote_session=${sid}; HttpOnly; Path=/; SameSite=Lax`);
  log("security", `User ${user.email} logged in`);
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post("/api/logout", (req, res) => {
  const sid = parseCookies(req).shardnote_session;
  if (sid) sessions.delete(sid);
  res.setHeader("Set-Cookie", "shardnote_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "Ikke logget ind." });
  res.json({ user });
});

app.get("/api/admin/users", requireAuth, requireAdmin, (req, res) => {
  ensureAdmin();
  res.json(state.users.map(({ passwordHash, ...u }) => u));
});

app.post("/api/admin/users", requireAuth, requireAdmin, (req, res) => {
  ensureAdmin();
  const name = String(req.body.name || "").trim().slice(0, 80);
  const email = String(req.body.email || "").trim().toLowerCase().slice(0, 160);
  const password = String(req.body.password || "");
  const role = req.body.role === "admin" ? "admin" : "staff";
  if (!name || !email || password.length < 8) return res.status(400).json({ error: "Navn, email og adgangskode på mindst 8 tegn er påkrævet." });
  if (state.users.some(u => u.email === email)) return res.status(409).json({ error: "Email findes allerede." });
  const user = { id: Date.now(), name, email, role, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
  state.users.push(user);
  log("security", `Admin ${req.user.email} created user ${email}`);
  res.status(201).json({ id: user.id, name, email, role, createdAt: user.createdAt });
});

app.delete("/api/admin/users/:id", requireAuth, requireAdmin, (req, res) => {
  ensureAdmin();
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: "Du kan ikke slette din egen konto." });
  const before = state.users.length;
  state.users = state.users.filter(u => u.id !== id);
  if (before === state.users.length) return res.status(404).json({ error: "Bruger ikke fundet." });
  log("security", `Admin ${req.user.email} deleted user #${id}`);
  res.json({ ok: true });
});


app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "ShardNote",
    discord: discordReady,
    uptime: Math.floor((Date.now() - startedAt) / 1000)
  });
});

app.use("/api", (req, res, next) => {
  if (["/login", "/logout", "/me"].includes(req.path) || req.path === "/health") return next();
  requireAuth(req, res, next);
});

app.get("/api/stats", (req, res) => {
  res.json({
    botOnline: discordReady,
    servers: discordReady ? client.guilds.cache.size : 0,
    users: discordReady
      ? client.guilds.cache.reduce((total, guild) => total + (guild.memberCount || 0), 0)
      : 0,
    tickets: state.tickets.filter(t => t.status !== "closed").length,
    commands: 2,
    uptime: Math.floor((Date.now() - startedAt) / 1000)
  });
});

app.get("/api/tickets", (req, res) => res.json(state.tickets));

app.post("/api/tickets", (req, res) => {
  const ticket = {
    id: Date.now(),
    title: String(req.body.title || "New ticket").slice(0, 120),
    user: String(req.body.user || "Dashboard user").slice(0, 80),
    status: "open",
    priority: ["low", "normal", "high"].includes(req.body.priority) ? req.body.priority : "normal",
    createdAt: new Date().toISOString()
  };
  state.tickets.unshift(ticket);
  log("ticket", `Ticket #${ticket.id} created from dashboard`);
  res.status(201).json(ticket);
});

app.patch("/api/tickets/:id", (req, res) => {
  const ticket = state.tickets.find(t => String(t.id) === String(req.params.id));
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });

  if (["open", "pending", "closed"].includes(req.body.status)) ticket.status = req.body.status;
  if (["low", "normal", "high"].includes(req.body.priority)) ticket.priority = req.body.priority;

  log("ticket", `Ticket #${ticket.id} updated`);
  res.json(ticket);
});

app.delete("/api/tickets/:id", (req, res) => {
  const before = state.tickets.length;
  state.tickets = state.tickets.filter(t => String(t.id) !== String(req.params.id));
  if (before === state.tickets.length) return res.status(404).json({ error: "Ticket not found" });
  log("ticket", `Ticket #${req.params.id} deleted`);
  res.json({ ok: true });
});

app.get("/api/messages", (req, res) => res.json(state.messages));

app.post("/api/messages", async (req, res) => {
  const content = String(req.body.content || "").trim();
  if (!content) return res.status(400).json({ error: "Message is required" });

  const item = {
    id: Date.now(),
    channel: String(req.body.channel || "Dashboard").slice(0, 80),
    content: content.slice(0, 2000),
    author: "Dashboard",
    time: new Date().toISOString()
  };
  state.messages.unshift(item);
  state.messages = state.messages.slice(0, 50);
  log("message", "Message created from dashboard");
  res.status(201).json(item);
});

app.get("/api/commands", (req, res) => {
  res.json([
    { name: "ping", description: "Checks whether ShardNote is responding.", usage: "!ping" },
    { name: "ticket", description: "Creates a support ticket.", usage: "!ticket <title>" }
  ]);
});

app.post("/api/commands", async (req, res) => {
  const command = String(req.body.command || "").trim();
  if (!command) return res.status(400).json({ error: "Command is required" });

  log("command", `Dashboard command: ${command}`);
  res.json({
    ok: true,
    message: discordReady
      ? "Command received by the dashboard. Discord actions are available through the connected bot."
      : "Command saved. Connect DISCORD_TOKEN in Render to enable live Discord actions."
  });
});

app.get("/api/settings", (req, res) => res.json(state.settings));

app.patch("/api/settings", (req, res) => {
  if (typeof req.body.prefix === "string" && req.body.prefix.length <= 5) {
    state.settings.prefix = req.body.prefix || "!";
  }
  if (typeof req.body.maintenance === "boolean") state.settings.maintenance = req.body.maintenance;
  if (typeof req.body.autoReply === "boolean") state.settings.autoReply = req.body.autoReply;
  if (typeof req.body.welcomeMessages === "boolean") state.settings.welcomeMessages = req.body.welcomeMessages;

  log("settings", "Dashboard settings updated");
  res.json(state.settings);
});

app.get("/api/logs", (req, res) => res.json(state.logs));

const html = `<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ShardNote — Discord Control Center</title>
<style>
:root{
  --bg:#07070b;--panel:#101018;--panel2:#151521;--border:#272735;
  --text:#f7f7fb;--muted:#9292a5;--accent:#6d5dfc;--accent2:#8b7dff;
  --green:#42d392;--yellow:#f4c95d;--red:#ff6678;--shadow:0 18px 55px rgba(0,0,0,.35)
}
*{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at 20% 0%,#19152e 0,#07070b 35%),var(--bg);color:var(--text);min-height:100vh}
button,input,textarea,select{font:inherit}button{cursor:pointer}
.app{display:flex;min-height:100vh}.sidebar{width:255px;position:fixed;inset:0 auto 0 0;background:rgba(10,10,16,.92);backdrop-filter:blur(18px);border-right:1px solid var(--border);padding:22px 15px;z-index:10}
.brand{display:flex;align-items:center;gap:10px;padding:8px 10px 25px;font-size:23px;font-weight:800}.brand-mark{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:linear-gradient(135deg,var(--accent),#a855f7);box-shadow:0 8px 24px rgba(109,93,252,.3)}
.nav{display:grid;gap:7px}.nav button{border:1px solid transparent;background:transparent;color:#a5a5b5;text-align:left;padding:12px 13px;border-radius:11px;transition:.2s}.nav button:hover{background:#171722;color:#fff}.nav button.active{background:linear-gradient(90deg,rgba(109,93,252,.23),rgba(109,93,252,.07));border-color:rgba(109,93,252,.3);color:#fff}.nav .icon{display:inline-block;width:25px}
.sidebar-footer{position:absolute;left:15px;right:15px;bottom:18px;padding:13px;border:1px solid var(--border);border-radius:12px;background:#0e0e16;color:var(--muted);font-size:12px}
.main{margin-left:255px;width:calc(100% - 255px);padding:28px;max-width:1500px}.topbar{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:28px}.eyebrow{color:var(--accent2);font-size:12px;text-transform:uppercase;letter-spacing:.12em;font-weight:800}.topbar h1{margin:5px 0 0;font-size:30px}.status{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--panel);border:1px solid var(--border);border-radius:12px}.dot{width:9px;height:9px;border-radius:50%;background:var(--yellow);box-shadow:0 0 15px currentColor}.dot.online{background:var(--green)}
.page{display:none}.page.active{display:block}.grid{display:grid;gap:18px}.stats{grid-template-columns:repeat(4,minmax(0,1fr))}.card{background:linear-gradient(180deg,rgba(22,22,33,.96),rgba(13,13,20,.96));border:1px solid var(--border);border-radius:16px;padding:20px;box-shadow:var(--shadow)}.stat-title{color:var(--muted);font-size:13px}.stat-value{font-size:30px;font-weight:800;margin-top:8px}.stat-foot{font-size:12px;color:var(--green);margin-top:7px}
.two{grid-template-columns:1.35fr 1fr}.section-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.section-title h2{font-size:17px;margin:0}.section-title span{font-size:12px;color:var(--muted)}
.btn{border:1px solid var(--border);background:#171722;color:#fff;border-radius:10px;padding:10px 13px}.btn:hover{border-color:#4a4962;background:#1d1d2a}.btn.primary{background:linear-gradient(135deg,var(--accent),#795cff);border-color:transparent}.btn.danger{color:#ff8a96}.btn.small{padding:7px 10px;font-size:12px}
.table{width:100%;border-collapse:collapse}.table th,.table td{padding:12px 8px;border-bottom:1px solid #22222e;text-align:left;font-size:13px}.table th{color:var(--muted);font-weight:600}.badge{display:inline-flex;padding:5px 8px;border-radius:999px;font-size:11px;font-weight:700}.badge.open{background:rgba(66,211,146,.12);color:var(--green)}.badge.pending{background:rgba(244,201,93,.12);color:var(--yellow)}.badge.closed{background:rgba(255,102,120,.12);color:var(--red)}
.activity{display:grid;gap:11px}.activity-item{display:flex;gap:11px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #22222e}.activity-item:last-child{border:0}.activity-icon{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:#1c1b2b}.activity-item b{font-size:13px}.activity-item small{display:block;color:var(--muted);margin-top:3px}
.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.field{display:grid;gap:7px}.field label{font-size:12px;color:var(--muted)}.field input,.field textarea,.field select{width:100%;border:1px solid var(--border);background:#0b0b11;color:#fff;border-radius:10px;padding:11px 12px;outline:none}.field textarea{min-height:120px;resize:vertical}.field input:focus,.field textarea:focus,.field select:focus{border-color:var(--accent)}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.empty{padding:30px;text-align:center;color:var(--muted);border:1px dashed var(--border);border-radius:12px}
.switch-row{display:flex;align-items:center;justify-content:space-between;padding:15px 0;border-bottom:1px solid #22222e}.switch{width:48px;height:26px;border-radius:99px;background:#292936;padding:3px;transition:.2s}.switch i{display:block;width:20px;height:20px;border-radius:50%;background:#fff;transition:.2s}.switch.on{background:var(--accent)}.switch.on i{transform:translateX(22px)}

body.locked > .app{display:none}
#loginScreen{position:fixed;inset:0;z-index:100;background:radial-gradient(circle at 50% 0%,#19152e 0,#07070b 45%);display:grid;place-items:center;padding:20px}
.login-card{width:min(430px,100%);background:rgba(16,16,24,.96);border:1px solid var(--border);border-radius:20px;padding:30px;box-shadow:var(--shadow)}
.login-card h1{margin:0 0 8px}.login-card p{color:var(--muted);margin:0 0 22px}
.toast{position:fixed;right:24px;bottom:24px;z-index:50;background:#171722;border:1px solid #3a394d;color:#fff;border-radius:12px;padding:12px 15px;box-shadow:var(--shadow);display:none}
@media(max-width:1050px){.stats{grid-template-columns:repeat(2,1fr)}.two{grid-template-columns:1fr}}
@media(max-width:760px){.sidebar{width:76px;padding:15px 10px}.brand{justify-content:center;padding-bottom:18px}.brand span,.nav button span:not(.icon),.sidebar-footer{display:none}.nav button{text-align:center;padding:12px}.main{margin-left:76px;width:calc(100% - 76px);padding:18px}.topbar{align-items:flex-start}.topbar h1{font-size:24px}.form-grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="app">
<aside class="sidebar">
  <div class="brand"><div class="brand-mark">S</div><span>ShardNote</span></div>
  <nav class="nav">
    <button class="active" data-page="dashboard"><span class="icon">⌂</span><span>Dashboard</span></button>
    <button data-page="tickets"><span class="icon">🎫</span><span>Tickets</span></button>
    <button data-page="messages"><span class="icon">✉</span><span>Beskeder</span></button>
    <button data-page="commands"><span class="icon">⌘</span><span>Commands</span></button>
    <button data-page="music"><span class="icon">♫</span><span>Musik</span></button>
    <button data-page="settings"><span class="icon">⚙</span><span>Indstillinger</span></button>
    <button data-page="logs"><span class="icon">◷</span><span>Logs</span></button>
    <button data-page="admin"><span class="icon">👑</span><span>Admin</span></button>
  </nav>
  <div class="sidebar-footer">ShardNote 2.0<br>Discord Control Center</div>
</aside>

<main class="main">
<header class="topbar">
  <div><div class="eyebrow">Discord Control Center</div><h1 id="pageTitle">Dashboard</h1></div>
  <div style="display:flex;align-items:center;gap:10px">
    <div class="status"><span id="statusDot" class="dot"></span><span id="statusText">Connecting…</span></div>
    <button class="btn small" onclick="logout()">Log ud</button>
  </div>
</header>

<section class="page active" id="page-dashboard">
  <div class="grid stats">
    <div class="card"><div class="stat-title">BOT STATUS</div><div class="stat-value" id="statBot">—</div><div class="stat-foot">Live connection</div></div>
    <div class="card"><div class="stat-title">SERVERE</div><div class="stat-value" id="statServers">0</div><div class="stat-foot">Discord servers</div></div>
    <div class="card"><div class="stat-title">BRUGERE</div><div class="stat-value" id="statUsers">0</div><div class="stat-foot">Members</div></div>
    <div class="card"><div class="stat-title">ÅBNE TICKETS</div><div class="stat-value" id="statTickets">0</div><div class="stat-foot">Needs attention</div></div>
  </div>
  <div class="grid two" style="margin-top:18px">
    <div class="card"><div class="section-title"><h2>Seneste tickets</h2><button class="btn small" onclick="navigate('tickets')">Se alle</button></div><div id="dashTickets"></div></div>
    <div class="card"><div class="section-title"><h2>Aktivitet</h2><button class="btn small" onclick="navigate('logs')">Alle logs</button></div><div id="dashLogs" class="activity"></div></div>
  </div>
</section>

<section class="page" id="page-tickets">
  <div class="card">
    <div class="section-title"><h2>Ticket-system</h2><button class="btn primary" onclick="newTicket()">+ Ny ticket</button></div>
    <div id="ticketList"></div>
  </div>
</section>

<section class="page" id="page-messages">
  <div class="grid two">
    <div class="card">
      <div class="section-title"><h2>Send besked</h2><span>Dashboard → Discord workflow</span></div>
      <div class="form-grid">
        <div class="field"><label>Kanal</label><input id="messageChannel" placeholder="#general"></div>
        <div class="field"><label>Indhold</label><input id="messageContent" placeholder="Skriv din besked…"></div>
      </div>
      <div class="actions"><button class="btn primary" onclick="sendMessage()">Send besked</button></div>
      <p id="messageHint" style="color:var(--muted);font-size:12px;margin-top:12px">Live Discord-afsendelse kræver en gyldig DISCORD_TOKEN i Render.</p>
    </div>
    <div class="card"><div class="section-title"><h2>Seneste beskeder</h2></div><div id="messageList"></div></div>
  </div>
</section>

<section class="page" id="page-commands">
  <div class="grid two">
    <div class="card">
      <div class="section-title"><h2>Command Center</h2><span id="commandCount">0 commands</span></div>
      <div class="field"><label>Command</label><input id="commandInput" placeholder="!ping"></div>
      <div class="actions"><button class="btn primary" onclick="runCommand()">Kør command</button></div>
      <div id="commandResult" style="margin-top:14px;color:var(--green)"></div>
    </div>
    <div class="card"><div class="section-title"><h2>Tilgængelige commands</h2></div><div id="commandList"></div></div>
  </div>
</section>

<section class="page" id="page-music">
  <div class="card">
    <div class="section-title"><h2>Musik</h2><span>Control Center</span></div>
    <div class="empty">Musikmodulet er gjort klar i dashboardet. For rigtig afspilning skal en Discord voice-integration og en lydkilde konfigureres.</div>
    <div class="form-grid" style="margin-top:16px">
      <div class="field"><label>URL / søgning</label><input id="musicQuery" placeholder="YouTube URL eller søgning"></div>
      <div class="field"><label>Handling</label><select id="musicAction"><option>Play</option><option>Pause</option><option>Resume</option><option>Skip</option><option>Stop</option></select></div>
    </div>
    <div class="actions"><button class="btn primary" onclick="musicAction()">Udfør</button></div>
  </div>
</section>

<section class="page" id="page-settings">
  <div class="card">
    <div class="section-title"><h2>Indstillinger</h2><button class="btn primary" onclick="saveSettings()">Gem ændringer</button></div>
    <div class="field" style="max-width:280px"><label>Bot prefix</label><input id="prefix" maxlength="5" placeholder="!"></div>
    <div class="switch-row"><div><b>Maintenance mode</b><div style="color:var(--muted);font-size:12px">Vis dashboardet som vedligeholdelse</div></div><button id="maintenanceSwitch" class="switch" onclick="toggleSetting('maintenance')"><i></i></button></div>
    <div class="switch-row"><div><b>Auto-reply</b><div style="color:var(--muted);font-size:12px">Tillad automatiske svar</div></div><button id="autoReplySwitch" class="switch" onclick="toggleSetting('autoReply')"><i></i></button></div>
    <div class="switch-row"><div><b>Welcome messages</b><div style="color:var(--muted);font-size:12px">Velkomstbeskeder til nye medlemmer</div></div><button id="welcomeMessagesSwitch" class="switch" onclick="toggleSetting('welcomeMessages')"><i></i></button></div>
  </div>
</section>

<section class="page" id="page-logs">
  <div class="card"><div class="section-title"><h2>System logs</h2><button class="btn small" onclick="loadLogs()">Opdater</button></div><div id="logList"></div></div>
</section>

<section class="page" id="page-admin">
  <div class="grid two">
    <div class="card">
      <div class="section-title"><h2>Admin-panel</h2><span>Brugere og adgang</span></div>
      <div class="field"><label>Navn</label><input id="newUserName" placeholder="Fx Jonas"></div>
      <div class="field" style="margin-top:12px"><label>Email</label><input id="newUserEmail" type="email" placeholder="jonas@example.com"></div>
      <div class="field" style="margin-top:12px"><label>Adgangskode</label><input id="newUserPassword" type="password" placeholder="Mindst 8 tegn"></div>
      <div class="field" style="margin-top:12px"><label>Rolle</label><select id="newUserRole"><option value="staff">Staff</option><option value="admin">Administrator</option></select></div>
      <div class="actions"><button class="btn primary" onclick="createUser()">+ Tilføj bruger</button></div>
      <p style="color:var(--muted);font-size:12px;margin-top:12px">Kun administratorer kan åbne og ændre dette panel.</p>
    </div>
    <div class="card">
      <div class="section-title"><h2>Brugere</h2><button class="btn small" onclick="loadUsers()">Opdater</button></div>
      <div id="userList"></div>
    </div>
  </div>
</section>
</main>
</div>
<div id="toast" class="toast"></div>

<script src="/app.js" defer></script>
</body>
</html>`;

app.get("/", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.type("html").send(html);
});

app.listen(PORT, () => {
  log("success", `ShardNote web server started on port ${PORT}`);
  console.log(`ShardNote running on port ${PORT}`);
});

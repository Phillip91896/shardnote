const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { Pool } = require("pg");
const { createBot } = require("./bot");
const Stripe = require("stripe");

const app = express();
const PORT = process.env.PORT || 3000;
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const PUBLIC_SITE_URL = String(process.env.PUBLIC_SITE_URL || "https://shardnote-mxj3.onrender.com").replace(/\/$/, "");

app.set("trust proxy", 1);

app.post("/api/billing/webhook", express.raw({ type: "application/json" }), async (req,res)=>{
  if(!stripe||!process.env.STRIPE_WEBHOOK_SECRET)return res.status(503).send("Stripe webhook is not configured.");
  let event;
  try{event=stripe.webhooks.constructEvent(req.body,req.headers["stripe-signature"],process.env.STRIPE_WEBHOOK_SECRET);}
  catch(error){console.error("[ShardNote] Stripe webhook signature failed:",error.message);return res.status(400).send("Invalid webhook signature.");}
  try{
    const object=event.data.object;
    if(event.type==="checkout.session.completed"){
      const userId=object.metadata?.user_id;
      const subscriptionId=typeof object.subscription==="string"?object.subscription:object.subscription?.id||null;
      const customerId=typeof object.customer==="string"?object.customer:object.customer?.id||null;
      const plan=object.metadata?.plan;
      if(userId){
        await updateUserSubscription({userId,status:"active",customerId,subscriptionId});
        if(db && ["member","member_plus","member_pro","member_premium"].includes(plan)){
          await db.query("UPDATE public.users SET plan = $1 WHERE id = $2",[plan,userId]);
        }
        log("billing", "Subscription activated for user #" + userId + " (" + (plan || "member") + ")", userId);
      }
    }
    if(event.type==="customer.subscription.created"||event.type==="customer.subscription.updated"||event.type==="customer.subscription.deleted"){
      const userId=object.metadata?.user_id;
      const status=event.type==="customer.subscription.deleted"?"canceled":object.status;
      const plan=object.metadata?.plan;
      if(userId) {
        await updateUserSubscription({userId,status,customerId:typeof object.customer==="string"?object.customer:object.customer?.id,subscriptionId:object.id,currentPeriodEnd:object.current_period_end});
        if(db && event.type!=="customer.subscription.deleted" && ["member","member_plus","member_pro","member_premium"].includes(plan)){
          await db.query("UPDATE public.users SET plan = $1 WHERE id = $2",[plan,userId]);
        }
      } else if(event.type==="customer.subscription.deleted") await updateUserSubscriptionByStripeSubscription(object.id,status);
      if(userId)log("billing", "Subscription " + status + " for user #" + userId + " (" + (plan || "member") + ")", userId);
    }
    if(event.type==="invoice.payment_failed"){
      const subscriptionId=typeof object.subscription==="string"?object.subscription:object.subscription?.id||null;
      if(subscriptionId){
        await updateUserSubscriptionByStripeSubscription(subscriptionId,"past_due");
        log("billing", `Subscription payment failed for Stripe subscription ${subscriptionId}`);
      }
    }
    return res.json({received:true});
  }catch(error){console.error("[ShardNote] Stripe webhook handler failed:",error);return res.status(500).send("Webhook handler failed.");}
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public"), { maxAge: 0 }));

const db = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    })
  : null;

async function initDatabase() {
  if (!db) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      email VARCHAR(160) NOT NULL UNIQUE,
      role VARCHAR(20) NOT NULL DEFAULT 'member',
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id BIGSERIAL PRIMARY KEY,
      title VARCHAR(120) NOT NULL,
      user_name VARCHAR(80) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'open',
      priority VARCHAR(20) NOT NULL DEFAULT 'normal',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY,
      channel VARCHAR(80) NOT NULL,
      content TEXT NOT NULL,
      author VARCHAR(160) NOT NULL DEFAULT 'Dashboard',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS logs (
      id BIGSERIAL PRIMARY KEY,
      type VARCHAR(40) NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS bot_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      prefix VARCHAR(5) NOT NULL DEFAULT '!',
      maintenance BOOLEAN NOT NULL DEFAULT FALSE,
      auto_reply BOOLEAN NOT NULL DEFAULT TRUE,
      welcome_messages BOOLEAN NOT NULL DEFAULT TRUE,
      button_labels JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS login_audit (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT,
      user_name VARCHAR(80),
      user_email VARCHAR(160),
      event_type VARCHAR(40) NOT NULL DEFAULT 'login',
      success BOOLEAN NOT NULL DEFAULT FALSE,
      ip_address INET,
      user_agent TEXT,
      country VARCHAR(120),
      city VARCHAR(120),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    ALTER TABLE public.users
      ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(30) NOT NULL DEFAULT 'inactive',
      ADD COLUMN IF NOT EXISTS trial_used BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS plan VARCHAR(30) NOT NULL DEFAULT 'member',
      ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(120),
      ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(120),
      ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS ban_type VARCHAR(20),
      ADD COLUMN IF NOT EXISTS banned_ip INET,
      ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ
  `);

  await db.query(`
    ALTER TABLE public.tickets
      ADD COLUMN IF NOT EXISTS owner_user_id BIGINT;
    ALTER TABLE public.messages
      ADD COLUMN IF NOT EXISTS owner_user_id BIGINT;
    ALTER TABLE public.logs
      ADD COLUMN IF NOT EXISTS owner_user_id BIGINT;
  `);

  await db.query(`
    ALTER TABLE public.login_audit
      ADD COLUMN IF NOT EXISTS ip_encrypted TEXT
  `);

  await db.query(`
    ALTER TABLE public.users
      ADD COLUMN IF NOT EXISTS banned_ip_hash TEXT,
      ADD COLUMN IF NOT EXISTS banned_ip_encrypted TEXT
  `);

  await migrateProtectedIpData();

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.account_settings (
      user_id BIGINT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
      prefix VARCHAR(5) NOT NULL DEFAULT '!',
      maintenance BOOLEAN NOT NULL DEFAULT FALSE,
      auto_reply BOOLEAN NOT NULL DEFAULT TRUE,
      welcome_messages BOOLEAN NOT NULL DEFAULT TRUE,
      button_labels JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.account_guilds (
      user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      guild_id VARCHAR(32) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, guild_id)
    )
  `);

  await db.query(`
    ALTER TABLE public.tickets
      ADD COLUMN IF NOT EXISTS guild_id VARCHAR(32),
      ADD COLUMN IF NOT EXISTS user_id VARCHAR(32),
      ADD COLUMN IF NOT EXISTS channel_id VARCHAR(32),
      ADD COLUMN IF NOT EXISTS claimed_by VARCHAR(32),
      ADD COLUMN IF NOT EXISTS category VARCHAR(40) NOT NULL DEFAULT 'support',
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS handler VARCHAR(20) NOT NULL DEFAULT 'admins'
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id VARCHAR(32) PRIMARY KEY,
      log_channel_id VARCHAR(32),
      welcome_channel_id VARCHAR(32),
      welcome_message TEXT DEFAULT 'Velkommen {user} til {server}! 👋',
      leave_channel_id VARCHAR(32),
      leave_message TEXT DEFAULT '{user} har forladt {server}.',
      autorole_id VARCHAR(32),
      support_role_id VARCHAR(32),
      ticket_category_id VARCHAR(32),
      verification_role_id VARCHAR(32),
      suggestion_channel_id VARCHAR(32),
      automod_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      invite_filter BOOLEAN NOT NULL DEFAULT FALSE,
      levels_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      economy_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      anti_raid_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      lockdown BOOLEAN NOT NULL DEFAULT FALSE,
      ai_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      ai_channel_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    ALTER TABLE public.guild_settings
      ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS ai_channel_ids JSONB NOT NULL DEFAULT '[]'::jsonb
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS warnings (
      id BIGSERIAL PRIMARY KEY,
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      moderator_id VARCHAR(32) NOT NULL,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_stats (
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 0,
      coins INTEGER NOT NULL DEFAULT 0,
      last_daily TIMESTAMPTZ,
      last_work TIMESTAMPTZ,
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS suggestions (
      id BIGSERIAL PRIMARY KEY,
      guild_id VARCHAR(32) NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      content TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      channel_id VARCHAR(32),
      message_id VARCHAR(32),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS giveaways (
      id BIGSERIAL PRIMARY KEY,
      guild_id VARCHAR(32) NOT NULL,
      channel_id VARCHAR(32) NOT NULL,
      message_id VARCHAR(32) NOT NULL,
      prize VARCHAR(200) NOT NULL,
      winners INTEGER NOT NULL DEFAULT 1,
      ends_at TIMESTAMPTZ NOT NULL,
      host_id VARCHAR(32) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'running',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS giveaway_entries (
      giveaway_id BIGINT NOT NULL,
      user_id VARCHAR(32) NOT NULL,
      PRIMARY KEY (giveaway_id, user_id)
    )
  `);

  await db.query(`
    INSERT INTO bot_settings (id, prefix, maintenance, auto_reply, welcome_messages)
    VALUES (1, '!', FALSE, TRUE, TRUE)
    ON CONFLICT (id) DO NOTHING
  `);

  await ensureAdmin();
  await loadPersistentState();
}

async function loadPersistentState() {
  if (!db) return;

  const [tickets, messages, logs, settings] = await Promise.all([
    db.query(`
      SELECT id, title, user_name AS "user", status, priority, created_at AS "createdAt"
      FROM public.tickets ORDER BY created_at DESC LIMIT 500
    `),
    db.query(`
      SELECT id, channel, content, author, created_at AS "time"
      FROM public.messages ORDER BY created_at DESC LIMIT 500
    `),
    db.query(`
      SELECT id, type, message, created_at AS "time"
      FROM public.logs ORDER BY created_at DESC LIMIT 100
    `),
    db.query(`
      SELECT prefix, maintenance, auto_reply AS "autoReply", welcome_messages AS "welcomeMessages"
      FROM public.bot_settings WHERE id = 1 LIMIT 1
    `)
  ]);

  state.tickets = tickets.rows;
  state.messages = messages.rows;
  state.logs = logs.rows;
  if (settings.rows[0]) state.settings = settings.rows[0];
  const buttonLabelLog = state.logs.find(item => item.type === "button_labels");
  if (buttonLabelLog) {
    try { state.settings.buttonLabels = JSON.parse(buttonLabelLog.message) || {}; } catch (_) {}
  }
}

const startedAt = Date.now();

const state = {
  users: [],
  tickets: [],
  messages: [],
  logs: [],
  loginAudit: [],
  settings: {
    prefix: "!",
    maintenance: false,
    autoReply: true,
    welcomeMessages: true,
    buttonLabels: {}
  }
};

function log(type, message, ownerUserId = null) {
  const item = {
    id: Date.now() + Math.random(),
    type,
    message,
    ownerUserId: ownerUserId || null,
    time: new Date().toISOString()
  };
  state.logs.unshift(item);
  state.logs = state.logs.slice(0, 100);

  if (db) {
    db.query(
      "INSERT INTO public.logs (type, message, owner_user_id) VALUES ($1, $2, $3)",
      [type, message, ownerUserId || null]
    ).catch(error => console.error("[ShardNote] Log persistence failed:", error.message));
  }
}


const sessions = new Map();
const logsUnlocks = new Map();
const ipUnlocks = new Map();

function getIpEncryptionKey() {
  const secret = String(process.env.IP_ENCRYPTION_KEY || "").trim();
  if (!secret) throw new Error("IP_ENCRYPTION_KEY is not configured.");
  return crypto.createHash("sha256").update(secret).digest();
}

function normalizeIp(ip) {
  return String(ip || "").trim().replace(/^::ffff:/, "");
}

function encryptIp(ip) {
  const normalized = normalizeIp(ip);
  if (!normalized) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getIpEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(".");
}

function decryptIp(value) {
  if (!value) return null;
  try {
    const [ivHex, tagHex, encryptedHex] = String(value).split(".");
    if (!ivHex || !tagHex || !encryptedHex) return null;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getIpEncryptionKey(),
      Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return decipher.update(Buffer.from(encryptedHex, "hex")).toString("utf8") + decipher.final("utf8");
  } catch {
    return null;
  }
}

function hashIp(ip) {
  const normalized = normalizeIp(ip);
  if (!normalized) return null;
  return crypto.createHmac("sha256", getIpEncryptionKey()).update(normalized).digest("hex");
}

async function migrateProtectedIpData() {
  if (!db) return;

  while (true) {
    const result = await db.query(
      `SELECT id, host(ip_address) AS ip
       FROM public.login_audit
       WHERE ip_address IS NOT NULL AND (ip_encrypted IS NULL OR ip_encrypted = '')
       ORDER BY id ASC
       LIMIT 500`
    );
    if (!result.rowCount) break;
    for (const row of result.rows) {
      const encrypted = encryptIp(row.ip);
      if (!encrypted) continue;
      await db.query(
        "UPDATE public.login_audit SET ip_encrypted = $1, ip_address = NULL WHERE id = $2",
        [encrypted, row.id]
      );
    }
  }

  while (true) {
    const result = await db.query(
      `SELECT id, host(banned_ip) AS ip
       FROM public.users
       WHERE banned_ip IS NOT NULL
       ORDER BY id ASC
       LIMIT 500`
    );
    if (!result.rowCount) break;
    for (const row of result.rows) {
      const encrypted = encryptIp(row.ip);
      const hash = hashIp(row.ip);
      await db.query(
        `UPDATE public.users
         SET banned_ip_encrypted = $1, banned_ip_hash = $2, banned_ip = NULL
         WHERE id = $3`,
        [encrypted, hash, row.id]
      );
    }
  }
}

function getSessionId(req) {
  return parseCookies(req).shardnote_session;
}

function hasLogsAccess(req) {
  const sid = getSessionId(req);
  const expiresAt = sid ? logsUnlocks.get(sid) : 0;
  if (!expiresAt || expiresAt <= Date.now()) {
    if (sid) logsUnlocks.delete(sid);
    return false;
  }
  return true;
}

function getClientIp(req) {
  const ip = String(req.ip || req.socket?.remoteAddress || "").trim();
  return ip.replace(/^::ffff:/, "");
}

const geoCache = new Map();

async function lookupIpLocation() {
  return { country: null, city: null };
}

async function recordLoginAudit({ req, user, success, eventType }) {
  const ipAddress = getClientIp(req);
  const ipEncrypted = ipAddress ? encryptIp(ipAddress) : null;

  const item = {
    id: Date.now() + Math.random(),
    userId: user?.id || null,
    userName: user?.name || null,
    userEmail: user?.email || null,
    eventType,
    success: !!success,
    ipEncrypted,
    userAgent: String(req.headers["user-agent"] || "").slice(0, 1000),
    country: null,
    city: null,
    createdAt: new Date().toISOString()
  };

  if (db) {
    await db.query(
      `INSERT INTO public.login_audit
       (user_id, user_name, user_email, event_type, success, ip_address, ip_encrypted, user_agent, country, city)
       VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9)`,
      [
        item.userId,
        item.userName,
        item.userEmail,
        item.eventType,
        item.success,
        item.ipEncrypted,
        item.userAgent,
        item.country,
        item.city
      ]
    );
  } else {
    state.loginAudit.unshift(item);
    state.loginAudit = state.loginAudit.slice(0, 500);
  }
}

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

async function ensureAdmin() {
  const configuredEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const email = (configuredEmail || "admin@shardnote.local");
  const hasBootstrapPassword = Object.prototype.hasOwnProperty.call(process.env, "ADMIN_PASSWORD");
  const password = hasBootstrapPassword ? String(process.env.ADMIN_PASSWORD || "") : "change-me-now";

  if (db) {
    const byEmail = await db.query(
      "SELECT id, role FROM users WHERE email = $1 LIMIT 1",
      [email]
    );

    if (!byEmail.rowCount) {
      await db.query(
        "INSERT INTO users (name, email, role, password_hash) VALUES ($1, $2, $3, $4)",
        ["Administrator", email, "admin", hashPassword(password)]
      );
      log("security", `Admin account ${email} is ready in database`);
      return;
    }

    // ADMIN_EMAIL can be used to bootstrap an existing account into an admin.
    // ADMIN_PASSWORD is only used to replace that account's password when explicitly set.
    if (configuredEmail) {
      if (hasBootstrapPassword) {
        await db.query(
          "UPDATE users SET role = 'admin', password_hash = $1 WHERE email = $2",
          [hashPassword(password), email]
        );
      } else {
        await db.query(
          "UPDATE users SET role = 'admin' WHERE email = $1",
          [email]
        );
      }
      log("security", `Bootstrap admin ensured for ${email}`);
    }
    return;
  }

  if (!state.users.length) {
    state.users.push({
      id: 1,
      name: "Administrator",
      email,
      role: "admin",
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString()
    });
    log("security", "Initial admin account is ready in memory");
    return;
  }

  if (configuredEmail) {
    const existing = state.users.find(u => u.email.toLowerCase() === email);
    if (existing) {
      existing.role = "admin";
      if (hasBootstrapPassword) existing.passwordHash = hashPassword(password);
      log("security", `Bootstrap admin ensured for ${email}`);
    }
  }
}
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.DISCORD_TOKEN || process.env.STRIPE_SECRET_KEY || process.env.DATABASE_URL || "shardnote-session-secret";

function signSessionUserId(userId) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(String(userId)).digest("hex");
}

function createSessionToken(userId) {
  const id = String(userId);
  return id + "." + signSessionUserId(id);
}

function verifySessionToken(token) {
  const raw = String(token || "");
  const [id, signature] = raw.split(".");
  if (!id || !signature || !/^\d+$/.test(id)) return null;
  const expected = signSessionUserId(id);
  if (signature.length !== expected.length) return null;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? Number(id) : null;
  } catch {
    return null;
  }
}

function currentUser(req) {
  const sid = parseCookies(req).shardnote_session;
  if (!sid) return null;
  const cached = sessions.get(sid);
  if (cached) return cached;

  const userId = verifySessionToken(sid);
  if (userId == null) return null;

  if (!db) {
    return state.users.find(user => Number(user.id) === userId) || null;
  }

  return { id: userId };
}
async function updateUserSubscription({userId,status,customerId=null,subscriptionId=null,currentPeriodEnd=null}){const normalizedStatus=String(status||"inactive");const periodEnd=currentPeriodEnd?new Date(Number(currentPeriodEnd)*1000).toISOString():null;if(db){await db.query(`UPDATE public.users SET subscription_status=$1,stripe_customer_id=COALESCE($2,stripe_customer_id),stripe_subscription_id=COALESCE($3,stripe_subscription_id),subscription_current_period_end=COALESCE($4::timestamptz,subscription_current_period_end) WHERE id=$5`,[normalizedStatus,customerId,subscriptionId,periodEnd,userId]);return;}const user=state.users.find(item=>String(item.id)===String(userId));if(user){user.subscriptionStatus=normalizedStatus;if(customerId)user.stripeCustomerId=customerId;if(subscriptionId)user.stripeSubscriptionId=subscriptionId;if(periodEnd)user.subscriptionCurrentPeriodEnd=periodEnd;}}
async function updateUserSubscriptionByStripeSubscription(subscriptionId,status){if(!db||!subscriptionId)return;await db.query("UPDATE public.users SET subscription_status=$1 WHERE stripe_subscription_id=$2",[status,subscriptionId]);}
async function refreshSubscriptionFromStripe(user){if(!stripe||!user?.stripeSubscriptionId)return user;try{const subscription=await stripe.subscriptions.retrieve(user.stripeSubscriptionId);const customerId=typeof subscription.customer==="string"?subscription.customer:subscription.customer?.id||user.stripeCustomerId||null;await updateUserSubscription({userId:user.id,status:subscription.status,customerId,subscriptionId:subscription.id,currentPeriodEnd:subscription.current_period_end});user.subscriptionStatus=subscription.status;user.stripeCustomerId=customerId;user.stripeSubscriptionId=subscription.id;user.subscriptionCurrentPeriodEnd=subscription.current_period_end?new Date(subscription.current_period_end*1000).toISOString():user.subscriptionCurrentPeriodEnd;}catch(error){console.error("[ShardNote] Could not refresh Stripe subscription:",error.message);}return user;}
async function getSessionUser(req){
  const sessionUser=currentUser(req);
  if(!sessionUser) return null;
  if(!db) return sessionUser;
  const result=await db.query(
    `SELECT id,name,email,role,plan,subscription_status AS "subscriptionStatus",trial_used AS "trialUsed",stripe_customer_id AS "stripeCustomerId",stripe_subscription_id AS "stripeSubscriptionId",subscription_current_period_end AS "subscriptionCurrentPeriodEnd"
     FROM public.users WHERE id=$1 LIMIT 1`,
    [sessionUser.id]
  );
  const row=result.rows[0];
  if(!row) return null;
  Object.assign(sessionUser,row);
  return sessionUser;
}
function hasPaidAccess(user){return user?.role==="admin"||["active","trialing"].includes(user?.subscriptionStatus);}
async function requireAuth(req,res,next){try{const user=await getSessionUser(req);if(!user)return res.status(401).json({error:"Du skal logge ind."});req.user=user;next();}catch(error){console.error(error);res.status(500).json({error:"Loginstatus kunne ikke hentes."});}}
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Kun administratorer har adgang." });
  next();
}
function requirePaid(req, res, next) {
  if (!hasPaidAccess(req.user)) return res.status(402).json({ requiresSubscription: true, error: "Et aktivt ShardNote-abonnement kræves." });
  next();
}
function requirePlan(minimumPlan, req, res, next) {
  if (req.user?.role === "admin") return next();
  const rank = { member: 0, member_plus: 1, member_pro: 2, member_premium: 3 };
  const current = rank[req.user?.plan || "member"] ?? 0;
  const needed = rank[minimumPlan] ?? 0;
  if (current < needed) return res.status(403).json({ requiresPlan: minimumPlan, error: "Denne funktion kræver " + minimumPlan + "." });
  next();
}
async function isGuildLinkedToUser(userId, guildId) {
  if (!db) return false;
  const result = await db.query(
    "SELECT 1 FROM public.account_guilds WHERE user_id = $1 AND guild_id = $2 LIMIT 1",
    [userId, String(guildId)]
  );
  return result.rowCount > 0;
}

async function saveTicket({ title, user, status = "open", priority = "normal", ownerUserId = null, guildId = null, category = "support", description = "", handler = "admins" }) {
  const cleanTitle = String(title || "New ticket").slice(0, 120);
  const cleanUser = String(user || "Dashboard user").slice(0, 80);
  const cleanStatus = ["open", "pending", "closed"].includes(status) ? status : "open";
  const cleanPriority = ["low", "normal", "high"].includes(priority) ? priority : "normal";
  const cleanCategory = String(category || "support").trim().slice(0, 40) || "support";
  const cleanDescription = String(description || "").trim().slice(0, 5000);
  const cleanHandler = ["ai","admins","ticket"].includes(String(handler)) ? String(handler) : "admins";
  let resolvedOwnerUserId = ownerUserId || null;

  if (!resolvedOwnerUserId && db && guildId) {
    const owner = await db.query(
      "SELECT user_id FROM public.account_guilds WHERE guild_id = $1 ORDER BY created_at ASC LIMIT 1",
      [String(guildId)]
    );
    resolvedOwnerUserId = owner.rows[0]?.user_id || null;
  }

  if (db) {
    const result = await db.query(
      `INSERT INTO public.tickets (title, user_name, status, priority, owner_user_id, category, description, handler)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, title, user_name AS "user", status, priority, category, description, handler, created_at AS "createdAt"`,
      [cleanTitle, cleanUser, cleanStatus, cleanPriority, resolvedOwnerUserId, cleanCategory, cleanDescription, cleanHandler]
    );
    const ticket = result.rows[0];
    ticket.ownerUserId = resolvedOwnerUserId;
    ticket.category = cleanCategory;
    ticket.description = cleanDescription;
    ticket.handler = cleanHandler;
    state.tickets.unshift(ticket);
    state.tickets = state.tickets.slice(0, 500);
    return ticket;
  }

  const ticket = {
    id: Date.now(),
    title: cleanTitle,
    user: cleanUser,
    status: cleanStatus,
    priority: cleanPriority,
    category: cleanCategory,
    description: cleanDescription,
    handler: cleanHandler,
    ownerUserId: resolvedOwnerUserId,
    createdAt: new Date().toISOString()
  };
  state.tickets.unshift(ticket);
  state.tickets = state.tickets.slice(0, 500);
  return ticket;
}

let discordReady = false;

const client = createBot({
  state,
  db,
  log,
  createTicket: saveTicket,
  setReady(ready) {
    discordReady = ready;
  }
});

app.post("/api/login", async (req, res) => {
  try {
    await ensureAdmin();

    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    let user;
    if (db) {
      const result = await db.query(
        `SELECT id, name, email, role, password_hash, created_at,
                subscription_status AS "subscriptionStatus",
                trial_used AS "trialUsed",
                plan,
                stripe_customer_id AS "stripeCustomerId",
                stripe_subscription_id AS "stripeSubscriptionId",
                subscription_current_period_end AS "subscriptionCurrentPeriodEnd",
                banned,
                ban_type AS "banType",
                     banned_at AS "bannedAt"
         FROM users WHERE email = $1 LIMIT 1`,
        [email]
      );
      const row = result.rows[0];
      if (row && row.password_hash === hashPassword(password)) {
        user = {
          id: row.id,
          name: row.name,
          email: row.email,
          role: row.role,
          passwordHash: row.password_hash,
          createdAt: row.created_at,
          banned: !!row.banned,
          banType: row.banType || null,
          bannedIp: row.bannedIp || null,
          bannedAt: row.bannedAt || null,
          subscriptionStatus: row.subscriptionStatus || "inactive",
          trialUsed: !!row.trialUsed,
          plan: ["member","member_plus","member_pro","member_premium"].includes(row.plan) ? row.plan : "member",
          stripeCustomerId: row.stripeCustomerId || null,
          stripeSubscriptionId: row.stripeSubscriptionId || null,
          subscriptionCurrentPeriodEnd: row.subscriptionCurrentPeriodEnd || null
        };
        if (stripe && user.stripeSubscriptionId) await refreshSubscriptionFromStripe(user);
      }
    } else {
      user = state.users.find(
        u => u.email.toLowerCase() === email && u.passwordHash === hashPassword(password)
      );
    }

    if (!user) {
      await recordLoginAudit({
        req,
        user: { email },
        success: false,
        eventType: "login_failed"
      });
      log("security", `Failed login attempt for ${email || "unknown user"}`);
      return res.status(401).json({ error: "Forkert email eller adgangskode." });
    }

    if (user.banned) {
      await recordLoginAudit({ req, user, success: false, eventType: "login_blocked" });
      return res.status(403).json({ error: "Denne konto er bannet." });
    }

    if (db) {
      const ip = getClientIp(req);
      const ipHash = hashIp(ip);
      const ipBan = await db.query(
        "SELECT 1 FROM public.users WHERE banned = TRUE AND ban_type = 'ip' AND banned_ip_hash = $1 LIMIT 1",
        [ipHash]
      );
      if (ip && ipBan.rowCount) {
        await recordLoginAudit({ req, user, success: false, eventType: "ip_ban_blocked" });
        return res.status(403).json({ error: "Denne IP-adresse er bannet." });
      }
    }

    const sid = createSessionToken(user.id);
    sessions.set(sid, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      plan: user.plan || "member",
      banned: !!user.banned
    });

    res.setHeader("Set-Cookie", `shardnote_session=${sid}; HttpOnly; Path=/; SameSite=Lax`);
    await recordLoginAudit({ req, user, success: true, eventType: "login" });
    log("security", `User ${user.email} logged in`);
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        subscriptionStatus: user.subscriptionStatus || "inactive",
        trialUsed: !!user.trialUsed,
        plan: user.plan || "member",
        hasPaidAccess: hasPaidAccess(user)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Login kunne ikke gennemføres." });
  }
});

app.post("/api/register", async (req, res) => {
  try {
    await ensureAdmin();

    const name = String(req.body.name || "").trim().slice(0, 80);
    const email = String(req.body.email || "").trim().toLowerCase().slice(0, 160);
    const password = String(req.body.password || "");

    if (name.length < 2) {
      return res.status(400).json({ error: "Navnet skal være mindst 2 tegn." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Skriv en gyldig emailadresse." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Adgangskoden skal være mindst 8 tegn." });
    }

    let user;

    if (db) {
      const existing = await db.query("SELECT id, banned FROM users WHERE email = $1 LIMIT 1", [email]);
      if (existing.rowCount) {
        if (existing.rows[0].banned) return res.status(403).json({ error: "Denne email er bannet." });
        return res.status(409).json({ error: "Der findes allerede en konto med den email." });
      }

      const clientIp = getClientIp(req);
      if (clientIp) {
        const ipHash = hashIp(clientIp);
        const ipBan = await db.query(
          "SELECT 1 FROM public.users WHERE banned = TRUE AND ban_type = 'ip' AND banned_ip_hash = $1 LIMIT 1",
          [ipHash]
        );
        if (ipBan.rowCount) return res.status(403).json({ error: "Denne IP-adresse er bannet." });
      }

      try {
        const result = await db.query(
          "INSERT INTO users (name, email, role, password_hash, plan) VALUES ($1, $2, 'member', $3, 'member') RETURNING id, name, email, role, plan, created_at, banned",
          [name, email, hashPassword(password)]
        );
        user = result.rows[0];
      } catch (error) {
        if (error.code === "23505") {
          return res.status(409).json({ error: "Der findes allerede en konto med den email." });
        }
        throw error;
      }
    } else {
      const existingUser = state.users.find(u => u.email === email);
      if (existingUser) {
        if (existingUser.banned) return res.status(403).json({ error: "Denne email er bannet." });
        return res.status(409).json({ error: "Der findes allerede en konto med den email." });
      }
      const clientIp = getClientIp(req);
      const ipHash = hashIp(clientIp);
      if (clientIp && state.users.some(u => u.banned && u.banType === "ip" && u.bannedIpHash === ipHash)) {
        return res.status(403).json({ error: "Denne IP-adresse er bannet." });
      }

      user = {
        id: Date.now(),
        name,
        email,
        role: "member",
        passwordHash: hashPassword(password),
        createdAt: new Date().toISOString()
      };
      state.users.push(user);
    }

    const sid = createSessionToken(user.id);
    sessions.set(sid, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      plan: user.plan || "member"
    });

    res.setHeader("Set-Cookie", `shardnote_session=${sid}; HttpOnly; Path=/; SameSite=Lax`);
    log("security", `New account registered: ${email}`);
    res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan || "member"
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Kontoen kunne ikke oprettes." });
  }
});

app.post("/api/logout", (req, res) => {
  const sid = parseCookies(req).shardnote_session;
  if (sid) {
    sessions.delete(sid);
    logsUnlocks.delete(sid);
    ipUnlocks.delete(sid);
  }
  res.setHeader("Set-Cookie", "shardnote_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
  res.json({ ok: true });
});

app.get("/api/me", async (req,res)=>{
  const user=await getSessionUser(req);
  if(!user)return res.status(401).json({error:"Ikke logget ind."});
  if(stripe&&user.stripeSubscriptionId)await refreshSubscriptionFromStripe(user);
  res.json({user:{id:user.id,name:user.name,email:user.email,role:user.role,plan:user.plan||"member",subscriptionStatus:user.subscriptionStatus||"inactive",trialUsed:!!user.trialUsed,hasPaidAccess:hasPaidAccess(user)}});
});

app.get("/api/admin/login-history", requireAuth, requireAdmin, async (req, res) => {
  try {
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 200, 1), 500);

    if (db) {
      const result = await db.query(
        `SELECT
           id,
           user_id AS "userId",
           user_name AS "userName",
           user_email AS "userEmail",
           event_type AS "eventType",
           success,
           NULL AS "ipAddress",
           user_agent AS "userAgent",
           country,
           city,
           created_at AS "createdAt"
         FROM public.login_audit
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
      );
      return res.json(result.rows);
    }

    res.json(state.loginAudit.slice(0, limit));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Kunne ikke hente login-historikken." });
  }
});

app.get("/api/admin/database-summary", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!db) {
      return res.json({
        connected: false,
        tables: [
          { name: "users", rows: state.users.length },
          { name: "tickets", rows: state.tickets.length },
          { name: "messages", rows: state.messages.length },
          { name: "logs", rows: state.logs.length },
          { name: "bot_settings", rows: 1 },
          { name: "login_audit", rows: state.loginAudit.length }
        ]
      });
    }

    const tableNames = ["users", "tickets", "messages", "logs", "bot_settings", "login_audit"];
    const tables = [];
    for (const name of tableNames) {
      const result = await db.query(`SELECT COUNT(*)::int AS count FROM public.${name}`);
      tables.push({ name, rows: result.rows[0].count });
    }

    res.json({ connected: true, tables });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Kunne ikke hente database-status." });
  }
});

app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    await ensureAdmin();

    if (db) {
      const result = await db.query(
        `SELECT
           id, name, email, role, plan,
           banned,
           ban_type AS "banType",
           banned_at AS "bannedAt",
           created_at AS "createdAt"
         FROM users ORDER BY id ASC`
      );
      return res.json(result.rows);
    }

    res.json(state.users.map(({ passwordHash, ...u }) => u));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Kunne ikke hente brugere." });
  }
});

app.post("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    await ensureAdmin();

    const name = String(req.body.name || "").trim().slice(0, 80);
    const email = String(req.body.email || "").trim().toLowerCase().slice(0, 160);
    const password = String(req.body.password || "");
    const role = req.body.role === "admin" ? "admin" : "member";
    const plan = ["member","member_plus","member_pro","member_premium"].includes(req.body.plan) ? req.body.plan : "member";

    if (!name || !email || password.length < 8) {
      return res.status(400).json({ error: "Navn, email og adgangskode på mindst 8 tegn er påkrævet." });
    }

    let user;

    if (db) {
      try {
        const result = await db.query(
          "INSERT INTO users (name, email, role, password_hash, plan) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, plan, created_at",
          [name, email, role, hashPassword(password), plan]
        );
        user = result.rows[0];
      } catch (error) {
        if (error.code === "23505") {
          return res.status(409).json({ error: "Email findes allerede." });
        }
        throw error;
      }
    } else {
      if (state.users.some(u => u.email === email)) {
        return res.status(409).json({ error: "Email findes allerede." });
      }
      user = {
        id: Date.now(),
        name,
        email,
        role,
        plan,
        passwordHash: hashPassword(password),
        createdAt: new Date().toISOString()
      };
      state.users.push(user);
    }

    log("security", `Admin ${req.user.email} created user ${email}`);
    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      plan: user.plan || "member",
      createdAt: user.created_at || user.createdAt
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Brugeren kunne ikke oprettes." });
  }
});

app.patch("/api/admin/users/:id/role", requireAuth, requireAdmin, async (req, res) => {
  try {
    await ensureAdmin();

    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ error: "Du kan ikke ændre din egen rolle." });
    }

    const role = req.body.role === "admin" ? "admin" : "member";

    if (db) {
      const result = await db.query(
        "UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role, created_at",
        [role, req.params.id]
      );
      if (!result.rowCount) return res.status(404).json({ error: "Bruger ikke fundet." });
      const user = result.rows[0];
      log("security", `Admin ${req.user.email} changed ${user.email} role to ${role}`);
      return res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.created_at
      });
    }

    const id = Number(req.params.id);
    const user = state.users.find(u => u.id === id);
    if (!user) return res.status(404).json({ error: "Bruger ikke fundet." });

    user.role = role;
    log("security", `Admin ${req.user.email} changed ${user.email} role to ${role}`);
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Rollen kunne ikke ændres." });
  }
});

app.patch("/api/admin/users/:id/plan", requireAuth, requireAdmin, async (req, res) => {
  try {
    await ensureAdmin();
    const allowed = ["member","member_plus","member_pro","member_premium"];
    const plan = allowed.includes(req.body.plan) ? req.body.plan : "member";
    if (db) {
      const result = await db.query(
        "UPDATE users SET plan = $1 WHERE id = $2 RETURNING id, name, email, role, plan, created_at",
        [plan, req.params.id]
      );
      if (!result.rowCount) return res.status(404).json({ error: "Bruger ikke fundet." });
      const user = result.rows[0];
      log("security", `Admin ${req.user.email} changed ${user.email} plan to ${plan}`);
      return res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan,
        createdAt: user.created_at
      });
    }
    const id = Number(req.params.id);
    const user = state.users.find(u => u.id === id);
    if (!user) return res.status(404).json({ error: "Bruger ikke fundet." });
    user.plan = plan;
    log("security", `Admin ${req.user.email} changed ${user.email} plan to ${plan}`);
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      plan: user.plan,
      createdAt: user.createdAt
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Pakken kunne ikke ændres." });
  }
});

app.patch("/api/admin/users/:id/ban", requireAuth, requireAdmin, async (req, res) => {
  try {
    await ensureAdmin();

    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ error: "Du kan ikke banne din egen konto." });
    }

    const banType = req.body?.type === "ip" ? "ip" : "normal";
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Ugyldigt bruger-ID." });

    let userEmail = null;
    let bannedIp = null;

    if (db) {
      const userResult = await db.query(
        `SELECT id, email, banned, ban_type AS "banType", host(banned_ip) AS "bannedIp"
         FROM public.users WHERE id = $1 LIMIT 1`,
        [id]
      );
      if (!userResult.rowCount) return res.status(404).json({ error: "Bruger ikke fundet." });

      const target = userResult.rows[0];
      userEmail = target.email;

      if (banType === "ip") {
        const loginIp = await db.query(
          `SELECT ip_encrypted
           FROM public.login_audit
           WHERE user_id = $1 AND success = TRUE AND ip_encrypted IS NOT NULL
           ORDER BY created_at DESC
           LIMIT 1`,
          [id]
        );
        bannedIp = decryptIp(loginIp.rows[0]?.ip_encrypted);
        if (!bannedIp) return res.status(400).json({ error: "Der er ingen registreret IP-adresse for denne bruger endnu. Brugeren skal logge ind mindst én gang først." });
      }

      await db.query(
        `UPDATE public.users
         SET banned = TRUE,
             ban_type = $1,
             banned_ip = NULL,
             banned_ip_hash = CASE WHEN $1 = 'ip' THEN $2 ELSE NULL END,
             banned_ip_encrypted = CASE WHEN $1 = 'ip' THEN $3 ELSE NULL END,
             banned_at = NOW()
         WHERE id = $4`,
        [
          banType,
          banType === "ip" ? hashIp(bannedIp) : null,
          banType === "ip" ? encryptIp(bannedIp) : null,
          id
        ]
      );
    } else {
      const target = state.users.find(u => Number(u.id) === id);
      if (!target) return res.status(404).json({ error: "Bruger ikke fundet." });
      userEmail = target.email;
      if (banType === "ip") {
        const audit = state.loginAudit.find(item => Number(item.userId) === id && item.success && item.ipAddress);
        bannedIp = decryptIp(audit?.ipEncrypted) || null;
        if (!bannedIp) return res.status(400).json({ error: "Der er ingen registreret IP-adresse for denne bruger endnu." });
      }
      target.banned = true;
      target.banType = banType;
      target.bannedIp = null;
      target.bannedIpHash = banType === "ip" ? hashIp(bannedIp) : null;
      target.bannedIpEncrypted = banType === "ip" ? encryptIp(bannedIp) : null;
      target.bannedAt = new Date().toISOString();
    }

    for (const [sid, sessionUser] of sessions.entries()) {
      if (String(sessionUser?.id) === String(id)) sessions.delete(sid);
    }

    log("security", `Admin ${req.user.email} banned ${userEmail} (${banType})`);
    res.json({ ok: true, banType });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Brugeren kunne ikke bannes." });
  }
});

app.patch("/api/admin/users/:id/unban", requireAuth, requireAdmin, async (req, res) => {
  try {
    await ensureAdmin();
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Ugyldigt bruger-ID." });

    if (db) {
      const result = await db.query(
        "UPDATE public.users SET banned = FALSE, ban_type = NULL, banned_ip = NULL, banned_ip_hash = NULL, banned_ip_encrypted = NULL, banned_at = NULL WHERE id = $1 RETURNING id, email",
        [id]
      );
      if (!result.rowCount) return res.status(404).json({ error: "Bruger ikke fundet." });
      log("security", `Admin ${req.user.email} fjernede ban for ${result.rows[0].email}`);
      return res.json({ ok: true });
    }

    const user = state.users.find(u => Number(u.id) === id);
    if (!user) return res.status(404).json({ error: "Bruger ikke fundet." });
    user.banned = false;
    user.banType = null;
    user.bannedIp = null;
    user.bannedAt = null;
    log("security", `Admin ${req.user.email} fjernede ban for ${user.email}`);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Bannet kunne ikke fjernes." });
  }
});

app.delete("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await ensureAdmin();

    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ error: "Du kan ikke slette din egen konto." });
    }

    if (db) {
      const result = await db.query("DELETE FROM users WHERE id = $1 RETURNING id", [req.params.id]);
      if (!result.rowCount) return res.status(404).json({ error: "Bruger ikke fundet." });
    } else {
      const id = Number(req.params.id);
      const before = state.users.length;
      state.users = state.users.filter(u => u.id !== id);
      if (before === state.users.length) {
        return res.status(404).json({ error: "Bruger ikke fundet." });
      }
    }

    log("security", `Admin ${req.user.email} deleted user #${req.params.id}`);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Brugeren kunne ikke slettes." });
  }
});


app.get("/api/bot/invite", requireAuth, (req, res) => {
  if (!discordReady || !client?.user?.id) {
    return res.status(503).json({ error: "The Discord bot is not online yet." });
  }

  const clientId = client.user.id;
  const permissions = "8";
  const inviteUrl =
    "https://discord.com/oauth2/authorize" +
    `?client_id=${encodeURIComponent(clientId)}` +
    "&scope=bot%20applications.commands" +
    `&permissions=${permissions}`;

  res.json({
    url: inviteUrl,
    clientId,
    permissions
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "ShardNote",
    discord: discordReady,
    uptime: Math.floor((Date.now() - startedAt) / 1000)
  });
});

app.post("/api/billing/create-checkout",requireAuth,async(req,res)=>{
  try{
    if(!stripe)return res.status(503).json({error:"Stripe er ikke konfigureret endnu."});
    if(hasPaidAccess(req.user))return res.status(400).json({error:"Du har allerede adgang."});

    const requestedPlan=["member","member_plus","member_pro"].includes(req.body?.plan) ? req.body.plan : "member";
    const planInfo={
      member:{amount:267,name:"ShardNote Member"},
      member_plus:{amount:468,name:"ShardNote Member Plus"},
      member_pro:{amount:Number(process.env.STRIPE_MEMBER_PRO_AMOUNT_EUR || 699),name:"ShardNote Member Pro"}
    }[requestedPlan];

    let customerId=req.user.stripeCustomerId;
    if(!customerId){
      const customer=await stripe.customers.create({email:req.user.email,name:req.user.name,metadata:{user_id:String(req.user.id),plan:requestedPlan}});
      customerId=customer.id;
      await updateUserSubscription({userId:req.user.id,status:"inactive",customerId});
    }

    const firstTrial=!req.user.trialUsed;
    const session=await stripe.checkout.sessions.create({
      mode:"subscription",
      customer:customerId,
      line_items:[{price_data:{currency:"eur",unit_amount:planInfo.amount,recurring:{interval:"month"},product_data:{name:planInfo.name}},quantity:1}],
      metadata:{user_id:String(req.user.id),plan:requestedPlan},
      subscription_data:{
        metadata:{user_id:String(req.user.id),plan:requestedPlan},
        ...(firstTrial ? {trial_period_days:10} : {})
      },
      success_url:PUBLIC_SITE_URL+"/?payment=success",
      cancel_url:PUBLIC_SITE_URL+"/?payment=cancel"
    });

    if(firstTrial && db){
      await db.query("UPDATE public.users SET trial_used=TRUE WHERE id=$1",[req.user.id]);
    } else if(firstTrial){
      const localUser=state.users.find(item=>String(item.id)===String(req.user.id));
      if(localUser)localUser.trialUsed=true;
    }

    res.json({url:session.url,plan:requestedPlan});
  }catch(error){
    console.error("[ShardNote] Stripe checkout failed:",error);
    res.status(500).json({error:"Betalingssiden kunne ikke åbnes."});
  }
});

app.get("/api/billing/status",requireAuth,async(req,res)=>{
  try{
    if(stripe&&req.user.stripeSubscriptionId)await refreshSubscriptionFromStripe(req.user);
    res.json({configured:!!stripe,status:req.user.subscriptionStatus||"inactive",hasPaidAccess:hasPaidAccess(req.user)});
  }catch(error){
    console.error("[ShardNote] Stripe status check failed:",error);
    res.status(500).json({error:"Betalingsstatus kunne ikke hentes."});
  }
});

app.post("/api/billing/portal",requireAuth,async(req,res)=>{
  try{
    if(!stripe||!req.user.stripeCustomerId)return res.status(400).json({error:"Der er ikke noget Stripe-abonnement at administrere."});
    const portal=await stripe.billingPortal.sessions.create({customer:req.user.stripeCustomerId,return_url:PUBLIC_SITE_URL});
    res.json({url:portal.url});
  }catch(error){
    console.error("[ShardNote] Stripe portal failed:",error);
    res.status(500).json({error:"Abonnementsadministration kunne ikke åbnes."});
  }
});

app.use("/api", (req, res, next) => {
  if (["/login", "/register", "/logout", "/me"].includes(req.path) || req.path === "/health") return next();
  requireAuth(req,res,async()=>{
    try{
      if(["/billing/create-checkout","/billing/status","/billing/portal"].some(path=>req.path.startsWith(path))) return next();
      if(!hasPaidAccess(req.user))return res.status(402).json({requiresSubscription:true,error:"Et aktivt ShardNote-abonnement på 2 € pr. måned kræves."});
      next();
    }catch(error){console.error(error);res.status(500).json({error:"Adgangskontrol kunne ikke gennemføres."});}
  });
});

app.get("/api/stats", async (req, res) => {
  try {
    let linkedGuildIds = [];
    if (db && req.user?.role !== "admin") {
      const linked = await db.query("SELECT guild_id FROM public.account_guilds WHERE user_id = $1", [req.user.id]);
      linkedGuildIds = linked.rows.map(row => String(row.guild_id));
    }

    const linkedGuilds = discordReady
      ? (req.user?.role === "admin"
          ? [...client.guilds.cache.values()]
          : [...client.guilds.cache.values()].filter(guild => linkedGuildIds.includes(String(guild.id))))
      : [];

    let openTickets = req.user?.role === "admin"
      ? state.tickets.filter(t => t.status !== "closed").length
      : state.tickets.filter(t => t.ownerUserId === req.user.id && t.status !== "closed").length;
    if (db) {
      const result = req.user?.role === "admin"
        ? await db.query("SELECT COUNT(*)::int AS count FROM public.tickets WHERE status <> 'closed'")
        : await db.query("SELECT COUNT(*)::int AS count FROM public.tickets WHERE owner_user_id = $1 AND status <> 'closed'", [req.user.id]);
      openTickets = result.rows[0].count;
    }

    res.json({
      botOnline: linkedGuilds.length > 0,
      servers: linkedGuilds.length,
      users: req.user?.role === "admin" ? linkedGuilds.reduce((total, guild) => total + (guild.memberCount || 0), 0) : null,
      tickets: openTickets,
      commands: client.dashboardCommands?.length || 0,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      linked: linkedGuilds.length > 0
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Kunne ikke hente statistik." });
  }
});

app.get("/api/tickets", async (req, res) => {
  try {
    if (db) {
      const result = req.user?.role === "admin"
        ? await db.query(`
            SELECT id, title, user_name AS "user", status, priority, category, description, handler, created_at AS "createdAt", owner_user_id AS "ownerUserId"
            FROM public.tickets
            ORDER BY created_at DESC LIMIT 500
          `)
        : await db.query(`
            SELECT id, title, user_name AS "user", status, priority, category, description, handler, created_at AS "createdAt", owner_user_id AS "ownerUserId"
            FROM public.tickets
            WHERE owner_user_id = $1
            ORDER BY created_at DESC LIMIT 500
          `, [req.user.id]);
      state.tickets = result.rows;
    }
    res.json(req.user?.role === "admin"
      ? state.tickets
      : state.tickets.filter(item => String(item.ownerUserId || "") === String(req.user.id)));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Kunne ikke hente tickets." });
  }
});

app.post("/api/tickets", async (req, res) => {
  try {
    const ticket = await saveTicket({
      title: req.body.title,
      user: req.body.user,
      status: "open",
      priority: req.body.priority,
      ownerUserId: req.user.id,
      handler: req.body.handler
    });
    log("ticket", `Ticket #${ticket.id} created from dashboard`, req.user.id);
    res.status(201).json(ticket);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Ticket kunne ikke oprettes." });
  }
});

app.post("/api/upgrade-ideas", async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim().slice(0, 120);
    const description = String(req.body?.description || "").trim().slice(0, 5000);
    const area = String(req.body?.area || "Website / Bot").trim().slice(0, 80);

    if (title.length < 3) return res.status(400).json({ error: "Skriv en titel på mindst 3 tegn." });
    if (description.length < 10) return res.status(400).json({ error: "Skriv lidt mere om din idé." });

    const ticket = await saveTicket({
      title: "Opgradering: " + title,
      user: req.user?.email || "Dashboard user",
      status: "open",
      priority: "normal",
      ownerUserId: req.user.id,
      category: "upgrade",
      description: "Område: " + area + "\n\n" + description
    });

    log("ticket", `Upgrade idea #${ticket.id} created by ${req.user?.email || "user"}`, req.user.id);
    res.status(201).json(ticket);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Opgraderingsidéen kunne ikke oprettes." });
  }
});

app.patch("/api/tickets/:id", async (req, res) => {
  try {
    if (db) {
      const result = await db.query(
        `UPDATE public.tickets
         SET status = COALESCE($1, status),
             priority = COALESCE($2, priority),
             handler = COALESCE($6, handler)
         WHERE id = $3 AND (owner_user_id = $4 OR $5 = TRUE)
         RETURNING id, title, user_name AS "user", status, priority, created_at AS "createdAt", owner_user_id AS "ownerUserId"`,
        [
          ["open", "pending", "closed"].includes(req.body.status) ? req.body.status : null,
          ["low", "normal", "high"].includes(req.body.priority) ? req.body.priority : null,
          req.params.id,
          req.user.id,
          req.user.role === "admin",
          ["ai","admins","ticket"].includes(req.body.handler) ? req.body.handler : null
        ]
      );
      if (!result.rowCount) return res.status(404).json({ error: "Ticket not found" });
      const ticket = result.rows[0];
      const index = state.tickets.findIndex(t => String(t.id) === String(req.params.id));
      if (index >= 0) state.tickets[index] = ticket;
      log("ticket", `Ticket #${ticket.id} updated`, req.user.id);
      return res.json(ticket);
    }

    const ticket = state.tickets.find(t => String(t.id) === String(req.params.id) && (req.user?.role === "admin" || String(t.ownerUserId || "") === String(req.user.id)));
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    if (["open", "pending", "closed"].includes(req.body.status)) ticket.status = req.body.status;
    if (["low", "normal", "high"].includes(req.body.priority)) ticket.priority = req.body.priority;
    if (["ai","admins","ticket"].includes(req.body.handler)) ticket.handler = req.body.handler;
    log("ticket", `Ticket #${ticket.id} updated`, req.user.id);
    res.json(ticket);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Ticket kunne ikke opdateres." });
  }
});

app.delete("/api/tickets/:id", async (req, res) => {
  try {
    if (db) {
      const result = req.user?.role === "admin"
        ? await db.query("DELETE FROM public.tickets WHERE id = $1 RETURNING id", [req.params.id])
        : await db.query("DELETE FROM public.tickets WHERE id = $1 AND owner_user_id = $2 RETURNING id", [req.params.id, req.user.id]);
      if (!result.rowCount) return res.status(404).json({ error: "Ticket not found" });
      state.tickets = state.tickets.filter(t => String(t.id) !== String(req.params.id));
      log("ticket", `Ticket #${req.params.id} deleted`, req.user.id);
      return res.json({ ok: true });
    }

    const before = state.tickets.length;
    state.tickets = state.tickets.filter(t => !(String(t.id) === String(req.params.id) && String(t.ownerUserId || "") === String(req.user.id)));
    if (before === state.tickets.length) return res.status(404).json({ error: "Ticket not found" });
    log("ticket", `Ticket #${req.params.id} deleted`, req.user.id);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Ticket kunne ikke slettes." });
  }
});

app.get("/api/messages", async (req, res) => {
  try {
    if (db) {
      const result = req.user?.role === "admin"
        ? await db.query(`
            SELECT id, channel, content, author, created_at AS "time", owner_user_id AS "ownerUserId"
            FROM public.messages
            ORDER BY created_at DESC LIMIT 500
          `)
        : await db.query(`
            SELECT id, channel, content, author, created_at AS "time", owner_user_id AS "ownerUserId"
            FROM public.messages
            WHERE owner_user_id = $1
            ORDER BY created_at DESC LIMIT 500
          `, [req.user.id]);
      state.messages = result.rows;
    }
    res.json(req.user?.role === "admin"
      ? state.messages
      : state.messages.filter(item => String(item.ownerUserId || "") === String(req.user.id)));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Kunne ikke hente beskeder." });
  }
});

app.post("/api/messages", async (req, res) => {
  try {
    const content = String(req.body.content || "").trim();
    if (!content) return res.status(400).json({ error: "Message is required" });

    const channel = String(req.body.channel || "Dashboard").slice(0, 80);
    const result = db
      ? await db.query(
          `INSERT INTO public.messages (channel, content, author, owner_user_id)
           VALUES ($1, $2, $3, $4)
           RETURNING id, channel, content, author, created_at AS "time"`,
          [channel, content.slice(0, 2000), req.user?.email || "Dashboard", req.user.id]
        )
      : null;

    const item = result ? result.rows[0] : {
      id: Date.now(),
      channel,
      content: content.slice(0, 2000),
      author: req.user?.email || "Dashboard",
      time: new Date().toISOString()
    };

    state.messages.unshift(item);
    state.messages = state.messages.slice(0, 500);
    log("message", "Message created from dashboard", req.user.id);
    res.status(201).json(item);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Beskeden kunne ikke gemmes." });
  }
});

app.get("/api/commands", (req, res) => {
  const list = client.dashboardCommands || [];
  res.json(list.map(command => ({
    name: command.name,
    description: command.description,
    usage: "/" + command.name
  })));
});

app.post("/api/commands", async (req, res) => {
  const command = String(req.body.command || "").trim();
  if (!command) return res.status(400).json({ error: "Command is required" });

  log("command", `Dashboard command: ${command}`, req.user.id);
  res.json({
    ok: true,
    message: discordReady
      ? "Command received by the dashboard. Discord actions are available through the connected bot."
      : "Command saved. Connect DISCORD_TOKEN in Render to enable live Discord actions."
  });
});

app.get("/api/settings", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (db) {
      await db.query("INSERT INTO public.account_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [req.user.id]);
      const result = await db.query(
        `SELECT prefix, maintenance, auto_reply AS "autoReply", welcome_messages AS "welcomeMessages", button_labels AS "buttonLabels"
         FROM public.account_settings WHERE user_id = $1 LIMIT 1`,
        [req.user.id]
      );
      if (result.rows[0]) state.settings = result.rows[0];
    }
    res.json(state.settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Kunne ikke hente indstillinger." });
  }
});

app.patch("/api/settings", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (typeof req.body.prefix === "string" && req.body.prefix.length <= 5) {
      state.settings.prefix = req.body.prefix || "!";
    }
    if (typeof req.body.maintenance === "boolean") state.settings.maintenance = req.body.maintenance;
    if (typeof req.body.autoReply === "boolean") state.settings.autoReply = req.body.autoReply;
    if (typeof req.body.welcomeMessages === "boolean") state.settings.welcomeMessages = req.body.welcomeMessages;
    if (req.body.buttonLabels && typeof req.body.buttonLabels === "object") state.settings.buttonLabels = req.body.buttonLabels;

    if (db) {
      await db.query("INSERT INTO public.account_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [req.user.id]);
      const result = await db.query(
        `UPDATE public.account_settings
         SET prefix = $1,
             maintenance = $2,
             auto_reply = $3,
             welcome_messages = $4,
             button_labels = $5,
             updated_at = NOW()
         WHERE user_id = $6
         RETURNING prefix, maintenance, auto_reply AS "autoReply", welcome_messages AS "welcomeMessages", button_labels AS "buttonLabels"`,
        [
          state.settings.prefix,
          state.settings.maintenance,
          state.settings.autoReply,
          state.settings.welcomeMessages,
          JSON.stringify(state.settings.buttonLabels || {}),
          req.user.id
        ]
      );
      if (result.rows[0]) state.settings = result.rows[0];
    }

    log("settings", "Dashboard settings updated", req.user.id);
    res.json(state.settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Indstillingerne kunne ikke gemmes." });
  }
});

app.post("/api/ip/unlock", requireAuth, requireAdmin, async (req, res) => {
  try {
    const accessCode = String(req.body.password || "");
    const configuredCode = String(process.env.IP_ACCESS_CODE || "");
    if (!accessCode) return res.status(400).json({ error: "IP-kode mangler." });
    if (!configuredCode) return res.status(503).json({ error: "IP-koden er ikke konfigureret endnu." });

    const providedHash = crypto.createHash("sha256").update(accessCode).digest();
    const configuredHash = crypto.createHash("sha256").update(configuredCode).digest();
    const valid = crypto.timingSafeEqual(providedHash, configuredHash);
    if (!valid) return res.status(401).json({ error: "Forkert IP-kode." });

    const sid = getSessionId(req);
    ipUnlocks.set(sid, Date.now() + 15 * 60 * 1000);
    log("security", `IP-adressecenter låst op af ${req.user.email}`);
    res.json({ ok: true, expiresInSeconds: 900 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Kunne ikke låse IP-adresserne op." });
  }
});

app.post("/api/ip/lock", requireAuth, requireAdmin, (req, res) => {
  const sid = getSessionId(req);
  if (sid) ipUnlocks.delete(sid);
  res.json({ ok: true });
});

app.get("/api/ip/overview", requireAuth, requireAdmin, requireIpAccess, async (req, res) => {
  try {
    if (db) {
      const [auditResult, banResult] = await Promise.all([
        db.query(
          `SELECT
             id,
             user_id AS "userId",
             user_name AS "userName",
             user_email AS "userEmail",
             event_type AS "eventType",
             success,
             ip_encrypted AS "ipEncrypted",
             user_agent AS "userAgent",
             created_at AS "createdAt"
           FROM public.login_audit
           ORDER BY created_at DESC
           LIMIT 500`
        ),
        db.query(
          `SELECT
             id,
             name,
             email,
             banned_at AS "bannedAt",
             banned_ip_encrypted AS "ipEncrypted"
           FROM public.users
           WHERE banned = TRUE AND ban_type = 'ip' AND banned_ip_encrypted IS NOT NULL
           ORDER BY banned_at DESC NULLS LAST, id ASC`
        )
      ]);

      const loginHistory = auditResult.rows.map(row => ({
        id: row.id,
        userId: row.userId,
        userName: row.userName,
        userEmail: row.userEmail,
        eventType: row.eventType,
        success: !!row.success,
        ipAddress: decryptIp(row.ipEncrypted),
        userAgent: row.userAgent || "",
        createdAt: row.createdAt
      }));
      const bannedIps = banResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        email: row.email,
        ipAddress: decryptIp(row.ipEncrypted),
        bannedAt: row.bannedAt
      }));
      const distinctIps = [...new Set(
        [...loginHistory.map(item => item.ipAddress), ...bannedIps.map(item => item.ipAddress)].filter(Boolean)
      )];
      return res.json({ loginHistory, bannedIps, distinctIps });
    }

    const loginHistory = state.loginAudit.map(item => ({
      ...item,
      ipAddress: decryptIp(item.ipEncrypted)
    }));
    const bannedIps = state.users
      .filter(u => u.banned && u.banType === "ip" && u.bannedIpEncrypted)
      .map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        ipAddress: decryptIp(u.bannedIpEncrypted),
        bannedAt: u.bannedAt
      }));
    const distinctIps = [...new Set(
      [...loginHistory.map(item => item.ipAddress), ...bannedIps.map(item => item.ipAddress)].filter(Boolean)
    )];
    res.json({ loginHistory, bannedIps, distinctIps });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Kunne ikke hente de beskyttede IP-adresser." });
  }
});

app.post("/api/logs/unlock", requireAuth, requireAdmin, async (req, res) => {
  try {
    const accessCode = String(req.body.password || "");
    const configuredCode = String(process.env.LOG_ACCESS_CODE || "");

    if (!accessCode) return res.status(400).json({ error: "Logkode mangler." });
    if (!configuredCode) return res.status(503).json({ error: "Logkoden er ikke konfigureret endnu." });

    const providedHash = crypto.createHash("sha256").update(accessCode).digest();
    const configuredHash = crypto.createHash("sha256").update(configuredCode).digest();
    const valid = crypto.timingSafeEqual(providedHash, configuredHash);

    if (!valid) return res.status(401).json({ error: "Forkert logkode." });

    const sid = getSessionId(req);
    logsUnlocks.set(sid, Date.now() + 15 * 60 * 1000);
    log("security", `Logs unlocked by ${req.user.email}`);
    res.json({ ok: true, expiresInSeconds: 900 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Kunne ikke låse logs op." });
  }
});

app.post("/api/logs/lock", requireAuth, requireAdmin, (req, res) => {
  const sid = getSessionId(req);
  if (sid) logsUnlocks.delete(sid);
  res.json({ ok: true });
});

function requireLogsAccess(req, res, next) {
  if (!hasLogsAccess(req)) {
    return res.status(423).json({
      locked: true,
      error: "Logs er låst. Indtast din admin-adgangskode for at åbne dem."
    });
  }
  next();
}

function hasIpAccess(req) {
  const sid = getSessionId(req);
  const expiresAt = sid ? ipUnlocks.get(sid) : 0;
  if (!expiresAt || expiresAt <= Date.now()) {
    if (sid) ipUnlocks.delete(sid);
    return false;
  }
  return true;
}

function requireIpAccess(req, res, next) {
  if (!hasIpAccess(req)) {
    return res.status(423).json({
      locked: true,
      error: "IP-adressecenteret er låst. Indtast den særlige IP-kode."
    });
  }
  next();
}

const LOG_CATEGORIES = {
  login: { label: "Login", source: "login_audit" },
  security: { label: "Sikkerhed", type: "security" },
  tickets: { label: "Tickets", type: "ticket" },
  messages: { label: "Beskeder", type: "message" },
  commands: { label: "Commands", type: "command" },
  settings: { label: "Indstillinger", type: "settings" },
  system: { label: "System", type: "success" },
  warnings: { label: "Advarsler", type: "warning" },
  errors: { label: "Fejl", type: "error" }
};

app.get("/api/logs/categories", requireAuth, requireAdmin, requireLogsAccess, async (req, res) => {
  try {
    const counts = {};
    if (db) {
      const logsResult = req.user?.role === "admin"
        ? await db.query(`SELECT type, COUNT(*)::int AS count FROM public.logs GROUP BY type`)
        : await db.query(
            `SELECT type, COUNT(*)::int AS count
             FROM public.logs
             WHERE owner_user_id = $1
             GROUP BY type`,
            [req.user.id]
          );
      for (const row of logsResult.rows) counts[row.type] = row.count;

      const loginResult = await db.query(
        "SELECT COUNT(*)::int AS count FROM public.login_audit"
      );
      counts.login = loginResult.rows[0].count;
    } else {
      counts.login = state.loginAudit.length;
      for (const item of state.logs) {
        if (String(item.ownerUserId || "") !== String(req.user.id)) continue;
        counts[item.type] = (counts[item.type] || 0) + 1;
      }
    }

    res.json(Object.entries(LOG_CATEGORIES).map(([key, config]) => ({
      key,
      label: config.label,
      count: key === "login" ? (counts.login || 0) : (counts[config.type] || 0)
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Kunne ikke hente log-kategorier." });
  }
});

app.get("/api/logs", requireAuth, requireAdmin, requireLogsAccess, async (req, res) => {
  try {
    const category = String(req.query.category || "").toLowerCase();
    const config = LOG_CATEGORIES[category];
    if (!config) return res.status(400).json({ error: "Ugyldig log-kategori." });

    if (db) {
      if (category === "login") {
        const result = await db.query(
          `SELECT
             id,
             user_id AS "userId",
             user_name AS "userName",
             user_email AS "userEmail",
             event_type AS "eventType",
             success,
             NULL AS "ipAddress",
             user_agent AS "userAgent",
             country,
             city,
             created_at AS "createdAt"
           FROM public.login_audit
           ORDER BY created_at DESC
           LIMIT 500`
        );
        return res.json(result.rows);
      }

      const result = req.user?.role === "admin"
        ? await db.query(
            `SELECT id, type, message, created_at AS "time", owner_user_id AS "ownerUserId"
             FROM public.logs
             WHERE type = $1
             ORDER BY created_at DESC
             LIMIT 500`,
            [config.type]
          )
        : await db.query(
            `SELECT id, type, message, created_at AS "time", owner_user_id AS "ownerUserId"
             FROM public.logs
             WHERE type = $1 AND owner_user_id = $2
             ORDER BY created_at DESC
             LIMIT 500`,
            [config.type, req.user.id]
          );
      return res.json(result.rows);
    }

    if (category === "login") return res.json(state.loginAudit.slice(0, 500));
    return res.json(state.logs.filter(item => item.type === config.type).slice(0, 500));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Kunne ikke hente logs." });
  }
});


app.get("/api/bot/guilds", requireAuth, requirePaid, (req,res,next)=>requirePlan("member_plus",req,res,next), async (req, res) => {
  try {
    if (!discordReady) return res.json([]);
    let guildsSource = [...client.guilds.cache.values()];
    if (req.user?.role !== "admin") {
      if (!db) return res.json([]);
      const linked = await db.query("SELECT guild_id FROM public.account_guilds WHERE user_id = $1", [req.user.id]);
      const linkedIds = new Set(linked.rows.map(row => String(row.guild_id)));
      guildsSource = guildsSource.filter(guild => linkedIds.has(String(guild.id)));
    }
    const guilds = guildsSource
      .map(guild => ({
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount || 0,
        channelCount: guild.channels.cache.size
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json(guilds);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Kunne ikke hente Discord-servere." });
  }
});

app.get("/api/bot/guilds/:guildId/settings", requireAuth, requirePaid, (req,res,next)=>requirePlan("member_plus",req,res,next), async (req, res) => {
  try {
    if (!discordReady) return res.status(503).json({ error: "Discord-botten er ikke online endnu." });
    const guild = client.guilds.cache.get(String(req.params.guildId));
    if (!guild) return res.status(404).json({ error: "Botten er ikke med i den valgte Discord-server." });
    if (req.user?.role !== "admin" && !(await isGuildLinkedToUser(req.user.id, guild.id))) return res.status(403).json({ error: "Denne Discord-server er ikke koblet til din ShardNote-konto." });

    let settings;
    if (client.dashboardGetGuildSettings) {
      settings = await client.dashboardGetGuildSettings(guild.id);
    } else if (db) {
      await db.query("INSERT INTO public.guild_settings (guild_id) VALUES ($1) ON CONFLICT (guild_id) DO NOTHING", [guild.id]);
      const result = await db.query("SELECT * FROM public.guild_settings WHERE guild_id = $1 LIMIT 1", [guild.id]);
      settings = result.rows[0] || {};
    } else {
      settings = {};
    }

    const roles = [...guild.roles.cache.values()]
      .filter(role => role.id !== guild.id && !role.managed)
      .map(role => ({ id: role.id, name: role.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const channels = [...guild.channels.cache.values()]
      .filter(channel => channel.isTextBased?.() && channel.type !== 4)
      .map(channel => ({ id: channel.id, name: channel.name, type: channel.type }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const categories = [...guild.channels.cache.values()]
      .filter(channel => channel.type === 4)
      .map(channel => ({ id: channel.id, name: channel.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      guild: { id: guild.id, name: guild.name, memberCount: guild.memberCount || 0 },
      settings,
      roles,
      channels,
      categories
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Kunne ikke hente serverindstillinger." });
  }
});

app.get("/api/bot/guilds/:guildId/ai", requireAuth, requirePaid, (req,res,next)=>requirePlan("member_pro",req,res,next), async (req,res)=>{
  try{
    const guild=client.guilds.cache.get(String(req.params.guildId));
    if(!guild)return res.status(404).json({error:"Botten er ikke med i den valgte Discord-server."});
    if(req.user?.role!=="admin" && !(await isGuildLinkedToUser(req.user.id,guild.id)))return res.status(403).json({error:"Denne Discord-server er ikke koblet til din ShardNote-konto."});
    const settings=client.dashboardGetGuildSettings ? await client.dashboardGetGuildSettings(guild.id) : {};
    res.json({enabled:!!settings.ai_enabled,channelIds:Array.isArray(settings.ai_channel_ids)?settings.ai_channel_ids:[]});
  }catch(error){console.error(error);res.status(500).json({error:"AI-indstillingerne kunne ikke hentes."});}
});

app.patch("/api/bot/guilds/:guildId/ai", requireAuth, requirePaid, (req,res,next)=>requirePlan("member_pro",req,res,next), async (req,res)=>{
  try{
    const guild=client.guilds.cache.get(String(req.params.guildId));
    if(!guild)return res.status(404).json({error:"Botten er ikke med i den valgte Discord-server."});
    if(req.user?.role!=="admin" && !(await isGuildLinkedToUser(req.user.id,guild.id)))return res.status(403).json({error:"Denne Discord-server er ikke koblet til din ShardNote-konto."});
    const enabled=Boolean(req.body?.enabled);
    const channelIds=Array.isArray(req.body?.channelIds)
      ? [...new Set(req.body.channelIds.map(id=>String(id)).filter(id=>guild.channels.cache.has(id)))].slice(0,50)
      : [];
    if(client.dashboardSetGuildSetting){
      await client.dashboardSetGuildSetting(guild.id,"ai_enabled",enabled);
      await client.dashboardSetGuildSetting(guild.id,"ai_channel_ids",channelIds);
    }
    log("settings","AI-indstillinger ændret for "+guild.name,req.user?.id||null);
    res.json({ok:true,enabled,channelIds});
  }catch(error){console.error(error);res.status(500).json({error:error.message||"AI-indstillingerne kunne ikke gemmes."});}
});

app.post("/api/bot/guilds/:guildId/templates/:templateKey", requireAuth, requirePaid, (req,res,next)=>requirePlan("member_plus",req,res,next), async (req, res) => {
  try {
    if (!discordReady) return res.status(503).json({ error: "Discord-botten er ikke online endnu." });

    const guild = client.guilds.cache.get(String(req.params.guildId));
    if (!guild) return res.status(404).json({ error: "Botten er ikke med i den valgte Discord-server." });

    if (req.user?.role !== "admin" && !(await isGuildLinkedToUser(req.user.id, guild.id))) {
      return res.status(403).json({ error: "Denne Discord-server er ikke koblet til din ShardNote-konto." });
    }

    if (!client.dashboardApplyDiscordTemplate) {
      return res.status(503).json({ error: "Discord-skitser er ikke klar endnu." });
    }

    const templateKey = String(req.params.templateKey || "").trim().toLowerCase();
    const allowedTemplates = [
      "fivem-vip","fivem-esx","fivem-rp","rust","vennegruppe",
      "gaming","clan","streamer","community","support","shop","creator","custom"
    ];
    if (!allowedTemplates.includes(templateKey)) {
      return res.status(400).json({ error: "Ukendt Discord-skitse." });
    }

    const body = req.body || {};
    const cleanList = value => Array.isArray(value) ? value.map(item => String(item)).filter(Boolean).slice(0, 100) : [];
    const supportedLanguages = ["da","en","de","fr","es","it","nl","pt","sv","no","fi","pl","tr","ru","uk","ja","ko","zh"];
    const language = supportedLanguages.includes(String(body.language || "")) ? String(body.language) : "da";
    const result = await client.dashboardApplyDiscordTemplate(guild.id, templateKey, {
      language,
      prefixRoles: cleanList(body.prefixRoles),
      prefixChannels: cleanList(body.prefixChannels)
    });
    log("settings", "Discord-skitse blev kørt på " + guild.name, req.user?.id || null);
    res.json({
      ok: true,
      guild: { id: guild.id, name: guild.name },
      result
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Discord-skitsen kunne ikke opsættes." });
  }
});

app.patch("/api/bot/guilds/:guildId/settings", requireAuth, requirePaid, (req,res,next)=>requirePlan("member_plus",req,res,next), async (req, res) => {
  try {
    if (!discordReady) return res.status(503).json({ error: "Discord-botten er ikke online endnu." });
    const guild = client.guilds.cache.get(String(req.params.guildId));
    if (!guild) return res.status(404).json({ error: "Botten er ikke med i den valgte Discord-server." });

    const allowed = [
      "log_channel_id", "welcome_channel_id", "welcome_message",
      "leave_channel_id", "leave_message", "autorole_id", "support_role_id",
      "ticket_category_id", "verification_role_id", "suggestion_channel_id",
      "automod_enabled", "invite_filter", "levels_enabled", "economy_enabled",
      "anti_raid_enabled", "lockdown"
    ];

    const updates = {};
    for (const key of allowed) {
      if (!Object.prototype.hasOwnProperty.call(req.body || {}, key)) continue;
      const value = req.body[key];

      if (key.endsWith("_enabled") || key === "invite_filter" || key === "lockdown") {
        if (typeof value !== "boolean") return res.status(400).json({ error: "Ugyldig værdi for " + key + "." });
        updates[key] = value;
      } else if (key === "welcome_message" || key === "leave_message") {
        updates[key] = String(value ?? "").slice(0, 1000);
      } else {
        updates[key] = value ? String(value).slice(0, 40) : null;
      }
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: "Ingen indstillinger blev sendt." });
    }

    if (client.dashboardSetGuildSetting) {
      for (const [key, value] of Object.entries(updates)) {
        if (key === "lockdown" && client.dashboardSetLockdown) {
          await client.dashboardSetLockdown(guild.id, value);
        } else {
          await client.dashboardSetGuildSetting(guild.id, key, value);
        }
      }
    } else if (db) {
      await db.query("INSERT INTO public.guild_settings (guild_id) VALUES ($1) ON CONFLICT (guild_id) DO NOTHING", [guild.id]);
      const sets = Object.keys(updates).map((key, i) => key + " = $" + (i + 1));
      const values = Object.values(updates);
      values.push(guild.id);
      await db.query(
        "UPDATE public.guild_settings SET " + sets.join(", ") + ", updated_at = NOW() WHERE guild_id = $" + values.length,
        values
      );
    }

    const settings = client.dashboardGetGuildSettings
      ? await client.dashboardGetGuildSettings(guild.id)
      : updates;

    log("settings", "Bot-funktioner opdateret for " + guild.name);
    res.json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Serverindstillingerne kunne ikke gemmes." });
  }
});

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
.table{width:100%;border-collapse:collapse}.table th,.table td{padding:12px 8px;border-bottom:1px solid #22222e;text-align:left;font-size:13px}.table th{color:var(--muted);font-weight:600}.badge{display:inline-flex;padding:5px 8px;border-radius:999px;font-size:11px;font-weight:700}.badge.open{background:rgba(66,211,146,.12);color:var(--green)}.badge.pending{background:rgba(244,201,93,.12);color:var(--yellow)}.badge.closed{background:rgba(255,102,120,.12);color:var(--red)}.log-category{border:1px solid var(--border);border-radius:12px;background:#0e0e16;margin-bottom:10px;overflow:hidden}.log-category summary{cursor:pointer;list-style:none;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;font-weight:700}.log-category summary::-webkit-details-marker{display:none}.log-category summary b{background:#1c1b2b;padding:4px 8px;border-radius:999px;font-size:11px;color:var(--muted)}.log-category-body{padding:0 12px 12px}.log-category-intro{padding:10px 12px;margin-bottom:12px;border:1px dashed var(--border);border-radius:10px;color:var(--muted);font-size:12px}.log-category summary{user-select:none}.log-category-body{overflow:auto}
.activity{display:grid;gap:11px}.activity-item{display:flex;gap:11px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #22222e}.activity-item:last-child{border:0}.activity-icon{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:#1c1b2b}.activity-item b{font-size:13px}.activity-item small{display:block;color:var(--muted);margin-top:3px}
.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.field{display:grid;gap:7px}.field label{font-size:12px;color:var(--muted)}.field input,.field textarea,.field select{width:100%;border:1px solid var(--border);background:#0b0b11;color:#fff;border-radius:10px;padding:11px 12px;outline:none}.field textarea{min-height:120px;resize:vertical}.field input:focus,.field textarea:focus,.field select:focus{border-color:var(--accent)}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.empty{padding:30px;text-align:center;color:var(--muted);border:1px dashed var(--border);border-radius:12px}
.switch-row{display:flex;align-items:center;justify-content:space-between;padding:15px 0;border-bottom:1px solid #22222e}.switch{width:48px;height:26px;border-radius:99px;background:#292936;padding:3px;transition:.2s}.switch i{display:block;width:20px;height:20px;border-radius:50%;background:#fff;transition:.2s}.switch.on{background:var(--accent)}.switch.on i{transform:translateX(22px)}.feature-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.feature-card{background:#0e0e16;border:1px solid var(--border);border-radius:14px;padding:16px}.feature-card h3{margin:0 0 7px;font-size:14px}.feature-card p{margin:0;color:var(--muted);font-size:12px;line-height:1.45}.feature-status{display:inline-flex;margin-top:10px;padding:5px 8px;border-radius:999px;background:rgba(66,211,146,.12);color:var(--green);font-size:11px;font-weight:800}.feature-command{display:inline-block;margin-top:10px;font-size:11px;color:var(--accent2);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.feature-select{min-height:42px}.feature-save{position:sticky;bottom:12px;z-index:3}@media(max-width:1050px){.feature-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.feature-grid{grid-template-columns:1fr}}

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
    <button data-page="features"><span class="icon">🧩</span><span>Bot-funktioner</span></button>
    <button data-page="templates"><span class="icon">🧱</span><span>Discord-skitser</span></button>
    <button data-page="upgrades"><span class="icon">🚀</span><span>Opgraderinger</span></button>
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
    <button class="btn primary small" onclick="addBotToDiscord()">+ Add Bot to Discord</button><button class="btn small" onclick="logout()">Log ud</button>
  </div>
</header>

<section class="page active" id="page-dashboard">
  <div class="grid stats">
    <div class="card"><div class="stat-title">BOT STATUS</div><div class="stat-value" id="statBot">—</div><div class="stat-foot">Live connection</div></div>
    <div class="card"><div class="stat-title">SERVERE</div><div class="stat-value" id="statServers">0</div><div class="stat-foot">Discord servers</div></div>
    <div class="card" id="statUsersCard"><div class="stat-title">BRUGERE</div><div class="stat-value" id="statUsers">0</div><div class="stat-foot">Members</div></div>
    <div class="card"><div class="stat-title">ÅBNE TICKETS</div><div class="stat-value" id="statTickets">0</div><div class="stat-foot">Needs attention</div></div>
  </div>
  <div class="grid two" style="margin-top:18px">
    <div class="card"><div class="section-title"><h2>Seneste tickets</h2><button class="btn small" data-button-label="dashboardSeeAll" onclick="navigate('tickets')">Se alle</button></div><div id="dashTickets"></div></div>
    <div class="card"><div class="section-title"><h2>Aktivitet</h2><button class="btn small" onclick="navigate('logs')">Alle logs</button></div><div id="dashLogs" class="activity"></div></div>
  </div>
</section>

<section class="page" id="page-features">
  <div id="botFeaturesPage">
    <div class="card"><div class="empty">Indlæser bot-funktioner…</div></div>
  </div>
</section>

<section class="page" id="page-templates">
  <div id="discordTemplatesPage">
    <div class="card"><div class="empty">Indlæser Discord-skitser…</div></div>
  </div>
</section>

<section class="page" id="page-upgrades">
  <div class="card" style="margin-bottom:18px">
    <div class="section-title">
      <div><h2>🚀 Opgraderinger</h2><span>Har du en idé til en forbedring af ShardNote-hjemmesiden eller botten?</span></div>
      <div class="badge open">Idé → Ticket</div>
    </div>
    <p style="color:var(--muted);line-height:1.6;margin:0">Send din idé her. Den bliver automatisk oprettet som en ticket, så den kan behandles og følges ligesom andre tickets.</p>
  </div>

  <div class="grid two">
    <div class="card">
      <div class="section-title"><div><h2>💡 Send en idé</h2><span>Fortæl os, hvad der skal forbedres.</span></div></div>
      <div class="field">
        <label>Område</label>
        <select id="upgradeArea">
          <option>Website</option>
          <option>Discord-bot</option>
          <option>Dashboard</option>
          <option>Betaling / Member Plus</option>
          <option>Discord-skitser</option>
          <option>Andet</option>
        </select>
      </div>
      <div class="field" style="margin-top:12px">
        <label>Titel</label>
        <input id="upgradeTitle" maxlength="120" placeholder="Fx Tilføj en ny FiveM-skabelon">
      </div>
      <div class="field" style="margin-top:12px">
        <label>Din idé</label>
        <textarea id="upgradeDescription" maxlength="5000" rows="8" placeholder="Beskriv hvad du gerne vil have lavet, og hvordan det skal fungere…"></textarea>
      </div>
      <div class="actions">
        <button class="btn primary" type="button" onclick="submitUpgradeIdea()">🚀 Send opgraderingsidé</button>
      </div>
      <div id="upgradeResult" style="margin-top:12px"></div>
    </div>

    <div class="card">
      <div class="section-title"><div><h2>🎫 Sådan fungerer det</h2><span>Din idé bliver til en rigtig ShardNote-ticket.</span></div></div>
      <div class="activity">
        <div class="activity-item"><div class="activity-icon">1</div><div><b>Du sender idéen</b><small>Vælg område og skriv dit forslag.</small></div></div>
        <div class="activity-item"><div class="activity-icon">2</div><div><b>ShardNote opretter ticketen</b><small>Idéen bliver gemt med din konto.</small></div></div>
        <div class="activity-item"><div class="activity-icon">3</div><div><b>Den kan behandles</b><small>Status og prioritet kan følges i Ticket-systemet.</small></div></div>
      </div>
    </div>
  </div>
  <div class="card" style="margin-top:18px">
    <div class="section-title"><div><h2>📋 Dine opgraderingsidéer</h2><span>Seneste idéer sendt fra din konto.</span></div></div>
    <div id="upgradeIdeasList"><div class="empty">Indlæser…</div></div>
  </div>
</section>

<section class="page" id="page-tickets">
  <div class="card">
    <div class="section-title">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <h2 style="margin:0">Ticket-system</h2>
        <select id="ticketHandlerDefault" class="feature-select" style="min-width:160px">
          <option value="ticket">🎫 Ticket</option>
          <option value="ai">🤖 AI</option>
          <option value="admins" selected>👑 Admins</option>
        </select>
      </div>
      <button class="btn primary" data-button-label="ticketNew" onclick="newTicket()">+ Ny ticket</button>
    </div>
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
      <div class="actions"><button class="btn primary" data-button-label="messageSend" onclick="sendMessage()">Send besked</button></div>
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
      <div class="actions"><button class="btn primary" data-button-label="commandRun" onclick="runCommand()">Kør command</button></div>
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
    <div class="actions"><button class="btn primary" data-button-label="musicExecute" onclick="musicAction()">Udfør</button></div>
  </div>
</section>

<section class="page" id="page-settings">
  <div class="card">
    <div class="section-title"><h2>Indstillinger</h2><button class="btn primary" data-button-label="settingsSave" onclick="saveSettings()">Gem ændringer</button></div>
    <div class="field" style="max-width:280px"><label>Bot prefix</label><input id="prefix" maxlength="5" placeholder="!"></div>
    <div class="switch-row"><div><b>Maintenance mode</b><div style="color:var(--muted);font-size:12px">Vis dashboardet som vedligeholdelse</div></div><button id="maintenanceSwitch" class="switch" onclick="toggleSetting('maintenance')"><i></i></button></div>
    <div class="switch-row"><div><b>Auto-reply</b><div style="color:var(--muted);font-size:12px">Tillad automatiske svar</div></div><button id="autoReplySwitch" class="switch" onclick="toggleSetting('autoReply')"><i></i></button></div>
    <div class="switch-row"><div><b>Welcome messages</b><div style="color:var(--muted);font-size:12px">Velkomstbeskeder til nye medlemmer</div></div><button id="welcomeMessagesSwitch" class="switch" onclick="toggleSetting('welcomeMessages')"><i></i></button></div>
    <div style="margin-top:22px;padding-top:20px;border-top:1px solid var(--border)">
      <div class="section-title"><div><h2>Knapnavne</h2><span>Kun knapper inde på siderne. Menuen ændres ikke.</span></div></div>
      <div class="form-grid">
        <div class="field"><label>Se alle</label><input id="buttonLabel_dashboardSeeAll" maxlength="80"></div>
        <div class="field"><label>+ Ny ticket</label><input id="buttonLabel_ticketNew" maxlength="80"></div>
        <div class="field"><label>Send besked</label><input id="buttonLabel_messageSend" maxlength="80"></div>
        <div class="field"><label>Kør command</label><input id="buttonLabel_commandRun" maxlength="80"></div>
        <div class="field"><label>Udfør</label><input id="buttonLabel_musicExecute" maxlength="80"></div>
        <div class="field"><label>Gem ændringer</label><input id="buttonLabel_settingsSave" maxlength="80"></div>
        <div class="field"><label>Opdater logs</label><input id="buttonLabel_logsRefresh" maxlength="80"></div>
        <div class="field"><label>Lås logs</label><input id="buttonLabel_logsLock" maxlength="80"></div>
        <div class="field"><label>Åbn logcenter</label><input id="buttonLabel_logsUnlock" maxlength="80"></div>
        <div class="field"><label>+ Tilføj bruger</label><input id="buttonLabel_adminAddUser" maxlength="80"></div>
        <div class="field"><label>Opdater brugere</label><input id="buttonLabel_adminRefresh" maxlength="80"></div>
      </div>
      <div style="color:var(--muted);font-size:12px;margin-top:12px">Sidebar/menu-knapper, Log ud og Add Bot til Discord ændres ikke.</div>
    </div>
  </div>
</section>

<section class="page" id="page-logs">
  <div class="card">
    <div class="section-title">
      <div><h2>Logcenter</h2><span>Kun administratorer · kræver adgangskode</span></div>
      <div class="actions" style="margin:0">
        <button class="btn small" data-button-label="logsRefresh" onclick="loadLogs()">Opdater</button>
        <button class="btn small danger" data-button-label="logsLock" onclick="lockLogs()">🔒 Lås</button>
      </div>
    </div>
    <div id="logLockPanel">
      <div class="empty">
        <div style="font-size:34px;margin-bottom:10px">🔐</div>
        <b>Logcenter er låst</b>
        <div style="color:var(--muted);font-size:12px;margin:8px 0 15px">Indtast den faste logkode for at åbne logcenteret.</div>
        <div style="max-width:360px;margin:0 auto">
          <input id="logPassword" type="password" placeholder="Logkode" style="width:100%;border:1px solid var(--border);background:#0b0b11;color:#fff;border-radius:10px;padding:11px 12px;outline:none">
          <button class="btn primary" data-button-label="logsUnlock" style="margin-top:10px;width:100%" onclick="unlockLogs()">🔓 Åbn logcenter</button>
          <div id="logUnlockError" style="color:var(--red);font-size:12px;margin-top:10px"></div>
        </div>
      </div>
    </div>
    <div id="logContent" style="display:none">
      <div class="log-category-intro">Hver logtype ligger separat. Åbn kun den kategori, du vil se.</div>
      <div id="logCategoryList"></div>
    </div>
  </div>
</section>

<section class="page" id="page-admin">
  <div class="card" style="margin-bottom:18px">
    <div class="section-title">
      <div><h2>🔐 IP-adressecenter</h2><span>Kun administratorer · kræver en separat IP-kode</span></div>
      <div class="actions" style="margin:0">
        <button class="btn small" onclick="loadIpOverview()">Opdater</button>
        <button class="btn small danger" onclick="lockIpCenter()">🔒 Lås</button>
      </div>
    </div>

    <div id="ipLockPanel">
      <div class="empty">
        <div style="font-size:34px;margin-bottom:10px">🛡️</div>
        <b>IP-adressecenter er låst</b>
        <div style="color:var(--muted);font-size:12px;margin:8px 0 15px">
          IP-adresserne er krypteret i databasen og vises kun efter den separate IP-kode.
        </div>
        <div style="max-width:360px;margin:0 auto">
          <input id="ipPassword" type="password" placeholder="IP-kode" style="width:100%;border:1px solid var(--border);background:#0b0b11;color:#fff;border-radius:10px;padding:11px 12px;outline:none">
          <button class="btn primary" style="margin-top:10px;width:100%" onclick="unlockIpCenter()">🔓 Åbn IP-adresser</button>
          <div id="ipUnlockError" style="color:var(--red);font-size:12px;margin-top:10px"></div>
        </div>
      </div>
    </div>

    <div id="ipContent" style="display:none">
      <div style="margin-bottom:14px">
        <b>Registrerede IP-adresser</b>
        <div id="ipDistinctList" style="margin-top:8px"></div>
      </div>
      <div style="margin-top:18px">
        <b>Login-IP'er</b>
        <div id="ipLoginList" style="margin-top:8px"></div>
      </div>
      <div style="margin-top:18px">
        <b>Aktive IP-bans</b>
        <div id="ipBanList" style="margin-top:8px"></div>
      </div>
    </div>
  </div>

  <div class="card" style="margin-bottom:18px">
    <div class="section-title"><h2>Database-overblik</h2><span id="databaseStatus" class="badge pending">Tjekker…</span></div>
    <div id="databaseTables" class="activity"></div>
  </div>

  <div class="grid two">
    <div class="card">
      <div class="section-title"><h2>Admin-panel</h2><span>Brugere og adgang</span></div>
      <div class="field"><label>Navn</label><input id="newUserName" placeholder="Fx Jonas"></div>
      <div class="field" style="margin-top:12px"><label>Email</label><input id="newUserEmail" type="email" placeholder="jonas@example.com"></div>
      <div class="field" style="margin-top:12px"><label>Adgangskode</label><input id="newUserPassword" type="password" placeholder="Mindst 8 tegn"></div>
      <div class="field" style="margin-top:12px"><label>Rolle</label><select id="newUserRole"><option value="member">Member</option><option value="admin">Administrator</option></select></div>
      <div class="field" style="margin-top:12px"><label>Pakke</label><select id="newUserPlan"><option value="member">Member</option><option value="member_plus">Member Plus</option><option value="member_pro">Member Pro</option></select></div>
      <div class="actions"><button class="btn primary" data-button-label="adminAddUser" onclick="createUser()">+ Tilføj bruger</button></div>
      <p style="color:var(--muted);font-size:12px;margin-top:12px">Kun administratorer kan åbne og ændre dette panel.</p>
    </div>
    <div class="card">
      <div class="section-title"><h2>Brugere</h2><button class="btn small" data-button-label="adminRefresh" onclick="loadUsers()">Opdater</button></div>
      <div id="userList"></div>
    </div>
  </div>

</section>
</main>
</div>
<div id="toast" class="toast"></div>

<script src="/app.js" defer></script>
<script src="/features.js" defer></script>
<script src="/templates.js" defer></script>
</body>
</html>`;

app.get("/", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.type("html").send(html);
});

async function startServer() {
  try {
    if (db) {
      await initDatabase();
      log("success", "PostgreSQL database connected");
    } else {
      await ensureAdmin();
      log("warning", "DATABASE_URL is not configured. User data is temporary until a database is connected.");
    }

    app.listen(PORT, () => {
      log("success", `ShardNote web server started on port ${PORT}`);
      console.log(`ShardNote running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Database initialization failed:", error);
    process.exit(1);
  }
}

startServer();

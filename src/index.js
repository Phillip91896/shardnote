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
  catch(error){console.error("[Shardnote Bot] Stripe webhook signature failed:",error.message);return res.status(400).send("Invalid webhook signature.");}
  try{
    const object=event.data.object;
    if(event.type==="checkout.session.completed"){
      const userId=object.metadata?.user_id;
      const subscriptionId=typeof object.subscription==="string"?object.subscription:object.subscription?.id||null;
      const customerId=typeof object.customer==="string"?object.customer:object.customer?.id||null;
      const plan=object.metadata?.plan;
      if(userId){
        await updateUserSubscription({userId,status:"active",customerId,subscriptionId});
        if (db && ["member","member_plus","member_pro"].includes(plan) && object.id) {
          try {
            const delivery = await db.query(
              "SELECT id, sent_at AS \"sentAt\" FROM public.license_deliveries WHERE checkout_session_id = $1 LIMIT 1",
              [object.id]
            );
            if (!delivery.rows[0]) {
              const rawKey = generateSerialKey();
              const keyHash = hashSerialKey(rawKey);
              const keyResult = await db.query(
                `INSERT INTO public.serial_keys
                  (key_hash,key_last4,product_name,access_plan,max_uses,created_by)
                 VALUES ($1,$2,$3,$4,1,$5)
                 RETURNING id`,
                [keyHash, rawKey.slice(-4), "Shardnote Bot " + plan, plan, userId]
              );
              const deliveryInsert = await db.query(
                `INSERT INTO public.license_deliveries
                  (checkout_session_id,user_id,email,key_hash,key_last4)
                 VALUES ($1,$2,$3,$4,$5)
                 RETURNING id`,
                [object.id, userId, object.customer_details?.email || "", keyHash, rawKey.slice(-4)]
              );
              const userResult = await db.query("SELECT name,email FROM public.users WHERE id = $1 LIMIT 1",[userId]);
              const recipient = userResult.rows[0];
              if (recipient?.email) {
                const mail = await sendLicenseEmail({
                  to: recipient.email,
                  name: recipient.name,
                  key: rawKey,
                  plan,
                  months: Number(object.metadata?.months || 1)
                });
                if (mail.sent) {
                  await db.query("UPDATE public.license_deliveries SET sent_at = NOW() WHERE id = $1",[deliveryInsert.rows[0].id]);
                }
              }
              log("billing", "License key generated for checkout #" + object.id, userId);
            }
          } catch (mailError) {
            console.error("[Shardnote Bot] License delivery failed:", mailError.message);
          }
        }
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
  }catch(error){console.error("[Shardnote Bot] Stripe webhook handler failed:",error);return res.status(500).send("Webhook handler failed.");}
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
    CREATE TABLE IF NOT EXISTS public.ticket_messages (
      id BIGSERIAL PRIMARY KEY,
      ticket_id BIGINT NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
      author_user_id BIGINT,
      author_name VARCHAR(160) NOT NULL,
      author_role VARCHAR(30) NOT NULL DEFAULT 'user',
      content TEXT NOT NULL,
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
    CREATE TABLE IF NOT EXISTS public.license_deliveries (
      id BIGSERIAL PRIMARY KEY,
      checkout_session_id VARCHAR(255) NOT NULL UNIQUE,
      user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      email VARCHAR(160) NOT NULL,
      key_hash TEXT,
      key_last4 VARCHAR(8),
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.serial_keys (
      id BIGSERIAL PRIMARY KEY,
      key_hash TEXT NOT NULL UNIQUE,
      key_last4 VARCHAR(8) NOT NULL,
      product_name VARCHAR(120) NOT NULL,
      guild_id VARCHAR(32),
      role_id VARCHAR(32),
      access_plan VARCHAR(30),
      max_uses INTEGER NOT NULL DEFAULT 1,
      uses INTEGER NOT NULL DEFAULT 0,
      created_by BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      last_redeemed_by VARCHAR(32),
      last_redeemed_at TIMESTAMPTZ,
      revoked BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);

  await db.query(`
    ALTER TABLE public.serial_keys
      ALTER COLUMN guild_id DROP NOT NULL,
      ALTER COLUMN role_id DROP NOT NULL,
      ADD COLUMN IF NOT EXISTS access_plan VARCHAR(30)
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
    ).catch(error => console.error("[Shardnote Bot] Log persistence failed:", error.message));
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
  return parseCookies(req).ShardNote_session;
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

async function sendLicenseEmail({to,name,key,plan,months}) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.MAIL_FROM || "").trim();
  if (!apiKey || !from) {
    console.warn("[Shardnote Bot] License email not sent: RESEND_API_KEY or MAIL_FROM is missing.");
    return { sent: false, reason: "mail_not_configured" };
  }
  const activationUrl = PUBLIC_SITE_URL + "/?activate=1";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Din ShardNote licens-key",
      html: "<div style=\"font-family:Arial,sans-serif;line-height:1.6\">" +
        "<h2>Din ShardNote licens</h2>" +
        "<p>Hej " + String(name || "").replace(/[&<>"]/g,"") + ",</p>" +
        "<p>Dit køb er bekræftet. Din licens-key er:</p>" +
        "<p style=\"font-size:20px;font-weight:700;letter-spacing:1px\">" + key + "</p>" +
        "<p>Pakke: <b>" + plan + "</b><br>Periode: <b>" + months + " måned(er)</b></p>" +
        "<p><a href=\"" + activationUrl + "\">Aktivér din key</a></p>" +
        "<p>Gem denne mail sikkert.</p></div>"
    })
  });
  if (!response.ok) {
    const body = await response.text().catch(()=>"");
    throw new Error("Maillevering fejlede: " + response.status + " " + body.slice(0,500));
  }
  return { sent: true };
}

function generateSerialKey() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const parts = [];
  for (let group = 0; group < 4; group++) {
    let part = "";
    for (let i = 0; i < 5; i++) {
      part += alphabet[crypto.randomInt(0, alphabet.length)];
    }
    parts.push(part);
  }
  return parts.join("-");
}

function hashSerialKey(value) {
  return crypto.createHash("sha256").update(String(value || "").trim().toUpperCase()).digest("hex");
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
  const email = (configuredEmail || "admin@Shardnote Bot.local");
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
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.DISCORD_TOKEN || process.env.STRIPE_SECRET_KEY || process.env.DATABASE_URL || "Shardnote Bot-session-secret";

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
  const sid = parseCookies(req).ShardNote_session;
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
async function refreshSubscriptionFromStripe(user){if(!stripe||!user?.stripeSubscriptionId)return user;try{const subscription=await stripe.subscriptions.retrieve(user.stripeSubscriptionId);const customerId=typeof subscription.customer==="string"?subscription.customer:subscription.customer?.id||user.stripeCustomerId||null;await updateUserSubscription({userId:user.id,status:subscription.status,customerId,subscriptionId:subscription.id,currentPeriodEnd:subscription.current_period_end});user.subscriptionStatus=subscription.status;user.stripeCustomerId=customerId;user.stripeSubscriptionId=subscription.id;user.subscriptionCurrentPeriodEnd=subscription.current_period_end?new Date(subscription.current_period_end*1000).toISOString():user.subscriptionCurrentPeriodEnd;}catch(error){console.error("[Shardnote Bot] Could not refresh Stripe subscription:",error.message);}return user;}
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
function getSiteOwnerEmail() {
  return String(process.env.SITE_OWNER_EMAIL || process.env.ADMIN_EMAIL || "admin@Shardnote Bot.local").trim().toLowerCase();
}
function isSiteOwner(user) {
  return !!user?.email && String(user.email).trim().toLowerCase() === getSiteOwnerEmail();
}
function requireSiteOwner(req, res, next) {
  if (!isSiteOwner(req.user)) return res.status(403).json({ error: "Kun ejeren af Shardnote Bot har adgang til IP-adresser." });
  next();
}
function requirePaid(req, res, next) {
  if (!hasPaidAccess(req.user)) return res.status(402).json({ requiresSubscription: true, error: "Et aktivt Shardnote Bot-abonnement kræves." });
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

    res.setHeader("Set-Cookie", `ShardNote_session=${sid}; HttpOnly; Path=/; SameSite=Lax`);
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
        hasPaidAccess: hasPaidAccess(user),
         isOwner: isSiteOwner(user)
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
    const serialKey = String(req.body.serialKey || "").trim().toUpperCase();

    if (name.length < 2) return res.status(400).json({ error: "Navnet skal være mindst 2 tegn." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Skriv en gyldig emailadresse." });
    if (password.length < 8) return res.status(400).json({ error: "Adgangskoden skal være mindst 8 tegn." });

    let user;
    let activatedPlan = "member";
    let activatedFromKey = false;

    if (!db) return res.status(503).json({ error: "Database er nødvendig for at oprette kontoen." });

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

    await db.query("BEGIN");
    try {
      let keyRow = null;
      if (serialKey) {
        const keyHash = hashSerialKey(serialKey);
        const keyResult = await db.query(
          "SELECT id, access_plan AS \"accessPlan\", max_uses AS \"maxUses\", uses, expires_at AS \"expiresAt\", revoked FROM public.serial_keys WHERE key_hash = $1 FOR UPDATE",
          [keyHash]
        );
        keyRow = keyResult.rows[0];

        if (!keyRow) throw Object.assign(new Error("Serial key findes ikke."), { statusCode: 400 });
        if (keyRow.revoked) throw Object.assign(new Error("Denne serial key er tilbagekaldt."), { statusCode: 400 });
        if (!keyRow.accessPlan || !["member","member_plus","member_pro"].includes(keyRow.accessPlan)) throw Object.assign(new Error("Denne serial key er ikke en Shardnote Bot-konto-key."), { statusCode: 400 });
        if (keyRow.expiresAt && new Date(keyRow.expiresAt).getTime() <= Date.now()) throw Object.assign(new Error("Denne serial key er udløbet."), { statusCode: 400 });
        if (keyRow.uses >= keyRow.maxUses) throw Object.assign(new Error("Denne serial key er allerede brugt op."), { statusCode: 400 });

        activatedPlan = keyRow.accessPlan;
        activatedFromKey = true;
      }

      const result = await db.query(
        "INSERT INTO users (name, email, role, password_hash, plan, subscription_status, trial_used) VALUES ($1, $2, 'member', $3, $4, $5, $6) RETURNING id, name, email, role, plan, subscription_status, trial_used, created_at, banned",
        [name, email, hashPassword(password), activatedPlan, activatedFromKey ? "active" : "inactive", activatedFromKey]
      );
      user = result.rows[0];

      if (keyRow) {
        const used = await db.query(
          "UPDATE public.serial_keys SET uses = uses + 1, last_redeemed_by = $1, last_redeemed_at = NOW() WHERE id = $2 AND uses < max_uses RETURNING id",
          [String(user.id), keyRow.id]
        );
        if (!used.rowCount) throw Object.assign(new Error("Denne serial key blev brugt op lige før."), { statusCode: 409 });
      }

      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      if (error.code === "23505") return res.status(409).json({ error: "Der findes allerede en konto med den email." });
      if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
      throw error;
    }

    const sid = createSessionToken(user.id);
    sessions.set(sid, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      plan: user.plan || activatedPlan
    });

    res.setHeader("Set-Cookie", `ShardNote_session=${sid}; HttpOnly; Path=/; SameSite=Lax`);
    log("security", `New account registered: ${email}${activatedFromKey ? " with serial key (" + (user.plan || activatedPlan) + ")" : ""}`);
    res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan || activatedPlan,
        subscriptionStatus: user.subscriptionStatus || (activatedFromKey ? "active" : "inactive"),
        trialUsed: !!user.trialUsed,
        hasPaidAccess: hasPaidAccess(user)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Kontoen kunne ikke oprettes." });
  }
});
app.post("/api/license/redeem", requireAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: "Database er nødvendig." });
    const key = String(req.body?.key || "").trim().toUpperCase();
    if (!key) return res.status(400).json({ error: "Indtast din license key." });

    const hash = hashSerialKey(key);
    await db.query("BEGIN");
    try {
      const result = await db.query(
        'SELECT id, product_name AS "productName", access_plan AS "accessPlan", max_uses AS "maxUses", uses, expires_at AS "expiresAt", revoked FROM public.serial_keys WHERE key_hash = $1 FOR UPDATE',
        [hash]
      );
      const item = result.rows[0];
      if (!item) throw Object.assign(new Error("License key findes ikke."), { statusCode: 404 });
      if (item.revoked) throw Object.assign(new Error("Denne license key er tilbagekaldt."), { statusCode: 400 });
      if (!item.accessPlan || !["member","member_plus","member_pro"].includes(item.accessPlan)) {
        throw Object.assign(new Error("Denne key er ikke en Shardnote Bot-license key."), { statusCode: 400 });
      }
      if (item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now()) {
        throw Object.assign(new Error("Denne license key er udløbet."), { statusCode: 400 });
      }
      if (item.uses >= item.maxUses) throw Object.assign(new Error("Denne license key er allerede brugt op."), { statusCode: 400 });

      await db.query(
        "UPDATE public.users SET plan = $1, subscription_status = 'active', trial_used = TRUE WHERE id = $2",
        [item.accessPlan, req.user.id]
      );
      const used = await db.query(
        "UPDATE public.serial_keys SET uses = uses + 1, last_redeemed_by = $1, last_redeemed_at = NOW() WHERE id = $2 AND uses < max_uses RETURNING id",
        [String(req.user.id), item.id]
      );
      if (!used.rowCount) throw Object.assign(new Error("Denne license key blev brugt op lige før."), { statusCode: 409 });

      await db.query("COMMIT");
      log("billing", "License redeemed by user #" + req.user.id + " (" + item.accessPlan + ")", req.user.id);
      res.json({ ok: true, productName: item.productName, plan: item.accessPlan });
    } catch (error) {
      await db.query("ROLLBACK");
      if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
      throw error;
    }
  } catch (error) {
    console.error("[Shardnote Bot] License redeem failed:", error);
    res.status(500).json({ error: "License kunne ikke aktiveres." });
  }
});

app.post("/api/logout", (req, res) => {
  const sid = parseCookies(req).ShardNote_session;
  if (sid) {
    sessions.delete(sid);
    logsUnlocks.delete(sid);
    ipUnlocks.delete(sid);
  }
  res.setHeader("Set-Cookie", "ShardNote_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
  res.json({ ok: true });
});

app.get("/api/me", async (req,res)=>{
  const user=await getSessionUser(req);
  if(!user)return res.status(401).json({error:"Ikke logget ind."});
  if(stripe&&user.stripeSubscriptionId)await refreshSubscriptionFromStripe(user);
  res.json({user:{id:user.id,name:user.name,email:user.email,role:user.role,plan:user.plan||"member",subscriptionStatus:user.subscriptionStatus||"inactive",trialUsed:!!user.trialUsed,hasPaidAccess:hasPaidAccess(user),isOwner:isSiteOwner(user)}});
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


app.get("/api/admin/serial-keys", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!db) return res.json([]);
    const result = await db.query(
      'SELECT id, product_name AS "productName", guild_id AS "guildId", role_id AS "roleId", access_plan AS "accessPlan", key_last4 AS "keyLast4", max_uses AS "maxUses", uses, revoked, created_at AS "createdAt", expires_at AS "expiresAt", last_redeemed_by AS "lastRedeemedBy", last_redeemed_at AS "lastRedeemedAt" FROM public.serial_keys ORDER BY created_at DESC LIMIT 300'
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Kunne ikke hente serial keys." });
  }
});

app.post("/api/admin/serial-keys/generate", requireAuth, requireAdmin, async (req, res) => {
  try {
    const productName = String(req.body?.productName || "Shardnote Bot Access").trim().slice(0,120) || "Shardnote Bot Access";
    const accessPlan = ["member","member_plus","member_pro","member_premium"].includes(String(req.body?.accessPlan || "")) ? String(req.body.accessPlan) : null;
    const guildId = String(req.body?.guildId || "").trim() || null;
    const roleId = String(req.body?.roleId || "").trim() || null;
    const quantity = Math.min(Math.max(Number(req.body?.quantity || 1), 1), 100);
    const maxUses = Math.min(Math.max(Number(req.body?.maxUses || 1), 1), 10000);
    const expiresAtRaw = String(req.body?.expiresAt || "").trim();
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;

    if (!accessPlan && (!guildId || !roleId)) return res.status(400).json({ error: "Vælg enten en Shardnote Bot-pakke eller både Discord-server og rolle." });
    if (expiresAt && Number.isNaN(expiresAt.getTime())) return res.status(400).json({ error: "Ugyldig udløbsdato." });
    if (!db) return res.status(503).json({ error: "Database er nødvendig for serial keys." });

    let guild = null;
    let role = null;
    if (!accessPlan) {
      if (!client || !discordReady) return res.status(503).json({ error: "Discord-botten er ikke online." });
      guild = client.guilds.cache.get(guildId);
      if (!guild) return res.status(404).json({ error: "Shardnote Bot-botten er ikke på den valgte server." });
      role = guild.roles.cache.get(roleId);
      if (!role || role.id === guild.id) return res.status(404).json({ error: "Rollen blev ikke fundet." });
      if (!role.editable) return res.status(400).json({ error: "Botten kan ikke give den valgte rolle. Flyt rollen under Shardnote Bot-bottens rolle." });
    }

    const created = [];
    for (let i = 0; i < quantity; i++) {
      let inserted = null;
      for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
        const key = generateSerialKey();
        const hash = hashSerialKey(key);
        try {
          const result = await db.query(
            'INSERT INTO public.serial_keys (key_hash, key_last4, product_name, guild_id, role_id, access_plan, max_uses, created_by, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
            [hash, key.slice(-4), productName, guildId, roleId, accessPlan, maxUses, req.user.id, expiresAt ? expiresAt.toISOString() : null]
          );
          if (result.rowCount) inserted = { key, id: result.rows[0].id };
        } catch (error) {
          if (error.code !== "23505") throw error;
        }
      }
      if (!inserted) throw new Error("Kunne ikke generere en unik serial key.");
      created.push(inserted.key);
    }

    log("security", "Admin " + req.user.email + " generated " + created.length + " serial key(s) for " + productName);
    res.json({ ok: true, keys: created });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Serial keys kunne ikke genereres." });
  }
});

app.patch("/api/admin/serial-keys/:id/revoke", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: "Database er nødvendig." });
    const result = await db.query(
      "UPDATE public.serial_keys SET revoked = TRUE WHERE id = $1 RETURNING id",
      [req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Serial key ikke fundet." });
    log("security", "Admin " + req.user.email + " revoked serial key #" + req.params.id);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Serial key kunne ikke tilbagekaldes." });
  }
});

app.post("/api/serial-keys/redeem", requireAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: "Database er nødvendig." });
    const key = String(req.body?.key || "").trim().toUpperCase();
    const guildId = String(req.body?.guildId || "").trim();
    const discordUserId = String(req.body?.discordUserId || "").trim();

    if (!key || !guildId || !/^\d{17,20}$/.test(discordUserId)) {
      return res.status(400).json({ error: "Indtast serial key, server-ID og Discord bruger-ID." });
    }

    const hash = hashSerialKey(key);
    const result = await db.query(
      'SELECT id, product_name AS "productName", guild_id AS "guildId", role_id AS "roleId", max_uses AS "maxUses", uses, expires_at AS "expiresAt", revoked FROM public.serial_keys WHERE key_hash = $1 LIMIT 1',
      [hash]
    );
    const item = result.rows[0];
    if (!item) return res.status(404).json({ error: "Serial key findes ikke." });
    if (item.revoked) return res.status(400).json({ error: "Denne serial key er tilbagekaldt." });
    if (item.accessPlan) return res.status(400).json({ error: "Denne key skal aktiveres ved konto-oprettelse." });
    if (item.guildId !== guildId) return res.status(400).json({ error: "Denne key er lavet til en anden Discord-server." });
    if (item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now()) return res.status(400).json({ error: "Denne serial key er udløbet." });
    if (item.uses >= item.maxUses) return res.status(400).json({ error: "Denne serial key er allerede brugt op." });

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(400).json({ error: "Shardnote Bot-botten er ikke på den valgte server." });
    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (!member) return res.status(404).json({ error: "Discord-brugeren er ikke medlem af serveren." });
    const role = guild.roles.cache.get(item.roleId);
    if (!role) return res.status(404).json({ error: "Rollen findes ikke længere på serveren." });
    if (!role.editable) return res.status(400).json({ error: "Botten kan ikke give denne rolle. Flyt rollen under Shardnote Bot-bottens rolle." });

    await member.roles.add(role, "Shardnote Bot serial key redemption");

    const used = await db.query(
      'UPDATE public.serial_keys SET uses = uses + 1, last_redeemed_by = $1, last_redeemed_at = NOW() WHERE id = $2 AND uses < max_uses RETURNING uses',
      [discordUserId, item.id]
    );
    if (!used.rowCount) return res.status(409).json({ error: "Denne serial key blev brugt op lige før. Rollen er dog givet til denne Discord-bruger." });

    log("security", "Serial key redeemed for " + (member.user?.tag || discordUserId) + " in " + guild.name);
    res.json({ ok: true, productName: item.productName, roleName: role.name, guildName: guild.name });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Serial key kunne ikke bruges." });
  }
});

app.patch("/api/admin/users/:id/ban", requireAuth, requireAdmin, async (req, res) => {
  try {
    await ensureAdmin();

    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ error: "Du kan ikke banne din egen konto." });
    }

    const banType = req.body?.type === "ip" ? "ip" : "normal";
    if (banType === "ip" && !isSiteOwner(req.user)) return res.status(403).json({ error: "Kun ejeren af Shardnote Bot kan bruge IP-ban." });
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
    service: "Shardnote Bot",
    discord: discordReady,
    uptime: Math.floor((Date.now() - startedAt) / 1000)
  });
});

app.post("/api/billing/create-checkout",requireAuth,async(req,res)=>{
  try{
    if(!stripe)return res.status(503).json({error:"Stripe er ikke konfigureret endnu."});
    if(hasPaidAccess(req.user))return res.status(400).json({error:"Du har allerede adgang."});

    const requestedPlan=["member","member_plus","member_pro"].includes(req.body?.plan) ? req.body.plan : "member";
    const requestedMonths=[1,3,12].includes(Number(req.body?.months)) ? Number(req.body.months) : 1;
    const planInfo={
      member:{amount:267,name:"Shardnote Bot Member"},
      member_plus:{amount:468,name:"Shardnote Bot Member Plus"},
      member_pro:{amount:Number(process.env.STRIPE_MEMBER_PRO_AMOUNT_EUR || 699),name:"Shardnote Bot Member Pro"}
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
      line_items:[{price_data:{currency:"eur",unit_amount:planInfo.amount*requestedMonths,recurring:{interval:"month",interval_count:requestedMonths},product_data:{name:planInfo.name+" · "+requestedMonths+" "+(requestedMonths===1?"month":"months")}},quantity:1}],
      metadata:{user_id:String(req.user.id),plan:requestedPlan,months:String(requestedMonths)},
      subscription_data:{
        metadata:{user_id:String(req.user.id),plan:requestedPlan,months:String(requestedMonths)},
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

    res.json({url:session.url,plan:requestedPlan,months:requestedMonths});
  }catch(error){
    console.error("[Shardnote Bot] Stripe checkout failed:",error);
    res.status(500).json({error:"Betalingssiden kunne ikke åbnes."});
  }
});

app.get("/api/billing/status",requireAuth,async(req,res)=>{
  try{
    if(stripe&&req.user.stripeSubscriptionId)await refreshSubscriptionFromStripe(req.user);
    res.json({configured:!!stripe,status:req.user.subscriptionStatus||"inactive",hasPaidAccess:hasPaidAccess(req.user)});
  }catch(error){
    console.error("[Shardnote Bot] Stripe status check failed:",error);
    res.status(500).json({error:"Betalingsstatus kunne ikke hentes."});
  }
});

app.post("/api/billing/portal",requireAuth,async(req,res)=>{
  try{
    if(!stripe||!req.user.stripeCustomerId)return res.status(400).json({error:"Der er ikke noget Stripe-abonnement at administrere."});
    const portal=await stripe.billingPortal.sessions.create({customer:req.user.stripeCustomerId,return_url:PUBLIC_SITE_URL});
    res.json({url:portal.url});
  }catch(error){
    console.error("[Shardnote Bot] Stripe portal failed:",error);
    res.status(500).json({error:"Abonnementsadministration kunne ikke åbnes."});
  }
});

app.use("/api", (req, res, next) => {
  if (["/login", "/register", "/logout", "/me"].includes(req.path) || req.path === "/health") return next();
  requireAuth(req,res,async()=>{
    try{
      if(["/billing/create-checkout","/billing/status","/billing/portal","/license/redeem"].some(path=>req.path.startsWith(path))) return next();
      if(!hasPaidAccess(req.user))return res.status(402).json({requiresSubscription:true,error:"Et aktivt Shardnote Bot-abonnement kræves."});
      next();
    }catch(error){console.error(error);res.status(500).json({error:"Adgangskontrol kunne ikke gennemføres."});}
  });
});

app.get("/api/stats", async (req, res) => {
  try {
    const botReady = typeof client.isReady === "function" ? client.isReady() : discordReady;
    const linkedGuilds = botReady ? [...client.guilds.cache.values()] : [];

    let openTickets = req.user?.role === "admin"
      ? state.tickets.filter(t => t.status !== "closed").length
      : state.tickets.filter(t => t.ownerUserId === req.user.id && t.status !== "closed").length;

    if (db) {
      const result = req.user?.role === "admin"
        ? await db.query("SELECT COUNT(*)::int AS count FROM public.tickets WHERE status <> 'closed'")
        : await db.query("SELECT COUNT(*)::int AS count FROM public.tickets WHERE owner_user_id = $1 AND status <> 'closed'", [req.user.id]);
      openTickets = result.rows[0].count;
    }

    const memberCount = linkedGuilds.reduce(
      (total, guild) => total + Number(guild.memberCount || 0),
      0
    );

    res.json({
      botOnline: botReady,
      servers: linkedGuilds.length,
      users: memberCount,
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

function emailHtmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function getTicketAdminEmail() {
  const configured = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (configured) return configured;

  if (db) {
    const result = await db.query(
      "SELECT email FROM public.users WHERE role = 'admin' ORDER BY id ASC LIMIT 1"
    );
    return result.rows[0]?.email ? String(result.rows[0].email).trim().toLowerCase() : "";
  }

  const admin = state.users.find(user => user.role === "admin");
  return admin?.email ? String(admin.email).trim().toLowerCase() : "";
}

async function sendTicketAdminEscalationEmail(ticket, messages, reason) {
  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.RESEND_FROM_EMAIL || "").trim();
  const to = await getTicketAdminEmail();

  if (!resendKey || !from || !to) {
    console.warn("[Shardnote Bot] Admin escalation email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL in Render.");
    return false;
  }

  const transcript = messages.slice(-20).map(m => {
    const who = m.authorRole === "admin" ? "Admin" : m.authorRole === "ai" ? "AI" : "Kunde";
    return `<p><b>${emailHtmlEscape(who)} — ${emailHtmlEscape(m.authorName || "")}</b><br>${emailHtmlEscape(m.content || "").replace(/\n/g, "<br>")}</p>`;
  }).join("");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + resendKey
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `🚨 ShardNote ticket #${emailHtmlEscape(ticket.id)} kræver en administrator`,
      html:
        `<h2>🚨 Ticket #${emailHtmlEscape(ticket.id)} kræver hjælp</h2>` +
        `<p><b>Ticket:</b> ${emailHtmlEscape(ticket.title || "Support ticket")}</p>` +
        `<p><b>Hvorfor:</b> ${emailHtmlEscape(reason || "AI kunne ikke løse ticketen.")}</p>` +
        `<p><b>Beskrivelse:</b><br>${emailHtmlEscape(ticket.description || "").replace(/\n/g, "<br>")}</p>` +
        `<hr><h3>Seneste samtale</h3>${transcript || "<p>Ingen beskeder.</p>"}` +
        `<p><a href="https://shardnote-mxj3.onrender.com">Åbn ShardNote</a></p>`
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || data?.error?.message || "Kunne ikke sende admin-mailen.");
  }

  return true;
}

function normalizeAiAnswer(answer) {
  const raw = String(answer || "").trim();
  const needsAdmin = /^\[ADMIN_HANDOFF\]/i.test(raw);
  return {
    needsAdmin,
    text: raw.replace(/^\[ADMIN_HANDOFF\]\s*/i, "").trim()
  };
}

async function generateTicketAiReply(ticket, messages) {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("AI er ikke konfigureret. Tilføj GEMINI_API_KEY i Render.");

  const primaryModel = String(process.env.GEMINI_MODEL || "gemini-3.8-flash").trim();
  const fallbackModel = String(process.env.GEMINI_FALLBACK_MODEL || "gemini-3.7-flash").trim();
  const models = [...new Set([primaryModel, fallbackModel, "gemini-3.5-flash-lite"].filter(Boolean))];

  const transcript = messages.slice(-20)
    .map(m => (m.authorRole === "admin" ? "Admin" : m.authorRole === "ai" ? "AI" : "Kunde") + ": " + m.content)
    .join("\n");

  const prompt = [
    "Du er Shardnote Bot supportassistent.",
    "Svar kort, venligt og konkret på kundens supportticket.",
    "Du må ikke opfinde funktioner, priser eller løfter.",
    "Hvis du kan løse problemet med de oplysninger, du har, så svar direkte og konkret.",
    "Hvis du ikke kan løse problemet sikkert, mangler vigtig adgang/oplysning, eller sagen kræver en administrator, skal du starte svaret med præcis [ADMIN_HANDOFF].",
    "Efter [ADMIN_HANDOFF] skal du kort forklare brugeren, at en administrator tager over.",
    "Svar på dansk, medmindre kunden skriver på et andet sprog.",
    "",
    "Ticket: " + String(ticket.title || ""),
    "Beskrivelse: " + String(ticket.description || ""),
    "",
    "Samtale:",
    transcript || "(ingen tidligere beskeder)"
  ].join("\n");

  let lastError = null;

  for (const model of models) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{
              text: "Du er Shardnote Bot supportassistent. Vær hjælpsom, præcis og sikker. Opfind ikke funktioner, priser eller løfter. Brug [ADMIN_HANDOFF], når sagen kræver menneskelig hjælp."
            }]
          },
          contents: [{
            role: "user",
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            maxOutputTokens: 500,
            temperature: 0.2
          }
        })
      });

      const data = await response.json();

      if (response.ok) {
        const text = (data?.candidates || [])
          .flatMap(candidate => candidate?.content?.parts || [])
          .map(part => part?.text || "")
          .join("")
          .trim();

        if (!text) throw new Error("AI returnerede ikke et svar.");
        return text.slice(0, 4000);
      }

      const message = data?.error?.message || "AI-svar kunne ikke genereres.";
      lastError = new Error(message);
      const retryable = response.status === 429 || response.status === 503 ||
        /quota|high demand|temporar|resource exhausted|rate.?limit/i.test(message);

      if (!retryable) break;
      console.warn(`[Shardnote Bot] Gemini model ${model} was unavailable; trying fallback model.`);
    } catch (error) {
      lastError = error;
      console.warn(`[Shardnote Bot] Gemini model ${model} failed; trying fallback model:`, error.message);
    }
  }

  throw lastError || new Error("AI-svar kunne ikke genereres.");
}

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
    const description = String(req.body?.description || "").trim().slice(0, 5000);
    const ticket = await saveTicket({
      title: req.body.title,
      user: req.body.user,
      status: "open",
      priority: req.body.priority,
      ownerUserId: req.user.id,
      description,
      handler: req.body.handler
    });

    if (db && description) {
      await db.query(
        'INSERT INTO public.ticket_messages (ticket_id, author_user_id, author_name, author_role, content) VALUES ($1,$2,$3,$4,$5)',
        [
          ticket.id,
          req.user.id,
          req.user.name || req.user.email || "Bruger",
          "user",
          description
        ]
      );
    }

    log("ticket", `Ticket #${ticket.id} created from dashboard`, req.user.id);

    if (ticket.handler === "ai" && db && process.env.GEMINI_API_KEY && description) {
      try {
        const history = [{
          authorName: req.user.name || req.user.email || "Bruger",
          authorRole: "user",
          content: description
        }];
        const answer = await generateTicketAiReply(ticket, history);
        const aiResult = normalizeAiAnswer(answer);
        if (aiResult.needsAdmin) {
          try {
            await sendTicketAdminEscalationEmail(ticket, history, "AI vurderede, at sagen kræver en administrator.");
          } catch (notifyError) {
            console.error("[Shardnote Bot] Admin escalation email failed:", notifyError.message);
          }
          await db.query(
            'INSERT INTO public.ticket_messages (ticket_id, author_name, author_role, content) VALUES ($1,$2,$3,$4)',
            [ticket.id, "Shardnote Bot AI", "ai", aiResult.text || "Jeg sender din ticket videre til en administrator, som hjælper dig videre."]
          );
          await db.query("UPDATE public.tickets SET status = 'pending', handler = 'admins' WHERE id = $1", [ticket.id]);
        } else {
          await db.query(
            'INSERT INTO public.ticket_messages (ticket_id, author_name, author_role, content) VALUES ($1,$2,$3,$4)',
            [ticket.id, "Shardnote Bot AI", "ai", aiResult.text]
          );
        }
        log("ticket", "AI automatically replied to ticket #" + ticket.id, req.user.id);
      } catch (error) {
        console.error("[Shardnote Bot] Automatic ticket AI failed:", error.message);
        try {
          await sendTicketAdminEscalationEmail(ticket, history, error.message);
        } catch (notifyError) {
          console.error("[Shardnote Bot] Could not notify admin about AI failure:", notifyError.message);
        }
        try {
          await db.query(
            'INSERT INTO public.ticket_messages (ticket_id, author_name, author_role, content) VALUES ($1,$2,$3,$4)',
            [ticket.id, "Shardnote Bot AI", "ai", "Jeg kunne ikke svare sikkert på dette lige nu. Jeg har sendt din ticket videre til en administrator."]
          );
          await db.query("UPDATE public.tickets SET status = 'pending', handler = 'admins' WHERE id = $1", [ticket.id]);
        } catch (dbError) {
          console.error("[Shardnote Bot] Could not save AI escalation message:", dbError.message);
        }
        ticket.aiError = error.message;
      }
    }

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

app.get("/api/tickets/:id/messages", async (req, res) => {
  try {
    if (!db) return res.json([]);
    const check = await db.query(
      "SELECT id FROM public.tickets WHERE id = $1 AND (owner_user_id = $2 OR $3 = TRUE) LIMIT 1",
      [req.params.id, req.user.id, req.user.role === "admin"]
    );
    if (!check.rowCount) return res.status(404).json({ error: "Ticket not found" });
    const result = await db.query(
      'SELECT id, author_name AS "authorName", author_role AS "authorRole", content, created_at AS "createdAt" FROM public.ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC LIMIT 200',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Ticketbeskeder kunne ikke hentes." });
  }
});

app.post("/api/tickets/:id/reply", async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: "Database er nødvendig." });
    const content = String(req.body?.content || "").trim().slice(0, 4000);
    if (!content) return res.status(400).json({ error: "Skriv et svar." });
    const check = await db.query(
      "SELECT id FROM public.tickets WHERE id = $1 AND (owner_user_id = $2 OR $3 = TRUE) LIMIT 1",
      [req.params.id, req.user.id, req.user.role === "admin"]
    );
    if (!check.rowCount) return res.status(404).json({ error: "Ticket not found" });
    const role = req.user.role === "admin" ? "admin" : "user";
    const authorName = req.user.name || req.user.email || "Bruger";
    const result = await db.query(
      'INSERT INTO public.ticket_messages (ticket_id, author_user_id, author_name, author_role, content) VALUES ($1,$2,$3,$4,$5) RETURNING id, author_name AS "authorName", author_role AS "authorRole", content, created_at AS "createdAt"',
      [req.params.id, req.user.id, authorName, role, content]
    );
    await db.query("UPDATE public.tickets SET status = 'pending' WHERE id = $1 AND status <> 'closed'", [req.params.id]);
    log("ticket", "Ticket #" + req.params.id + " received a " + role + " reply", req.user.id);
    if (role === "user") {
      const ticketInfo = await db.query('SELECT id, title, description, handler FROM public.tickets WHERE id = $1 LIMIT 1', [req.params.id]);
      const currentTicket = ticketInfo.rows[0];
      if (currentTicket?.handler === "ai" && process.env.GEMINI_API_KEY) {
        try {
          const history = await db.query(
            'SELECT author_name AS "authorName", author_role AS "authorRole", content, created_at AS "createdAt" FROM public.ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC LIMIT 200',
            [req.params.id]
          );
          const answer = await generateTicketAiReply(currentTicket, history.rows);
          const aiResult = normalizeAiAnswer(answer);
          if (aiResult.needsAdmin) {
            try {
              await sendTicketAdminEscalationEmail(currentTicket, history.rows, "AI vurderede, at sagen kræver en administrator.");
            } catch (notifyError) {
              console.error("[Shardnote Bot] Admin escalation email failed:", notifyError.message);
            }
            await db.query(
              'INSERT INTO public.ticket_messages (ticket_id, author_name, author_role, content) VALUES ($1,$2,$3,$4)',
              [req.params.id, "Shardnote Bot AI", "ai", aiResult.text || "Jeg sender din ticket videre til en administrator, som hjælper dig videre."]
            );
            await db.query("UPDATE public.tickets SET status = 'pending', handler = 'admins' WHERE id = $1", [req.params.id]);
          } else {
            await db.query(
              'INSERT INTO public.ticket_messages (ticket_id, author_name, author_role, content) VALUES ($1,$2,$3,$4)',
              [req.params.id, "Shardnote Bot AI", "ai", aiResult.text]
            );
          }
          log("ticket", "AI automatically replied to customer on ticket #" + req.params.id, req.user.id);
        } catch (error) {
          console.error("[Shardnote Bot] Automatic AI reply failed:", error.message);
          try {
            await sendTicketAdminEscalationEmail(currentTicket, history.rows, error.message);
          } catch (notifyError) {
            console.error("[Shardnote Bot] Admin escalation email failed:", notifyError.message);
          }
          try {
            await db.query(
              'INSERT INTO public.ticket_messages (ticket_id, author_name, author_role, content) VALUES ($1,$2,$3,$4)',
              [req.params.id, "Shardnote Bot AI", "ai", "Jeg kunne ikke svare sikkert på dette lige nu. Jeg har sendt din ticket videre til en administrator."]
            );
            await db.query("UPDATE public.tickets SET status = 'pending', handler = 'admins' WHERE id = $1", [req.params.id]);
          } catch (dbError) {
            console.error("[Shardnote Bot] Could not save AI escalation message:", dbError.message);
          }
        }
      }
    }
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Svar kunne ikke sendes." });
  }
});

app.post("/api/tickets/:id/ai-reply", requireAdmin, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: "Database er nødvendig." });
    const ticketResult = await db.query(
      'SELECT id, title, description FROM public.tickets WHERE id = $1 LIMIT 1',
      [req.params.id]
    );
    const ticket = ticketResult.rows[0];
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const messagesResult = await db.query(
      'SELECT id, author_name AS "authorName", author_role AS "authorRole", content, created_at AS "createdAt" FROM public.ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC LIMIT 200',
      [ticket.id]
    );
    const history = messagesResult.rows;

    const lastMessage = history[history.length - 1];
    if (lastMessage?.authorRole === "ai") {
      return res.status(409).json({
        error: "AI har allerede svaret på den seneste besked."
      });
    }

    const answer = await generateTicketAiReply(ticket, history);
    const aiResult = normalizeAiAnswer(answer);
    if (aiResult.needsAdmin) {
      try {
        await sendTicketAdminEscalationEmail(ticket, history, "AI vurderede, at sagen kræver en administrator.");
      } catch (notifyError) {
        console.error("[Shardnote Bot] Admin escalation email failed:", notifyError.message);
      }
    }
    const result = await db.query(
      'INSERT INTO public.ticket_messages (ticket_id, author_name, author_role, content) VALUES ($1,$2,$3,$4) RETURNING id, author_name AS "authorName", author_role AS "authorRole", content, created_at AS "createdAt"',
      [ticket.id, "Shardnote Bot AI", "ai", aiResult.text || "Jeg sender din ticket videre til en administrator, som hjælper dig videre."]
    );
    await db.query("UPDATE public.tickets SET status = 'pending', handler = 'ai' WHERE id = $1", [ticket.id]);
    log("ticket", "AI replied to ticket #" + ticket.id, req.user.id);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("[Shardnote Bot] Ticket AI failed:", error);
    res.status(500).json({ error: error.message || "AI-svar kunne ikke genereres." });
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

app.post("/api/ip/unlock", requireAuth, requireSiteOwner, async (req, res) => {
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

app.post("/api/ip/lock", requireAuth, requireSiteOwner, (req, res) => {
  const sid = getSessionId(req);
  if (sid) ipUnlocks.delete(sid);
  res.json({ ok: true });
});

app.get("/api/ip/overview", requireAuth, requireSiteOwner, requireIpAccess, async (req, res) => {
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
    if (req.user?.role !== "admin" && !(await isGuildLinkedToUser(req.user.id, guild.id))) return res.status(403).json({ error: "Denne Discord-server er ikke koblet til din Shardnote Bot-konto." });

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
    if(req.user?.role!=="admin" && !(await isGuildLinkedToUser(req.user.id,guild.id)))return res.status(403).json({error:"Denne Discord-server er ikke koblet til din Shardnote Bot-konto."});
    const settings=client.dashboardGetGuildSettings ? await client.dashboardGetGuildSettings(guild.id) : {};
    res.json({enabled:!!settings.ai_enabled,channelIds:Array.isArray(settings.ai_channel_ids)?settings.ai_channel_ids:[]});
  }catch(error){console.error(error);res.status(500).json({error:"AI-indstillingerne kunne ikke hentes."});}
});

app.patch("/api/bot/guilds/:guildId/ai", requireAuth, requirePaid, (req,res,next)=>requirePlan("member_pro",req,res,next), async (req,res)=>{
  try{
    const guild=client.guilds.cache.get(String(req.params.guildId));
    if(!guild)return res.status(404).json({error:"Botten er ikke med i den valgte Discord-server."});
    if(req.user?.role!=="admin" && !(await isGuildLinkedToUser(req.user.id,guild.id)))return res.status(403).json({error:"Denne Discord-server er ikke koblet til din Shardnote Bot-konto."});
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
      return res.status(403).json({ error: "Denne Discord-server er ikke koblet til din Shardnote Bot-konto." });
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
<title>Shardnote Bot — Discord Control Center</title>
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
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.empty{padding:30px;text-align:center;color:var(--muted);border:1px dashed var(--border);border-radius:12px}.spot-layout{display:grid;grid-template-columns:minmax(280px,420px) 1fr;gap:18px}.spot-preview{display:grid;place-items:center;min-height:420px;background:#0b0b11;border:1px solid var(--border);border-radius:14px;padding:18px}.spot-canvas{max-width:100%;height:auto;border-radius:12px;box-shadow:0 16px 50px rgba(0,0,0,.3);display:block}.spot-help{color:var(--muted);font-size:12px;line-height:1.5}@media(max-width:900px){.spot-layout{grid-template-columns:1fr}}
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
  <div class="brand"><div class="brand-mark">S</div><span>Shardnote Bot</span></div>
  <nav class="nav">
    <button class="active" data-page="dashboard"><span class="icon">⌂</span><span>Dashboard</span></button>
    <button data-page="spot"><span class="icon">🎨</span><span>Mit spot</span></button>
    <button data-page="tickets"><span class="icon">🎫</span><span>Tickets</span></button>
    <button data-page="messages"><span class="icon">✉</span><span>Beskeder</span></button>
    <button data-page="commands"><span class="icon">⌘</span><span>Commands</span></button>
    <button data-page="features"><span class="icon">🧩</span><span>Bot-funktioner</span></button>
    <button data-page="templates"><span class="icon">🧱</span><span>Discord-skitser</span></button>
    <button data-page="upgrades"><span class="icon">🚀</span><span>Opgraderinger</span></button>
    <button data-page="store"><span class="icon">🛒</span><span>Store</span></button>
    <button data-page="music"><span class="icon">♫</span><span>Musik</span></button>
    <button data-page="settings"><span class="icon">⚙</span><span>Indstillinger</span></button>
    <button data-page="logs"><span class="icon">◷</span><span>Logs</span></button>
    <button data-page="admin"><span class="icon">👑</span><span>Admin</span></button>
  </nav>
  <div class="sidebar-footer">Shardnote Bot 2.0<br>Discord Control Center</div>
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

<section class="page" id="page-spot">
  <div class="card" style="margin-bottom:18px">
    <div class="section-title">
      <div><h2>🎨 Mit spot</h2><span>Lav dit eget billede direkte inde på Shardnote Bot.</span></div>
    </div>
    <p class="spot-help" style="margin:0">Du kan skrive tekst, vælge størrelse og farver og hente billedet som PNG. Det bliver lavet lokalt i din browser.</p>
  </div>

  <div class="spot-layout">
    <div class="card">
      <div class="section-title"><div><h2>Opret billede</h2><span>Dit billede ændres med det samme.</span></div></div>
      <div class="form-grid">
        <div class="field"><label>Titel</label><input id="spotTitle" maxlength="60" value="Shardnote Bot"></div>
        <div class="field"><label>Undertekst</label><input id="spotSubtitle" maxlength="90" value="Mit spot"></div>
        <div class="field"><label>Bredde</label><input id="spotWidth" type="number" min="300" max="2400" value="1200"></div>
        <div class="field"><label>Højde</label><input id="spotHeight" type="number" min="300" max="1600" value="630"></div>
        <div class="field"><label>Baggrund</label><input id="spotBackground" type="color" value="#11111b" style="height:44px;padding:4px"></div>
        <div class="field"><label>Tekstfarve</label><input id="spotTextColor" type="color" value="#ffffff" style="height:44px;padding:4px"></div>
        <div class="field"><label>Accentfarve</label><input id="spotAccent" type="color" value="#6d28d9" style="height:44px;padding:4px"></div>
        <div class="field"><label>Rundede hjørner</label><select id="spotRadius"><option value="0">Ingen</option><option value="24" selected>24 px</option><option value="40">40 px</option><option value="60">60 px</option></select></div>
      </div>
      <div class="actions">
        <button class="btn primary" type="button" onclick="renderSpotImage()">🔄 Opdater</button>
        <button class="btn" type="button" onclick="downloadSpotImage()">⬇ Hent PNG</button>
      </div>
      <div class="spot-help" style="margin-top:12px">Tip: Brug en kort titel og en lille undertekst, så billedet også ser godt ud som banner eller opslag.</div>
    </div>

    <div class="card">
      <div class="section-title"><div><h2>Forhåndsvisning</h2><span>Sådan bliver dit billede gemt.</span></div></div>
      <div class="spot-preview"><canvas id="spotCanvas" class="spot-canvas" width="1200" height="630"></canvas></div>
    </div>
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
      <div><h2>🚀 Opgraderinger</h2><span>Har du en idé til en forbedring af Shardnote Bot-hjemmesiden eller botten?</span></div>
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
      <div class="section-title"><div><h2>🎫 Sådan fungerer det</h2><span>Din idé bliver til en rigtig Shardnote Bot-ticket.</span></div></div>
      <div class="activity">
        <div class="activity-item"><div class="activity-icon">1</div><div><b>Du sender idéen</b><small>Vælg område og skriv dit forslag.</small></div></div>
        <div class="activity-item"><div class="activity-icon">2</div><div><b>Shardnote Bot opretter ticketen</b><small>Idéen bliver gemt med din konto.</small></div></div>
        <div class="activity-item"><div class="activity-icon">3</div><div><b>Den kan behandles</b><small>Status og prioritet kan følges i Ticket-systemet.</small></div></div>
      </div>
    </div>
  </div>
  <div class="card" style="margin-top:18px">
    <div class="section-title"><div><h2>📋 Dine opgraderingsidéer</h2><span>Seneste idéer sendt fra din konto.</span></div></div>
    <div id="upgradeIdeasList"><div class="empty">Indlæser…</div></div>
  </div>
</section>

<section class="page" id="page-store">
  <div class="card" style="margin-bottom:18px">
    <div class="section-title">
      <div><h2>🛒 Shardnote Bot Store</h2><span>Køb din ShardNote-licens</span></div>
    </div>
    <p style="color:var(--muted);line-height:1.6">
      Vælg den pakke og periode, du vil købe. Efter et bekræftet køb bliver din licens-key udleveret til din konto og sendt til din mail, når maillevering er konfigureret.
    </p>
    <div class="grid three" style="margin-top:16px">
      <div class="card">
        <h3>Member</h3>
        <p style="color:var(--muted)">Grundpakken til din Discord-server.</p>
        <div class="field" style="margin-top:14px"><label>Vælg betalingsperiode</label><select id="period-member"><option value="1">1 måned</option><option value="3">3 måneder</option><option value="12">12 måneder</option></select></div>
        <p style="color:var(--muted);font-size:12px;margin:10px 0 0">Den valgte periode åbner den tilsvarende SellAuth-pris.</p>
        <div class="actions"><button class="btn primary" onclick="buySelectedPeriod('member','period-member')">Fortsæt til betaling</button></div>
      </div>
      <div class="card">
        <h3>Member Plus</h3>
        <p style="color:var(--muted)">Flere server- og botfunktioner.</p>
        <div class="field" style="margin-top:14px"><label>Vælg betalingsperiode</label><select id="period-member-plus"><option value="1">1 måned</option><option value="3">3 måneder</option><option value="12">12 måneder</option></select></div>
        <p style="color:var(--muted);font-size:12px;margin:10px 0 0">Den valgte periode åbner den tilsvarende SellAuth-pris.</p>
        <div class="actions"><button class="btn primary" onclick="buySelectedPeriod('member_plus','period-member-plus')">Fortsæt til betaling</button></div>
      </div>
      <div class="card">
        <h3>Member Pro</h3>
        <p style="color:var(--muted)">Avancerede funktioner og AI.</p>
        <div class="field" style="margin-top:14px"><label>Vælg betalingsperiode</label><select id="period-member-pro"><option value="1">1 måned</option><option value="3">3 måneder</option><option value="12">12 måneder</option></select></div>
        <p style="color:var(--muted);font-size:12px;margin:10px 0 0">Den valgte periode åbner den tilsvarende SellAuth-pris.</p>
        <div class="actions"><button class="btn primary" onclick="buySelectedPeriod('member_pro','period-member-pro')">Fortsæt til betaling</button></div>
      </div>
    </div>
    <div id="storePurchaseResult" style="margin-top:12px"></div>
  </div>
  <div class="card">
    <div class="section-title"><div><h2>🔑 Har du allerede en key?</h2><span>Aktivér den separat fra butikken</span></div></div>
    <p style="color:var(--muted);line-height:1.6">Key-aktivering hører ikke til i selve Bot Store. Åbn aktiveringen og indsæt din licens.</p>
    <div class="actions"><button class="btn primary" onclick="navigate('activate')">🔑 Aktivér key</button></div>
  </div>
</section>

<section class="page" id="page-activate">
  <div class="card" style="max-width:760px;margin:0 auto">
    <div class="section-title"><div><h2>🔑 Aktivér din key</h2><span>Indtast den licens, du har købt eller fået udleveret</span></div></div>
    <div class="field"><label>Licens-key</label><input id="licenseActivationKey" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" autocomplete="off"></div>
    <div class="actions" style="margin-top:14px"><button class="btn primary" onclick="activateLicenseKey()">✅ Aktivér licens</button><button class="btn" onclick="navigate('store')">Tilbage til Store</button></div>
    <div id="licenseActivationResult" style="margin-top:12px"></div>
  </div>
</section>

<section class="page" id="page-tickets">
  <div class="card">
    <div class="section-title">
      <div>
        <h2 style="margin:0">Ticket-system</h2>
        <span>Vælg hvem der skal behandle ticketen, og skriv derefter direkte i chatten.</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end">
        <label style="display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px">
          <span>Behandler</span>
          <select id="ticketHandlerDefault" class="ticket-handler-default">
            <option value="ai">🤖 AI</option>
            <option value="admins">👑 Admins</option>
            <option value="ticket">🎫 Ticket</option>
          </select>
        </label>
        <button class="btn primary" data-button-label="ticketNew" onclick="newTicket()">+ Ny ticket</button>
      </div>
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
      <div>
        <h2>🎫 Tickets</h2>
        <span>Alle kundetickets direkte i Admin-panelet.</span>
      </div>
      <button class="btn small" onclick="loadAdminTickets()">Opdater</button>
    </div>
    <p style="color:var(--muted);line-height:1.6">Åbn en ticket direkte herfra og se hele samtalen, inklusive <b>🤖 AI-svar</b>, kundens beskeder og dine adminsvar.</p>
    <div id="adminTicketList"></div>
  </div>

  <div class="card" style="margin-bottom:18px">
    <div class="section-title"><div><h2>🔑 Serial Keys</h2><span>Kun administratorer · generér nøgler til Discord-roller</span></div></div>
    <div class="form-grid">
      <div class="field"><label>Key type</label><select id="serialType" onchange="toggleSerialType()"><option value="account">Website access</option><option value="discord">Discord role</option></select></div>
      <div class="field"><label>Shardnote Bot-pakke</label><select id="serialAccessPlan"><option value="member">Member</option><option value="member_plus">Member Plus</option><option value="member_pro">Member Pro</option></select></div>
      <div class="field"><label>Server</label><select id="serialGuild" onchange="loadSerialRoles()" disabled><option value="">Vælg server</option></select></div>
      <div class="field"><label>Discord-rolle</label><select id="serialRole" disabled><option value="">Vælg rolle</option></select></div>
      <div class="field"><label>Produktnavn</label><input id="serialProduct" maxlength="120" value="Shardnote Bot Access"></div>
      <div class="field"><label>Antal keys</label><input id="serialQuantity" type="number" min="1" max="100" value="1"></div>
      <div class="field"><label>Brug pr. key</label><input id="serialMaxUses" type="number" min="1" max="10000" value="1"></div>
      <div class="field"><label>Udløbsdato (valgfri)</label><input id="serialExpiresAt" type="datetime-local"></div>
    </div>
    <div class="actions"><button class="btn primary" onclick="generateSerialKeys()">🔑 Generér serial keys</button></div>
    <pre id="serialGenerated" style="display:none;margin-top:14px;white-space:pre-wrap;word-break:break-all;background:#0b0b11;border:1px solid var(--border);padding:12px;border-radius:10px"></pre>
    <div id="serialKeyList" style="margin-top:16px"></div>
  </div>

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
      log("success", `Shardnote Bot web server started on port ${PORT}`);
      console.log(`Shardnote Bot running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Database initialization failed:", error);
    process.exit(1);
  }
}

startServer();

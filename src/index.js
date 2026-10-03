const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { Pool } = require("pg");
const { createBot } = require("./bot");
const Stripe = require("stripe");

const app = express();
const PORT = process.env.PORT || 3000;
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;
const PUBLIC_SITE_URL = String(process.env.PUBLIC_SITE_URL || "https://shardnote-mxj3.onrender.com").replace(/\/$/, "");

app.set("trust proxy", 1);

app.post("/api/billing/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).send("Stripe webhook is not configured.");
  }

  const signature = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error("[ShardNote] Stripe webhook signature failed:", error.message);
    return res.status(400).send("Invalid webhook signature.");
  }

  try {
    const object = event.data.object;

    if (event.type === "checkout.session.completed") {
      const userId = object.metadata?.user_id;
      const subscriptionId = typeof object.subscription === "string"
        ? object.subscription
        : object.subscription?.id || null;
      const customerId = typeof object.customer === "string"
        ? object.customer
        : object.customer?.id || null;

      if (userId) {
        await updateUserSubscription({
          userId,
          status: "active",
          customerId,
          subscriptionId
        });
      }
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
      const userId = object.metadata?.user_id;
      if (userId) {
        await updateUserSubscription({
          userId,
          status: object.status,
          customerId: typeof object.customer === "string" ? object.customer : object.customer?.id,
          subscriptionId: object.id,
          currentPeriodEnd: object.current_period_end
        });
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const userId = object.metadata?.user_id;
      if (userId) {
        await updateUserSubscription({
          userId,
          status: "canceled",
          customerId: typeof object.customer === "string" ? object.customer : object.customer?.id,
          subscriptionId: object.id,
          currentPeriodEnd: object.current_period_end
        });
      }
    }

    if (event.type === "invoice.payment_failed") {
      const subscriptionId = typeof object.subscription === "string"
        ? object.subscription
        : object.subscription?.id || null;
      if (subscriptionId) {
        await updateUserSubscriptionByStripeSubscription(subscriptionId, "past_due");
      }
    }

    return res.json({ received: true });
  } catch (error) {
    console.error("[ShardNote] Stripe webhook handler failed:", error);
    return res.status(500).send("Webhook handler failed.");
  }
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
      ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(120),
      ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(120),
      ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ
  `);

  await db.query(`
    ALTER TABLE public.tickets
      ADD COLUMN IF NOT EXISTS guild_id VARCHAR(32),
      ADD COLUMN IF NOT EXISTS user_id VARCHAR(32),
      ADD COLUMN IF NOT EXISTS channel_id VARCHAR(32),
      ADD COLUMN IF NOT EXISTS claimed_by VARCHAR(32)
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
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
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
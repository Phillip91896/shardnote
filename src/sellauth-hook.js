const crypto = require('crypto');
const express = require('express');
const { Pool } = require('pg');

const ORIGINAL_POST = express.application.post;
const ORIGINAL_USE = express.application.use;
const DATABASE_URL = process.env.DATABASE_URL;
const db = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 }) : null;
const SHOP_ID = String(process.env.SELLAUTH_SHOP_ID || '273405').trim();
const API_KEY = String(process.env.SELLAUTH_API_KEY || '').trim();
const WEBHOOK_SECRET = String(process.env.SELLAUTH_WEBHOOK_SECRET || '').trim();
const API_BASE = String(process.env.SELLAUTH_API_BASE_URL || 'https://api.sellauth.com').replace(/\/$/, '');

function hashSerialKey(value) { return crypto.createHash('sha256').update(String(value || '').trim().toUpperCase()).digest('hex'); }
function generateSerialKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const parts = [];
  for (let group = 0; group < 4; group++) { let part = ''; for (let i = 0; i < 5; i++) part += alphabet[crypto.randomInt(0, alphabet.length)]; parts.push(part); }
  return parts.join('-');
}
function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(header.split(';').filter(Boolean).map(part => { const i = part.indexOf('='); return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())]; }));
}
function sessionSecret() { return process.env.SESSION_SECRET || process.env.DISCORD_TOKEN || process.env.STRIPE_SECRET_KEY || process.env.DATABASE_URL || 'Shardnote Bot-session-secret'; }
function verifySessionToken(token) {
  const raw = String(token || ''); const [id, signature] = raw.split('.');
  if (!id || !signature || !/^\d+$/.test(id)) return null;
  const expected = crypto.createHmac('sha256', sessionSecret()).update(id).digest('hex');
  if (signature.length !== expected.length) return null;
  try { return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? Number(id) : null; } catch { return null; }
}
async function sessionUser(req) {
  if (!db) return null;
  const id = verifySessionToken(parseCookies(req).ShardNote_session); if (id == null) return null;
  const result = await db.query(`SELECT id,name,email,role,plan,subscription_status AS "subscriptionStatus",trial_used AS "trialUsed" FROM public.users WHERE id=$1 LIMIT 1`, [id]);
  return result.rows[0] || null;
}
function paid(user) { return ['admin','owner'].includes(String(user?.role || '').toLowerCase()) || ['active','trialing'].includes(user?.subscriptionStatus); }
function safeJson(value) { try { return JSON.parse(value); } catch { return null; } }
function hmacMatches(rawBody, signature) {
  if (!WEBHOOK_SECRET || !signature) return false;
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
  const supplied = String(signature).trim().replace(/^sha256=/i, '');
  if (supplied.length !== expected.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)); } catch { return false; }
}
function normalizeText(value) { return String(value || '').trim().toLowerCase(); }
function inferPlan(text) {
  const s = normalizeText(text);
  if (s.includes('pro')) return 'member_pro';
  if (s.includes('plus')) return 'member_plus';
  if (s.includes('member')) return 'member';
  return null;
}
function inferMonths(text) {
  const s = normalizeText(text);
  if (/12\s*(month|months|måned|måneder)|annual|year|yearly|12m/.test(s)) return 12;
  if (/3\s*(month|months|måned|måneder)|quarter|3m/.test(s)) return 3;
  return 1;
}
function deepFind(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of keys) if (obj[key] != null) return obj[key];
  for (const value of Object.values(obj)) if (value && typeof value === 'object') { const found = deepFind(value, keys); if (found != null) return found; }
  return null;
}
function productMappingFromEnv() {
  const raw = String(process.env.SELLAUTH_PRODUCT_MAP || '').trim(); if (!raw) return {};
  const parsed = safeJson(raw); return parsed && typeof parsed === 'object' ? parsed : {};
}
async function sellauthRequest(method, endpoint, body) {
  if (!API_KEY) throw new Error('SELLAUTH_API_KEY mangler.');
  const response = await fetch(API_BASE + endpoint, {
    method,
    headers: { Authorization: 'Bearer ' + API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body == null ? undefined : JSON.stringify(body)
  });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!response.ok) throw new Error('SellAuth API ' + response.status + ': ' + String(data?.message || data?.error || text).slice(0, 500));
  return data;
}
async function resolveProductInfo(item) {
  const productId = item?.product_id ?? item?.productId ?? deepFind(item, ['product_id','productId']);
  const variantId = item?.variant_id ?? item?.variantId ?? deepFind(item, ['variant_id','variantId']);
  const mapping = productMappingFromEnv(); const direct = mapping[String(variantId || productId)] || mapping[String(productId || '')];
  if (direct) return { ...direct, productId, variantId };
  if (productId && API_KEY) {
    try {
      const product = await sellauthRequest('GET', `/v1/shops/${encodeURIComponent(SHOP_ID)}/products/${encodeURIComponent(productId)}`);
      const productText = JSON.stringify(product);
      return { plan: inferPlan(productText) || 'member', months: inferMonths(productText), productId, variantId };
    } catch (_) {}
  }
  const text = JSON.stringify(item || {}); return { plan: inferPlan(text) || 'member', months: inferMonths(text), productId, variantId };
}
async function createOrGetLicense({ email, plan, months, orderKey }) {
  if (!db) throw new Error('Database er ikke konfigureret.');
  const existing = await db.query('SELECT id FROM public.license_deliveries WHERE checkout_session_id=$1 LIMIT 1', [orderKey]);
  if (existing.rows[0]) return { duplicate: true, key: null };
  const rawKey = generateSerialKey(); const keyHash = hashSerialKey(rawKey);
  const user = await db.query('SELECT id FROM public.users WHERE lower(email)=lower($1) LIMIT 1', [email]);
  if (!user.rows[0]) throw new Error('Kunden skal have en ShardNote-konto med samme email før levering.');
  await db.query('BEGIN');
  try {
    await db.query(`INSERT INTO public.serial_keys (key_hash,key_last4,product_name,access_plan,max_uses,created_by) VALUES ($1,$2,$3,$4,1,NULL)`, [keyHash, rawKey.slice(-4), `Shardnote Bot ${plan} · ${months} måned${months === 1 ? '' : 'er'}`, plan]);
    await db.query(`INSERT INTO public.license_deliveries (checkout_session_id,user_id,email,key_hash,key_last4) VALUES ($1,$2,$3,$4,$5)`, [orderKey, user.rows[0].id, email, keyHash, rawKey.slice(-4)]);
    await db.query(`UPDATE public.users SET plan=$1, subscription_status='active', trial_used=TRUE WHERE id=$2`, [plan, user.rows[0].id]);
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK'); if (error.code === '23505') return { duplicate: true, key: null }; throw error;
  }
  return { duplicate: false, key: rawKey };
}

function install() {
  express.application.use = function patchedUse(path, ...handlers) {
    if (path === '/api' && handlers.length === 1 && typeof handlers[0] === 'function') {
      const handler = handlers[0];
      return ORIGINAL_USE.call(this, path, (req, res, next) => {
        if (req.path === '/sellauth/deliver' || req.path === '/billing/webhook') return next();
        return handler(req, res, next);
      });
    }
    return ORIGINAL_USE.call(this, path, ...handlers);
  };

  express.application.post = function patchedPost(path, ...handlers) {
    if (path === '/api/billing/create-checkout') {
      return ORIGINAL_POST.call(this, path, express.json({ limit: '100kb' }), async (req, res) => {
        try {
          const user = await sessionUser(req);
          if (!user) return res.status(401).json({ error: 'Du skal logge ind.' });
          if (paid(user)) return res.status(400).json({ error: 'Du har allerede adgang.' });
          if (!API_KEY) return res.status(503).json({ error: 'SellAuth API er ikke konfigureret endnu.' });
          const plan = ['member','member_plus','member_pro'].includes(req.body?.plan) ? req.body.plan : 'member';
          const months = [1,3,12].includes(Number(req.body?.months)) ? Number(req.body.months) : 1;
          const mapping = productMappingFromEnv();
          let productId = mapping[`${plan}:${months}`]?.productId || mapping[`${plan}:${months}`]?.product_id || mapping[`${plan}:${months}`]?.product;
          let variantId = mapping[`${plan}:${months}`]?.variantId || mapping[`${plan}:${months}`]?.variant_id || mapping[`${plan}:${months}`]?.variant;
          if (!productId) {
            const products = await sellauthRequest('GET', `/v1/shops/${encodeURIComponent(SHOP_ID)}/products`);
            const list = Array.isArray(products) ? products : (products?.products || products?.data || []);
            const targetPlan = plan === 'member_plus' ? 'plus' : plan === 'member_pro' ? 'pro' : 'member';
            const target = list.find(p => {
              const text = normalizeText(JSON.stringify(p));
              return text.includes(targetPlan) && (text.includes(String(months)) || (months === 1 && !/3|12/.test(text)));
            });
            if (target) {
              productId = target.id || target.product_id || target.productId;
              const variants = target.variants || target.variant || [];
              if (Array.isArray(variants) && variants.length) {
                const v = variants.find(x => normalizeText(JSON.stringify(x)).includes(String(months))) || variants[0];
                variantId = v?.id || v?.variant_id || v?.variantId || variantId;
              }
            }
          }
          if (!productId) return res.status(503).json({ error: 'SellAuth-produktet kunne ikke findes. Sæt SELLAUTH_PRODUCT_MAP i Render.' });
          // SellAuth Checkout API expects camelCase catalog identifiers.
          // Using product_id / variant_id causes a 422 because the API only accepts
          // productId + variantId for catalog items (or name + price for custom items).
          const cartItem = { productId, quantity: 1 };
          if (variantId) cartItem.variantId = variantId;
          const checkout = await sellauthRequest('POST', `/v1/shops/${encodeURIComponent(SHOP_ID)}/checkout`, {
            cart: [cartItem],
            email: user.email,
            newsletter: false
          });
          const url = checkout?.url || checkout?.checkout_url || checkout?.checkoutUrl || checkout?.data?.url || checkout?.data?.checkout_url || checkout?.data?.checkoutUrl;
          if (!url) throw new Error('SellAuth returnerede ikke en checkout-URL.');
          return res.json({ url, plan, months });
        } catch (error) {
          console.error('[Shardnote Bot] SellAuth checkout failed:', error);
          return res.status(500).json({ error: error.message || 'Betalingssiden kunne ikke åbnes.' });
        }
      });
    }
    if (path === '/api/billing/webhook' || path === '/api/sellauth/deliver') {
      return ORIGINAL_POST.call(this, path, express.raw({ type: 'application/json', limit: '2mb' }), async (req, res) => {
        try {
          const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
          if (!WEBHOOK_SECRET) return res.status(503).send('SellAuth webhook secret er ikke konfigureret.');
          if (!hmacMatches(raw, req.headers['x-signature'])) return res.status(401).send('Invalid webhook signature.');
          const payload = safeJson(raw.toString('utf8')) || {};
          const event = normalizeText(payload.event || payload.type || '');
          if (event && !/(deliver|paid|complete|success|invoice)/.test(event)) return res.json({ received: true, ignored: true });
          const item = payload.item || payload.invoice_item || payload.invoiceItem || payload.data?.item || payload.data?.invoice_item || {};
          const email = String(payload.email || payload.customer?.email || payload.data?.customer?.email || deepFind(payload, ['email']) || '').trim().toLowerCase();
          const info = await resolveProductInfo(item);
          const plan = ['member','member_plus','member_pro'].includes(info.plan) ? info.plan : 'member';
          const months = [1,3,12].includes(Number(info.months)) ? Number(info.months) : 1;
          const baseId = payload.id || payload.invoice_id || payload.invoiceId || payload.data?.id || req.headers['idempotency-key'] || crypto.createHash('sha256').update(raw).digest('hex').slice(0,24);
          const orderKey = `sellauth:${baseId}:${info.productId || ''}:${info.variantId || ''}`;
          const result = await createOrGetLicense({ email, plan, months, orderKey });
          if (result.duplicate) return res.type('text/plain').send('');
          return res.type('text/plain').send(result.key + '\\n');
        } catch (error) {
          console.error('[Shardnote Bot] SellAuth webhook failed:', error);
          return res.status(500).send('Webhook processing failed.');
        }
      });
    }
    return ORIGINAL_POST.call(this, path, ...handlers);
  };
}

install();

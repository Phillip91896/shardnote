async function ensureCannedResponsesTable(db) {
  if (!db) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.canned_responses (
      id BIGSERIAL PRIMARY KEY,
      guild_id VARCHAR(32) NOT NULL,
      response_key VARCHAR(40) NOT NULL,
      response_text VARCHAR(1800) NOT NULL,
      created_by VARCHAR(32),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (guild_id, response_key)
    )
  `);
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 40);
}

async function saveCannedResponse(db, guildId, key, text, userId) {
  await ensureCannedResponsesTable(db);
  await db.query(
    `INSERT INTO public.canned_responses (guild_id,response_key,response_text,created_by)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (guild_id,response_key)
     DO UPDATE SET response_text=EXCLUDED.response_text, updated_at=NOW(), created_by=EXCLUDED.created_by`,
    [guildId, normalizeKey(key), String(text || "").trim().slice(0, 1800), userId]
  );
}

async function listCannedResponses(db, guildId) {
  await ensureCannedResponsesTable(db);
  const result = await db.query(
    "SELECT response_key,response_text FROM public.canned_responses WHERE guild_id=$1 ORDER BY response_key ASC LIMIT 50",
    [guildId]
  );
  return result.rows;
}

async function getCannedResponse(db, guildId, key) {
  await ensureCannedResponsesTable(db);
  const result = await db.query(
    "SELECT response_text FROM public.canned_responses WHERE guild_id=$1 AND response_key=$2 LIMIT 1",
    [guildId, normalizeKey(key)]
  );
  return result.rows[0]?.response_text || null;
}

module.exports = { ensureCannedResponsesTable, saveCannedResponse, listCannedResponses, getCannedResponse, normalizeKey };

// Supabase-backed store, used automatically when SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are set (see db.js and supabaseClient.js).
//
// Rather than a full relational schema, the whole store is kept as one
// JSONB document (same shape as the local store.json) in a single row of
// the `app_store` table (see supabase/schema.sql). This keeps every route
// handler's business logic - which was written against a plain JS object -
// completely unchanged; only persistence moves.
//
// Because a Vercel serverless deployment has no single long-lived process
// to serialize writes in-memory (unlike db.local.js's promise queue),
// concurrent writes are instead handled with optimistic concurrency: each
// write is conditioned on the version number it read, and retries against
// fresh data if another request wrote in between.
const { getSupabaseClient } = require("./supabaseClient");

const TABLE = "app_store";
const ROW_ID = "singleton";
const MAX_RETRIES = 10;

function emptyStore() {
  return { entities: [], reviews: [], users: [], sessions: [] };
}

function withDefaults(data) {
  const defaults = emptyStore();
  const store = data && typeof data === "object" ? data : {};
  for (const key of Object.keys(defaults)) {
    if (!store[key]) store[key] = defaults[key];
  }
  return store;
}

async function fetchRow() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("data, version")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) throw new Error(`Supabase read failed: ${error.message}`);

  if (!data) {
    // First run against a fresh database: seed the singleton row. If two
    // cold starts race here, the loser's insert just conflicts on the
    // primary key - harmless, the winner's row is what both will read next.
    const seed = emptyStore();
    const { error: insertError } = await supabase
      .from(TABLE)
      .insert({ id: ROW_ID, data: seed, version: 0 });
    if (insertError && insertError.code !== "23505") {
      throw new Error(`Supabase init failed: ${insertError.message}`);
    }
    return { store: seed, version: 0 };
  }
  return { store: withDefaults(data.data), version: data.version };
}

async function readStore() {
  const { store } = await fetchRow();
  return store;
}

async function withStore(mutator) {
  const supabase = getSupabaseClient();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { store, version } = await fetchRow();
    const result = mutator(store); // may throw - propagates immediately, no retry, matches db.local.js

    const { data: updatedRows, error } = await supabase
      .from(TABLE)
      .update({ data: store, version: version + 1, updated_at: new Date().toISOString() })
      .eq("id", ROW_ID)
      .eq("version", version)
      .select("version");
    if (error) throw new Error(`Supabase write failed: ${error.message}`);

    if (updatedRows && updatedRows.length > 0) return result;

    // Another request wrote in between our read and write - retry against
    // fresh data rather than silently overwriting it.
    await new Promise((resolve) => setTimeout(resolve, 25 + Math.random() * 75));
  }
  throw new Error("Could not save - too many concurrent updates. Please try again.");
}

module.exports = { withStore, readStore };

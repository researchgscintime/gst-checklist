// Whether to use Supabase at all is decided purely by presence of these two
// env vars - local/on-prem runs simply don't set them and get the original
// JSON-file + local-disk behavior untouched. See db.js and attachments.js.
let cachedClient = null;

function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Uses the service_role key deliberately: the browser never talks to
// Supabase directly, only to our own Express API (same as local mode), so
// there's no client-side exposure of this key. It bypasses Row Level
// Security, which is expected - our own auth.js (requireAuth/requireAdmin/
// canAccessEntity) is what actually gates access, same as it always has.
function getSupabaseClient() {
  if (cachedClient) return cachedClient;
  if (!isSupabaseConfigured()) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use the Supabase backend.");
  }
  const { createClient } = require("@supabase/supabase-js");
  cachedClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

module.exports = { isSupabaseConfigured, getSupabaseClient };

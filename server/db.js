// Picks the storage backend at startup: Supabase when configured (Vercel
// deployment), otherwise the original local JSON file (local/on-prem runs).
// Both expose the exact same { withStore, readStore } interface, so every
// route handler works unchanged regardless of which one is active.
const { isSupabaseConfigured } = require("./supabaseClient");

module.exports = isSupabaseConfigured() ? require("./db.supabase") : require("./db.local");

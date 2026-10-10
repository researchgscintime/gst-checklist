// Picks the attachment storage backend the same way db.js does: Supabase
// Storage when configured, otherwise the local disk folder.
const { isSupabaseConfigured } = require("./supabaseClient");

module.exports = isSupabaseConfigured() ? require("./attachments.supabase") : require("./attachments.local");

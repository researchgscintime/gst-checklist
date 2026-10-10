// Local dev / on-prem entrypoint. Vercel uses api/index.js instead, which
// imports the same app from ./app but never calls .listen() itself -
// Vercel's runtime handles the HTTP server.
//
// Loads a local .env file if present (e.g. to test Supabase mode locally
// before deploying) - harmless no-op if it doesn't exist. Must happen
// before requiring ./app, since that's what decides local-JSON vs Supabase.
require("dotenv").config();
const { app, ensureAdminExists } = require("./app");

const PORT = process.env.PORT || 4173;

ensureAdminExists().finally(() => {
  app.listen(PORT, () => {
    console.log(`GST Review Checklist app running at http://localhost:${PORT}`);
  });
});

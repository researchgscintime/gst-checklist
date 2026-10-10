// Vercel serverless entrypoint. Vercel treats a module exporting an
// (req, res) handler as the function itself - an Express app satisfies
// that directly. vercel.json rewrites every request here.
const { app, ensureAdminExists } = require("../server/app");

// Runs once per cold start of a given function instance (module-level code
// executes once, then the instance is reused for subsequent invocations
// until it's recycled). Idempotent, so overlapping cold starts are safe.
let bootstrap = null;
function ensureBootstrapped() {
  if (!bootstrap) bootstrap = ensureAdminExists().catch((err) => {
    console.error("Admin bootstrap failed:", err);
    bootstrap = null; // allow a retry on the next invocation
  });
  return bootstrap;
}

module.exports = async (req, res) => {
  await ensureBootstrapped();
  return app(req, res);
};

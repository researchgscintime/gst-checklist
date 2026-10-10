const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { template } = require("./checklistTemplate");
const entitiesRouter = require("./routes/entities");
const { entityReviewsRouter, reviewsRouter } = require("./routes/reviews");
const attachmentsRouter = require("./routes/attachments");
const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");
const { requireAuth, requireAdmin, hashPassword } = require("./auth");
const { withStore, readStore } = require("./db");

const app = express();

// Safety net: if no accounts exist yet (fresh install, or the store was
// reset), create a default admin so the app can never lock itself out of
// its own login page. Idempotent - safe to call on every cold start.
async function ensureAdminExists() {
  const store = await readStore();
  if (store.users.length > 0) return;
  const password = crypto.randomBytes(9).toString("base64url");
  const { salt, hash } = hashPassword(password);
  await withStore((s) => {
    s.users.push({
      id: crypto.randomUUID(),
      username: "admin",
      name: "Admin",
      salt,
      passwordHash: hash,
      role: "admin",
      createdAt: new Date().toISOString(),
    });
  });
  console.log("No accounts found - created a default admin account:");
  console.log("  username: admin");
  console.log(`  password: ${password}`);
  console.log("Log in and change this as soon as possible.");
}

app.use("/api/auth", authRouter);
app.get("/api/checklist-template", requireAuth, (req, res) => res.json(template));
app.use("/api/entities/:entityId/reviews", requireAuth, entityReviewsRouter);
app.use("/api/entities", requireAuth, entitiesRouter);
app.use("/api/users", requireAuth, requireAdmin, usersRouter);
app.use("/api/reviews/:id/attachments", requireAuth, attachmentsRouter);
app.use("/api/reviews", requireAuth, reviewsRouter);

app.use(express.static(path.join(__dirname, "..", "public")));

// Fallback errors as JSON for any unmatched /api route
app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

// Catches errors passed via next(err) - notably multer upload failures
// (bad file type, file too large) - and responds with JSON instead of
// Express's default HTML error page.
app.use((err, req, res, next) => {
  if (!err) return next();
  console.error(err);
  res.status(err.status || 400).json({ error: err.message || "Something went wrong." });
});

module.exports = { app, ensureAdminExists };

const express = require("express");
const { readStore } = require("../db");
const {
  verifyPassword,
  publicUser,
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  SESSION_COOKIE,
} = require("../auth");
const cookie = require("cookie");

const router = express.Router();

router.post("/login", express.json(), async (req, res) => {
  const username = String((req.body && req.body.username) || "").trim().toLowerCase();
  const password = String((req.body && req.body.password) || "");
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const store = await readStore();
  const user = store.users.find((u) => u.username === username);
  if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const token = await createSession(user.id);
  setSessionCookie(res, token);
  res.json(publicUser(user));
});

router.post("/logout", async (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE];
  if (token) await destroySession(token);
  clearSessionCookie(res);
  res.status(204).end();
});

router.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

module.exports = router;

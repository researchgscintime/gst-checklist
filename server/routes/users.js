const express = require("express");
const crypto = require("crypto");
const { withStore, readStore } = require("../db");
const { hashPassword } = require("../auth");

const router = express.Router();

function validateUserInput(username, name, password, { requirePassword }) {
  const cleanUsername = String(username || "").trim().toLowerCase();
  const cleanName = String(name || "").trim();
  const cleanPassword = String(password || "");
  if (!cleanUsername) return { error: "Username is required." };
  if (!/^[a-z0-9._-]{2,40}$/.test(cleanUsername)) {
    return { error: "Username may only contain letters, numbers, dots, dashes and underscores." };
  }
  if (!cleanName) return { error: "Name is required." };
  if (requirePassword && cleanPassword.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }
  return { cleanUsername, cleanName, cleanPassword };
}

// GET /api/users - list managers with entity counts (admin only)
router.get("/", async (req, res) => {
  const store = await readStore();
  const users = store.users
    .filter((u) => u.role === "manager")
    .map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role,
      entityCount: store.entities.filter((e) => e.ownerId === u.id).length,
      createdAt: u.createdAt,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json(users);
});

// POST /api/users - create a manager account
router.post("/", express.json(), async (req, res) => {
  const { username, name, password } = req.body || {};
  const result = validateUserInput(username, name, password, { requirePassword: true });
  if (result.error) return res.status(400).json({ error: result.error });

  try {
    const user = await withStore((store) => {
      if (store.users.some((u) => u.username === result.cleanUsername)) {
        const err = new Error(`Username "${result.cleanUsername}" is already taken.`);
        err.status = 409;
        throw err;
      }
      const { salt, hash } = hashPassword(result.cleanPassword);
      const now = new Date().toISOString();
      const user = {
        id: crypto.randomUUID(),
        username: result.cleanUsername,
        name: result.cleanName,
        salt,
        passwordHash: hash,
        role: "manager",
        createdAt: now,
      };
      store.users.push(user);
      return user;
    });
    res.status(201).json({ id: user.id, username: user.username, name: user.name, role: user.role });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// PUT /api/users/:id - rename and/or reset password for a manager
router.put("/:id", express.json(), async (req, res) => {
  const { username, name, password } = req.body || {};
  const result = validateUserInput(username, name, password, { requirePassword: false });
  if (result.error) return res.status(400).json({ error: result.error });

  try {
    const user = await withStore((store) => {
      const existing = store.users.find((u) => u.id === req.params.id && u.role === "manager");
      if (!existing) {
        const err = new Error("Manager not found.");
        err.status = 404;
        throw err;
      }
      const dup = store.users.find((u) => u.username === result.cleanUsername && u.id !== req.params.id);
      if (dup) {
        const err = new Error(`Username "${result.cleanUsername}" is already taken.`);
        err.status = 409;
        throw err;
      }
      existing.username = result.cleanUsername;
      existing.name = result.cleanName;
      if (result.cleanPassword) {
        const { salt, hash } = hashPassword(result.cleanPassword);
        existing.salt = salt;
        existing.passwordHash = hash;
      }
      return existing;
    });
    res.json({ id: user.id, username: user.username, name: user.name, role: user.role });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// DELETE /api/users/:id - delete a manager; their entities become unassigned
router.delete("/:id", async (req, res) => {
  try {
    await withStore((store) => {
      const idx = store.users.findIndex((u) => u.id === req.params.id && u.role === "manager");
      if (idx === -1) {
        const err = new Error("Manager not found.");
        err.status = 404;
        throw err;
      }
      store.users.splice(idx, 1);
      store.entities.forEach((e) => {
        if (e.ownerId === req.params.id) e.ownerId = null;
      });
      store.sessions = (store.sessions || []).filter((s) => s.userId !== req.params.id);
    });
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;

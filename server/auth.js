const crypto = require("crypto");
const cookie = require("cookie");
const { withStore, readStore } = require("./db");

const SESSION_COOKIE = "sid";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const candidate = crypto.scryptSync(String(password || ""), salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, username: user.username, name: user.name, role: user.role };
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  await withStore((store) => {
    if (!store.sessions) store.sessions = [];
    store.sessions.push({ token, userId, createdAt: now, expiresAt: now + SESSION_TTL_MS });
  });
  return token;
}

async function destroySession(token) {
  await withStore((store) => {
    store.sessions = (store.sessions || []).filter((s) => s.token !== token);
  });
}

async function getSessionUser(req) {
  const cookies = cookie.parse(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;

  const store = await readStore();
  const session = (store.sessions || []).find((s) => s.token === token);
  if (!session || session.expiresAt < Date.now()) return null;

  return store.users.find((u) => u.id === session.userId) || null;
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", cookie.serialize(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  }));
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", cookie.serialize(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  }));
}

async function requireAuth(req, res, next) {
  try {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: "Please log in." });
    req.user = publicUser(user);
    next();
  } catch (err) {
    next(err);
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}

function canAccessEntity(user, entity) {
  if (!user || !entity) return false;
  return user.role === "admin" || entity.ownerId === user.id;
}

module.exports = {
  SESSION_COOKIE,
  hashPassword,
  verifyPassword,
  publicUser,
  createSession,
  destroySession,
  getSessionUser,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  requireAdmin,
  canAccessEntity,
};

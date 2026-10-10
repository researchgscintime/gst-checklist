// Local JSON-file backed store. Used for local/on-prem runs (npm start)
// where there's no Supabase configured. This is the original, unchanged
// persistence model - nothing here should behave differently than before.
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "data", "store.json");

function emptyStore() {
  return { entities: [], reviews: [], users: [], sessions: [] };
}

function load() {
  if (!fs.existsSync(DB_PATH)) {
    save(emptyStore());
  }
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  let store;
  try {
    store = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Data file at ${DB_PATH} is corrupted: ${err.message}`);
  }
  // Fill in collections missing from data files written before they existed.
  const defaults = emptyStore();
  for (const key of Object.keys(defaults)) {
    if (!store[key]) store[key] = defaults[key];
  }
  return store;
}

function save(store) {
  const tmpPath = DB_PATH + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), "utf-8");
  fs.renameSync(tmpPath, DB_PATH);
}

// Simple queue to serialize writes since fs ops are synchronous but
// route handlers could interleave on await boundaries elsewhere.
// `tail` must never become a rejected promise - if it did, every future
// `.then()` on it would skip straight past its handler (short-circuiting
// to the same old rejection) and never touch the store again. So each
// call's own outcome (resultPromise) is returned to its caller, while
// `tail` always continues as resolved regardless of that outcome.
let tail = Promise.resolve();
function withStore(mutator) {
  const resultPromise = tail.then(() => {
    const store = load();
    const result = mutator(store);
    save(store);
    return result;
  });
  tail = resultPromise.catch(() => {});
  return resultPromise;
}

// Async for interface parity with db.supabase.js - callers always `await`
// this regardless of which backend is active.
async function readStore() {
  return load();
}

module.exports = { withStore, readStore };

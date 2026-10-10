// One-time migration: copies the local store.json (all entities, reviews/
// answers, users with their existing password hashes, and sessions) plus
// every locally-stored attachment file into a Supabase project, so the
// hosted (Vercel) deployment starts out identical to what's on this
// machine right now - same logins, same data.
//
// Usage:
//   1. Run supabase/schema.sql in your Supabase project's SQL editor first.
//   2. Create a .env file in this folder (see .env.example) with
//      SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from your Supabase
//      project's Settings -> API page.
//   3. node scripts/migrate-to-supabase.js
//      (add --force to overwrite if the Supabase project already has data
//      in it - without --force the script refuses to clobber existing data)
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { isSupabaseConfigured, getSupabaseClient } = require("../server/supabaseClient");

const STORE_PATH = path.join(__dirname, "..", "server", "data", "store.json");
const ATTACH_DIR = path.join(__dirname, "..", "server", "data", "attachments");
const BUCKET = process.env.SUPABASE_ATTACHMENTS_BUCKET || "attachments";
const FORCE = process.argv.includes("--force");

async function main() {
  if (!isSupabaseConfigured()) {
    console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
    console.error("Create a .env file (see .env.example) with your Supabase project's credentials, then re-run.");
    process.exit(1);
  }
  if (!fs.existsSync(STORE_PATH)) {
    console.error(`No local data found at ${STORE_PATH} - nothing to migrate.`);
    process.exit(1);
  }

  const localStore = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
  const counts = {
    entities: (localStore.entities || []).length,
    reviews: (localStore.reviews || []).length,
    users: (localStore.users || []).length,
    sessions: (localStore.sessions || []).length,
  };
  console.log("Local data found:", counts);

  const supabase = getSupabaseClient();

  // --- 1. Seed the app_store row ---
  const { data: existingRow, error: fetchError } = await supabase
    .from("app_store")
    .select("id, data")
    .eq("id", "singleton")
    .maybeSingle();

  if (fetchError) {
    console.error("Could not reach the app_store table:", fetchError.message);
    console.error("Have you run supabase/schema.sql in your Supabase project's SQL editor yet?");
    process.exit(1);
  }

  const existingHasData = existingRow && existingRow.data && (existingRow.data.entities || []).length > 0;
  if (existingHasData && !FORCE) {
    console.error("Supabase already has data in it. Re-run with --force to overwrite it with your local data.");
    process.exit(1);
  }

  const { error: upsertError } = await supabase
    .from("app_store")
    .upsert({ id: "singleton", data: localStore, version: 0, updated_at: new Date().toISOString() });
  if (upsertError) {
    console.error("Failed to write data to Supabase:", upsertError.message);
    process.exit(1);
  }
  console.log("Data migrated: entities, reviews/answers, users (with existing password hashes intact).");

  // --- 2. Ensure the attachments bucket exists ---
  const { data: buckets, error: listBucketsError } = await supabase.storage.listBuckets();
  if (listBucketsError) {
    console.error("Could not list Storage buckets:", listBucketsError.message);
    process.exit(1);
  }
  if (!buckets.some((b) => b.name === BUCKET)) {
    const { error: createBucketError } = await supabase.storage.createBucket(BUCKET, { public: false });
    if (createBucketError) {
      console.error(`Could not create the "${BUCKET}" bucket:`, createBucketError.message);
      process.exit(1);
    }
    console.log(`Created private Storage bucket "${BUCKET}".`);
  }

  // --- 3. Upload local attachment files ---
  if (fs.existsSync(ATTACH_DIR)) {
    const files = fs.readdirSync(ATTACH_DIR).filter((f) => !f.startsWith("."));
    console.log(`Uploading ${files.length} attachment file(s)...`);
    let uploaded = 0;
    for (const filename of files) {
      const buffer = fs.readFileSync(path.join(ATTACH_DIR, filename));
      const { error } = await supabase.storage.from(BUCKET).upload(filename, buffer, { upsert: true });
      if (error) {
        console.error(`  Failed to upload ${filename}:`, error.message);
      } else {
        uploaded += 1;
      }
    }
    console.log(`Uploaded ${uploaded}/${files.length} attachment file(s).`);
  } else {
    console.log("No local attachments folder found - skipping file upload.");
  }

  console.log("\nMigration complete. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as environment");
  console.log("variables in your Vercel project settings, then deploy - the hosted app will use");
  console.log("this Supabase data, with the same logins and entities as your local copy.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

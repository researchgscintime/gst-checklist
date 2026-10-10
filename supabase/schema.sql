-- Run this once in your Supabase project's SQL editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run) before deploying
-- or running the migration script.
--
-- The whole app store (entities, reviews/answers, users, sessions) lives as
-- one JSON document in a single row of this table, rather than a full
-- relational schema - see server/db.supabase.js for why. The server always
-- connects with the service_role key (see server/supabaseClient.js), which
-- bypasses Row Level Security entirely, so no RLS policies are added here:
-- access control is enforced in the app itself (server/auth.js), exactly
-- as it is for the local version today.

create table if not exists app_store (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  version integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table app_store enable row level security;
-- No policies -> nothing is reachable via the anon/public key. Only the
-- service_role key (server-side only, never shipped to the browser) can
-- read or write this table.

-- Attachments: create a Storage bucket named "attachments" and keep it
-- PRIVATE (not public). The app generates short-lived signed URLs to serve
-- files, so a public bucket is neither needed nor desired.
--
-- Easiest done from the dashboard: Storage -> New bucket -> name
-- "attachments" -> Public: OFF. The migration script (scripts/
-- migrate-to-supabase.js) also creates it automatically if it doesn't
-- exist yet, so this step is optional if you're about to run that script.

# GST Review Checklist

A local web app for running your GST review checklist across every entity, with full history.

## How to start it

Double-click **`start.bat`** in this folder. It opens `http://localhost:4173` in your browser and starts the server (a console window stays open — closing it stops the app).

Or manually:
```
cd "gst complience checklist\app"
npm install     (only needed the first time)
npm start
```
Then open http://localhost:4173 in your browser.

## What it does

- **Dashboard** (`/index.html`): lists every entity. Add one at a time (Name + GST number, both required), or bulk-import many via **Download import template** → fill in the Excel → **Import entities**.
- **Entity page**: click an entity to see every checklist ("review") ever saved for it, with a completion % and last-updated date. Create a new checklist, rename or delete old ones, or export any one back to Excel.
- **Checklist page**: the full compliance checklist from `check list.xlsx` (19 areas, 181 questions), each with the three original comment fields — Reviewer/Preparer's Comments, Director's Comment, Client's Feedback. Answers autosave as you type; nothing is lost on reload.

## Data storage

By default, all entities and checklists are stored in `server/data/store.json` (with uploaded documents in `server/data/attachments/`). Back these up (or copy the whole `app` folder) to keep your data safe — there is no cloud sync in this mode.

Setting `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (see `.env.example`) switches the app to Supabase instead — this is what the hosted Vercel deployment uses. See below.

## Deploying to Vercel + Supabase

The app runs unchanged locally (JSON file storage, as above) — these steps only affect the hosted copy.

**1. Create a Supabase project** at [supabase.com](https://supabase.com) if you don't have one yet.

**2. Set up the database.** In your Supabase project, open the SQL Editor and run the contents of `supabase/schema.sql`. This also documents creating a private `attachments` Storage bucket (or let the migration script in the next step create it for you).

**3. Migrate your local data in.** This copies your existing entities, checklists, logins (same usernames/passwords) and uploaded documents into Supabase, so the hosted app starts out identical to your local copy:

```sh
cp .env.example .env
```

Fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env` (find these in your Supabase project under Settings → API), then:

```sh
node scripts/migrate-to-supabase.js
```

**4. Push this repo to GitHub**, then import it into Vercel (vercel.com → Add New → Project → import your GitHub repo). Vercel auto-detects the `vercel.json`/`api/index.js` setup - no build configuration needed.

**5. Add environment variables in Vercel.** In the Vercel project's Settings → Environment Variables, add the same `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from your `.env` file. Never commit `.env` itself (it's git-ignored) — secrets belong only in Vercel's dashboard.

**6. Deploy.** Vercel redeploys automatically on every push to the repo after this.

After deploying, log in with one of your existing local accounts to confirm the migration worked before relying on the hosted version.

## Notes

- GST numbers must be unique across entities and are validated as 15-character GSTINs.
- The checklist questions themselves come from `server/data/checklistTemplate.json`, generated from the original `check list.xlsx`. Editing that JSON changes the questions shown for every entity/checklist going forward (existing saved answers are keyed by item ID and are unaffected unless you remove an item).

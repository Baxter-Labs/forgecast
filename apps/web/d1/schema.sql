-- Forgecast edge metadata schema (Cloudflare D1).
-- Mirrors the local SQLite schema in packages/store/src/sqlite/db.ts.
-- The app also self-initializes this lazily (ensureD1Schema), so applying this
-- file is optional; doing so avoids the one-time create on the first request.
--   Apply: wrangler d1 execute forgecast-db --remote --file apps/web/d1/schema.sql

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  params TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  provider TEXT NOT NULL,
  params TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL NOT NULL,
  result_asset_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

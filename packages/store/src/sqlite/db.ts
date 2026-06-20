import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS projects (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS assets (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     type TEXT NOT NULL,
     provider TEXT NOT NULL,
     params TEXT NOT NULL,
     storage_key TEXT NOT NULL,
     status TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS jobs (
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
   )`,
];

export function openDatabase(path: string): DatabaseSync {
  // SQLite won't create missing parent directories — it just fails with
  // "unable to open database file". Create them for file-backed DBs so durable
  // persistence works out of the box. ':memory:' and special URIs have no dir.
  if (path !== ':memory:' && !path.startsWith('file:')) {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  for (const statement of SCHEMA) {
    db.prepare(statement).run();
  }
  return db;
}

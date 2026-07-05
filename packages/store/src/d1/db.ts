/**
 * Minimal structural view of the Cloudflare D1 API surface this package uses.
 * Declaring it here (rather than depending on `@cloudflare/workers-types`) keeps
 * `@forgecast/store` runtime-agnostic and Node-testable: the real `D1Database`
 * is structurally assignable to `D1Like`, and tests pass a SQLite-backed fake.
 */
export interface D1LikePreparedStatement {
  bind(...values: unknown[]): D1LikePreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface D1Like {
  prepare(query: string): D1LikePreparedStatement;
}

export const D1_SCHEMA: string[] = [
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
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     email TEXT NOT NULL UNIQUE,
     name TEXT,
     avatar_url TEXT,
     created_at TEXT NOT NULL
   )`,
];

const schemaReady = new WeakMap<D1Like, Promise<void>>();

/**
 * Idempotently creates the schema, once per D1 binding per isolate. Safe to call
 * on every repo operation: the work runs once and subsequent calls await the
 * cached promise. D1 has no local migration runner, so repos self-initialize.
 */
export function ensureD1Schema(db: D1Like): Promise<void> {
  const existing = schemaReady.get(db);
  if (existing) return existing;
  const ready = (async () => {
    for (const statement of D1_SCHEMA) await db.prepare(statement).run();
  })();
  schemaReady.set(db, ready);
  return ready;
}

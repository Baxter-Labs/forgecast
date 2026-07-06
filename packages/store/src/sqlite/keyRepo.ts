import type { DatabaseSync } from 'node:sqlite';
import type { KeyRepo, StoredKey } from '@forgecast/core';

interface KeyRow { owner_id: string; key_id: string; value: string; updated_at: string }

const toKey = (r: KeyRow): StoredKey => ({ ownerId: r.owner_id, keyId: r.key_id, value: r.value, updatedAt: r.updated_at });

export class SqliteKeyRepo implements KeyRepo {
  constructor(private readonly db: DatabaseSync) {}

  async get(ownerId: string, keyId: string): Promise<StoredKey | null> {
    const row = this.db.prepare('SELECT * FROM user_keys WHERE owner_id = ? AND key_id = ?').get(ownerId, keyId) as unknown as KeyRow | undefined;
    return row ? toKey(row) : null;
  }

  async list(ownerId: string): Promise<StoredKey[]> {
    const rows = this.db.prepare('SELECT * FROM user_keys WHERE owner_id = ? ORDER BY key_id ASC').all(ownerId) as unknown as KeyRow[];
    return rows.map(toKey);
  }

  async set(key: StoredKey): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO user_keys (owner_id, key_id, value, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(owner_id, key_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key.ownerId, key.keyId, key.value, key.updatedAt);
  }

  async delete(ownerId: string, keyId: string): Promise<void> {
    this.db.prepare('DELETE FROM user_keys WHERE owner_id = ? AND key_id = ?').run(ownerId, keyId);
  }
}

import type { KeyRepo, StoredKey } from '@forgecast/core';
import { ensureD1Schema, type D1Like } from './db';

interface KeyRow { owner_id: string; key_id: string; value: string; updated_at: string }

const toKey = (r: KeyRow): StoredKey => ({ ownerId: r.owner_id, keyId: r.key_id, value: r.value, updatedAt: r.updated_at });

export class D1KeyRepo implements KeyRepo {
  constructor(private readonly db: D1Like) {}

  async get(ownerId: string, keyId: string): Promise<StoredKey | null> {
    await ensureD1Schema(this.db);
    const row = await this.db.prepare('SELECT * FROM user_keys WHERE owner_id = ? AND key_id = ?').bind(ownerId, keyId).first<KeyRow>();
    return row ? toKey(row) : null;
  }

  async list(ownerId: string): Promise<StoredKey[]> {
    await ensureD1Schema(this.db);
    const { results } = await this.db.prepare('SELECT * FROM user_keys WHERE owner_id = ? ORDER BY key_id ASC').bind(ownerId).all<KeyRow>();
    return results.map(toKey);
  }

  async set(key: StoredKey): Promise<void> {
    await ensureD1Schema(this.db);
    await this.db
      .prepare(
        `INSERT INTO user_keys (owner_id, key_id, value, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(owner_id, key_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(key.ownerId, key.keyId, key.value, key.updatedAt)
      .run();
  }

  async delete(ownerId: string, keyId: string): Promise<void> {
    await ensureD1Schema(this.db);
    await this.db.prepare('DELETE FROM user_keys WHERE owner_id = ? AND key_id = ?').bind(ownerId, keyId).run();
  }
}

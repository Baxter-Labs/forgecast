import type { DatabaseSync } from 'node:sqlite';
import type { UserRecord, UserRepo } from '@forgecast/core';

interface UserRow { id: string; email: string; name: string | null; avatar_url: string | null; created_at: string }

function toUser(r: UserRow): UserRecord {
  const u: UserRecord = { id: r.id, email: r.email, createdAt: r.created_at };
  if (r.name) u.name = r.name;
  if (r.avatar_url) u.avatarUrl = r.avatar_url;
  return u;
}

export class SqliteUserRepo implements UserRepo {
  constructor(private readonly db: DatabaseSync) {}

  async get(id: string): Promise<UserRecord | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  async getByEmail(email: string): Promise<UserRecord | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as unknown as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  async upsert(user: UserRecord): Promise<UserRecord> {
    const existing = await this.getByEmail(user.email);
    if (existing) {
      const name = user.name ?? existing.name ?? null;
      const avatar = user.avatarUrl ?? existing.avatarUrl ?? null;
      this.db.prepare('UPDATE users SET name = ?, avatar_url = ? WHERE id = ?').run(name, avatar, existing.id);
      const updated: UserRecord = { ...existing };
      if (name) updated.name = name; else delete updated.name;
      if (avatar) updated.avatarUrl = avatar; else delete updated.avatarUrl;
      return updated;
    }
    this.db
      .prepare('INSERT INTO users (id, email, name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(user.id, user.email, user.name ?? null, user.avatarUrl ?? null, user.createdAt);
    return user;
  }
}

import type { UserRecord, UserRepo } from '@forgecast/core';
import { ensureD1Schema, type D1Like } from './db';

interface UserRow { id: string; email: string; name: string | null; avatar_url: string | null; created_at: string }

function toUser(r: UserRow): UserRecord {
  const u: UserRecord = { id: r.id, email: r.email, createdAt: r.created_at };
  if (r.name) u.name = r.name;
  if (r.avatar_url) u.avatarUrl = r.avatar_url;
  return u;
}

export class D1UserRepo implements UserRepo {
  constructor(private readonly db: D1Like) {}

  async get(id: string): Promise<UserRecord | null> {
    await ensureD1Schema(this.db);
    const row = await this.db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
    return row ? toUser(row) : null;
  }

  async getByEmail(email: string): Promise<UserRecord | null> {
    await ensureD1Schema(this.db);
    const row = await this.db.prepare('SELECT * FROM users WHERE email = ?').bind(email.toLowerCase()).first<UserRow>();
    return row ? toUser(row) : null;
  }

  async upsert(user: UserRecord): Promise<UserRecord> {
    await ensureD1Schema(this.db);
    const existing = await this.getByEmail(user.email);
    if (existing) {
      const name = user.name ?? existing.name ?? null;
      const avatar = user.avatarUrl ?? existing.avatarUrl ?? null;
      await this.db.prepare('UPDATE users SET name = ?, avatar_url = ? WHERE id = ?').bind(name, avatar, existing.id).run();
      const updated: UserRecord = { ...existing };
      if (name) updated.name = name; else delete updated.name;
      if (avatar) updated.avatarUrl = avatar; else delete updated.avatarUrl;
      return updated;
    }
    await this.db
      .prepare('INSERT INTO users (id, email, name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(user.id, user.email, user.name ?? null, user.avatarUrl ?? null, user.createdAt)
      .run();
    return user;
  }

  async list(): Promise<UserRecord[]> {
    await ensureD1Schema(this.db);
    const { results } = await this.db.prepare('SELECT * FROM users ORDER BY created_at DESC, id DESC').all<UserRow>();
    return results.map(toUser);
  }
}

import type { UserRecord, UserRepo } from '@forgecast/core';

export class InMemoryUserRepo implements UserRepo {
  private readonly items = new Map<string, UserRecord>();

  async get(id: string): Promise<UserRecord | null> {
    return this.items.get(id) ?? null;
  }

  async getByEmail(email: string): Promise<UserRecord | null> {
    const needle = email.toLowerCase();
    for (const u of this.items.values()) if (u.email === needle) return u;
    return null;
  }

  async upsert(user: UserRecord): Promise<UserRecord> {
    const existing = await this.getByEmail(user.email);
    if (existing) {
      const updated: UserRecord = { ...existing };
      if (user.name) updated.name = user.name;
      if (user.avatarUrl) updated.avatarUrl = user.avatarUrl;
      this.items.set(existing.id, updated);
      return updated;
    }
    this.items.set(user.id, user);
    return user;
  }

  async list(): Promise<UserRecord[]> {
    return [...this.items.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  }
}

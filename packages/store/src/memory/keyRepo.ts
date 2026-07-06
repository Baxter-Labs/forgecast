import type { KeyRepo, StoredKey } from '@forgecast/core';

export class InMemoryKeyRepo implements KeyRepo {
  private readonly items = new Map<string, StoredKey>();

  private static k(ownerId: string, keyId: string): string {
    return `${ownerId}\u0000${keyId}`;
  }

  async get(ownerId: string, keyId: string): Promise<StoredKey | null> {
    return this.items.get(InMemoryKeyRepo.k(ownerId, keyId)) ?? null;
  }

  async list(ownerId: string): Promise<StoredKey[]> {
    return [...this.items.values()].filter((k) => k.ownerId === ownerId);
  }

  async set(key: StoredKey): Promise<void> {
    this.items.set(InMemoryKeyRepo.k(key.ownerId, key.keyId), key);
  }

  async delete(ownerId: string, keyId: string): Promise<void> {
    this.items.delete(InMemoryKeyRepo.k(ownerId, keyId));
  }
}

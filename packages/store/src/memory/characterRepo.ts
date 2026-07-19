import type { Character, CharacterRepo, CharacterLoraPatch } from '@forgecast/core';

export class InMemoryCharacterRepo implements CharacterRepo {
  private readonly items = new Map<string, Character>();

  async create(character: Character): Promise<Character> {
    this.items.set(character.id, character);
    return character;
  }

  async get(id: string): Promise<Character | null> {
    return this.items.get(id) ?? null;
  }

  async listByOwner(ownerId: string): Promise<Character[]> {
    return [...this.items.values()]
      .filter((c) => c.ownerId === ownerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async update(id: string, patch: CharacterLoraPatch): Promise<Character | null> {
    const existing = this.items.get(id);
    if (!existing) return null;
    const next: Character = { ...existing };
    if ('loraUrl' in patch) { if (patch.loraUrl === undefined) delete next.loraUrl; else next.loraUrl = patch.loraUrl; }
    if ('loraStatus' in patch) { if (patch.loraStatus === undefined) delete next.loraStatus; else next.loraStatus = patch.loraStatus; }
    if ('loraTaskId' in patch) { if (patch.loraTaskId === undefined) delete next.loraTaskId; else next.loraTaskId = patch.loraTaskId; }
    this.items.set(id, next);
    return next;
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }
}

import type { Character, CharacterRepo } from '@forgecast/core';

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

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }
}

import type { DatabaseSync } from 'node:sqlite';
import type { Character, CharacterRepo } from '@forgecast/core';

interface CharacterRow {
  id: string;
  owner_id: string;
  name: string;
  ref_keys: string;
  description: string | null;
  created_at: string;
}

const toCharacter = (r: CharacterRow): Character => ({
  id: r.id,
  ownerId: r.owner_id,
  name: r.name,
  refKeys: JSON.parse(r.ref_keys) as string[],
  ...(r.description ? { description: r.description } : {}),
  createdAt: r.created_at,
});

export class SqliteCharacterRepo implements CharacterRepo {
  constructor(private readonly db: DatabaseSync) {}

  async create(character: Character): Promise<Character> {
    this.db
      .prepare('INSERT INTO characters (id, owner_id, name, ref_keys, description, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(character.id, character.ownerId, character.name, JSON.stringify(character.refKeys), character.description ?? null, character.createdAt);
    return character;
  }

  async get(id: string): Promise<Character | null> {
    const row = this.db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as unknown as CharacterRow | undefined;
    return row ? toCharacter(row) : null;
  }

  async listByOwner(ownerId: string): Promise<Character[]> {
    const rows = this.db.prepare('SELECT * FROM characters WHERE owner_id = ? ORDER BY created_at DESC').all(ownerId) as unknown as CharacterRow[];
    return rows.map(toCharacter);
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM characters WHERE id = ?').run(id);
  }
}

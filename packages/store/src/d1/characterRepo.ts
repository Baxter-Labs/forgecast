import type { Character, CharacterRepo } from '@forgecast/core';
import { ensureD1Schema, type D1Like } from './db';

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

export class D1CharacterRepo implements CharacterRepo {
  constructor(private readonly db: D1Like) {}

  async create(character: Character): Promise<Character> {
    await ensureD1Schema(this.db);
    await this.db
      .prepare('INSERT INTO characters (id, owner_id, name, ref_keys, description, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(character.id, character.ownerId, character.name, JSON.stringify(character.refKeys), character.description ?? null, character.createdAt)
      .run();
    return character;
  }

  async get(id: string): Promise<Character | null> {
    await ensureD1Schema(this.db);
    const row = await this.db.prepare('SELECT * FROM characters WHERE id = ?').bind(id).first<CharacterRow>();
    return row ? toCharacter(row) : null;
  }

  async listByOwner(ownerId: string): Promise<Character[]> {
    await ensureD1Schema(this.db);
    const { results } = await this.db
      .prepare('SELECT * FROM characters WHERE owner_id = ? ORDER BY created_at DESC')
      .bind(ownerId)
      .all<CharacterRow>();
    return results.map(toCharacter);
  }

  async delete(id: string): Promise<void> {
    await ensureD1Schema(this.db);
    await this.db.prepare('DELETE FROM characters WHERE id = ?').bind(id).run();
  }
}

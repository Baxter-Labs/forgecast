import type { DatabaseSync } from 'node:sqlite';
import type { Character, CharacterRepo, CharacterLoraPatch, CharacterLoraStatus } from '@forgecast/core';

interface CharacterRow {
  id: string;
  owner_id: string;
  name: string;
  ref_keys: string;
  description: string | null;
  lora_url: string | null;
  lora_status: string | null;
  lora_task: string | null;
  created_at: string;
}

const toCharacter = (r: CharacterRow): Character => ({
  id: r.id,
  ownerId: r.owner_id,
  name: r.name,
  refKeys: JSON.parse(r.ref_keys) as string[],
  ...(r.description ? { description: r.description } : {}),
  ...(r.lora_url ? { loraUrl: r.lora_url } : {}),
  ...(r.lora_status ? { loraStatus: r.lora_status as CharacterLoraStatus } : {}),
  ...(r.lora_task ? { loraTaskId: r.lora_task } : {}),
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

  async update(id: string, patch: CharacterLoraPatch): Promise<Character | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const loraUrl = 'loraUrl' in patch ? patch.loraUrl : existing.loraUrl;
    const loraStatus = 'loraStatus' in patch ? patch.loraStatus : existing.loraStatus;
    const loraTaskId = 'loraTaskId' in patch ? patch.loraTaskId : existing.loraTaskId;
    this.db
      .prepare('UPDATE characters SET lora_url = ?, lora_status = ?, lora_task = ? WHERE id = ?')
      .run(loraUrl ?? null, loraStatus ?? null, loraTaskId ?? null, id);
    return this.get(id);
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM characters WHERE id = ?').run(id);
  }
}

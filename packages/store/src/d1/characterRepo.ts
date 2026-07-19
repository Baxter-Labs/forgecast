import type { Character, CharacterRepo, CharacterLoraPatch, CharacterLoraStatus } from '@forgecast/core';
import { ensureD1Schema, type D1Like } from './db';

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

  async update(id: string, patch: CharacterLoraPatch): Promise<Character | null> {
    await ensureD1Schema(this.db);
    const existing = await this.get(id);
    if (!existing) return null;
    const loraUrl = 'loraUrl' in patch ? patch.loraUrl : existing.loraUrl;
    const loraStatus = 'loraStatus' in patch ? patch.loraStatus : existing.loraStatus;
    const loraTaskId = 'loraTaskId' in patch ? patch.loraTaskId : existing.loraTaskId;
    await this.db
      .prepare('UPDATE characters SET lora_url = ?, lora_status = ?, lora_task = ? WHERE id = ?')
      .bind(loraUrl ?? null, loraStatus ?? null, loraTaskId ?? null, id)
      .run();
    return this.get(id);
  }

  async delete(id: string): Promise<void> {
    await ensureD1Schema(this.db);
    await this.db.prepare('DELETE FROM characters WHERE id = ?').bind(id).run();
  }
}

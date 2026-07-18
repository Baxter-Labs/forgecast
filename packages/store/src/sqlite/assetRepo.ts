import type { DatabaseSync } from 'node:sqlite';
import type { Asset, AssetRepo, AssetType } from '@forgecast/core';

interface AssetRow {
  id: string; project_id: string; type: string; provider: string;
  params: string; storage_key: string; status: string; created_at: string;
}
const toAsset = (r: AssetRow): Asset => ({
  id: r.id, projectId: r.project_id, type: r.type as AssetType, provider: r.provider,
  params: JSON.parse(r.params) as Record<string, unknown>, storageKey: r.storage_key,
  status: r.status as 'ready' | 'error', createdAt: r.created_at,
});

export class SqliteAssetRepo implements AssetRepo {
  constructor(private readonly db: DatabaseSync) {}

  async create(a: Asset): Promise<Asset> {
    this.db
      .prepare('INSERT INTO assets (id, project_id, type, provider, params, storage_key, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(a.id, a.projectId, a.type, a.provider, JSON.stringify(a.params), a.storageKey, a.status, a.createdAt);
    return a;
  }
  async get(id: string): Promise<Asset | null> {
    const row = this.db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as unknown as AssetRow | undefined;
    return row ? toAsset(row) : null;
  }
  async listByProject(projectId: string): Promise<Asset[]> {
    const rows = this.db.prepare('SELECT * FROM assets WHERE project_id = ? ORDER BY created_at ASC, id ASC').all(projectId) as unknown as AssetRow[];
    return rows.map(toAsset);
  }
  async listByOwner(ownerId: string): Promise<Asset[]> {
    const rows = this.db
      .prepare(
        `SELECT a.* FROM assets a JOIN projects p ON a.project_id = p.id
         WHERE COALESCE(p.owner_id, 'local') = ? ORDER BY a.created_at DESC, a.id DESC`,
      )
      .all(ownerId) as unknown as AssetRow[];
    return rows.map(toAsset);
  }
  async update(id: string, patch: Partial<Omit<Asset, 'id'>>): Promise<Asset> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`asset not found: ${id}`);
    const a: Asset = { ...existing, ...patch, id };
    this.db
      .prepare('UPDATE assets SET project_id = ?, type = ?, provider = ?, params = ?, storage_key = ?, status = ?, created_at = ? WHERE id = ?')
      .run(a.projectId, a.type, a.provider, JSON.stringify(a.params), a.storageKey, a.status, a.createdAt, id);
    return a;
  }
}

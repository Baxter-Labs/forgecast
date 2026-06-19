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
}

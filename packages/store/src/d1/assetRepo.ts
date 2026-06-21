import type { Asset, AssetRepo, AssetType } from '@forgecast/core';
import { ensureD1Schema, type D1Like } from './db';

interface AssetRow {
  id: string; project_id: string; type: string; provider: string;
  params: string; storage_key: string; status: string; created_at: string;
}
const toAsset = (r: AssetRow): Asset => ({
  id: r.id, projectId: r.project_id, type: r.type as AssetType, provider: r.provider,
  params: JSON.parse(r.params) as Record<string, unknown>, storageKey: r.storage_key,
  status: r.status as 'ready' | 'error', createdAt: r.created_at,
});

export class D1AssetRepo implements AssetRepo {
  constructor(private readonly db: D1Like) {}

  async create(a: Asset): Promise<Asset> {
    await ensureD1Schema(this.db);
    await this.db
      .prepare('INSERT INTO assets (id, project_id, type, provider, params, storage_key, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(a.id, a.projectId, a.type, a.provider, JSON.stringify(a.params), a.storageKey, a.status, a.createdAt)
      .run();
    return a;
  }
  async get(id: string): Promise<Asset | null> {
    await ensureD1Schema(this.db);
    const row = await this.db.prepare('SELECT * FROM assets WHERE id = ?').bind(id).first<AssetRow>();
    return row ? toAsset(row) : null;
  }
  async listByProject(projectId: string): Promise<Asset[]> {
    await ensureD1Schema(this.db);
    const { results } = await this.db.prepare('SELECT * FROM assets WHERE project_id = ? ORDER BY created_at ASC, id ASC').bind(projectId).all<AssetRow>();
    return results.map(toAsset);
  }

  async deleteByProject(projectId: string): Promise<void> {
    await ensureD1Schema(this.db);
    await this.db.prepare('DELETE FROM assets WHERE project_id = ?').bind(projectId).run();
  }
}

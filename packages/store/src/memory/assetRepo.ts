import type { Asset, AssetRepo, ProjectRepo } from '@forgecast/core';

export class InMemoryAssetRepo implements AssetRepo {
  private readonly items = new Map<string, Asset>();

  /**
   * Assets carry no owner column of their own — ownership is derived from their
   * project. Pass the project repo so `listByOwner` can resolve it; when omitted
   * (standalone test fixtures, single-operator mode) every asset is returned.
   */
  constructor(private readonly projects?: ProjectRepo) {}

  async create(asset: Asset): Promise<Asset> {
    this.items.set(asset.id, asset);
    return asset;
  }

  async get(id: string): Promise<Asset | null> {
    return this.items.get(id) ?? null;
  }

  async listByProject(projectId: string): Promise<Asset[]> {
    return [...this.items.values()].filter((a) => a.projectId === projectId);
  }

  async listByOwner(ownerId: string): Promise<Asset[]> {
    const all = [...this.items.values()];
    let owned = all;
    if (this.projects) {
      const ids = new Set((await this.projects.list(ownerId)).map((p) => p.id));
      owned = all.filter((a) => ids.has(a.projectId));
    }
    return owned.sort((a, b) =>
      a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1,
    );
  }

  async update(id: string, patch: Partial<Omit<Asset, 'id'>>): Promise<Asset> {
    const existing = this.items.get(id);
    if (!existing) throw new Error(`asset not found: ${id}`);
    const updated: Asset = { ...existing, ...patch, id };
    this.items.set(id, updated);
    return updated;
  }
}

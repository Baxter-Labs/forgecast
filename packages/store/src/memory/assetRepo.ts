import type { Asset, AssetRepo } from '@forgecast/core';

export class InMemoryAssetRepo implements AssetRepo {
  private readonly items = new Map<string, Asset>();

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
}

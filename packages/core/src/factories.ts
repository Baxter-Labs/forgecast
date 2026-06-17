import type { Project, Asset, AssetType } from './types';

export interface NewProjectInput {
  name: string;
}

export interface NewProjectDeps {
  id: string;
  now: string;
}

export function newProject(input: NewProjectInput, deps: NewProjectDeps): Project {
  return { id: deps.id, name: input.name, createdAt: deps.now };
}

export interface NewAssetInput {
  projectId: string;
  type: AssetType;
  provider: string;
  storageKey: string;
  params?: Record<string, unknown>;
  status?: 'ready' | 'error';
}

export interface NewAssetDeps {
  id: string;
  now: string;
}

export function newAsset(input: NewAssetInput, deps: NewAssetDeps): Asset {
  return {
    id: deps.id,
    projectId: input.projectId,
    type: input.type,
    provider: input.provider,
    params: input.params ?? {},
    storageKey: input.storageKey,
    status: input.status ?? 'ready',
    createdAt: deps.now,
  };
}

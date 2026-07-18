import type { Project, Asset, Job } from './types';

export interface ProjectRepo {
  create(project: Project): Promise<Project>;
  get(id: string): Promise<Project | null>;
  /** All projects, or only those owned by `ownerId` (absent ownerId on a row = 'local'). */
  list(ownerId?: string): Promise<Project[]>;
}

export interface AssetRepo {
  create(asset: Asset): Promise<Asset>;
  get(id: string): Promise<Asset | null>;
  listByProject(projectId: string): Promise<Asset[]>;
  /** Every asset owned by `ownerId` across all their projects, newest first. Powers the global Library. */
  listByOwner(ownerId: string): Promise<Asset[]>;
  /** Patch an existing asset (e.g. its `params` to attach library tags). */
  update(id: string, patch: Partial<Omit<Asset, 'id'>>): Promise<Asset>;
}

export interface JobRepo {
  create(job: Job): Promise<Job>;
  get(id: string): Promise<Job | null>;
  update(id: string, patch: Partial<Omit<Job, 'id'>>): Promise<Job>;
  listByProject(projectId: string): Promise<Job[]>;
}

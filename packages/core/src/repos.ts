import type { Project, Asset, Job } from './types';

export interface ProjectRepo {
  create(project: Project): Promise<Project>;
  get(id: string): Promise<Project | null>;
  list(): Promise<Project[]>;
}

export interface AssetRepo {
  create(asset: Asset): Promise<Asset>;
  get(id: string): Promise<Asset | null>;
  listByProject(projectId: string): Promise<Asset[]>;
  deleteByProject?(projectId: string): Promise<void>;
}

export interface JobRepo {
  create(job: Job): Promise<Job>;
  get(id: string): Promise<Job | null>;
  update(id: string, patch: Partial<Omit<Job, 'id'>>): Promise<Job>;
  listByProject(projectId: string): Promise<Job[]>;
}

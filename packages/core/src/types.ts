export type AssetType = 'image' | 'video' | 'audio';
export type JobKind = 'image' | 'short_video' | 'video' | 'montage' | 'voiceover' | 'narrate' | 'presenter';
export type JobStatus = 'queued' | 'running' | 'done' | 'error';

export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

export interface Asset {
  id: string;
  projectId: string;
  type: AssetType;
  provider: string;
  params: Record<string, unknown>;
  storageKey: string;
  status: 'ready' | 'error';
  createdAt: string;
}

export interface Job {
  id: string;
  projectId: string;
  kind: JobKind;
  provider: string;
  params: Record<string, unknown>;
  status: JobStatus;
  /** Fraction complete, 0..1 (0 = not started, 1 = done). */
  progress: number;
  resultAssetId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

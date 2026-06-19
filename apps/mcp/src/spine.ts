import { DEFAULT_API_URL } from './constants';

export interface SpineClientOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export interface Project { id: string; name: string; createdAt: string }
export interface Job {
  id: string; projectId?: string; kind?: string; provider?: string;
  status: string; progress?: number; resultAssetId?: string; error?: string;
  params?: Record<string, unknown>;
}
export interface Asset {
  id: string; projectId?: string; type: string; provider?: string;
  storageKey?: string; params?: Record<string, unknown>; createdAt?: string;
}

export class SpineError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'SpineError';
  }
}

export interface GenerateImageInput {
  prompt: string;
  model?: string;
  width?: number;
  height?: number;
}

export class SpineClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: SpineClientOptions = {}) {
    const url = opts.baseUrl ?? process.env['FORGECAST_API_URL'] ?? DEFAULT_API_URL;
    this.baseUrl = url.replace(/\/$/, '');
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  assetUrl(assetId: string): string {
    return `${this.baseUrl}/api/assets/${assetId}/raw`;
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, init);
    const text = await res.text();
    let body: unknown = {};
    if (text) {
      try { body = JSON.parse(text); } catch { body = { raw: text }; }
    }
    if (!res.ok) {
      const message = (body as { error?: string }).error ?? `request failed with status ${res.status}`;
      throw new SpineError(res.status, message);
    }
    return body as T;
  }

  health(): Promise<{ ok: boolean; providers: { image: string[] } }> { return this.req('/api/health'); }
  listProjects(): Promise<{ projects: Project[] }> { return this.req('/api/projects'); }
  createProject(name: string): Promise<{ project: Project }> {
    return this.req('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
  }
  generateImage(projectId: string, input: GenerateImageInput): Promise<{ job: Job; asset: Asset | null }> {
    return this.req(`/api/projects/${projectId}/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  }
  generateShortVideo(projectId: string, subject: string): Promise<{ job: Job }> {
    return this.req(`/api/projects/${projectId}/generate-video`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subject }) });
  }
  getJob(jobId: string): Promise<{ job: Job }> { return this.req(`/api/jobs/${jobId}`); }
  listAssets(projectId: string): Promise<{ assets: Asset[] }> { return this.req(`/api/projects/${projectId}/assets`); }
  publishAsset(assetId: string, input: { content: string; channels?: string[]; publisher?: string }): Promise<{ published: { postId: string; status: string } }> {
    return this.req(`/api/assets/${assetId}/publish`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
  }
}

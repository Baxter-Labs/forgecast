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

export interface BrandKit {
  name?: string;
  tagline?: string;
  palette?: string[];
  fonts?: { display?: string; body?: string };
  toneOfVoice?: string;
  keyMessages?: string[];
  notes?: string;
  sourceUrl?: string;
}

/** Full health shape: generation providers per modality + configured publishers (the
 * social channels available for cross-posting). */
export interface Health {
  ok: boolean;
  providers: { image?: string[]; video?: string[]; montage?: string[]; voice?: string[]; transcribe?: string[]; presenter?: string[] };
  publishers: string[];
}

/** One generated ad-copy variant (A/B-tagged, within the platform's char limit). */
export interface AdCopyVariant { id: string; text: string; chars: number }
/** Result of an ad-copy generation: the resolved platform, its char limit, and the variants. */
export interface AdCopyResult { platform: string; label: string; limit: number; variants: AdCopyVariant[] }

/** One creative's metrics for one day (the measure side). */
export interface AdCreativeMetrics {
  creativeId: string; name?: string; platform?: string; date: string;
  impressions: number; clicks: number; spend: number; conversions?: number; frequency?: number;
}
/** Input for the ads endpoints: hand in `metrics` (keyless) or pull from a connected `source`. */
export interface AdsMetricsInput { metrics?: AdCreativeMetrics[]; source?: string; sinceDays?: number }

/** Short-video (MoneyPrinterTurbo) options — vendor-neutral; the app maps them to the worker. */
export interface ShortVideoOptions {
  aspect?: '9:16' | '16:9' | '1:1';
  script?: string;
  terms?: string[];
  clipDuration?: number;
  count?: number;
  source?: 'pexels' | 'pixabay' | 'local';
  concatMode?: 'random' | 'sequential';
  transition?: 'none' | 'Shuffle' | 'FadeIn' | 'FadeOut' | 'SlideIn' | 'SlideOut';
  voiceName?: string;
  voiceVolume?: number;
  voiceRate?: number;
  bgmType?: string;
  bgmVolume?: number;
  subtitles?: boolean;
  subtitlePosition?: 'top' | 'center' | 'bottom' | 'custom';
  fontName?: string;
  textColor?: string;
  fontSize?: number;
  strokeColor?: string;
  strokeWidth?: number;
  paragraphs?: number;
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

  health(): Promise<Health> { return this.req('/api/health'); }
  listProjects(): Promise<{ projects: Project[] }> { return this.req('/api/projects'); }
  createProject(name: string): Promise<{ project: Project }> {
    return this.req('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
  }
  generateImage(projectId: string, input: GenerateImageInput): Promise<{ job: Job; asset: Asset | null }> {
    return this.req(`/api/projects/${projectId}/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  }
  generateShortVideo(projectId: string, subject: string, options?: ShortVideoOptions): Promise<{ job: Job }> {
    return this.req(`/api/projects/${projectId}/generate-video`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subject, options }) });
  }
  generateVideo(projectId: string, input: { prompt: string; aspectRatio?: string; duration?: number; quality?: string; model?: string }): Promise<{ job: { id: string; kind: string; status: string } }> {
    return this.req(`/api/projects/${projectId}/generate-clip`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
  }
  generateMontage(projectId: string, input: { assetIds?: string[]; aspectRatio?: string; spec?: unknown }): Promise<{ job: { id: string; kind: string; status: string } }> {
    return this.req(`/api/projects/${projectId}/generate-montage`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
  }
  enhanceAsset(projectId: string, assetId: string): Promise<{ job: Job; asset: Asset | null }> {
    return this.req(`/api/projects/${projectId}/assets/${assetId}/enhance`, { method: 'POST' });
  }
  editAsset(projectId: string, assetId: string, prompt: string): Promise<{ job: Job; asset: Asset | null }> {
    return this.req(`/api/projects/${projectId}/assets/${assetId}/edit`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }),
    });
  }
  cutoutAsset(projectId: string, assetId: string): Promise<{ job: Job; asset: Asset | null }> {
    return this.req(`/api/projects/${projectId}/assets/${assetId}/cutout`, { method: 'POST' });
  }
  narrateVideo(projectId: string, input: { videoAssetId: string; text: string; voice?: string }): Promise<{ job: Job }> {
    return this.req(`/api/projects/${projectId}/narrate`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
  }
  getJob(jobId: string): Promise<{ job: Job }> { return this.req(`/api/jobs/${jobId}`); }
  listAssets(projectId: string): Promise<{ assets: Asset[] }> { return this.req(`/api/projects/${projectId}/assets`); }
  publishAsset(assetId: string, input: { content: string; channels?: string[]; publisher?: string }): Promise<{ published: { postId: string; status: string } }> {
    return this.req(`/api/assets/${assetId}/publish`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
  }

  // ── Brand kit + from-website ──────────────────────────────────────────────
  getBrandKit(projectId: string): Promise<{ brandKit: BrandKit }> {
    return this.req(`/api/projects/${projectId}/brand-kit`);
  }
  saveBrandKit(projectId: string, kit: BrandKit): Promise<{ brandKit: BrandKit }> {
    return this.req(`/api/projects/${projectId}/brand-kit`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(kit),
    });
  }
  brandKitFromWebsite(projectId: string, url: string): Promise<{ brandKit: BrandKit; derivedFrom: string }> {
    return this.req(`/api/projects/${projectId}/brand-kit/from-website`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }),
    });
  }
  generateFromWebsite(projectId: string, input: { url: string; generate?: boolean; generateCount?: number; enhance?: boolean }): Promise<{ assets: Asset[]; summary: unknown }> {
    return this.req(`/api/projects/${projectId}/from-website`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
  }

  // ── The Forgecast agent (PLAN / EXECUTE / AUTO-RUN) ───────────────────────
  agentPlan(brief: string, platforms?: string[]): Promise<{ plan: unknown }> {
    return this.req('/api/agent', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'plan', brief, platforms }),
    });
  }
  agentExecute(input: { plan: unknown; projectId?: string; projectName?: string; publish?: boolean }): Promise<{ result: unknown }> {
    return this.req('/api/agent', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'execute', ...input }),
    });
  }
  agentRun(input: { brief: string; projectId?: string; platforms?: string[] }): Promise<{ result: unknown }> {
    return this.req('/api/agent', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'agentic', ...input }),
    });
  }

  // ── Ad copy (platform-aware, char-limited, A/B variants) ──────────────────
  generateAdCopy(projectId: string, input: { brief: string; platform?: string; count?: number }): Promise<AdCopyResult> {
    return this.req(`/api/projects/${projectId}/ad-copy`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
  }

  // ── Ads measure→optimize: insights + audit ────────────────────────────────
  adsInsights(input: AdsMetricsInput): Promise<{ source: string; count: number; metrics: AdCreativeMetrics[] }> {
    return this.req('/api/ads/insights', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
  }
  adsAudit(input: AdsMetricsInput): Promise<{ source: string; audit: unknown }> {
    return this.req('/api/ads/audit', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
  }
  optimizeCreatives(projectId: string, input: AdsMetricsInput & { max?: number }): Promise<{ source: string; fatiguedCount: number; imageReady: boolean; regenerated: Array<{ creativeId: string; newAssetId: string }>; optimizations: unknown[]; note?: string }> {
    return this.req(`/api/projects/${projectId}/ads/optimize`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
  }
}

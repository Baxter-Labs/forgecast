import type { VideoProvider, VideoGenInput, VideoGenTask, VideoGenState } from '@forgecast/core';

export interface FalVideoProviderOptions {
  /** Defaults to process.env.FAL_KEY (same key as the image provider). */
  apiKey?: string;
  /** fal text-to-video model id. Defaults to a fast, low-cost model. */
  model?: string;
  /** Defaults to https://queue.fal.run. */
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface SubmitResp { request_id?: string }
interface StatusResp { status?: string }
interface ResultResp { video?: { url?: string }; detail?: unknown }

const stateFrom = (s: string | undefined): VideoGenState =>
  s === 'COMPLETED' ? 'complete' : s === 'FAILED' || s === 'ERROR' ? 'failed' : 'processing';

/**
 * Video generation via fal.ai's async queue API — reuses the same FAL_KEY as the
 * image provider, so it works wherever fal images already work (no separate
 * Pixverse credits needed). Implements the provider-agnostic VideoProvider
 * contract (create → poll getTask), so VideoJobHandler drives it unchanged.
 */
export class FalVideoProvider implements VideoProvider {
  readonly name = 'fal-video';
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: FalVideoProviderOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.FAL_KEY;
    this.model = opts.model ?? 'fal-ai/wan/v2.2-5b/text-to-video';
    this.baseUrl = (opts.baseUrl ?? 'https://queue.fal.run').replace(/\/$/, '');
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Key ${this.apiKey ?? ''}`, 'Content-Type': 'application/json' };
  }
  private requestBase(taskId: string): string {
    return `${this.baseUrl}/${this.model}/requests/${taskId}`;
  }

  async create(input: VideoGenInput): Promise<{ taskId: string }> {
    if (!this.apiKey) throw new Error('fal video not configured (set FAL_KEY)');
    const body: Record<string, unknown> = {
      prompt: input.prompt,
      aspect_ratio: input.aspectRatio ?? '16:9',
      resolution: input.quality ?? '720p',
    };
    const res = await this.fetchFn(`${this.baseUrl}/${this.model}`, {
      method: 'POST', headers: this.authHeaders(), body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`fal video submit failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as SubmitResp;
    if (!data.request_id) throw new Error('fal video response missing request_id');
    return { taskId: data.request_id };
  }

  async getTask(taskId: string): Promise<VideoGenTask> {
    if (!this.apiKey) throw new Error('fal video not configured (set FAL_KEY)');
    const statusRes = await this.fetchFn(`${this.requestBase(taskId)}/status`, { headers: this.authHeaders() });
    if (!statusRes.ok) return { taskId, state: 'failed' };
    const status = stateFrom(((await statusRes.json()) as StatusResp).status);
    if (status !== 'complete') return { taskId, state: status };

    // Completed → fetch the result payload for the video URL.
    const resultRes = await this.fetchFn(this.requestBase(taskId), { headers: this.authHeaders() });
    if (!resultRes.ok) return { taskId, state: 'failed' };
    const url = ((await resultRes.json()) as ResultResp).video?.url;
    return url ? { taskId, state: 'complete', videoUrl: url } : { taskId, state: 'failed' };
  }
}

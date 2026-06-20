import type { VideoProvider, VideoGenInput, VideoGenTask, VideoGenState } from '@forgecast/core';

export interface FalVideoProviderOptions {
  /** Defaults to process.env.FAL_KEY_VIDEO. */
  apiKey?: string;
  /** fal text-to-video model id. Defaults to a fast, low-cost model. */
  model?: string;
  /** Defaults to https://queue.fal.run. */
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface SubmitResp { request_id?: string; response_url?: string }
interface StatusResp { status?: string }
interface ResultResp { video?: { url?: string }; detail?: unknown }

const stateFrom = (s: string | undefined): VideoGenState =>
  s === 'COMPLETED' ? 'complete' : s === 'FAILED' || s === 'ERROR' ? 'failed' : 'processing';

/**
 * Video generation via fal.ai's async queue API. Reads FAL_KEY_VIDEO (separate
 * from the image FAL_KEY so video spend can be tracked independently). Implements
 * the provider-agnostic VideoProvider contract (create → poll getTask).
 *
 * NOTE: fal.ai normalises the status/result URL to the app-level path
 * (e.g. fal-ai/wan) regardless of which model variant was used for submission.
 * We therefore store the response_url from the submit response as the taskId so
 * that getTask always polls the correct endpoint.
 */
export class FalVideoProvider implements VideoProvider {
  readonly name = 'fal-video';
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: FalVideoProviderOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.FAL_KEY_VIDEO;
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

  async create(input: VideoGenInput): Promise<{ taskId: string }> {
    if (!this.apiKey) throw new Error('fal video not configured (set FAL_KEY_VIDEO)');
    const model = input.model ?? this.model;
    const body: Record<string, unknown> = {
      prompt: input.prompt,
      aspect_ratio: input.aspectRatio ?? '16:9',
      resolution: input.quality ?? '720p',
    };
    const res = await this.fetchFn(`${this.baseUrl}/${model}`, {
      method: 'POST', headers: this.authHeaders(), body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`fal video submit failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as SubmitResp;
    if (!data.request_id) throw new Error('fal video response missing request_id');
    // fal.ai returns a response_url that points to the app-level base (e.g.
    // queue.fal.run/fal-ai/wan/requests/{id}) which may differ from the model
    // submission URL. Use it as the canonical base for status + result polling.
    const responseUrl = data.response_url ?? `${this.baseUrl}/${this.model}/requests/${data.request_id}`;
    return { taskId: responseUrl };
  }

  async getTask(taskId: string): Promise<VideoGenTask> {
    // taskId is the response_url from create() — a fully qualified URL.
    if (!this.apiKey) throw new Error('fal video not configured (set FAL_KEY_VIDEO)');
    const statusRes = await this.fetchFn(`${taskId}/status`, { headers: this.authHeaders() });
    if (!statusRes.ok) return { taskId, state: 'failed' };
    const status = stateFrom(((await statusRes.json()) as StatusResp).status);
    if (status !== 'complete') return { taskId, state: status };

    // Completed → fetch the result payload for the video URL.
    const resultRes = await this.fetchFn(taskId, { headers: this.authHeaders() });
    if (!resultRes.ok) return { taskId, state: 'failed' };
    const url = ((await resultRes.json()) as ResultResp).video?.url;
    return url ? { taskId, state: 'complete', videoUrl: url } : { taskId, state: 'failed' };
  }
}

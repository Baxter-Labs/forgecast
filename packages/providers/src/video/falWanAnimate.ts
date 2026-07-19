import type { RetargetProvider, RetargetGenInput, RetargetGenTask, RetargetGenState } from '@forgecast/core';

export interface FalWanAnimateProviderOptions {
  /** Defaults to process.env.FAL_KEY_VIDEO ?? process.env.FAL_KEY. */
  apiKey?: string;
  /** Defaults to https://queue.fal.run. */
  baseUrl?: string;
  /** Defaults to fal-ai/wan-animate. */
  model?: string;
  fetchFn?: typeof fetch;
}

interface SubmitResp { request_id?: string; response_url?: string }
interface StatusResp { status?: string }
interface ResultResp { video?: { url?: string }; detail?: unknown }

const DEFAULT_MODEL = 'fal-ai/wan-animate';

const stateFrom = (s: string | undefined): RetargetGenState =>
  s === 'COMPLETED' ? 'complete' : s === 'FAILED' || s === 'ERROR' ? 'failed' : 'processing';

/**
 * Motion retargeting via fal.ai's Wan-Animate: a character image is driven by
 * the performance of a reference video. Same fal async queue API as
 * FalLipsyncProvider (response_url stored as taskId, getTask polls
 * ${taskId}/status then ${taskId} for the result).
 *
 * apiKey defaults to FAL_KEY_VIDEO then FAL_KEY so video spend can be tracked
 * independently from image spend.
 */
export class FalWanAnimateProvider implements RetargetProvider {
  readonly name: string;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: FalWanAnimateProviderOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.FAL_KEY_VIDEO ?? process.env.FAL_KEY;
    this.baseUrl = (opts.baseUrl ?? 'https://queue.fal.run').replace(/\/$/, '');
    this.model = opts.model ?? DEFAULT_MODEL;
    this.name = this.model.replace(/^fal-ai\//, '');
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Key ${this.apiKey ?? ''}`, 'Content-Type': 'application/json' };
  }

  async create(input: RetargetGenInput): Promise<{ taskId: string }> {
    if (!this.apiKey) throw new Error('Retarget not configured (set FAL_KEY_VIDEO or FAL_KEY)');
    const body = { image_url: input.imageUrl, video_url: input.videoUrl };
    const res = await this.fetchFn(`${this.baseUrl}/${this.model}`, {
      method: 'POST', headers: this.authHeaders(), body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Retarget submit failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as SubmitResp;
    if (!data.request_id) throw new Error('Retarget response missing request_id');
    const responseUrl = data.response_url ?? `${this.baseUrl}/${this.model}/requests/${data.request_id}`;
    return { taskId: responseUrl };
  }

  async getTask(taskId: string): Promise<RetargetGenTask> {
    if (!this.apiKey) throw new Error('Retarget not configured (set FAL_KEY_VIDEO or FAL_KEY)');
    const statusRes = await this.fetchFn(`${taskId}/status`, { headers: this.authHeaders() });
    if (!statusRes.ok) return { taskId, state: 'failed' };
    const state = stateFrom(((await statusRes.json()) as StatusResp).status);
    if (state !== 'complete') return { taskId, state };

    const resultRes = await this.fetchFn(taskId, { headers: this.authHeaders() });
    if (!resultRes.ok) return { taskId, state: 'failed' };
    const url = ((await resultRes.json()) as ResultResp).video?.url;
    return url ? { taskId, state: 'complete', videoUrl: url } : { taskId, state: 'failed' };
  }
}

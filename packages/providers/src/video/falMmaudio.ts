import type { SfxProvider, SfxGenInput, SfxGenTask, SfxGenState } from '@forgecast/core';

export interface FalMmaudioProviderOptions {
  /** Defaults to process.env.FAL_KEY_VIDEO ?? process.env.FAL_KEY. */
  apiKey?: string;
  /** Defaults to https://queue.fal.run. */
  baseUrl?: string;
  /** Defaults to fal-ai/mmaudio-v2. */
  model?: string;
  fetchFn?: typeof fetch;
}

interface SubmitResp { request_id?: string; response_url?: string }
interface StatusResp { status?: string }
interface ResultResp { video?: { url?: string }; detail?: unknown }

const DEFAULT_MODEL = 'fal-ai/mmaudio-v2';

const stateFrom = (s: string | undefined): SfxGenState =>
  s === 'COMPLETED' ? 'complete' : s === 'FAILED' || s === 'ERROR' ? 'failed' : 'processing';

/**
 * SFX via fal.ai's MMAudio v2: generates synchronized sound effects/ambience
 * for a video and returns the video with the new audio track merged. Same fal
 * async queue API as FalLipsyncProvider (response_url stored as taskId,
 * getTask polls ${taskId}/status then ${taskId} for the result).
 *
 * apiKey defaults to FAL_KEY_VIDEO then FAL_KEY so video spend can be tracked
 * independently from image spend.
 */
export class FalMmaudioProvider implements SfxProvider {
  readonly name: string;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: FalMmaudioProviderOptions = {}) {
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

  async create(input: SfxGenInput): Promise<{ taskId: string }> {
    if (!this.apiKey) throw new Error('SFX not configured (set FAL_KEY_VIDEO or FAL_KEY)');
    const body: Record<string, unknown> = { video_url: input.videoUrl, prompt: input.prompt };
    if (input.negativePrompt) body.negative_prompt = input.negativePrompt;
    const res = await this.fetchFn(`${this.baseUrl}/${this.model}`, {
      method: 'POST', headers: this.authHeaders(), body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`SFX submit failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as SubmitResp;
    if (!data.request_id) throw new Error('SFX response missing request_id');
    const responseUrl = data.response_url ?? `${this.baseUrl}/${this.model}/requests/${data.request_id}`;
    return { taskId: responseUrl };
  }

  async getTask(taskId: string): Promise<SfxGenTask> {
    if (!this.apiKey) throw new Error('SFX not configured (set FAL_KEY_VIDEO or FAL_KEY)');
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

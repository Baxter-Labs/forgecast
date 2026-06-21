import type { PresenterProvider, PresenterGenInput, PresenterGenTask, PresenterGenState } from '@forgecast/core';

export interface OmniHumanPresenterProviderOptions {
  /** Defaults to process.env.FAL_KEY_VIDEO ?? process.env.FAL_KEY. */
  apiKey?: string;
  /** Defaults to https://queue.fal.run. */
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface SubmitResp { request_id?: string; response_url?: string }
interface StatusResp { status?: string }
interface ResultResp { video?: { url?: string }; detail?: unknown }

const MODEL = 'fal-ai/bytedance/omnihuman';

const stateFrom = (s: string | undefined): PresenterGenState =>
  s === 'COMPLETED' ? 'complete' : s === 'FAILED' || s === 'ERROR' ? 'failed' : 'processing';

/**
 * Talking-head presenter via fal.ai's OmniHuman model. Takes a portrait image
 * URL and an audio URL and returns a lip-synced video. Uses the same fal async
 * queue API as FalVideoProvider (response_url stored as taskId, getTask polls
 * ${taskId}/status then ${taskId} for the result).
 *
 * apiKey defaults to FAL_KEY_VIDEO then FAL_KEY so video spend can be tracked
 * independently from image spend.
 */
export class OmniHumanPresenterProvider implements PresenterProvider {
  readonly name = 'omnihuman';
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: OmniHumanPresenterProviderOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.FAL_KEY_VIDEO ?? process.env.FAL_KEY;
    this.baseUrl = (opts.baseUrl ?? 'https://queue.fal.run').replace(/\/$/, '');
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Key ${this.apiKey ?? ''}`, 'Content-Type': 'application/json' };
  }

  async create(input: PresenterGenInput): Promise<{ taskId: string }> {
    if (!this.apiKey) throw new Error('OmniHuman not configured (set FAL_KEY_VIDEO or FAL_KEY)');
    const body = { image_url: input.imageUrl, audio_url: input.audioUrl };
    const res = await this.fetchFn(`${this.baseUrl}/${MODEL}`, {
      method: 'POST', headers: this.authHeaders(), body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`OmniHuman submit failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as SubmitResp;
    if (!data.request_id) throw new Error('OmniHuman response missing request_id');
    const responseUrl = data.response_url ?? `${this.baseUrl}/${MODEL}/requests/${data.request_id}`;
    return { taskId: responseUrl };
  }

  async getTask(taskId: string): Promise<PresenterGenTask> {
    if (!this.apiKey) throw new Error('OmniHuman not configured (set FAL_KEY_VIDEO or FAL_KEY)');
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

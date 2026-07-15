import type { VideoProvider, VideoGenInput, VideoGenTask, VideoGenState } from '@forgecast/core';

export interface SkyReelsVideoProviderOptions {
  /** Base URL of a self-hosted SkyReels-V2 worker. Falls back to SKYREELS_URL. */
  baseUrl?: string;
  /** Injectable fetch for testing. Defaults to global fetch. */
  fetchFn?: typeof fetch;
}

interface SubmitResp { task_id?: string }
interface StatusResp { state?: string; video_url?: string; error?: string }

const stateFrom = (s: string | undefined): VideoGenState =>
  s === 'complete' || s === 'completed' || s === 'succeeded'
    ? 'complete'
    : s === 'failed' || s === 'error' || s === 'canceled'
      ? 'failed'
      : 'processing';

/**
 * Optional, self-hosted VIDEO generation via SkyReels-V2 (Skywork — a GPU-only
 * open model: text-to-video, image-to-video, infinite-length). A bring-your-own-GPU
 * alternative to the keyless Cloudflare default and the cloud (fal / Replicate)
 * providers: no per-call API fee, you run the model on your own hardware.
 *
 * SkyReels-V2 cannot run on the Cloudflare Worker itself (needs ~15 GB+ VRAM), so
 * this adapter is a thin HTTP client to a self-hosted worker (see workers/skyreels).
 * Available only when SKYREELS_URL points at that worker. Implements the async
 * create → poll VideoProvider contract:
 *   POST {SKYREELS_URL}/generate  { prompt, aspect_ratio?, duration?, image? } -> { task_id }
 *   GET  {SKYREELS_URL}/tasks/{id}                                            -> { state, video_url? }
 */
export class SkyReelsVideoProvider implements VideoProvider {
  readonly name = 'skyreels';
  private readonly baseUrl: string | undefined;
  private readonly fetchFn: typeof fetch;

  constructor(opts: SkyReelsVideoProviderOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.SKYREELS_URL)?.replace(/\/$/, '');
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.baseUrl);
  }

  async create(input: VideoGenInput): Promise<{ taskId: string }> {
    if (!this.baseUrl) throw new Error('SkyReels not configured (set SKYREELS_URL)');
    const body: Record<string, unknown> = { prompt: input.prompt };
    if (input.aspectRatio) body.aspect_ratio = input.aspectRatio;
    if (typeof input.duration === 'number') body.duration = input.duration;
    if (input.imageUrl) body.image = input.imageUrl; // image-to-video source
    if (input.extra) Object.assign(body, input.extra);

    const res = await this.fetchFn(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`SkyReels submit failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as SubmitResp;
    if (!data.task_id) throw new Error('SkyReels response missing task_id');
    return { taskId: data.task_id };
  }

  async getTask(taskId: string): Promise<VideoGenTask> {
    if (!this.baseUrl) throw new Error('SkyReels not configured (set SKYREELS_URL)');
    const res = await this.fetchFn(`${this.baseUrl}/tasks/${taskId}`);
    if (!res.ok) return { taskId, state: 'failed' };
    const data = (await res.json()) as StatusResp;
    const state = stateFrom(data.state);
    if (state === 'complete') {
      return data.video_url ? { taskId, state: 'complete', videoUrl: data.video_url } : { taskId, state: 'failed' };
    }
    return { taskId, state };
  }
}

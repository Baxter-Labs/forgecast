import type { VideoProvider, VideoGenInput, VideoGenTask, VideoGenState } from '@forgecast/core';

export interface ReplicateVideoProviderOptions {
  /** Defaults to process.env.REPLICATE_API_TOKEN. */
  apiKey?: string;
  /**
   * Replicate model to run. `owner/name` runs the latest official version;
   * `owner/name:version` pins a version. Defaults to REPLICATE_VIDEO_MODEL, then
   * a text-to-video model.
   */
  model?: string;
  /** API base. Defaults to https://api.replicate.com/v1. */
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface Prediction {
  id?: string;
  status?: string;
  output?: unknown;
  error?: string | null;
}

function stateFrom(status: string | undefined): VideoGenState {
  if (status === 'succeeded') return 'complete';
  if (status === 'failed' || status === 'canceled') return 'failed';
  return 'processing'; // starting | processing | anything else pending
}

/** Pull the first video URL out of Replicate's varied output shapes. */
function urlFrom(output: unknown): string | undefined {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    const s = output.find((o) => typeof o === 'string');
    return typeof s === 'string' ? s : undefined;
  }
  if (output && typeof output === 'object') {
    const v = (output as { video?: unknown; url?: unknown }).video ?? (output as { url?: unknown }).url;
    return typeof v === 'string' ? v : undefined;
  }
  return undefined;
}

/**
 * Video generation via **Replicate** — a non-fal option users drive with their own
 * Replicate token. Uses the predictions API (create → poll) with raw injectable
 * fetch, no SDK. `owner/name` runs the latest official version; `owner/name:version`
 * pins one. Available when a Replicate token is present.
 */
export class ReplicateVideoProvider implements VideoProvider {
  readonly name = 'replicate';
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: ReplicateVideoProviderOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.REPLICATE_API_TOKEN;
    this.model = opts.model ?? process.env.REPLICATE_VIDEO_MODEL ?? 'minimax/video-01';
    this.baseUrl = (opts.baseUrl ?? 'https://api.replicate.com/v1').replace(/\/+$/, '');
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey ?? ''}`, 'Content-Type': 'application/json' };
  }

  async create(input: VideoGenInput): Promise<{ taskId: string }> {
    if (!this.apiKey) throw new Error('Replicate not configured (set REPLICATE_API_TOKEN)');

    const modelRef = input.model ?? this.model;
    const runInput: Record<string, unknown> = { prompt: input.prompt };
    if (input.imageUrl) runInput.first_frame_image = input.imageUrl; // image-to-video source
    if (input.extra) Object.assign(runInput, input.extra);

    // `owner/name:version` → generic /predictions with the version hash;
    // `owner/name` → the official-model endpoint (latest version).
    const colon = modelRef.indexOf(':');
    const url = colon >= 0 ? `${this.baseUrl}/predictions` : `${this.baseUrl}/models/${modelRef}/predictions`;
    const body = colon >= 0 ? { version: modelRef.slice(colon + 1), input: runInput } : { input: runInput };

    const res = await this.fetchFn(url, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Replicate submit failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as Prediction;
    if (!data.id) throw new Error('Replicate response missing prediction id');
    return { taskId: data.id };
  }

  async getTask(taskId: string): Promise<VideoGenTask> {
    if (!this.apiKey) throw new Error('Replicate not configured (set REPLICATE_API_TOKEN)');
    const res = await this.fetchFn(`${this.baseUrl}/predictions/${taskId}`, { headers: this.headers() });
    if (!res.ok) return { taskId, state: 'failed', error: `status ${res.status}` };
    const data = (await res.json()) as Prediction;
    const state = stateFrom(data.status);
    if (state !== 'complete') {
      return data.error ? { taskId, state, error: data.error } : { taskId, state };
    }
    const videoUrl = urlFrom(data.output);
    return videoUrl ? { taskId, state: 'complete', videoUrl } : { taskId, state: 'failed', error: 'no output url' };
  }
}

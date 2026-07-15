import type { VideoProvider, VideoGenInput, VideoGenTask } from '@forgecast/core';
import type { WorkersAiRunner } from '../image/cloudflare';

export interface CloudflareVideoProviderOptions {
  /** The Workers AI binding (env.AI). Present on the Cloudflare deploy → keyless. */
  runner?: WorkersAiRunner;
  /** REST fallback (off-Workers): Cloudflare account id. Falls back to CLOUDFLARE_ACCOUNT_ID. */
  accountId?: string;
  /** REST fallback: an API token with Workers AI access. Falls back to CLOUDFLARE_AI_API_TOKEN. */
  apiToken?: string;
  /** Text/image-to-video model id. Falls back to CF_AI_VIDEO_MODEL, then vidu/q3-turbo. */
  model?: string;
  /** Injectable fetch for the REST path (tests). */
  fetchFn?: typeof fetch;
}

/** Defensive shape covering both the binding (unwrapped) and REST (`result`-wrapped) responses. */
interface RawVideo {
  request_id?: string;
  status?: string;
  state?: string;
  video?: string;
  result?: { video?: string; request_id?: string; status?: string; state?: string; result?: { video?: string } };
}

const ASYNC = 'req::';
const SYNC = 'url::';

const videoUrlOf = (r: RawVideo): string | undefined => r.result?.video ?? r.video ?? r.result?.result?.video;
const requestIdOf = (r: RawVideo): string | undefined => r.request_id ?? r.result?.request_id;
const statusOf = (r: RawVideo): string => String(r.status ?? r.state ?? r.result?.status ?? r.result?.state ?? '').toLowerCase();

/**
 * Keyless, on-deploy VIDEO generation via Cloudflare Workers AI (Vidu / Runway /
 * Seedance / WAN, default vidu/q3-turbo). Runs through the Worker's `AI` binding —
 * no API key, billed to the account. Implements the create → poll VideoProvider
 * contract:
 *   - create() submits via the async queue API (`queueRequest: true`) and returns
 *     the request_id to poll, so each HTTP request stays short (Workers-friendly).
 *     If a model instead runs synchronously (returns the video URL directly), we
 *     store that URL and resolve it immediately.
 *   - getTask() polls the queued request (queued/running → processing; done →
 *     complete with the mp4 URL), or resolves a stored sync URL.
 * Off Workers it uses the Workers AI REST API when CLOUDFLARE_ACCOUNT_ID +
 * CLOUDFLARE_AI_API_TOKEN are set.
 */
export class CloudflareVideoProvider implements VideoProvider {
  readonly name = 'cloudflare';
  private readonly runner: WorkersAiRunner | undefined;
  private readonly accountId: string | undefined;
  private readonly apiToken: string | undefined;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: CloudflareVideoProviderOptions = {}) {
    this.runner = opts.runner;
    this.accountId = opts.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID;
    this.apiToken = opts.apiToken ?? process.env.CLOUDFLARE_AI_API_TOKEN;
    this.model = opts.model ?? process.env.CF_AI_VIDEO_MODEL ?? 'vidu/q3-turbo';
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.runner) || Boolean(this.accountId && this.apiToken);
  }

  private inputsFrom(input: VideoGenInput): Record<string, unknown> {
    const inputs: Record<string, unknown> = { prompt: input.prompt };
    if (input.aspectRatio) inputs.aspect_ratio = input.aspectRatio;
    if (typeof input.duration === 'number') inputs.duration = input.duration;
    if (input.imageUrl) inputs.start_image = input.imageUrl; // image-to-video source (Vidu)
    if (input.extra) Object.assign(inputs, input.extra);     // per-model params
    return inputs;
  }

  async create(input: VideoGenInput): Promise<{ taskId: string }> {
    if (!this.isAvailable()) throw new Error('Cloudflare Workers AI not configured');
    const model = input.model ?? this.model;
    const inputs = this.inputsFrom(input);

    const raw = this.runner
      ? ((await this.runner.run(model, inputs, { queueRequest: true })) as RawVideo)
      : await this.runViaRest(model, inputs);

    const reqId = requestIdOf(raw);
    if (reqId) return { taskId: `${ASYNC}${model}::${reqId}` };
    const url = videoUrlOf(raw);
    if (url) return { taskId: `${SYNC}${url}` };
    throw new Error('Cloudflare Workers AI video response missing request_id and video url');
  }

  async getTask(taskId: string): Promise<VideoGenTask> {
    if (taskId.startsWith(SYNC)) {
      return { taskId, state: 'complete', videoUrl: taskId.slice(SYNC.length) };
    }
    if (!taskId.startsWith(ASYNC)) return { taskId, state: 'failed' };
    const [model, requestId] = taskId.slice(ASYNC.length).split('::');
    if (!model || !requestId) return { taskId, state: 'failed' };

    let raw: RawVideo;
    try {
      raw = this.runner
        ? ((await this.runner.run(model, { request_id: requestId })) as RawVideo)
        : await this.runViaRest(model, { request_id: requestId });
    } catch {
      return { taskId, state: 'processing' }; // transient — the next poll retries
    }

    const status = statusOf(raw);
    if (status === 'queued' || status === 'running' || status === 'inprogress' || status === 'in_progress') {
      return { taskId, state: 'processing' };
    }
    const url = videoUrlOf(raw);
    if (url) return { taskId, state: 'complete', videoUrl: url };
    return { taskId, state: status === 'failed' || status === 'error' ? 'failed' : 'processing' };
  }

  private async runViaRest(model: string, inputs: Record<string, unknown>): Promise<RawVideo> {
    // Partner video models use POST /ai/run with { model, input } (the account-scoped
    // gateway route). This is the off-Workers fallback; the deploy uses the binding.
    const res = await this.fetchFn(
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiToken ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: inputs }),
      },
    );
    if (!res.ok) throw new Error(`Cloudflare Workers AI video request failed (${res.status}): ${await res.text()}`);
    return (await res.json()) as RawVideo;
  }
}

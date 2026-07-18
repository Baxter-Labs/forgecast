import {
  ProviderUnavailableError,
  type ImageProvider,
  type GenerateImageInput,
  type ImageResult,
} from '@forgecast/core';

/**
 * Minimal shape of the Cloudflare Workers AI binding (`env.AI`). The app injects
 * the real binding; keeping our own interface means this package needs no
 * Cloudflare types and stays offline-testable with a mock runner.
 */
export interface WorkersAiRunner {
  run(model: string, inputs: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
}

export interface CloudflareImageProviderOptions {
  /** The Workers AI binding (env.AI). Present on the Cloudflare deploy → keyless. */
  runner?: WorkersAiRunner;
  /** REST fallback (off-Workers): Cloudflare account id. Falls back to CLOUDFLARE_ACCOUNT_ID. */
  accountId?: string;
  /** REST fallback: an API token with Workers AI access. Falls back to CLOUDFLARE_AI_API_TOKEN. */
  apiToken?: string;
  /** Text-to-image model id. Falls back to CF_AI_IMAGE_MODEL, then FLUX.1 [schnell]. */
  model?: string;
  /** Injectable fetch for the REST path (tests). */
  fetchFn?: typeof fetch;
}

interface WorkersAiImageResult { image?: string; result?: { image?: string } }

/**
 * Keyless, on-deploy image generation via Cloudflare Workers AI (FLUX.1 [schnell]).
 *
 * This is Forgecast's default generator: no API key, it runs through the Worker's
 * `AI` binding and bills against the account's free daily neuron allowance. Off
 * Workers (local dev / other hosts) it can use the Workers AI REST API when
 * CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_API_TOKEN are set; otherwise it reports
 * unavailable and the app falls back to a BYO-key provider (fal / OpenAI / SD).
 *
 * FLUX.1 [schnell] returns a base64 JPEG, which we hand back as a `data:` URI —
 * the download pipeline (and fal/ffmpeg consumers) already accept data URLs.
 */
export class CloudflareImageProvider implements ImageProvider {
  readonly name = 'cloudflare';
  private readonly runner: WorkersAiRunner | undefined;
  private readonly accountId: string | undefined;
  private readonly apiToken: string | undefined;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: CloudflareImageProviderOptions = {}) {
    this.runner = opts.runner;
    this.accountId = opts.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID;
    this.apiToken = opts.apiToken ?? process.env.CLOUDFLARE_AI_API_TOKEN;
    this.model = opts.model ?? process.env.CF_AI_IMAGE_MODEL ?? '@cf/black-forest-labs/flux-1-schnell';
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.runner) || Boolean(this.accountId && this.apiToken);
  }

  async generateImage(input: GenerateImageInput): Promise<ImageResult> {
    if (!this.isAvailable()) throw new ProviderUnavailableError(this.name);
    if (input.refImageUrls?.length) {
      throw new Error('character reference images need an edit-capable image provider — add a fal key (Settings → keys) to generate with characters');
    }

    const model = input.model ?? this.model;
    // FLUX.1 [schnell] takes `prompt` (+ optional steps/seed). `extra` is spread
    // last so callers can pass model-specific params. Pixel dimensions aren't part
    // of the schnell schema, so width/height are intentionally not forwarded.
    const inputs: Record<string, unknown> = { prompt: input.prompt, ...input.extra };

    const raw = this.runner
      ? ((await this.runner.run(model, inputs)) as WorkersAiImageResult)
      : await this.runViaRest(model, inputs);

    const b64 = raw?.image ?? raw?.result?.image;
    if (!b64) throw new Error('Cloudflare Workers AI response missing image');
    return { url: `data:image/jpeg;base64,${b64}`, raw };
  }

  private async runViaRest(model: string, inputs: Record<string, unknown>): Promise<WorkersAiImageResult> {
    const res = await this.fetchFn(
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${model}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiToken ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(inputs),
      },
    );
    if (!res.ok) throw new Error(`Cloudflare Workers AI request failed (${res.status}): ${await res.text()}`);
    return (await res.json()) as WorkersAiImageResult;
  }
}

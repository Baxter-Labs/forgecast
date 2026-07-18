import {
  ProviderUnavailableError,
  type ImageProvider,
  type GenerateImageInput,
  type ImageResult,
} from '@forgecast/core';

export interface FalImageProviderOptions {
  /** Defaults to process.env.FAL_KEY. */
  apiKey?: string;
  /** fal model id. Defaults to a fast text-to-image model. */
  model?: string;
  /** Injectable fetch for testing. Defaults to global fetch. */
  fetchFn?: typeof fetch;
}

interface FalImageResponse {
  images?: Array<{ url: string; width?: number; height?: number }>;
  image?: { url?: string; width?: number; height?: number };
}

export class FalImageProvider implements ImageProvider {
  readonly name = 'fal';
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: FalImageProviderOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.FAL_KEY;
    this.model = opts.model ?? 'fal-ai/flux/schnell';
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async generateImage(input: GenerateImageInput): Promise<ImageResult> {
    if (!this.isAvailable()) throw new ProviderUnavailableError(this.name);

    // Reference portraits (character consistency): multi-reference models take
    // `image_urls`; Kontext-class instruction editors take a single `image_url`.
    // When refs are present with no explicit model, route to the multi-reference
    // editor rather than the text-only default.
    const model = input.model ?? (input.refImageUrls?.length ? 'fal-ai/nano-banana/edit' : this.model);
    const refs = input.refImageUrls ?? [];
    const refFields: Record<string, unknown> =
      refs.length === 0 ? {} : /kontext/i.test(model) ? { image_url: refs[0] } : { image_urls: refs };

    // `image_size` is derived only when BOTH dimensions are given (use != null
    // so a literal 0 isn't silently dropped). `extra` is spread last so callers
    // can override any mapped field (prompt, image_size).
    const body: Record<string, unknown> = {
      prompt: input.prompt,
      ...(input.width != null && input.height != null
        ? { image_size: { width: input.width, height: input.height } }
        : {}),
      ...refFields,
      ...input.extra,
    };
    const res = await this.fetchFn(`https://fal.run/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`fal request failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as FalImageResponse;
    const image = data.images?.[0] ?? (data as { image?: { url?: string; width?: number; height?: number } }).image;
    if (!image?.url) throw new Error('fal response missing image url');

    return { url: image.url, width: image.width, height: image.height, raw: data };
  }
}

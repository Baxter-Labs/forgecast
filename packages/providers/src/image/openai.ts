import {
  ProviderUnavailableError,
  type ImageProvider,
  type GenerateImageInput,
  type ImageResult,
} from '@forgecast/core';

export interface OpenAiImageProviderOptions {
  /** Defaults to process.env.OPENAI_API_KEY. */
  apiKey?: string;
  /** Model id. Defaults to OPENAI_IMAGE_MODEL, then `gpt-image-1`. */
  model?: string;
  /** API base. Defaults to OPENAI_BASE_URL, then https://api.openai.com/v1. */
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

interface OpenAiImageResponse {
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message?: string };
}

/** Map width/height to the nearest size string the model family accepts. */
function pickSize(model: string, width?: number, height?: number): string {
  const isDalle = model.startsWith('dall-e');
  if (width == null || height == null || width === height) return '1024x1024';
  if (width > height) return isDalle ? '1792x1024' : '1536x1024'; // landscape
  return isDalle ? '1024x1792' : '1024x1536'; // portrait
}

/**
 * Image generation via the **OpenAI Images API** (`gpt-image-1` by default, or any
 * `dall-e-*`) — a non-fal option users can drive with their own OpenAI key. Raw
 * injectable fetch, no SDK. `gpt-image-1` returns base64, handed back as a `data:`
 * URI the job handler stores like any other generated image; `dall-e-*` can return
 * a URL. Available when an OpenAI key is present.
 */
export class OpenAiImageProvider implements ImageProvider {
  readonly name = 'openai';
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: OpenAiImageProviderOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
    this.model = opts.model ?? process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1';
    this.baseUrl = (opts.baseUrl ?? process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async generateImage(input: GenerateImageInput): Promise<ImageResult> {
    if (!this.apiKey) throw new ProviderUnavailableError(this.name);

    const model = input.model ?? this.model;
    const body: Record<string, unknown> = {
      model,
      prompt: input.prompt,
      size: pickSize(model, input.width, input.height),
      n: 1,
      // gpt-image-1 always returns b64_json and rejects response_format; dall-e-* needs it.
      ...(model.startsWith('dall-e') ? { response_format: 'b64_json' } : {}),
      ...input.extra,
    };

    const res = await this.fetchFn(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI image request failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as OpenAiImageResponse;
    const first = data.data?.[0];
    if (first?.b64_json) return { url: `data:image/png;base64,${first.b64_json}`, raw: data };
    if (first?.url) return { url: first.url, raw: data };
    throw new Error('OpenAI image response missing image data');
  }
}

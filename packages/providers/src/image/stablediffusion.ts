import {
  ProviderUnavailableError,
  type ImageProvider,
  type GenerateImageInput,
  type ImageResult,
} from '@forgecast/core';

export interface StableDiffusionImageProviderOptions {
  /** Base URL of a running Stable Diffusion WebUI (Automatic1111). Falls back to SD_WEBUI_URL. */
  baseUrl?: string;
  /** Sampling steps (default 25, or SD_STEPS). */
  steps?: number;
  /** Classifier-free guidance scale (default 7, or SD_CFG_SCALE). */
  cfgScale?: number;
  fetchFn?: typeof fetch;
}

interface Txt2ImgResponse { images?: string[]; error?: string; detail?: string }

function numEnv(name: string): number | undefined {
  const v = process.env[name];
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Self-hosted, **free** image generation via a local Stable Diffusion WebUI
 * (Automatic1111: https://github.com/AUTOMATIC1111/stable-diffusion-webui), over
 * its `POST /sdapi/v1/txt2img` API. Own the whole image stack — no fal, no per-use
 * cost. Raw injectable fetch, no SDK. Configure with SD_WEBUI_URL (e.g.
 * http://localhost:7860). The returned base64 PNG is handed back as a `data:` URI
 * the job handler stores like any other generated image.
 */
export class StableDiffusionImageProvider implements ImageProvider {
  readonly name = 'stablediffusion';
  private readonly baseUrl: string | undefined;
  private readonly steps: number;
  private readonly cfgScale: number;
  private readonly fetchFn: typeof fetch;

  constructor(opts: StableDiffusionImageProviderOptions = {}) {
    const url = opts.baseUrl ?? process.env.SD_WEBUI_URL;
    this.baseUrl = url ? url.replace(/\/+$/, '') : undefined;
    this.steps = opts.steps ?? numEnv('SD_STEPS') ?? 25;
    this.cfgScale = opts.cfgScale ?? numEnv('SD_CFG_SCALE') ?? 7;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  isAvailable(): boolean {
    return Boolean(this.baseUrl);
  }

  async generateImage(input: GenerateImageInput): Promise<ImageResult> {
    if (!this.baseUrl) throw new ProviderUnavailableError(this.name);

    const width = input.width ?? 1024;
    const height = input.height ?? 1024;
    const body: Record<string, unknown> = {
      prompt: input.prompt,
      width,
      height,
      steps: this.steps,
      cfg_scale: this.cfgScale,
      // `extra` is spread last so a caller can override anything (sampler, seed,
      // negative_prompt, an explicit model checkpoint via `override_settings`, …).
      ...input.extra,
    };

    const res = await this.fetchFn(`${this.baseUrl}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Stable Diffusion request failed (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as Txt2ImgResponse;
    const b64 = data.images?.[0];
    if (!b64) throw new Error(`Stable Diffusion response missing image${data.error ? `: ${data.error}` : ''}`);

    return { url: `data:image/png;base64,${b64}`, width, height, raw: { info: undefined } };
  }
}

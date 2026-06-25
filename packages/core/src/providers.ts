export interface GenerateImageInput {
  prompt: string;
  width?: number;
  height?: number;
  /** Per-call model override; takes precedence over the provider's default model. */
  model?: string;
  /**
   * Provider-specific extra parameters, passed through verbatim. Spread last by
   * adapters, so a key here takes precedence over mapped fields (e.g. an
   * `image_size` in `extra` overrides the one derived from `width`/`height`).
   */
  extra?: Record<string, unknown>;
}

export interface ImageResult {
  url: string;
  width?: number;
  height?: number;
  /** The raw provider response, for debugging/storage. */
  raw?: unknown;
}

export interface ImageProvider {
  readonly name: string;
  /** True when the provider has the credentials/config it needs to run. */
  isAvailable(): boolean;
  generateImage(input: GenerateImageInput): Promise<ImageResult>;
}

export class ProviderUnavailableError extends Error {
  constructor(public readonly providerName: string) {
    super(`Provider "${providerName}" is unavailable (missing credentials or config)`);
    this.name = 'ProviderUnavailableError';
  }
}

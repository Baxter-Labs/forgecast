export interface GenerateImageInput {
  prompt: string;
  width?: number;
  height?: number;
  /** Provider-specific extra parameters passed through verbatim. */
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

import type { VideoProvider } from '@forgecast/core';

/**
 * Registry of video-generation providers, mirroring ImageProviderRegistry. Lets
 * the app offer a keyless default (Cloudflare) plus BYO-key providers (fal /
 * Replicate) and self-hosted ones (SkyReels), resolving each job to the provider
 * that created it by name.
 */
export class VideoProviderRegistry {
  private readonly providers = new Map<string, VideoProvider>();

  register(provider: VideoProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): VideoProvider {
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`Unknown video provider: ${name}`);
    return provider;
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }

  available(): string[] {
    return [...this.providers.values()]
      .filter((p) => p.isAvailable())
      .map((p) => p.name);
  }
}

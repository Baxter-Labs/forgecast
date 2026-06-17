import type { ImageProvider } from '@forgecast/core';

export class ImageProviderRegistry {
  private readonly providers = new Map<string, ImageProvider>();

  register(provider: ImageProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): ImageProvider {
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`Unknown image provider: ${name}`);
    return provider;
  }

  available(): string[] {
    return [...this.providers.values()]
      .filter((p) => p.isAvailable())
      .map((p) => p.name);
  }
}

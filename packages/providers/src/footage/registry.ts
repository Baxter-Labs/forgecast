import type { FootageProvider } from '@forgecast/core';

/** Holds the configured footage sources (Pexels, …). Mirrors the other registries. */
export class FootageRegistry {
  private readonly providers = new Map<string, FootageProvider>();

  register(provider: FootageProvider): void {
    this.providers.set(provider.name, provider);
  }
  get(name: string): FootageProvider {
    const p = this.providers.get(name);
    if (!p) throw new Error(`Unknown footage provider: ${name}`);
    return p;
  }
  /** Names of sources that are configured (have credentials). */
  available(): string[] {
    return [...this.providers.values()].filter((p) => p.isAvailable()).map((p) => p.name);
  }
  has(name: string): boolean {
    return this.providers.has(name);
  }
}

import type { AdsInsightsProvider } from '@forgecast/core';

/** Holds the connected ad-insights sources (Meta, Google Ads, …). Mirrors PublisherRegistry. */
export class AdsInsightsRegistry {
  private readonly providers = new Map<string, AdsInsightsProvider>();

  register(provider: AdsInsightsProvider): void {
    this.providers.set(provider.name, provider);
  }
  get(name: string): AdsInsightsProvider {
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`Unknown ads-insights provider: ${name}`);
    return provider;
  }
  /** Names of providers that are configured (have credentials). */
  available(): string[] {
    return [...this.providers.values()].filter((p) => p.isAvailable()).map((p) => p.name);
  }
  has(name: string): boolean {
    return this.providers.has(name);
  }
}

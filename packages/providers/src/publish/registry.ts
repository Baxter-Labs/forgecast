import type { Publisher } from '@forgecast/core';

export class PublisherRegistry {
  private readonly publishers = new Map<string, Publisher>();

  register(publisher: Publisher): void {
    this.publishers.set(publisher.name, publisher);
  }
  get(name: string): Publisher {
    const publisher = this.publishers.get(name);
    if (!publisher) throw new Error(`Unknown publisher: ${name}`);
    return publisher;
  }
  available(): string[] {
    return [...this.publishers.values()].filter((p) => p.isAvailable()).map((p) => p.name);
  }
}

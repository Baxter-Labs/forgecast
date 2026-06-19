import type { StorageDriver, StoredObject, StoredBytes } from '@forgecast/core';

export interface InMemoryStorageOptions {
  /** Base url for generated object urls. Defaults to "memory://forgecast". */
  baseUrl?: string;
}

export class InMemoryStorage implements StorageDriver {
  private readonly objects = new Map<string, StoredBytes>();
  private readonly baseUrl: string;

  constructor(opts: InMemoryStorageOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? 'memory://forgecast').replace(/\/$/, '');
  }

  async put(key: string, data: Uint8Array, contentType: string): Promise<StoredObject> {
    this.objects.set(key, { data, contentType });
    return { key, url: this.url(key) };
  }

  async get(key: string): Promise<StoredBytes | null> {
    return this.objects.get(key) ?? null;
  }

  url(key: string): string {
    return `${this.baseUrl}/${key}`;
  }

  /** Test/debug helper: read back stored bytes. Not part of the StorageDriver contract. */
  read(key: string): StoredBytes | undefined {
    return this.objects.get(key);
  }
}

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { StorageDriver, StoredObject, StoredBytes } from '@forgecast/core';

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
};
function contentTypeFor(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

export interface FilesystemStorageOptions {
  root: string;
  baseUrl?: string;
}

export class FilesystemStorage implements StorageDriver {
  private readonly root: string;
  private readonly baseUrl: string;

  constructor(opts: FilesystemStorageOptions) {
    this.root = opts.root;
    this.baseUrl = (opts.baseUrl ?? 'file://forgecast').replace(/\/$/, '');
  }

  private pathFor(key: string): string {
    if (key.includes('..')) throw new Error(`Invalid storage key: ${key}`);
    return join(this.root, key);
  }

  async put(key: string, data: Uint8Array, _contentType: string): Promise<StoredObject> {
    const p = this.pathFor(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
    return { key, url: this.url(key) };
  }

  async get(key: string): Promise<StoredBytes | null> {
    try {
      const buf = await readFile(this.pathFor(key));
      return { data: new Uint8Array(buf), contentType: contentTypeFor(key) };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  url(key: string): string {
    return `${this.baseUrl}/${key}`;
  }
}

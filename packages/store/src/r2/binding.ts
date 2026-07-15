import type { StorageDriver, StoredObject, StoredBytes } from '@forgecast/core';

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', wav: 'audio/wav', mp3: 'audio/mpeg',
};
function contentTypeFor(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

/**
 * Minimal shape of a Cloudflare R2 bucket binding (`env.MEDIA_BUCKET`). Kept local
 * so the store package needs no Workers types and stays offline-testable with a mock.
 */
export interface R2BucketLike {
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
}
export interface R2ObjectBodyLike {
  arrayBuffer(): Promise<ArrayBuffer>;
  httpMetadata?: { contentType?: string };
}

export interface R2BucketStorageOptions {
  /** The R2 bucket binding (env.MEDIA_BUCKET). */
  bucket: R2BucketLike;
  /** Optional public base url (a public R2 domain / CDN). When unset, url() returns a
   *  non-public marker — assets are served through the app's /api/assets/:id/raw route,
   *  which reads bytes via get(), so a public object URL isn't required. */
  publicBaseUrl?: string;
}

/**
 * Native Cloudflare R2 storage via the Worker's bucket BINDING (`env.MEDIA_BUCKET`) —
 * the media store for the `baxter-cloud` profile when the binding is present. Unlike
 * R2Storage (which signs S3 requests), it needs NO access keys: the binding itself is
 * the credential. Fully offline-testable with a mock bucket.
 */
export class R2BucketStorage implements StorageDriver {
  private readonly bucket: R2BucketLike;
  private readonly publicBaseUrl: string | undefined;

  constructor(opts: R2BucketStorageOptions) {
    this.bucket = opts.bucket;
    this.publicBaseUrl = opts.publicBaseUrl?.replace(/\/$/, '');
  }

  async put(key: string, data: Uint8Array, contentType: string): Promise<StoredObject> {
    // Copy into a fresh ArrayBuffer-backed view (a concrete Uint8Array) for the binding.
    const bytes = new Uint8Array(data.byteLength);
    bytes.set(data);
    await this.bucket.put(key, bytes, { httpMetadata: { contentType } });
    return { key, url: this.url(key) };
  }

  async get(key: string): Promise<StoredBytes | null> {
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    const data = new Uint8Array(await obj.arrayBuffer());
    const contentType = obj.httpMetadata?.contentType ?? contentTypeFor(key);
    return { data, contentType };
  }

  url(key: string): string {
    return `${this.publicBaseUrl ?? 'r2://forgecast-media'}/${key}`;
  }
}

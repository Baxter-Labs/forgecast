import { createHash, createHmac } from 'node:crypto';
import type { StorageDriver, StoredObject, StoredBytes } from '@forgecast/core';

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
};
function contentTypeFor(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

export interface R2StorageOptions {
  /** Cloudflare account id — used to derive the S3 endpoint when `endpoint` is unset. */
  accountId: string;
  /** Target R2 bucket. */
  bucket: string;
  /** R2 access key id (S3 API token). */
  accessKeyId: string;
  /** R2 secret access key (S3 API token). */
  secretAccessKey: string;
  /** Public base url for serving objects (R2 public bucket or custom CDN domain). When unset, `url()` returns the authenticated S3 object url. */
  publicBaseUrl?: string;
  /** Override the S3 endpoint. Defaults to `https://<accountId>.r2.cloudflarestorage.com`. */
  endpoint?: string;
  /** Signing region. R2 uses `auto`. */
  region?: string;
  /** Injectable fetch for testing. Defaults to global fetch. */
  fetchFn?: typeof fetch;
  /** Injectable clock for deterministic signing in tests. Defaults to `() => new Date()`. */
  now?: () => Date;
}

/**
 * Reads R2 config from the standard env vars. Returns null when the required
 * vars are absent, so the composition root can fall back to local storage.
 */
export function r2OptionsFromEnv(env: NodeJS.ProcessEnv = process.env): R2StorageOptions | null {
  const accountId = env.R2_ACCOUNT_ID;
  const bucket = env.R2_BUCKET;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    accountId,
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: env.R2_PUBLIC_BASE_URL,
    endpoint: env.R2_ENDPOINT,
  };
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}
function sha256Hex(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}
/** RFC 3986 path encoding (keeps `/`, encodes everything S3 expects encoded). */
function encodePath(key: string): string {
  return key
    .split('/')
    .map((seg) =>
      encodeURIComponent(seg).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`),
    )
    .join('/');
}

/**
 * S3-compatible storage driver for Cloudflare R2 — the media store of the
 * `baxter-cloud` deployment profile. Signs requests with AWS Signature V4 using
 * `node:crypto` (no SDK dependency) and an injectable `fetch`, so it is fully
 * unit-testable offline.
 */
export class R2Storage implements StorageDriver {
  private readonly bucket: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly endpoint: string;
  private readonly host: string;
  private readonly region: string;
  private readonly publicBaseUrl: string | undefined;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => Date;

  constructor(opts: R2StorageOptions) {
    if (!opts.accountId && !opts.endpoint) throw new Error('R2Storage: accountId or endpoint is required');
    if (!opts.bucket) throw new Error('R2Storage: bucket is required');
    if (!opts.accessKeyId || !opts.secretAccessKey) throw new Error('R2Storage: accessKeyId and secretAccessKey are required');

    this.bucket = opts.bucket;
    this.accessKeyId = opts.accessKeyId;
    this.secretAccessKey = opts.secretAccessKey;
    this.endpoint = (opts.endpoint ?? `https://${opts.accountId}.r2.cloudflarestorage.com`).replace(/\/$/, '');
    this.host = new URL(this.endpoint).host;
    this.region = opts.region ?? 'auto';
    this.publicBaseUrl = opts.publicBaseUrl?.replace(/\/$/, '');
    this.fetchFn = opts.fetchFn ?? fetch;
    this.now = opts.now ?? (() => new Date());
  }

  async put(key: string, data: Uint8Array, contentType: string): Promise<StoredObject> {
    const res = await this.signedFetch('PUT', key, data, contentType);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`R2 put failed (${res.status}) for ${key}: ${text}`);
    }
    return { key, url: this.url(key) };
  }

  async get(key: string): Promise<StoredBytes | null> {
    const res = await this.signedFetch('GET', key);
    if (res.status === 404) return null;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`R2 get failed (${res.status}) for ${key}: ${text}`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? contentTypeFor(key);
    return { data: buf, contentType };
  }

  url(key: string): string {
    if (this.publicBaseUrl) return `${this.publicBaseUrl}/${key}`;
    return `${this.endpoint}/${this.bucket}/${encodePath(key)}`;
  }

  private async signedFetch(
    method: 'GET' | 'PUT',
    key: string,
    body?: Uint8Array,
    contentType?: string,
  ): Promise<Response> {
    const canonicalUri = `/${this.bucket}/${encodePath(key)}`;
    const url = `${this.endpoint}${canonicalUri}`;
    const payloadHash = sha256Hex(body ?? '');

    const date = this.now();
    const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalHeaders =
      `host:${this.host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
    const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

    const scope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

    const kDate = hmac(`AWS4${this.secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, this.region);
    const kService = hmac(kRegion, 's3');
    const kSigning = hmac(kService, 'aws4_request');
    const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

    const authorization =
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const headers: Record<string, string> = {
      Authorization: authorization,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    if (contentType) headers['Content-Type'] = contentType;

    const init: RequestInit = { method, headers };
    if (body) {
      // Copy into a fresh ArrayBuffer-backed view so the body type is a concrete
      // Uint8Array<ArrayBuffer> (satisfies fetch's BodyInit across TS lib targets).
      const bytes = new Uint8Array(body.byteLength);
      bytes.set(body);
      init.body = bytes;
    }
    return this.fetchFn(url, init);
  }
}

import { describe, it, expect, vi } from 'vitest';
import { R2Storage, r2OptionsFromEnv } from '../src/index';

const baseOpts = {
  accountId: 'acct123',
  bucket: 'forge-media',
  accessKeyId: 'AKID',
  secretAccessKey: 'SECRET',
  now: () => new Date('2026-06-20T20:00:00.000Z'),
};

describe('R2Storage', () => {
  it('PUTs bytes to the R2 S3 endpoint with a SigV4 Authorization header', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 200 }));
    const s = new R2Storage({ ...baseOpts, fetchFn: fetchFn as unknown as typeof fetch });

    const stored = await s.put('projects/p1/images/a1.png', new Uint8Array([1, 2, 3]), 'image/png');

    expect(stored.key).toBe('projects/p1/images/a1.png');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://acct123.r2.cloudflarestorage.com/forge-media/projects/p1/images/a1.png');
    expect(init.method).toBe('PUT');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('image/png');
    expect(headers['x-amz-date']).toBe('20260620T200000Z');
    expect(headers['x-amz-content-sha256']).toMatch(/^[0-9a-f]{64}$/);
    expect(headers.Authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKID\/20260620\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
  });

  it('produces a deterministic signature for fixed inputs', async () => {
    const sign = async () => {
      const fetchFn = vi.fn(async () => new Response(null, { status: 200 }));
      const s = new R2Storage({ ...baseOpts, fetchFn: fetchFn as unknown as typeof fetch });
      await s.put('a.png', new Uint8Array([1]), 'image/png');
      const headers = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
      return headers.Authorization;
    };
    const auth = await sign();
    expect(auth).toMatch(/Signature=[0-9a-f]{64}$/);
    // Signing the same request again yields an identical signature.
    expect(await sign()).toBe(auth);
  });

  it('GETs bytes and resolves content type from the response, falling back to the key', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(new Uint8Array([9, 8, 7]), { status: 200, headers: { 'content-type': 'image/webp' } }),
    );
    const s = new R2Storage({ ...baseOpts, fetchFn: fetchFn as unknown as typeof fetch });
    const got = await s.get('projects/p1/images/a1.webp');
    expect(got?.contentType).toBe('image/webp');
    expect(Array.from(got?.data ?? [])).toEqual([9, 8, 7]);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://acct123.r2.cloudflarestorage.com/forge-media/projects/p1/images/a1.webp');
    expect(init.method).toBe('GET');
  });

  it('returns null on a 404', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 404 }));
    const s = new R2Storage({ ...baseOpts, fetchFn: fetchFn as unknown as typeof fetch });
    expect(await s.get('missing.png')).toBeNull();
  });

  it('throws on non-404 errors', async () => {
    const fetchFn = vi.fn(async () => new Response('denied', { status: 403 }));
    const s = new R2Storage({ ...baseOpts, fetchFn: fetchFn as unknown as typeof fetch });
    await expect(s.get('x.png')).rejects.toThrowError(/R2 get failed \(403\)/);
  });

  it('url() prefers the public CDN base url and infers the authenticated url otherwise', () => {
    const withCdn = new R2Storage({ ...baseOpts, publicBaseUrl: 'https://cdn.example.com/' });
    expect(withCdn.url('img/1.png')).toBe('https://cdn.example.com/img/1.png');

    const noCdn = new R2Storage({ ...baseOpts });
    expect(noCdn.url('img/1.png')).toBe('https://acct123.r2.cloudflarestorage.com/forge-media/img/1.png');
  });

  it('throws when required config is missing', () => {
    expect(() => new R2Storage({ ...baseOpts, bucket: '' })).toThrowError(/bucket is required/);
    expect(() => new R2Storage({ ...baseOpts, accessKeyId: '' })).toThrowError(/accessKeyId and secretAccessKey/);
  });

  it('r2OptionsFromEnv returns null unless all required vars are set', () => {
    expect(r2OptionsFromEnv({})).toBeNull();
    expect(r2OptionsFromEnv({ R2_ACCOUNT_ID: 'a', R2_BUCKET: 'b', R2_ACCESS_KEY_ID: 'k' })).toBeNull();
    const opts = r2OptionsFromEnv({
      R2_ACCOUNT_ID: 'a',
      R2_BUCKET: 'b',
      R2_ACCESS_KEY_ID: 'k',
      R2_SECRET_ACCESS_KEY: 's',
      R2_PUBLIC_BASE_URL: 'https://cdn',
    });
    expect(opts).toMatchObject({ accountId: 'a', bucket: 'b', accessKeyId: 'k', secretAccessKey: 's', publicBaseUrl: 'https://cdn' });
  });
});

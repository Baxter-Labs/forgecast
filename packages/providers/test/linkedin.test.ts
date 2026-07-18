import { describe, it, expect, vi } from 'vitest';
import { PublishError } from '@forgecast/core';
import { LinkedInPublisher } from '../src/index';

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

describe('LinkedInPublisher', () => {
  it('is unavailable without credentials', () => {
    expect(new LinkedInPublisher({ accessToken: undefined, authorUrn: undefined }).isAvailable()).toBe(false);
    expect(new LinkedInPublisher({ accessToken: 'tok', authorUrn: undefined }).isAvailable()).toBe(false);
  });

  it('is available with both credentials', () => {
    expect(new LinkedInPublisher({ accessToken: 'tok', authorUrn: 'urn:li:person:abc' }).isAvailable()).toBe(true);
  });

  it('throws PublishError when publishing without credentials', async () => {
    await expect(new LinkedInPublisher({ accessToken: undefined }).publish({ content: 'hi' }))
      .rejects.toBeInstanceOf(PublishError);
  });

  it('publishes a text post and reads post id from x-restli-id header', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({}, 201, { 'x-restli-id': 'urn:li:share:12345' }),
    );
    const p = new LinkedInPublisher({ accessToken: 'tok', authorUrn: 'urn:li:person:abc', fetchFn });
    const r = await p.publish({ content: 'Hello LinkedIn!' });

    expect(r).toEqual({ postId: 'urn:li:share:12345', status: 'published', raw: {} });

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.linkedin.com/rest/posts');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      'Authorization': 'Bearer tok',
      'LinkedIn-Version': '202508',
      'X-Restli-Protocol-Version': '2.0.0',
    });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      author: 'urn:li:person:abc',
      commentary: 'Hello LinkedIn!',
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED' },
      lifecycleState: 'PUBLISHED',
    });
  });

  it('falls back to body id if x-restli-id header is absent', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ id: 'urn:li:share:99' }, 201),
    );
    const p = new LinkedInPublisher({ accessToken: 'tok', authorUrn: 'urn:li:org:1', fetchFn });
    const r = await p.publish({ content: 'Org post' });
    expect(r.postId).toBe('urn:li:share:99');
  });

  it('maps an api error to PublishError', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ message: 'Unauthorized', status: 401 }, 401),
    );
    const p = new LinkedInPublisher({ accessToken: 'bad', authorUrn: 'urn:li:person:abc', fetchFn });
    await expect(p.publish({ content: 'x' })).rejects.toThrowError(/Unauthorized/);
  });

  it('throws if response has no post id at all', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({}, 201),
    );
    const p = new LinkedInPublisher({ accessToken: 'tok', authorUrn: 'urn:li:person:abc', fetchFn });
    await expect(p.publish({ content: 'x' })).rejects.toThrowError(/missing post id/);
  });
});

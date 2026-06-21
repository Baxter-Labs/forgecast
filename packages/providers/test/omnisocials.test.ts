import { describe, it, expect, vi } from 'vitest';
import { PublishError } from '@forgecast/core';
import { OmnisocialsPublisher, PublisherRegistry } from '../src/index';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('OmnisocialsPublisher', () => {
  it('is unavailable without an api key', () => {
    expect(new OmnisocialsPublisher({ apiKey: undefined }).isAvailable()).toBe(false);
  });

  it('throws PublishError when publishing without a key', async () => {
    await expect(new OmnisocialsPublisher({ apiKey: undefined }).publish({ content: 'hi' }))
      .rejects.toBeInstanceOf(PublishError);
  });

  it('creates-and-publishes with content, channels, and media urls', async () => {
    // OmniSocials wraps the created post under `data`.
    const envelope = { data: { id: 'post_1', status: 'posting' } };
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json(envelope));
    const p = new OmnisocialsPublisher({ apiKey: 'k', fetchFn });
    const r = await p.publish({ content: 'a fox', channels: ['instagram', 'linkedin'], mediaUrls: ['https://x/a.png'] });
    expect(r).toEqual({ postId: 'post_1', status: 'posting', raw: envelope });

    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.omnisocials.com/v1/posts/create-and-publish');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer k' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      content: 'a fox', channels: ['instagram', 'linkedin'], media_urls: ['https://x/a.png'],
    });
  });

  it('omits channels/media when not provided', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ data: { id: 'p2', status: 'posting' } }));
    const p = new OmnisocialsPublisher({ apiKey: 'k', fetchFn });
    await p.publish({ content: 'just text' });
    expect(JSON.parse((fetchFn.mock.calls[0]![1] as RequestInit).body as string)).toEqual({ content: 'just text' });
  });

  it('also accepts a top-level post object (no data envelope)', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ id: 'p3', status: 'posting' }));
    const p = new OmnisocialsPublisher({ apiKey: 'k', fetchFn });
    const r = await p.publish({ content: 'x' });
    expect(r.postId).toBe('p3');
  });

  it('maps an api error envelope to PublishError', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ error: { code: 'no_channels', message: 'no channels connected' } }, 400),
    );
    const p = new OmnisocialsPublisher({ apiKey: 'k', fetchFn });
    await expect(p.publish({ content: 'x' })).rejects.toThrowError(/no channels connected/);
  });
});

describe('PublisherRegistry', () => {
  it('registers, gets, and rejects unknown publishers', () => {
    const reg = new PublisherRegistry();
    reg.register(new OmnisocialsPublisher({ apiKey: 'k' }));
    expect(() => reg.get('omnisocials')).not.toThrow();
    expect(() => reg.get('nope')).toThrowError(/unknown publisher: nope/i);
  });
});

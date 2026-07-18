import { describe, it, expect, vi } from 'vitest';
import { PublishError } from '@forgecast/core';
import { InstagramPublisher } from '../src/index';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('InstagramPublisher', () => {
  it('is unavailable without credentials', () => {
    expect(new InstagramPublisher({ accessToken: undefined, igUserId: undefined }).isAvailable()).toBe(false);
    expect(new InstagramPublisher({ accessToken: 'tok', igUserId: undefined }).isAvailable()).toBe(false);
    expect(new InstagramPublisher({ accessToken: undefined, igUserId: 'uid' }).isAvailable()).toBe(false);
  });

  it('is available with both credentials', () => {
    expect(new InstagramPublisher({ accessToken: 'tok', igUserId: 'uid' }).isAvailable()).toBe(true);
  });

  it('throws PublishError when publishing without credentials', async () => {
    await expect(new InstagramPublisher({ accessToken: undefined }).publish({ content: 'hi', mediaUrls: ['https://x/a.png'] }))
      .rejects.toBeInstanceOf(PublishError);
  });

  it('throws PublishError when no media URL is provided', async () => {
    const p = new InstagramPublisher({ accessToken: 'tok', igUserId: 'uid', fetchFn: vi.fn() });
    await expect(p.publish({ content: 'hi' })).rejects.toThrowError(/requires at least one media/);
  });

  it('publishes an image via two-step container flow', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({}));
    // First call: container creation -> { id: 'container_1' }
    fetchFn.mockResolvedValueOnce(json({ id: 'container_1' }));
    // Second call: publish -> { id: 'media_1' }
    fetchFn.mockResolvedValueOnce(json({ id: 'media_1' }));

    const p = new InstagramPublisher({ accessToken: 'tok', igUserId: 'uid_123', fetchFn });
    const r = await p.publish({ content: 'Check this out', mediaUrls: ['https://cdn.example.com/photo.png'] });

    expect(r).toEqual({ postId: 'media_1', status: 'published', raw: { id: 'media_1' } });

    // Assert container creation call
    const [containerUrl, containerInit] = fetchFn.mock.calls[0]!;
    expect(containerUrl).toBe('https://graph.facebook.com/v23.0/uid_123/media');
    expect((containerInit as RequestInit).method).toBe('POST');
    const containerBody = (containerInit as RequestInit).body as string;
    expect(containerBody).toContain('image_url=');
    expect(containerBody).toContain('caption=Check+this+out');
    expect(containerBody).not.toContain('video_url');

    // Assert publish call
    const [publishUrl, publishInit] = fetchFn.mock.calls[1]!;
    expect(publishUrl).toBe('https://graph.facebook.com/v23.0/uid_123/media_publish');
    expect((publishInit as RequestInit).method).toBe('POST');
    const publishBody = (publishInit as RequestInit).body as string;
    expect(publishBody).toContain('creation_id=container_1');
  });

  it('uses video_url + REELS media_type for video files', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({}));
    fetchFn.mockResolvedValueOnce(json({ id: 'c1' }));
    fetchFn.mockResolvedValueOnce(json({ id: 'm1' }));

    const p = new InstagramPublisher({ accessToken: 'tok', igUserId: 'uid', fetchFn });
    await p.publish({ content: 'vid', mediaUrls: ['https://cdn.example.com/clip.mp4'] });

    const containerBody = (fetchFn.mock.calls[0]![1] as RequestInit).body as string;
    expect(containerBody).toContain('video_url=');
    expect(containerBody).toContain('media_type=REELS');
    expect(containerBody).not.toContain('image_url');
  });

  it('maps container creation error to PublishError', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ error: { message: 'Invalid token', code: 190 } }, 400),
    );
    const p = new InstagramPublisher({ accessToken: 'tok', igUserId: 'uid', fetchFn });
    await expect(p.publish({ content: 'x', mediaUrls: ['https://x/a.png'] }))
      .rejects.toThrowError(/Invalid token/);
  });

  it('maps publish step error to PublishError', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({}));
    fetchFn.mockResolvedValueOnce(json({ id: 'c1' }));
    fetchFn.mockResolvedValueOnce(json({ error: { message: 'Media not ready', code: 9007 } }, 400));

    const p = new InstagramPublisher({ accessToken: 'tok', igUserId: 'uid', fetchFn });
    await expect(p.publish({ content: 'x', mediaUrls: ['https://x/a.png'] }))
      .rejects.toThrowError(/Media not ready/);
  });
});

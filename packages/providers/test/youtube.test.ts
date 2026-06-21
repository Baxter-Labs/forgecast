import { describe, it, expect, vi } from 'vitest';
import { PublishError } from '@forgecast/core';
import { YouTubePublisher } from '../src/index';

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function videoBytes(): Response {
  return new Response(new Uint8Array([0x00, 0x01, 0x02]), { status: 200 });
}

describe('YouTubePublisher', () => {
  it('is unavailable without an access token', () => {
    expect(new YouTubePublisher({ accessToken: undefined }).isAvailable()).toBe(false);
  });

  it('is available with an access token', () => {
    expect(new YouTubePublisher({ accessToken: 'tok' }).isAvailable()).toBe(true);
  });

  it('throws PublishError when publishing without credentials', async () => {
    await expect(new YouTubePublisher({ accessToken: undefined }).publish({ content: 'hi', mediaUrls: ['https://x/v.mp4'] }))
      .rejects.toBeInstanceOf(PublishError);
  });

  it('throws PublishError when no media URL is provided', async () => {
    const p = new YouTubePublisher({ accessToken: 'tok', fetchFn: vi.fn() });
    await expect(p.publish({ content: 'hi' })).rejects.toThrowError(/requires a video URL/);
  });

  it('uploads via the three-step resumable flow', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({}));

    // Call 1: fetch video bytes from mediaUrl
    fetchFn.mockResolvedValueOnce(videoBytes());
    // Call 2: init resumable upload -> returns location header
    fetchFn.mockResolvedValueOnce(json({}, 200, { location: 'https://upload.example.com/resume123' }));
    // Call 3: PUT bytes -> returns video id
    fetchFn.mockResolvedValueOnce(json({ id: 'vid_abc' }));

    const p = new YouTubePublisher({ accessToken: 'tok', fetchFn });
    const r = await p.publish({ content: 'My cool video\nWith description', mediaUrls: ['https://cdn.example.com/clip.mp4'] });

    expect(r).toEqual({ postId: 'vid_abc', status: 'uploaded', raw: { id: 'vid_abc' } });

    // Assert: fetched media
    expect(fetchFn.mock.calls[0]![0]).toBe('https://cdn.example.com/clip.mp4');

    // Assert: init upload with metadata
    const [initUrl, initOpts] = fetchFn.mock.calls[1]!;
    expect(initUrl).toBe('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status');
    expect((initOpts as RequestInit).method).toBe('POST');
    expect((initOpts as RequestInit).headers).toMatchObject({ 'Authorization': 'Bearer tok' });
    const metadata = JSON.parse((initOpts as RequestInit).body as string);
    expect(metadata.snippet.title).toBe('My cool video');
    expect(metadata.snippet.description).toBe('My cool video\nWith description');
    expect(metadata.status.privacyStatus).toBe('unlisted');

    // Assert: PUT bytes to upload URL
    const [putUrl, putOpts] = fetchFn.mock.calls[2]!;
    expect(putUrl).toBe('https://upload.example.com/resume123');
    expect((putOpts as RequestInit).method).toBe('PUT');
  });

  it('derives title from first line of content, truncated to 70 chars', async () => {
    const longLine = 'A'.repeat(100) + '\nSecond line';
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({}));
    fetchFn.mockResolvedValueOnce(videoBytes());
    fetchFn.mockResolvedValueOnce(json({}, 200, { location: 'https://up.com/x' }));
    fetchFn.mockResolvedValueOnce(json({ id: 'v1' }));

    const p = new YouTubePublisher({ accessToken: 'tok', fetchFn });
    await p.publish({ content: longLine, mediaUrls: ['https://x/v.mp4'] });

    const metadata = JSON.parse((fetchFn.mock.calls[1]![1] as RequestInit).body as string);
    expect(metadata.snippet.title).toHaveLength(70);
  });

  it('throws when media fetch fails', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      new Response('not found', { status: 404 }),
    );
    const p = new YouTubePublisher({ accessToken: 'tok', fetchFn });
    await expect(p.publish({ content: 'x', mediaUrls: ['https://x/v.mp4'] }))
      .rejects.toThrowError(/Failed to fetch media/);
  });

  it('throws when upload init fails', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({}));
    fetchFn.mockResolvedValueOnce(videoBytes());
    fetchFn.mockResolvedValueOnce(json({ error: { message: 'Quota exceeded' } }, 403));

    const p = new YouTubePublisher({ accessToken: 'tok', fetchFn });
    await expect(p.publish({ content: 'x', mediaUrls: ['https://x/v.mp4'] }))
      .rejects.toThrowError(/Quota exceeded/);
  });

  it('throws when upload init has no location header', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({}));
    fetchFn.mockResolvedValueOnce(videoBytes());
    fetchFn.mockResolvedValueOnce(json({}, 200)); // no location header

    const p = new YouTubePublisher({ accessToken: 'tok', fetchFn });
    await expect(p.publish({ content: 'x', mediaUrls: ['https://x/v.mp4'] }))
      .rejects.toThrowError(/missing location header/);
  });

  it('throws when final upload fails', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({}));
    fetchFn.mockResolvedValueOnce(videoBytes());
    fetchFn.mockResolvedValueOnce(json({}, 200, { location: 'https://up.com/x' }));
    fetchFn.mockResolvedValueOnce(json({ error: { message: 'Upload failed' } }, 500));

    const p = new YouTubePublisher({ accessToken: 'tok', fetchFn });
    await expect(p.publish({ content: 'x', mediaUrls: ['https://x/v.mp4'] }))
      .rejects.toThrowError(/Upload failed/);
  });
});

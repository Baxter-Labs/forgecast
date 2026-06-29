import { describe, it, expect, vi } from 'vitest';
import { PexelsFootageProvider, FootageRegistry } from '../src/index';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const sample = {
  videos: [
    {
      id: 123, width: 1920, height: 1080, duration: 12, url: 'https://pexels.com/video/123', image: 'https://img/123.jpg',
      user: { name: 'Jane Doe' },
      video_files: [
        { quality: 'sd', file_type: 'video/mp4', width: 640, height: 360, link: 'https://cdn/sd.mp4' },
        { quality: 'hd', file_type: 'video/mp4', width: 1920, height: 1080, link: 'https://cdn/hd.mp4' },
      ],
    },
    { id: 124, video_files: [{ quality: 'hd', file_type: 'video/quicktime', link: 'https://cdn/x.mov' }] }, // no mp4 → falls back to first file
  ],
};

describe('PexelsFootageProvider', () => {
  it('isAvailable reflects the API key', () => {
    expect(new PexelsFootageProvider({ apiKey: undefined }).isAvailable()).toBe(false);
    expect(new PexelsFootageProvider({ apiKey: 'k' }).isAvailable()).toBe(true);
  });

  it('searches with the raw Authorization key and maps clips (prefers HD mp4)', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json(sample));
    const p = new PexelsFootageProvider({ apiKey: 'k-secret', fetchFn });
    const clips = await p.search({ query: 'ocean waves', perPage: 5, orientation: 'portrait' });

    expect(clips[0]).toMatchObject({ id: '123', url: 'https://cdn/hd.mp4', source: 'pexels', author: 'Jane Doe', durationSec: 12, pageUrl: 'https://pexels.com/video/123' });
    expect(clips[1]!.url).toBe('https://cdn/x.mov'); // no mp4 → first file
    const [url, init] = fetchFn.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/videos/search?');
    expect(url).toContain('query=ocean+waves');
    expect(url).toContain('orientation=portrait');
    expect((init.headers as Record<string, string>).Authorization).toBe('k-secret'); // raw key, no Bearer
  });

  it('throws on an API error', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ error: 'bad key' }, 401));
    const p = new PexelsFootageProvider({ apiKey: 'k', fetchFn });
    await expect(p.search({ query: 'x' })).rejects.toThrow(/Pexels footage search failed/);
  });
});

describe('FootageRegistry', () => {
  it('registers, looks up, and lists available sources', () => {
    const reg = new FootageRegistry();
    reg.register(new PexelsFootageProvider({ apiKey: 'k' }));
    expect(reg.has('pexels')).toBe(true);
    expect(reg.get('pexels').name).toBe('pexels');
    expect(reg.available()).toEqual(['pexels']);
    expect(() => reg.get('nope')).toThrow(/Unknown footage provider/);
  });
});

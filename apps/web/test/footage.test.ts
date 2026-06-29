import { describe, it, expect, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, searchFootage, importFootage } from '../lib/api';
import { PexelsFootageProvider } from '@forgecast/providers';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function newProjectId(svc: ReturnType<typeof buildServices>): Promise<string> {
  const r = await createProject(svc, { name: 'Footage Test' });
  return (r.body as { project: { id: string } }).project.id;
}

describe('searchFootage', () => {
  it('503s when no footage source is configured', async () => {
    const svc = buildServices({ fetchFn: vi.fn(async (..._a: Parameters<typeof fetch>) => json({})) });
    const r = await searchFootage(svc, { query: 'ocean' });
    expect(r.status).toBe(503);
  });

  it('400s without a query', async () => {
    const svc = buildServices({ fetchFn: vi.fn(async (..._a: Parameters<typeof fetch>) => json({})) });
    const r = await searchFootage(svc, {});
    expect(r.status).toBe(400);
  });

  it('returns mapped clips from a configured source', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ videos: [{ id: 9, duration: 8, image: 'https://img/9.jpg', user: { name: 'Pat' }, url: 'https://pexels/9', video_files: [{ quality: 'hd', file_type: 'video/mp4', link: 'https://cdn/9.mp4', width: 1080, height: 1920 }] }] }),
    );
    const svc = buildServices({ fetchFn });
    svc.footage.register(new PexelsFootageProvider({ apiKey: 'k', fetchFn })); // override with a keyed provider
    const r = await searchFootage(svc, { query: 'forge sparks', perPage: 3, orientation: 'portrait' });
    expect(r.status).toBe(200);
    const body = r.body as { source: string; count: number; clips: Array<{ id: string; url: string; source: string }> };
    expect(body.source).toBe('pexels');
    expect(body.clips[0]).toMatchObject({ id: '9', url: 'https://cdn/9.mp4', source: 'pexels' });
  });
});

describe('importFootage', () => {
  it('downloads a clip into the project as a video asset', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { 'content-type': 'video/mp4' } }));
    const svc = buildServices({ fetchFn });
    const pid = await newProjectId(svc);
    const r = await importFootage(svc, pid, { url: 'https://cdn/clip.mp4', query: 'ocean', source: 'pexels' });
    expect(r.status).toBe(200);
    const asset = (r.body as { asset: { id: string; type: string; provider: string; params: { importedFrom?: string } } }).asset;
    expect(asset.type).toBe('video');
    expect(asset.provider).toBe('footage');
    expect(asset.params.importedFrom).toBe('https://cdn/clip.mp4');
    // the asset really exists and is listed for the project
    const stored = await svc.assets.get(asset.id);
    expect(stored).toBeTruthy();
  });

  it('400s on a non-http url', async () => {
    const svc = buildServices({ fetchFn: vi.fn(async (..._a: Parameters<typeof fetch>) => json({})) });
    const pid = await newProjectId(svc);
    const r = await importFootage(svc, pid, { url: 'ftp://nope' });
    expect(r.status).toBe(400);
  });

  it('404s for an unknown project', async () => {
    const svc = buildServices({ fetchFn: vi.fn(async (..._a: Parameters<typeof fetch>) => json({})) });
    const r = await importFootage(svc, 'nope', { url: 'https://cdn/clip.mp4' });
    expect(r.status).toBe(404);
  });
});

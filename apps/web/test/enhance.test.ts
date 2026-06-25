import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, uploadAsset, enhanceAsset } from '../lib/api';

const savedBase = process.env.FORGECAST_BASE_URL;
afterEach(() => {
  if (savedBase === undefined) delete process.env.FORGECAST_BASE_URL;
  else process.env.FORGECAST_BASE_URL = savedBase;
});

async function setup(fetchFn?: typeof fetch) {
  const svc = buildServices({ falKey: 'k', fetchFn });
  const created = await createProject(svc, { name: 'EnhanceTest' });
  const pid = (created.body as { project: { id: string } }).project.id;
  return { svc, pid };
}

async function createImageAsset(svc: ReturnType<typeof buildServices>, pid: string) {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const r = await uploadAsset(svc, pid, { bytes, contentType: 'image/png', filename: 'src.png' });
  return (r.body as { asset: { id: string } }).asset.id;
}

describe('api: enhanceAsset', () => {
  it('returns 404 for missing project', async () => {
    process.env.FORGECAST_BASE_URL = 'http://localhost:3000';
    const svc = buildServices({ falKey: 'k' });
    const r = await enhanceAsset(svc, 'nope', { assetId: 'any' });
    expect(r.status).toBe(404);
  });

  it('returns 400 when assetId is missing', async () => {
    process.env.FORGECAST_BASE_URL = 'http://localhost:3000';
    const { svc, pid } = await setup();
    const r = await enhanceAsset(svc, pid, {});
    expect(r.status).toBe(400);
  });

  it('returns 404 when asset does not exist', async () => {
    process.env.FORGECAST_BASE_URL = 'http://localhost:3000';
    const { svc, pid } = await setup();
    const r = await enhanceAsset(svc, pid, { assetId: 'ghost' });
    expect(r.status).toBe(404);
  });

  it('returns 400 when asset is not an image', async () => {
    process.env.FORGECAST_BASE_URL = 'http://localhost:3000';
    // Create a video asset via upload
    const svc = buildServices({ falKey: 'k' });
    const created = await createProject(svc, { name: 'VidTest' });
    const pid = (created.body as { project: { id: string } }).project.id;
    const up = await uploadAsset(svc, pid, { bytes: new Uint8Array([1, 2, 3, 4]), contentType: 'video/mp4', filename: 'v.mp4' });
    const videoAssetId = (up.body as { asset: { id: string } }).asset.id;
    const r = await enhanceAsset(svc, pid, { assetId: videoAssetId });
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toBe('only image assets can be enhanced');
  });

  it('returns 503 when FORGECAST_BASE_URL is not set', async () => {
    delete process.env.FORGECAST_BASE_URL;
    const { svc, pid } = await setup();
    const assetId = await createImageAsset(svc, pid);
    const r = await enhanceAsset(svc, pid, { assetId });
    expect(r.status).toBe(503);
    expect((r.body as { error: string }).error).toMatch(/FORGECAST_BASE_URL/);
  });

  it('returns 200 with enhanced image asset when fal provider is configured', async () => {
    process.env.FORGECAST_BASE_URL = 'http://localhost:3000';

    // fetchFn handles two calls:
    // 1. POST to fal.run/fal-ai/clarity-upscaler → returns single {image:{url}} shape
    // 2. GET the image download URL → returns image bytes
    const falResponseUrl = 'https://cdn.fal/enhanced.png';
    const imageBytes = new Uint8Array([10, 20, 30, 40]);

    const fetchFn = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const u = String(url);
      if (u.includes('fal.run')) {
        // upscaler returns single image object
        return new Response(JSON.stringify({ image: { url: falResponseUrl, width: 2048, height: 2048 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // download the enhanced image
      return new Response(imageBytes, { status: 200, headers: { 'content-type': 'image/png' } });
    });

    const svc = buildServices({ falKey: 'k', fetchFn });
    const created = await createProject(svc, { name: 'EnhTest' });
    const pid = (created.body as { project: { id: string } }).project.id;
    const assetId = await createImageAsset(svc, pid);

    const r = await enhanceAsset(svc, pid, { assetId });
    expect(r.status).toBe(200);
    const body = r.body as { job: { status: string }; asset: { type: string; provider: string; params: Record<string, unknown> } };
    expect(body.job.status).toBe('done');
    expect(body.asset.type).toBe('image');
    expect(body.asset.provider).toBe('enhance');
    expect(body.asset.params.enhanced).toBe(true);
    expect(body.asset.params.sourceAssetId).toBe(assetId);
  });
});

import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, uploadAsset, getAsset, generateVariations } from '../lib/api';

const savedBase = process.env.FORGECAST_BASE_URL;
afterEach(() => {
  if (savedBase === undefined) delete process.env.FORGECAST_BASE_URL;
  else process.env.FORGECAST_BASE_URL = savedBase;
});

async function setup(fetchFn?: typeof fetch) {
  const svc = buildServices({ falKey: 'k', fetchFn });
  const created = await createProject(svc, { name: 'EditorTest' });
  const pid = (created.body as { project: { id: string } }).project.id;
  return { svc, pid };
}

async function createImageAsset(svc: ReturnType<typeof buildServices>, pid: string) {
  const r = await uploadAsset(svc, pid, { bytes: new Uint8Array([1, 2, 3, 4]), contentType: 'image/png', filename: 'src.png' });
  return (r.body as { asset: { id: string } }).asset.id;
}

describe('api: getAsset', () => {
  it('returns 404 for a missing asset', async () => {
    const { svc } = await setup();
    const r = await getAsset(svc, 'ghost');
    expect(r.status).toBe(404);
  });

  it('returns the asset metadata incl. projectId', async () => {
    const { svc, pid } = await setup();
    const assetId = await createImageAsset(svc, pid);
    const r = await getAsset(svc, assetId);
    expect(r.status).toBe(200);
    const asset = (r.body as { asset: { id: string; projectId: string; type: string } }).asset;
    expect(asset.id).toBe(assetId);
    expect(asset.projectId).toBe(pid);
    expect(asset.type).toBe('image');
  });
});

describe('api: generateVariations', () => {
  it('returns 400 when assetId is missing', async () => {
    const { svc, pid } = await setup();
    const r = await generateVariations(svc, pid, {});
    expect(r.status).toBe(400);
  });

  it('returns 400 when the asset is not an image', async () => {
    const { svc, pid } = await setup();
    const up = await uploadAsset(svc, pid, { bytes: new Uint8Array([1, 2, 3, 4]), contentType: 'video/mp4' });
    const videoId = (up.body as { asset: { id: string } }).asset.id;
    const r = await generateVariations(svc, pid, { assetId: videoId });
    expect(r.status).toBe(400);
  });

  it('produces N variation assets (clamped) using data-URI source when no base URL', async () => {
    delete process.env.FORGECAST_BASE_URL;
    let falCalls = 0;
    let sawDataUri = false;
    const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('fal.run')) {
        falCalls++;
        const imageUrl = (JSON.parse(String(init?.body)) as { image_url?: unknown }).image_url;
        if (typeof imageUrl === 'string' && imageUrl.startsWith('data:image/')) sawDataUri = true;
        return new Response(JSON.stringify({ images: [{ url: 'https://cdn.fal/var.png' }] }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(new Uint8Array([5, 5, 5, 5]), { status: 200, headers: { 'content-type': 'image/png' } });
    });

    const { svc, pid } = await setup(fetchFn);
    const assetId = await createImageAsset(svc, pid);
    const r = await generateVariations(svc, pid, { assetId, count: 2 });

    expect(r.status).toBe(200);
    const assets = (r.body as { assets: { id: string; provider: string }[] }).assets;
    expect(assets).toHaveLength(2);
    expect(falCalls).toBe(2);
    expect(sawDataUri).toBe(true);
  });
});

import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, uploadAsset, removeBackgroundAsset } from '../lib/api';

const savedBase = process.env.FORGECAST_BASE_URL;
afterEach(() => {
  if (savedBase === undefined) delete process.env.FORGECAST_BASE_URL;
  else process.env.FORGECAST_BASE_URL = savedBase;
});

async function setup(fetchFn?: typeof fetch) {
  const svc = buildServices({ falKey: 'k', fetchFn });
  const created = await createProject(svc, { name: 'CutoutTest' });
  const pid = (created.body as { project: { id: string } }).project.id;
  return { svc, pid };
}

async function createImageAsset(svc: ReturnType<typeof buildServices>, pid: string) {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const r = await uploadAsset(svc, pid, { bytes, contentType: 'image/png', filename: 'src.png' });
  return (r.body as { asset: { id: string } }).asset.id;
}

describe('api: removeBackgroundAsset', () => {
  it('returns 404 for missing project', async () => {
    process.env.FORGECAST_BASE_URL = 'http://localhost:3000';
    const svc = buildServices({ falKey: 'k' });
    const r = await removeBackgroundAsset(svc, 'nope', { assetId: 'any' });
    expect(r.status).toBe(404);
  });

  it('returns 400 when assetId is missing', async () => {
    const { svc, pid } = await setup();
    const r = await removeBackgroundAsset(svc, pid, {});
    expect(r.status).toBe(400);
  });

  it('returns 400 when asset is not an image', async () => {
    const svc = buildServices({ falKey: 'k' });
    const created = await createProject(svc, { name: 'VidTest' });
    const pid = (created.body as { project: { id: string } }).project.id;
    const up = await uploadAsset(svc, pid, { bytes: new Uint8Array([1, 2, 3, 4]), contentType: 'video/mp4', filename: 'v.mp4' });
    const videoAssetId = (up.body as { asset: { id: string } }).asset.id;
    const r = await removeBackgroundAsset(svc, pid, { assetId: videoAssetId });
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toMatch(/only image assets/);
  });

  it('returns 503 when fal is not configured', async () => {
    const svc = buildServices({ falKey: undefined });
    const created = await createProject(svc, { name: 'NoFal' });
    const pid = (created.body as { project: { id: string } }).project.id;
    // no image provider available → upload still works (storage), cutout 503s
    const up = await uploadAsset(svc, pid, { bytes: new Uint8Array([1, 2, 3, 4]), contentType: 'image/png' });
    const assetId = (up.body as { asset: { id: string } }).asset.id;
    const r = await removeBackgroundAsset(svc, pid, { assetId });
    expect(r.status).toBe(503);
  });

  it('produces a cutout image asset and sends fal a data URI when no base URL', async () => {
    delete process.env.FORGECAST_BASE_URL;

    let sentImageUrl: unknown;
    const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('fal.run')) {
        sentImageUrl = (JSON.parse(String(init?.body)) as { image_url?: unknown }).image_url;
        // birefnet returns a single transparent image
        return new Response(JSON.stringify({ image: { url: 'https://cdn.fal/cutout.png' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(new Uint8Array([7, 7, 7, 7]), { status: 200, headers: { 'content-type': 'image/png' } });
    });

    const { svc, pid } = await setup(fetchFn);
    const assetId = await createImageAsset(svc, pid);
    const r = await removeBackgroundAsset(svc, pid, { assetId });

    expect(r.status).toBe(200);
    expect(String(sentImageUrl)).toMatch(/^data:image\/png;base64,/);
    const body = r.body as { job: { status: string }; asset: { type: string; provider: string; params: Record<string, unknown> } };
    expect(body.job.status).toBe('done');
    expect(body.asset.type).toBe('image');
    expect(body.asset.provider).toBe('cutout');
    expect(body.asset.params.cutout).toBe(true);
    expect(body.asset.params.sourceAssetId).toBe(assetId);
  });
});

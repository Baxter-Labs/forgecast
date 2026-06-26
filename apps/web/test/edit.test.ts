import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, uploadAsset, editAsset } from '../lib/api';

const savedBase = process.env.FORGECAST_BASE_URL;
afterEach(() => {
  if (savedBase === undefined) delete process.env.FORGECAST_BASE_URL;
  else process.env.FORGECAST_BASE_URL = savedBase;
});

async function setup(fetchFn?: typeof fetch) {
  const svc = buildServices({ falKey: 'k', fetchFn });
  const created = await createProject(svc, { name: 'EditTest' });
  const pid = (created.body as { project: { id: string } }).project.id;
  return { svc, pid };
}

async function createImageAsset(svc: ReturnType<typeof buildServices>, pid: string) {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const r = await uploadAsset(svc, pid, { bytes, contentType: 'image/png', filename: 'src.png' });
  return (r.body as { asset: { id: string } }).asset.id;
}

describe('api: editAsset', () => {
  it('returns 404 for missing project', async () => {
    process.env.FORGECAST_BASE_URL = 'http://localhost:3000';
    const svc = buildServices({ falKey: 'k' });
    const r = await editAsset(svc, 'nope', { assetId: 'any', prompt: 'make it blue' });
    expect(r.status).toBe(404);
  });

  it('returns 400 when assetId is missing', async () => {
    process.env.FORGECAST_BASE_URL = 'http://localhost:3000';
    const { svc, pid } = await setup();
    const r = await editAsset(svc, pid, { prompt: 'make it blue' });
    expect(r.status).toBe(400);
  });

  it('returns 404 when asset does not exist', async () => {
    process.env.FORGECAST_BASE_URL = 'http://localhost:3000';
    const { svc, pid } = await setup();
    const r = await editAsset(svc, pid, { assetId: 'ghost', prompt: 'make it blue' });
    expect(r.status).toBe(404);
  });

  it('returns 400 when asset is not an image', async () => {
    process.env.FORGECAST_BASE_URL = 'http://localhost:3000';
    const svc = buildServices({ falKey: 'k' });
    const created = await createProject(svc, { name: 'VidTest' });
    const pid = (created.body as { project: { id: string } }).project.id;
    const up = await uploadAsset(svc, pid, { bytes: new Uint8Array([1, 2, 3, 4]), contentType: 'video/mp4', filename: 'v.mp4' });
    const videoAssetId = (up.body as { asset: { id: string } }).asset.id;
    const r = await editAsset(svc, pid, { assetId: videoAssetId, prompt: 'make it blue' });
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toBe('only image assets can be edited');
  });

  it('returns 400 when prompt is missing', async () => {
    process.env.FORGECAST_BASE_URL = 'http://localhost:3000';
    const { svc, pid } = await setup();
    const assetId = await createImageAsset(svc, pid);
    const r = await editAsset(svc, pid, { assetId });
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toBe('an edit instruction (prompt) is required');
  });

  it('returns 400 when prompt is an empty string', async () => {
    process.env.FORGECAST_BASE_URL = 'http://localhost:3000';
    const { svc, pid } = await setup();
    const assetId = await createImageAsset(svc, pid);
    const r = await editAsset(svc, pid, { assetId, prompt: '   ' });
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toBe('an edit instruction (prompt) is required');
  });

  it('works without FORGECAST_BASE_URL by inlining the source as a data URI', async () => {
    delete process.env.FORGECAST_BASE_URL;

    let sentImageUrl: unknown;
    const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('fal.run')) {
        sentImageUrl = (JSON.parse(String(init?.body)) as { image_url?: unknown }).image_url;
        return new Response(JSON.stringify({ images: [{ url: 'https://cdn.fal/edited.png' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(new Uint8Array([9, 9, 9, 9]), { status: 200, headers: { 'content-type': 'image/png' } });
    });

    const { svc, pid } = await setup(fetchFn);
    const assetId = await createImageAsset(svc, pid);
    const r = await editAsset(svc, pid, { assetId, prompt: 'make it blue' });

    expect(r.status).toBe(200);
    expect(String(sentImageUrl)).toMatch(/^data:image\/png;base64,/);
    const body = r.body as { job: { status: string }; asset: { provider: string } };
    expect(body.job.status).toBe('done');
    expect(body.asset.provider).toBe('edit');
  });

  it('returns 200 with edited image asset when fal provider is configured', async () => {
    process.env.FORGECAST_BASE_URL = 'http://localhost:3000';

    // fetchFn handles two calls:
    // 1. POST to fal.run/fal-ai/flux-kontext/dev → returns {images:[{url}]} shape
    // 2. GET the image download URL → returns image bytes
    const falResponseUrl = 'https://cdn.fal/edited.png';
    const imageBytes = new Uint8Array([10, 20, 30, 40]);

    const fetchFn = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const u = String(url);
      if (u.includes('fal.run')) {
        return new Response(JSON.stringify({ images: [{ url: falResponseUrl, width: 1024, height: 1024 }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // download the edited image
      return new Response(imageBytes, { status: 200, headers: { 'content-type': 'image/png' } });
    });

    const svc = buildServices({ falKey: 'k', fetchFn });
    const created = await createProject(svc, { name: 'EditTest200' });
    const pid = (created.body as { project: { id: string } }).project.id;
    const assetId = await createImageAsset(svc, pid);

    const r = await editAsset(svc, pid, { assetId, prompt: 'make the background a sunset' });
    expect(r.status).toBe(200);
    const body = r.body as { job: { status: string }; asset: { type: string; provider: string; params: Record<string, unknown> } };
    expect(body.job.status).toBe('done');
    expect(body.asset.type).toBe('image');
    expect(body.asset.provider).toBe('edit');
    expect(body.asset.params.edited).toBe(true);
    expect(body.asset.params.sourceAssetId).toBe(assetId);
    expect(body.asset.params.prompt).toBe('make the background a sunset');
  });
});

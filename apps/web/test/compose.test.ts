import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, generateImage, generateMontage } from '../lib/api';
import type { ImageProvider } from '@forgecast/core';

// Save / restore env
const savedBase = process.env.FORGECAST_BASE_URL;
const savedWorker = process.env.MONTAGE_WORKER_URL;
afterEach(() => {
  if (savedBase === undefined) delete process.env.FORGECAST_BASE_URL;
  else process.env.FORGECAST_BASE_URL = savedBase;
  if (savedWorker === undefined) delete process.env.MONTAGE_WORKER_URL;
  else process.env.MONTAGE_WORKER_URL = savedWorker;
});

function fakeImageProvider(): ImageProvider {
  return {
    name: 'fal',
    isAvailable: () => true,
    async generateImage(input) {
      return { url: `https://cdn/${encodeURIComponent(input.prompt)}.png` };
    },
  };
}

/** Build a services instance pre-wired with an image provider and a fetch stub */
function makeServices() {
  const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
    new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } }),
  );
  const svc = buildServices({ falKey: 'k', fetchFn });
  svc.imageRegistry.register(fakeImageProvider());
  return svc;
}

/** Create a project and seed it with an image asset; return projectId + assetId */
async function seedProject(svc: ReturnType<typeof buildServices>) {
  const pc = await createProject(svc, { name: 'Compose Test' });
  const projectId = (pc.body as { project: { id: string } }).project.id;

  const gen = await generateImage(svc, projectId, { prompt: 'a forge', width: 512, height: 512 });
  const assetId = (gen.body as { asset: { id: string } }).asset.id;

  return { projectId, assetId };
}

describe('api: compose video — durationSec wiring', () => {
  it('builds a spec whose scenes use the provided durationSec', async () => {
    process.env.FORGECAST_BASE_URL = 'http://localhost:3000';
    // montageAvailable is always true in in-process mode (bundled ffmpeg path)
    delete process.env.MONTAGE_WORKER_URL;

    const svc = makeServices();
    const { projectId, assetId } = await seedProject(svc);

    const r = await generateMontage(svc, projectId, { assetIds: [assetId], durationSec: 3 });
    expect(r.status).toBe(202);

    const body = r.body as { job: { params: { spec: { scenes: { durationSec: number }[] } } } };
    const scenes = body.job.params.spec.scenes;
    expect(scenes.length).toBeGreaterThan(0);
    for (const scene of scenes) {
      expect(scene.durationSec).toBe(3);
    }
  });

  it('defaults to durationSec 4 when not provided', async () => {
    process.env.FORGECAST_BASE_URL = 'http://localhost:3000';
    delete process.env.MONTAGE_WORKER_URL;

    const svc = makeServices();
    const { projectId, assetId } = await seedProject(svc);

    const r = await generateMontage(svc, projectId, { assetIds: [assetId] });
    expect(r.status).toBe(202);

    const body = r.body as { job: { params: { spec: { scenes: { durationSec: number }[] } } } };
    const scenes = body.job.params.spec.scenes;
    expect(scenes[0]?.durationSec).toBe(4);
  });

  it('clamps durationSec > 10 to 10', async () => {
    process.env.FORGECAST_BASE_URL = 'http://localhost:3000';
    delete process.env.MONTAGE_WORKER_URL;

    const svc = makeServices();
    const { projectId, assetId } = await seedProject(svc);

    const r = await generateMontage(svc, projectId, { assetIds: [assetId], durationSec: 99 });
    expect(r.status).toBe(202);

    const body = r.body as { job: { params: { spec: { scenes: { durationSec: number }[] } } } };
    expect(body.job.params.spec.scenes[0]?.durationSec).toBe(10);
  });

  it('clamps durationSec < 1 to 1', async () => {
    process.env.FORGECAST_BASE_URL = 'http://localhost:3000';
    delete process.env.MONTAGE_WORKER_URL;

    const svc = makeServices();
    const { projectId, assetId } = await seedProject(svc);

    const r = await generateMontage(svc, projectId, { assetIds: [assetId], durationSec: 0 });
    expect(r.status).toBe(202);

    const body = r.body as { job: { params: { spec: { scenes: { durationSec: number }[] } } } };
    expect(body.job.params.spec.scenes[0]?.durationSec).toBe(1);
  });
});

import { describe, it, expect, vi } from 'vitest';
import type { ImageProvider } from '@forgecast/core';
import { buildServices } from '../lib/forgecast';
import { createProject, listProjects, generateImage, getJob, listAssets, getAssetBytes, clearAssets } from '../lib/api';
import { checkContentGuard } from '../lib/content-guard';

function fakeProvider(): ImageProvider {
  return {
    name: 'fal',
    isAvailable: () => true,
    async generateImage(input) {
      return { url: `https://cdn/${encodeURIComponent(input.prompt)}.png` };
    },
  };
}

function services() {
  const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
    new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } }),
  );
  const svc = buildServices({ falKey: 'k', fetchFn });
  svc.imageRegistry.register(fakeProvider());
  return svc;
}

describe('api: projects', () => {
  it('creates and lists projects', async () => {
    const svc = services();
    const created = await createProject(svc, { name: 'Demo' });
    expect(created.status).toBe(201);
    expect((created.body as { project: { id: string } }).project.id).toBeTruthy();

    const listed = await listProjects(svc);
    expect(listed.status).toBe(200);
    expect((listed.body as { projects: unknown[] }).projects).toHaveLength(1);
  });

  it('rejects a project without a name', async () => {
    const r = await createProject(services(), {});
    expect(r.status).toBe(400);
  });
});

describe('api: generate', () => {
  it('generates an image end-to-end and returns a done job + asset', async () => {
    const svc = services();
    const created = await createProject(svc, { name: 'P' });
    const projectId = (created.body as { project: { id: string } }).project.id;

    const r = await generateImage(svc, projectId, { prompt: 'a fox', width: 512, height: 512 });
    expect(r.status).toBe(200);
    const body = r.body as { job: { id: string; status: string }; asset: unknown };
    expect(body.job.status).toBe('done');
    expect(body.asset).toBeTruthy();

    const assets = await listAssets(svc, projectId);
    expect((assets.body as { assets: unknown[] }).assets).toHaveLength(1);

    const jobRes = await getJob(svc, body.job.id);
    expect((jobRes.body as { job: { status: string } }).job.status).toBe('done');
  });

  it('404 when generating on a missing project', async () => {
    const r = await generateImage(services(), 'nope', { prompt: 'x' });
    expect(r.status).toBe(404);
  });

  it('400 when generating without a prompt', async () => {
    const svc = services();
    const created = await createProject(svc, { name: 'P' });
    const projectId = (created.body as { project: { id: string } }).project.id;
    const r = await generateImage(svc, projectId, {});
    expect(r.status).toBe(400);
  });

  it('404 for an unknown job', async () => {
    const r = await getJob(services(), 'nope');
    expect(r.status).toBe(404);
  });
});

describe('api: asset bytes', () => {
  it('returns stored bytes for a generated asset, null for unknown', async () => {
    const svc = services();
    const created = await createProject(svc, { name: 'P' });
    const projectId = (created.body as { project: { id: string } }).project.id;
    const gen = await generateImage(svc, projectId, { prompt: 'a fox' });
    const assetId = (gen.body as { asset: { id: string } }).asset.id;

    const bytes = await getAssetBytes(svc, assetId);
    expect(bytes?.contentType).toBe('image/png');
    expect(bytes?.data.length).toBeGreaterThan(0);

    expect(await getAssetBytes(svc, 'nope')).toBeNull();
  });
});

describe('api: content guard', () => {
  it('blocks explicit terms', () => {
    expect(checkContentGuard('generate a nude woman').allowed).toBe(false);
    expect(checkContentGuard('nsfw content please').allowed).toBe(false);
    expect(checkContentGuard('show me porn').allowed).toBe(false);
    expect(checkContentGuard('mass shooting scene').allowed).toBe(false);
    expect(checkContentGuard('a deepfake video').allowed).toBe(false);
  });

  it('does NOT false-positive on legitimate prompts', () => {
    expect(checkContentGuard('Historical category of Byzantine art').allowed).toBe(true);
    expect(checkContentGuard('Ashkenazi Jewish traditions').allowed).toBe(true);
    expect(checkContentGuard('Al Gore climate speech').allowed).toBe(true);
    expect(checkContentGuard('VIP was escorted to the venue').allowed).toBe(true);
    expect(checkContentGuard('Asexual reproduction in plants').allowed).toBe(true);
    expect(checkContentGuard('A gorgeous sunset over the ocean').allowed).toBe(true);
    expect(checkContentGuard('The category winner was announced').allowed).toBe(true);
  });

  it('allows empty and whitespace-only prompts', () => {
    expect(checkContentGuard('').allowed).toBe(true);
    expect(checkContentGuard('   ').allowed).toBe(true);
  });

  it('rejects explicit prompts at the API level with 400', async () => {
    const svc = services();
    const created = await createProject(svc, { name: 'P' });
    const projectId = (created.body as { project: { id: string } }).project.id;
    const r = await generateImage(svc, projectId, { prompt: 'generate nude photo' });
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toContain('explicit');
  });
});

describe('api: clearAssets', () => {
  it('deletes all project assets and storage blobs', async () => {
    const svc = services();
    const created = await createProject(svc, { name: 'P' });
    const projectId = (created.body as { project: { id: string } }).project.id;

    await generateImage(svc, projectId, { prompt: 'a fox' });
    await generateImage(svc, projectId, { prompt: 'a cat' });

    let assets = await listAssets(svc, projectId);
    expect((assets.body as { assets: unknown[] }).assets).toHaveLength(2);

    const r = await clearAssets(svc, projectId);
    expect(r.status).toBe(200);
    expect((r.body as { cleared: boolean }).cleared).toBe(true);

    assets = await listAssets(svc, projectId);
    expect((assets.body as { assets: unknown[] }).assets).toHaveLength(0);
  });

  it('404 for unknown project', async () => {
    const r = await clearAssets(services(), 'nope');
    expect(r.status).toBe(404);
  });
});

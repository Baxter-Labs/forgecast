import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, generateMontage } from '../lib/api';

const saved = process.env.MONTAGE_WORKER_URL;
afterEach(() => { if (saved === undefined) delete process.env.MONTAGE_WORKER_URL; else process.env.MONTAGE_WORKER_URL = saved; });

async function project(svc: ReturnType<typeof buildServices>) {
  const c = await createProject(svc, { name: 'P' });
  return (c.body as { project: { id: string } }).project.id;
}
const spec = { scenes: [{ url: 'https://x/a.png', kind: 'image' as const, durationSec: 3 }], aspectRatio: '9:16' };

describe('api: generate montage', () => {
  it('202 with no worker configured — falls back to in-process ffmpeg', async () => {
    delete process.env.MONTAGE_WORKER_URL;
    const svc = buildServices({ falKey: 'k', fetchFn: vi.fn(async () => new Response('{}', { status: 200 })) });
    const r = await generateMontage(svc, await project(svc), { spec });
    expect(r.status).toBe(202);
  });

  it('400 without spec or assetIds', async () => {
    process.env.MONTAGE_WORKER_URL = 'http://montage';
    const svc = buildServices({ falKey: 'k', fetchFn: vi.fn(async () => new Response('{}', { status: 200 })) });
    expect((await generateMontage(svc, await project(svc), {})).status).toBe(400);
  });

  it('202 queued montage job with an explicit spec', async () => {
    process.env.MONTAGE_WORKER_URL = 'http://montage';
    const svc = buildServices({ falKey: 'k', fetchFn: vi.fn(async () => new Response('{}', { status: 200 })) });
    const r = await generateMontage(svc, await project(svc), { spec });
    expect(r.status).toBe(202);
    const body = r.body as { job: { kind: string; status: string } };
    expect(body.job.kind).toBe('montage');
    expect(body.job.status).toBe('queued');
  });
});

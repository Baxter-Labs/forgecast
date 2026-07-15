import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, generateMontage, getJob } from '../lib/api';

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

  it('202 running when a remote worker is configured (submit → client polls)', async () => {
    process.env.MONTAGE_WORKER_URL = 'http://montage';
    const svc = buildServices({ falKey: 'k', fetchFn: vi.fn(async () => new Response(JSON.stringify({ taskId: 't1' }), { status: 200 })) });
    const r = await generateMontage(svc, await project(svc), { spec });
    expect(r.status).toBe(202);
    const body = r.body as { job: { kind: string; status: string } };
    expect(body.job.kind).toBe('montage');
    expect(body.job.status).toBe('running');
  });

  it('completes via client polling: submit → getJob advances → stores the video asset', async () => {
    process.env.MONTAGE_WORKER_URL = 'http://montage';
    const fetchFn = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      const u = String(url);
      if (u === 'http://montage/render') return new Response(JSON.stringify({ taskId: 't1' }), { status: 200 });
      if (u === 'http://montage/render/t1') return new Response(JSON.stringify({ state: 'complete', videoUrl: 'http://montage/files/t1.mp4' }), { status: 200 });
      if (u === 'http://montage/files/t1.mp4') return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const svc = buildServices({ falKey: 'k', fetchFn });
    const pid = await project(svc);
    const submit = await generateMontage(svc, pid, { spec });
    const jobId = (submit.body as { job: { id: string } }).job.id;
    const done = await getJob(svc, jobId);
    const job = (done.body as { job: { status: string; resultAssetId?: string } }).job;
    expect(job.status).toBe('done');
    expect(job.resultAssetId).toBeTruthy();
  });
});

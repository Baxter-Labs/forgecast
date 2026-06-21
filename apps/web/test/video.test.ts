import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, generateShortVideo, generateVideo, getJob } from '../lib/api';

const saved = process.env.FORGECAST_VIDEO_WORKER_URL;
const savedVideoKey = process.env.FAL_KEY_VIDEO;
afterEach(() => {
  if (saved === undefined) delete process.env.FORGECAST_VIDEO_WORKER_URL;
  else process.env.FORGECAST_VIDEO_WORKER_URL = saved;
  if (savedVideoKey === undefined) delete process.env.FAL_KEY_VIDEO;
  else process.env.FAL_KEY_VIDEO = savedVideoKey;
});

async function projectId() {
  const svc = buildServices({ falKey: 'k' });
  const created = await createProject(svc, { name: 'P' });
  return { svc, pid: (created.body as { project: { id: string } }).project.id };
}

describe('api: short video', () => {
  it('503 when no video worker is configured', async () => {
    delete process.env.FORGECAST_VIDEO_WORKER_URL;
    const { svc, pid } = await projectId();
    const r = await generateShortVideo(svc, pid, { subject: 'cats' });
    expect(r.status).toBe(503);
  });

  it('accepts a short-video job (202, kind short_video, queued) when worker configured', async () => {
    process.env.FORGECAST_VIDEO_WORKER_URL = 'http://localhost:1';
    const { svc, pid } = await projectId();
    const r = await generateShortVideo(svc, pid, { subject: 'cats in space' });
    expect(r.status).toBe(202);
    const body = r.body as { job: { kind: string; status: string } };
    expect(body.job.kind).toBe('short_video');
    expect(body.job.status).toBe('queued');
  });

  it('400 without a subject', async () => {
    process.env.FORGECAST_VIDEO_WORKER_URL = 'http://localhost:1';
    const { svc, pid } = await projectId();
    const r = await generateShortVideo(svc, pid, {});
    expect(r.status).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Generate video — fal.ai via FAL_KEY_VIDEO
// ──────────────────────────────────────────────────────────────────────────────

async function project(svc: ReturnType<typeof buildServices>) {
  const created = await createProject(svc, { name: 'P' });
  return (created.body as { project: { id: string } }).project.id;
}

describe('api: generate video', () => {
  it('503 when FAL_KEY_VIDEO is not set', async () => {
    delete process.env.FAL_KEY_VIDEO;
    const svc = buildServices({ falVideoKey: undefined });
    const pid = await project(svc);
    expect((await generateVideo(svc, pid, { prompt: 'x' })).status).toBe(503);
  });

  it('queues a video job via fal when FAL_KEY_VIDEO is set', async () => {
    const svc = buildServices({ falVideoKey: 'k', fetchFn: vi.fn(async () => new Response('{}', { status: 200 })) });
    const pid = await project(svc);
    const r = await generateVideo(svc, pid, { prompt: 'a fox', aspectRatio: '9:16' });
    expect(r.status).toBe(202);
    const body = r.body as { job: { kind: string; status: string; provider: string } };
    expect(body.job.kind).toBe('video');
    expect(body.job.provider).toBe('fal-video');
  });

  it('400 without a prompt', async () => {
    const svc = buildServices({ falVideoKey: 'k', fetchFn: vi.fn(async () => new Response('{}', { status: 200 })) });
    const pid = await project(svc);
    expect((await generateVideo(svc, pid, {})).status).toBe(400);
  });

  it('submits synchronously then completes via a job poll (no background task)', async () => {
    const responseUrl = 'https://queue.fal.run/fal-ai/wan/requests/abc';
    const providerFetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith('/status')) return new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 });
      if (u === responseUrl) return new Response(JSON.stringify({ video: { url: 'https://cdn.example/v.mp4' } }), { status: 200 });
      return new Response(JSON.stringify({ request_id: 'abc', response_url: responseUrl }), { status: 200 });
    });
    const svc = buildServices({ falVideoKey: 'k', fetchFn: providerFetch as unknown as typeof fetch });
    const pid = await project(svc);

    const start = await generateVideo(svc, pid, { prompt: 'a fox', aspectRatio: '9:16' });
    expect(start.status).toBe(202);
    const startJob = (start.body as { job: { id: string; status: string } }).job;
    expect(startJob.status).toBe('running');

    // The video bytes are fetched with the global fetch in advanceVideoJob.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 })));
    const done = await getJob(svc, startJob.id);
    vi.unstubAllGlobals();

    const doneJob = (done.body as { job: { status: string; resultAssetId?: string } }).job;
    expect(doneJob.status).toBe('done');
    expect(doneJob.resultAssetId).toBeTruthy();
    const asset = await svc.assets.get(doneJob.resultAssetId as string);
    expect(asset?.type).toBe('video');
    expect((asset?.params as Record<string, unknown>).__videoTaskId).toBeUndefined();
  });
});

import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, generateShortVideo, generateVideo } from '../lib/api';

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
});

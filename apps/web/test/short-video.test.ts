import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, generateShortVideo } from '../lib/api';

const saved = process.env.FORGECAST_VIDEO_WORKER_URL;
beforeAll(() => { process.env.FORGECAST_VIDEO_WORKER_URL = 'http://worker:8080'; });
afterAll(() => {
  if (saved === undefined) delete process.env.FORGECAST_VIDEO_WORKER_URL;
  else process.env.FORGECAST_VIDEO_WORKER_URL = saved;
});

/** A fetch stub that drives the MoneyPrinter worker endpoints to completion. */
function makeServices() {
  const fetchFn = vi.fn(async (...a: Parameters<typeof fetch>) => {
    const url = String(a[0]);
    if (url.endsWith('/api/v1/videos')) {
      return new Response(JSON.stringify({ data: { task_id: 't1' } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/api/v1/tasks/')) {
      return new Response(JSON.stringify({ data: { state: 1, progress: 100, combined_videos: ['http://worker:8080/x.mp4'] } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'video/mp4' } });
  });
  return buildServices({ fetchFn });
}

async function newProjectId(svc: ReturnType<typeof buildServices>): Promise<string> {
  const r = await createProject(svc, { name: 'Short Video Test' });
  return (r.body as { project: { id: string } }).project.id;
}

describe('generateShortVideo — options', () => {
  it('503s when no worker is configured', async () => {
    delete process.env.FORGECAST_VIDEO_WORKER_URL;
    const svc = buildServices({ fetchFn: vi.fn(async (..._a: Parameters<typeof fetch>) => new Response('', { status: 200 })) });
    const id = await newProjectId(svc);
    const r = await generateShortVideo(svc, id, { subject: 'x' });
    expect(r.status).toBe(503);
    process.env.FORGECAST_VIDEO_WORKER_URL = 'http://worker:8080';
  });

  it('sanitizes + clamps options and stores them on the job', async () => {
    const svc = makeServices();
    const id = await newProjectId(svc);
    const r = await generateShortVideo(svc, id, {
      subject: 'forge it',
      options: { aspect: '9:16', subtitles: true, count: 999, source: 'nope', fontSize: 64, paragraphs: 3, bogus: 'x' },
    });
    expect(r.status).toBe(202);
    const opts = (r.body as { job: { params: { options: Record<string, unknown> } } }).job.params.options;
    expect(opts.aspect).toBe('9:16');
    expect(opts.subtitles).toBe(true);
    expect(opts.count).toBe(10);            // clamped from 999 → max 10
    expect(opts.source).toBeUndefined();    // invalid enum dropped
    expect(opts.fontSize).toBe(64);
    expect(opts.paragraphs).toBe(3);
    expect(opts).not.toHaveProperty('bogus'); // unknown field dropped
  });

  it('400s without a subject', async () => {
    const svc = makeServices();
    const id = await newProjectId(svc);
    const r = await generateShortVideo(svc, id, { options: { aspect: '9:16' } });
    expect(r.status).toBe(400);
  });
});

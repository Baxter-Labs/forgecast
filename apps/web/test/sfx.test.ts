import { describe, it, expect, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, uploadAsset, generateSfx } from '../lib/api';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A fal queue mock: submit → COMPLETED status → scored video result → mp4 download. */
function falFetch() {
  return vi.fn(async (...a: Parameters<typeof fetch>) => {
    const url = String(a[0]);
    if (url === 'https://queue.fal.run/fal-ai/mmaudio-v2') {
      return json({ request_id: 'r1', response_url: 'https://queue.fal.run/fal-ai/mmaudio-v2/requests/r1' });
    }
    if (url.endsWith('/status')) return json({ status: 'COMPLETED' });
    if (url.endsWith('/requests/r1')) return json({ video: { url: 'https://cdn/scored.mp4' } });
    return new Response(new Uint8Array([9, 9, 9]), { status: 200, headers: { 'content-type': 'video/mp4' } });
  });
}

async function setup(fetchFn?: typeof fetch) {
  const svc = buildServices({ falVideoKey: 'k', fetchFn: fetchFn ?? falFetch() });
  const created = await createProject(svc, { name: 'SfxTest' });
  const pid = (created.body as { project: { id: string } }).project.id;
  return { svc, pid };
}

async function upload(svc: ReturnType<typeof buildServices>, pid: string, contentType: string, filename: string) {
  const r = await uploadAsset(svc, pid, { bytes: new Uint8Array([1, 2, 3, 4]), contentType, filename });
  return (r.body as { asset: { id: string } }).asset.id;
}

describe('api: generateSfx', () => {
  it('503s with fal-key guidance when SFX is not configured', async () => {
    const svc = buildServices({});
    const created = await createProject(svc, { name: 'NoKey' });
    const pid = (created.body as { project: { id: string } }).project.id;
    const r = await generateSfx(svc, pid, { videoAssetId: 'v', prompt: 'rain' });
    expect(r.status).toBe(503);
    expect((r.body as { error: string }).error).toContain('fal key');
  });

  it('404s for a missing project', async () => {
    const { svc } = await setup();
    const r = await generateSfx(svc, 'nope', { videoAssetId: 'v', prompt: 'rain' });
    expect(r.status).toBe(404);
  });

  it('validates the video asset (required, owned by the project, type video)', async () => {
    const { svc, pid } = await setup();
    expect((await generateSfx(svc, pid, { prompt: 'rain' })).status).toBe(400);
    expect((await generateSfx(svc, pid, { videoAssetId: 'ghost', prompt: 'rain' })).status).toBe(404);

    const imageId = await upload(svc, pid, 'image/png', 'a.png');
    expect((await generateSfx(svc, pid, { videoAssetId: imageId, prompt: 'rain' })).status).toBe(400);

    const other = await createProject(svc, { name: 'Other' });
    const otherPid = (other.body as { project: { id: string } }).project.id;
    const foreignVideo = await upload(svc, otherPid, 'video/mp4', 'v.mp4');
    expect((await generateSfx(svc, pid, { videoAssetId: foreignVideo, prompt: 'rain' })).status).toBe(404);
  });

  it('400s when the prompt is missing', async () => {
    const { svc, pid } = await setup();
    const videoId = await upload(svc, pid, 'video/mp4', 'v.mp4');
    const r = await generateSfx(svc, pid, { videoAssetId: videoId });
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toContain('prompt');
  });

  it('202s an sfx job with a resolved video url and the scored video lands as a new asset', async () => {
    const fetchFn = falFetch();
    const { svc, pid } = await setup(fetchFn);
    const videoId = await upload(svc, pid, 'video/mp4', 'v.mp4');

    const r = await generateSfx(svc, pid, { videoAssetId: videoId, prompt: 'rain on a tin roof', negativePrompt: 'music' });
    expect(r.status).toBe(202);
    const job = (r.body as { job: { id: string; kind: string; params: Record<string, unknown> } }).job;
    expect(job.kind).toBe('sfx');
    expect(job.params.videoAssetId).toBe(videoId);
    expect(job.params.prompt).toBe('rain on a tin roof');
    expect(job.params.negativePrompt).toBe('music');
    // Local dev has no public base URL → asset bytes are inlined as data: URIs.
    expect(String(job.params.videoUrl)).toMatch(/^data:video\/mp4;base64,/);

    // The background runner drives the mocked fal queue to completion.
    for (let i = 0; i < 50; i += 1) {
      const done = await svc.jobs.get(job.id);
      if (done?.status === 'done') {
        const asset = await svc.assets.get(done.resultAssetId!);
        expect(asset?.type).toBe('video');
        expect(asset?.provider).toBe('mmaudio-v2');
        // The submit payload used the fal contract field names.
        const submit = fetchFn.mock.calls.find((c) => String(c[0]) === 'https://queue.fal.run/fal-ai/mmaudio-v2');
        const parsed = JSON.parse((submit![1] as RequestInit).body as string);
        expect(parsed).toEqual({ video_url: job.params.videoUrl, prompt: 'rain on a tin roof', negative_prompt: 'music' });
        return;
      }
      if (done?.status === 'error') throw new Error(done.error ?? 'job failed');
      await new Promise((res) => setTimeout(res, 20));
    }
    throw new Error('sfx job did not complete in time');
  });
});

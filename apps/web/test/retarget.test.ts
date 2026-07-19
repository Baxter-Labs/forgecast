import { describe, it, expect, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, uploadAsset, generateRetarget } from '../lib/api';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A fal queue mock: submit → COMPLETED status → animated video result → mp4 download. */
function falFetch() {
  return vi.fn(async (...a: Parameters<typeof fetch>) => {
    const url = String(a[0]);
    if (url === 'https://queue.fal.run/fal-ai/wan-animate') {
      return json({ request_id: 'r1', response_url: 'https://queue.fal.run/fal-ai/wan-animate/requests/r1' });
    }
    if (url.endsWith('/status')) return json({ status: 'COMPLETED' });
    if (url.endsWith('/requests/r1')) return json({ video: { url: 'https://cdn/animated.mp4' } });
    return new Response(new Uint8Array([9, 9, 9]), { status: 200, headers: { 'content-type': 'video/mp4' } });
  });
}

async function setup(fetchFn?: typeof fetch) {
  const svc = buildServices({ falVideoKey: 'k', fetchFn: fetchFn ?? falFetch() });
  const created = await createProject(svc, { name: 'RetargetTest' });
  const pid = (created.body as { project: { id: string } }).project.id;
  return { svc, pid };
}

async function upload(svc: ReturnType<typeof buildServices>, pid: string, contentType: string, filename: string) {
  const r = await uploadAsset(svc, pid, { bytes: new Uint8Array([1, 2, 3, 4]), contentType, filename });
  return (r.body as { asset: { id: string } }).asset.id;
}

describe('api: generateRetarget', () => {
  it('503s with fal-key guidance when retarget is not configured', async () => {
    const svc = buildServices({});
    const created = await createProject(svc, { name: 'NoKey' });
    const pid = (created.body as { project: { id: string } }).project.id;
    const r = await generateRetarget(svc, pid, { imageAssetId: 'i', videoAssetId: 'v' });
    expect(r.status).toBe(503);
    expect((r.body as { error: string }).error).toContain('fal key');
  });

  it('404s for a missing project', async () => {
    const { svc } = await setup();
    const r = await generateRetarget(svc, 'nope', { imageAssetId: 'i', videoAssetId: 'v' });
    expect(r.status).toBe(404);
  });

  it('validates the image asset (required, owned by the project, type image)', async () => {
    const { svc, pid } = await setup();
    expect((await generateRetarget(svc, pid, { videoAssetId: 'v' })).status).toBe(400);
    expect((await generateRetarget(svc, pid, { imageAssetId: 'ghost', videoAssetId: 'v' })).status).toBe(404);

    const videoId = await upload(svc, pid, 'video/mp4', 'v.mp4');
    expect((await generateRetarget(svc, pid, { imageAssetId: videoId, videoAssetId: videoId })).status).toBe(400);

    const other = await createProject(svc, { name: 'Other' });
    const otherPid = (other.body as { project: { id: string } }).project.id;
    const foreignImage = await upload(svc, otherPid, 'image/png', 'a.png');
    expect((await generateRetarget(svc, pid, { imageAssetId: foreignImage, videoAssetId: videoId })).status).toBe(404);
  });

  it('validates the reference video asset (required, owned by the project, type video)', async () => {
    const { svc, pid } = await setup();
    const imageId = await upload(svc, pid, 'image/png', 'a.png');
    expect((await generateRetarget(svc, pid, { imageAssetId: imageId })).status).toBe(400);
    expect((await generateRetarget(svc, pid, { imageAssetId: imageId, videoAssetId: 'ghost' })).status).toBe(404);
    expect((await generateRetarget(svc, pid, { imageAssetId: imageId, videoAssetId: imageId })).status).toBe(400);

    const other = await createProject(svc, { name: 'Other' });
    const otherPid = (other.body as { project: { id: string } }).project.id;
    const foreignVideo = await upload(svc, otherPid, 'video/mp4', 'v.mp4');
    expect((await generateRetarget(svc, pid, { imageAssetId: imageId, videoAssetId: foreignVideo })).status).toBe(404);
  });

  it('202s a retarget job with resolved urls and the animated video lands as a new asset', async () => {
    const fetchFn = falFetch();
    const { svc, pid } = await setup(fetchFn);
    const imageId = await upload(svc, pid, 'image/png', 'hero.png');
    const videoId = await upload(svc, pid, 'video/mp4', 'perf.mp4');

    const r = await generateRetarget(svc, pid, { imageAssetId: imageId, videoAssetId: videoId });
    expect(r.status).toBe(202);
    const job = (r.body as { job: { id: string; kind: string; params: Record<string, unknown> } }).job;
    expect(job.kind).toBe('retarget');
    expect(job.params.imageAssetId).toBe(imageId);
    expect(job.params.videoAssetId).toBe(videoId);
    // Local dev has no public base URL → asset bytes are inlined as data: URIs.
    expect(String(job.params.imageUrl)).toMatch(/^data:image\/png;base64,/);
    expect(String(job.params.videoUrl)).toMatch(/^data:video\/mp4;base64,/);

    // The background runner drives the mocked fal queue to completion.
    for (let i = 0; i < 50; i += 1) {
      const done = await svc.jobs.get(job.id);
      if (done?.status === 'done') {
        const asset = await svc.assets.get(done.resultAssetId!);
        expect(asset?.type).toBe('video');
        expect(asset?.provider).toBe('wan-animate');
        return;
      }
      if (done?.status === 'error') throw new Error(done.error ?? 'job failed');
      await new Promise((res) => setTimeout(res, 20));
    }
    throw new Error('retarget job did not complete in time');
  });
});

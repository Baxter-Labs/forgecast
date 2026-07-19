import { describe, it, expect, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, uploadAsset, generateLipsync } from '../lib/api';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A fal queue mock: submit → COMPLETED status → synced video result → mp4 download. */
function falFetch() {
  return vi.fn(async (...a: Parameters<typeof fetch>) => {
    const url = String(a[0]);
    if (url === 'https://queue.fal.run/fal-ai/sync-lipsync') {
      return json({ request_id: 'r1', response_url: 'https://queue.fal.run/fal-ai/sync-lipsync/requests/r1' });
    }
    if (url.endsWith('/status')) return json({ status: 'COMPLETED' });
    if (url.endsWith('/requests/r1')) return json({ video: { url: 'https://cdn/synced.mp4' } });
    return new Response(new Uint8Array([9, 9, 9]), { status: 200, headers: { 'content-type': 'video/mp4' } });
  });
}

async function setup(fetchFn?: typeof fetch) {
  const svc = buildServices({ falVideoKey: 'k', fetchFn: fetchFn ?? falFetch() });
  const created = await createProject(svc, { name: 'LipsyncTest' });
  const pid = (created.body as { project: { id: string } }).project.id;
  return { svc, pid };
}

async function upload(svc: ReturnType<typeof buildServices>, pid: string, contentType: string, filename: string) {
  const r = await uploadAsset(svc, pid, { bytes: new Uint8Array([1, 2, 3, 4]), contentType, filename });
  return (r.body as { asset: { id: string } }).asset.id;
}

describe('api: generateLipsync', () => {
  it('503s with fal-key guidance when lip-sync is not configured', async () => {
    const svc = buildServices({});
    const created = await createProject(svc, { name: 'NoKey' });
    const pid = (created.body as { project: { id: string } }).project.id;
    const r = await generateLipsync(svc, pid, { videoAssetId: 'v', text: 'hi' });
    expect(r.status).toBe(503);
    expect((r.body as { error: string }).error).toContain('fal key');
  });

  it('404s for a missing project', async () => {
    const { svc } = await setup();
    const r = await generateLipsync(svc, 'nope', { videoAssetId: 'v', text: 'hi' });
    expect(r.status).toBe(404);
  });

  it('validates the video asset (required, owned by the project, type video)', async () => {
    const { svc, pid } = await setup();
    expect((await generateLipsync(svc, pid, { text: 'hi' })).status).toBe(400);
    expect((await generateLipsync(svc, pid, { videoAssetId: 'ghost', text: 'hi' })).status).toBe(404);

    const imageId = await upload(svc, pid, 'image/png', 'a.png');
    expect((await generateLipsync(svc, pid, { videoAssetId: imageId, text: 'hi' })).status).toBe(400);

    const other = await createProject(svc, { name: 'Other' });
    const otherPid = (other.body as { project: { id: string } }).project.id;
    const foreignVideo = await upload(svc, otherPid, 'video/mp4', 'v.mp4');
    expect((await generateLipsync(svc, pid, { videoAssetId: foreignVideo, text: 'hi' })).status).toBe(404);
  });

  it('400s when neither text nor audioAssetId is given', async () => {
    const { svc, pid } = await setup();
    const videoId = await upload(svc, pid, 'video/mp4', 'v.mp4');
    const r = await generateLipsync(svc, pid, { videoAssetId: videoId });
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toContain('text or audioAssetId');
  });

  it('503s with guidance when a script is given but no voice provider is configured', async () => {
    const { svc, pid } = await setup();
    const videoId = await upload(svc, pid, 'video/mp4', 'v.mp4');
    const r = await generateLipsync(svc, pid, { videoAssetId: videoId, text: 'new line' });
    expect(r.status).toBe(503);
    expect((r.body as { error: string }).error).toContain('voice provider');
  });

  it('validates the audio asset (owned by the project, type audio)', async () => {
    const { svc, pid } = await setup();
    const videoId = await upload(svc, pid, 'video/mp4', 'v.mp4');
    expect((await generateLipsync(svc, pid, { videoAssetId: videoId, audioAssetId: 'ghost' })).status).toBe(404);
    const imageId = await upload(svc, pid, 'image/png', 'a.png');
    expect((await generateLipsync(svc, pid, { videoAssetId: videoId, audioAssetId: imageId })).status).toBe(400);
  });

  it('202s a lipsync job with resolved urls and the synced video lands as a new asset', async () => {
    const fetchFn = falFetch();
    const { svc, pid } = await setup(fetchFn);
    const videoId = await upload(svc, pid, 'video/mp4', 'v.mp4');
    const audioId = await upload(svc, pid, 'audio/mpeg', 'speech.mp3');

    const r = await generateLipsync(svc, pid, { videoAssetId: videoId, audioAssetId: audioId });
    expect(r.status).toBe(202);
    const job = (r.body as { job: { id: string; kind: string; params: Record<string, unknown> } }).job;
    expect(job.kind).toBe('lipsync');
    expect(job.params.videoAssetId).toBe(videoId);
    expect(job.params.audioAssetId).toBe(audioId);
    // Local dev has no public base URL → asset bytes are inlined as data: URIs.
    expect(String(job.params.videoUrl)).toMatch(/^data:video\/mp4;base64,/);
    expect(String(job.params.audioUrl)).toMatch(/^data:audio\/mpeg;base64,/);

    // The background runner drives the mocked fal queue to completion.
    for (let i = 0; i < 50; i += 1) {
      const done = await svc.jobs.get(job.id);
      if (done?.status === 'done') {
        const asset = await svc.assets.get(done.resultAssetId!);
        expect(asset?.type).toBe('video');
        expect(asset?.provider).toBe('sync-lipsync');
        return;
      }
      if (done?.status === 'error') throw new Error(done.error ?? 'job failed');
      await new Promise((res) => setTimeout(res, 20));
    }
    throw new Error('lipsync job did not complete in time');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, saveTimeline, readTimeline, getTimeline, buildTimelineSpec, renderTimeline } from '../lib/api';
import { newAsset } from '@forgecast/core';

function makeServices() {
  const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } }));
  return buildServices({ fetchFn });
}

async function seed(svc: ReturnType<typeof buildServices>): Promise<{ projectId: string; ids: string[] }> {
  const pc = await createProject(svc, { name: 'Editor Test' });
  const projectId = (pc.body as { project: { id: string } }).project.id;
  const ids: string[] = [];
  for (const n of [1, 2]) {
    const id = svc.ids.randomId();
    const key = `projects/${projectId}/images/${id}.png`;
    await svc.storage.put(key, new Uint8Array([1, 2, 3]), 'image/png');
    const asset = await svc.assets.create(
      newAsset({ projectId, type: 'image', provider: 'fal', storageKey: key, params: { prompt: `p${n}` } }, { id, now: svc.ids.nowIso() }),
    );
    ids.push(asset.id);
  }
  return { projectId, ids };
}

describe('timeline editor', () => {
  it('saves + reads a normalized timeline (ids assigned, durations clamped)', async () => {
    const svc = makeServices();
    const { projectId, ids } = await seed(svc);
    const r = await saveTimeline(svc, projectId, { timeline: { aspectRatio: '16:9', clips: [
      { assetId: ids[0], durationSec: 999 },
      { assetId: ids[1], durationSec: 3, caption: 'hi', transition: 'fade' },
    ] } });
    expect(r.status).toBe(200);
    const tl = (r.body as { timeline: { aspectRatio: string; clips: Array<{ id: string; durationSec: number }> } }).timeline;
    expect(tl.aspectRatio).toBe('16:9');
    expect(tl.clips).toHaveLength(2);
    expect(tl.clips[0]!.durationSec).toBe(60); // clamped from 999
    expect(tl.clips[0]!.id).toBeTruthy();       // id backfilled

    const read = await readTimeline(svc, projectId);
    expect((read.body as { timeline: { clips: unknown[] } }).timeline.clips).toHaveLength(2);
    expect(await getTimeline(svc, projectId)).not.toBeNull();
  });

  it('readTimeline returns an empty timeline when none is saved', async () => {
    const svc = makeServices();
    const pc = await createProject(svc, { name: 'empty' });
    const pid = (pc.body as { project: { id: string } }).project.id;
    expect((await readTimeline(svc, pid)).body).toEqual({ timeline: { aspectRatio: '9:16', clips: [] } });
  });

  it('buildTimelineSpec resolves each clip to a scene (with caption + aspect)', async () => {
    const svc = makeServices();
    const { ids } = await seed(svc);
    const spec = await buildTimelineSpec(svc, { aspectRatio: '9:16', clips: [
      { id: 'c1', assetId: ids[0]!, durationSec: 4, caption: 'hello' },
      { id: 'c2', assetId: ids[1]!, durationSec: 2 },
    ] });
    expect(spec).not.toBeNull();
    expect(spec!.scenes).toHaveLength(2);
    expect(spec!.scenes[0]).toMatchObject({ kind: 'image', durationSec: 4, caption: 'hello' });
    expect(spec!.aspectRatio).toBe('9:16');
  });

  it('renderTimeline 404s for a bad project and 400s on an empty timeline', async () => {
    const svc = makeServices();
    expect((await renderTimeline(svc, 'nope', {})).status).toBe(404);
    const pc = await createProject(svc, { name: 'e' });
    const pid = (pc.body as { project: { id: string } }).project.id;
    expect((await renderTimeline(svc, pid, { timeline: { clips: [] } })).status).toBe(400);
  });

  it('voiceoverAssetId round-trips through save and resolves to spec.voiceoverUrl', async () => {
    const svc = makeServices();
    const { projectId, ids } = await seed(svc);
    // Seed a narration audio asset.
    const audioId = svc.ids.randomId();
    const audioKey = `projects/${projectId}/audio/${audioId}.mp3`;
    await svc.storage.put(audioKey, new Uint8Array([4, 5, 6]), 'audio/mpeg');
    await svc.assets.create(
      newAsset({ projectId, type: 'audio', provider: 'cloudflare', storageKey: audioKey, params: { text: 'hi' } }, { id: audioId, now: svc.ids.nowIso() }),
    );

    const saved = await saveTimeline(svc, projectId, { timeline: {
      aspectRatio: '9:16',
      voiceoverAssetId: audioId,
      clips: [{ assetId: ids[0], durationSec: 3 }],
    } });
    expect((saved.body as { timeline: { voiceoverAssetId?: string } }).timeline.voiceoverAssetId).toBe(audioId);

    const tl = await getTimeline(svc, projectId);
    const spec = await buildTimelineSpec(svc, tl!);
    expect(spec).not.toBeNull();
    expect(spec!.voiceoverUrl).toBeTruthy();
    expect(spec!.voiceoverUrl!).toContain('data:audio/mpeg;base64,');
  });
});

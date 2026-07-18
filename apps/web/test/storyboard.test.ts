import { describe, it, expect, vi } from 'vitest';
import { newAsset } from '@forgecast/core';
import { buildServices } from '../lib/forgecast';
import {
  createProject, createCharacter, generateStoryboard, readStoryboard, saveStoryboard,
  getStoryboard, renderStoryboardShot, animateStoryboardShot, setStoryboardShotClip,
  storyboardToTimeline, getTimeline,
} from '../lib/api';
import { handleMcpMessage } from '../lib/mcp';

/** fal-aware fetch mock: fal.run returns a generated image, everything else raw image bytes. */
function falFetch() {
  return vi.fn(async (url: Parameters<typeof fetch>[0]) => {
    const u = String(url);
    if (u.includes('fal.run')) {
      return new Response(JSON.stringify({ images: [{ url: 'data:image/png;base64,QUJD' }] }), { status: 200 });
    }
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } });
  }) as unknown as typeof fetch;
}

function makeServices(extra: Parameters<typeof buildServices>[0] = {}) {
  return buildServices({ fetchFn: falFetch(), ...extra });
}

async function newProjectId(svc: ReturnType<typeof buildServices>, owner?: string): Promise<string> {
  const pc = await createProject(svc, { name: 'Storyboard Test' }, owner);
  return (pc.body as { project: { id: string } }).project.id;
}

async function seedAsset(svc: ReturnType<typeof buildServices>, projectId: string, type: 'image' | 'video', id: string) {
  await svc.storage.put(`projects/${projectId}/${id}`, new Uint8Array([1, 2, 3]), type === 'image' ? 'image/png' : 'video/mp4');
  return svc.assets.create(newAsset({ projectId, type, provider: 'x', storageKey: `projects/${projectId}/${id}`, params: {} }, { id, now: svc.ids.nowIso() }));
}

/** Stub LLM (same convention as the ad-copy tests). */
function fakeLlm(reply: string, available = true) {
  const complete = vi.fn(async (_input: { system: string; user: string }) => reply);
  return { llm: { isAvailable: () => available, complete }, complete };
}

const PLAN = JSON.stringify({
  title: 'Molten',
  voiceoverScript: 'From raw steel to the first cut.',
  shots: [
    { prompt: 'raw steel bar on a dark anvil', caption: 'From raw steel', shotType: 'establishing', durationSec: 3 },
    { prompt: 'hammer strike, sparks flying', shotType: 'close-up', durationSec: 5 },
  ],
});

describe('generateStoryboard (the director)', () => {
  it('plans, normalizes, saves and returns the storyboard from the LLM JSON', async () => {
    const svc = makeServices();
    const projectId = await newProjectId(svc);
    const { llm, complete } = fakeLlm(PLAN);

    const r = await generateStoryboard(svc, projectId, { brief: 'launch the knife', shotCount: 2, aspectRatio: '16:9' }, llm);
    expect(r.status).toBe(200);
    const sb = (r.body as { storyboard: { title: string; aspectRatio: string; voiceoverScript?: string; shots: Array<{ id: string; shotType?: string; durationSec: number }> } }).storyboard;
    expect(sb.title).toBe('Molten');
    expect(sb.aspectRatio).toBe('16:9');
    expect(sb.voiceoverScript).toBe('From raw steel to the first cut.');
    expect(sb.shots).toHaveLength(2);
    expect(sb.shots[0]!.id).toBeTruthy();
    expect(sb.shots[1]).toMatchObject({ shotType: 'close-up', durationSec: 5 });

    // The director prompt carried the shot count; the plan is persisted.
    expect(complete.mock.calls[0]![0].system).toContain('exactly 2 shots');
    const read = await readStoryboard(svc, projectId);
    expect((read.body as { storyboard: { shots: unknown[] } }).storyboard.shots).toHaveLength(2);
  });

  it('stamps the cast member onto every shot and stars them in the prompt', async () => {
    const svc = makeServices();
    const projectId = await newProjectId(svc, 'A');
    const p1 = await seedAsset(svc, projectId, 'image', 'ref1');
    const made = await createCharacter(svc, 'A', { name: 'Nova', refAssetIds: [p1.id] });
    const characterId = (made.body as { character: { id: string } }).character.id;
    const { llm, complete } = fakeLlm(PLAN);

    const r = await generateStoryboard(svc, projectId, { brief: 'launch', characterId }, llm);
    expect(r.status).toBe(200);
    const sb = (r.body as { storyboard: { shots: Array<{ characterId?: string }> } }).storyboard;
    expect(sb.shots.every((s) => s.characterId === characterId)).toBe(true);
    expect(complete.mock.calls[0]![0].system).toContain('Nova');

    // A foreign character id is a 404 (same rule as generateImage).
    expect((await generateStoryboard(svc, projectId, { brief: 'x', characterId: 'nope' }, llm)).status).toBe(404);
  });

  it('503s without an LLM, 400s without a brief, 404s for an unknown project', async () => {
    const svc = makeServices();
    const projectId = await newProjectId(svc);
    expect((await generateStoryboard(svc, projectId, { brief: 'x' }, fakeLlm('[]', false).llm)).status).toBe(503);
    expect((await generateStoryboard(svc, projectId, {}, fakeLlm('[]').llm)).status).toBe(400);
    expect((await generateStoryboard(svc, 'nope', { brief: 'x' }, fakeLlm('[]').llm)).status).toBe(404);
  });

  it('502s when the LLM returns no parseable shots', async () => {
    const svc = makeServices();
    const projectId = await newProjectId(svc);
    const r = await generateStoryboard(svc, projectId, { brief: 'x' }, fakeLlm('sorry, no can do').llm);
    expect(r.status).toBe(502);
  });
});

describe('saveStoryboard cross-tenant guard', () => {
  it("rejects another owner's character or asset anywhere in the document", async () => {
    const svc = makeServices();
    const aPid = await newProjectId(svc, 'A');
    const aRef = await seedAsset(svc, aPid, 'image', 'a-ref');
    const made = await createCharacter(svc, 'A', { name: 'Nova', refAssetIds: [aRef.id] });
    const aCharacter = (made.body as { character: { id: string } }).character.id;
    const aImg = await seedAsset(svc, aPid, 'image', 'a-img');

    const bPid = await newProjectId(svc, 'B');
    const viaCharacter = await saveStoryboard(svc, bPid, { storyboard: { shots: [{ prompt: 'p', characterId: aCharacter }] } });
    expect(viaCharacter.status).toBe(400);
    expect((viaCharacter.body as { error: string }).error).toContain('character not found');

    const viaAsset = await saveStoryboard(svc, bPid, { storyboard: { shots: [{ prompt: 'p', imageAssetId: aImg.id }] } });
    expect(viaAsset.status).toBe(400);
    expect((viaAsset.body as { error: string }).error).toContain('asset not found');

    // The same document saves fine for its actual owner.
    expect((await saveStoryboard(svc, aPid, { storyboard: { shots: [{ prompt: 'p', characterId: aCharacter, imageAssetId: aImg.id }] } })).status).toBe(200);
  });
});

describe('renderStoryboardShot', () => {
  it('renders the still (fal), folds framing into the prompt, and stamps imageAssetId', async () => {
    const fetchFn = falFetch();
    const svc = buildServices({ falKey: 'k', fetchFn });
    const projectId = await newProjectId(svc);
    await saveStoryboard(svc, projectId, { storyboard: { shots: [
      { id: 's1', prompt: 'hammer strike, sparks flying', shotType: 'close-up', cameraAngle: 'low angle' },
    ] } });

    const r = await renderStoryboardShot(svc, projectId, { shotId: 's1' });
    expect(r.status).toBe(200);
    const body = r.body as { shot: { imageAssetId?: string }; asset: { id: string } };
    expect(body.asset.id).toBeTruthy();
    expect(body.shot.imageAssetId).toBe(body.asset.id);

    // The stamp persisted, and the image model got the folded framing.
    const saved = await getStoryboard(svc, projectId);
    expect(saved!.shots[0]!.imageAssetId).toBe(body.asset.id);
    const falCall = (fetchFn as unknown as { mock: { calls: Array<[unknown, { body?: string }?]> } }).mock.calls
      .find((c) => String(c[0]).includes('fal.run'));
    const prompt = (JSON.parse(falCall![1]!.body!) as { prompt: string }).prompt;
    expect(prompt).toContain('close-up shot');
    expect(prompt).toContain('camera: low angle');
  });

  it('404s for an unknown shot and 400s without a shotId', async () => {
    const svc = buildServices({ falKey: 'k', fetchFn: falFetch() });
    const projectId = await newProjectId(svc);
    await saveStoryboard(svc, projectId, { storyboard: { shots: [{ id: 's1', prompt: 'p' }] } });
    expect((await renderStoryboardShot(svc, projectId, { shotId: 'ghost' })).status).toBe(404);
    expect((await renderStoryboardShot(svc, projectId, {})).status).toBe(400);
  });
});

describe('animateStoryboardShot + setStoryboardShotClip', () => {
  it('400s when the shot has no rendered frame yet', async () => {
    const svc = makeServices();
    const projectId = await newProjectId(svc);
    await saveStoryboard(svc, projectId, { storyboard: { shots: [{ id: 's1', prompt: 'p' }] } });
    const r = await animateStoryboardShot(svc, projectId, { shotId: 's1' });
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toMatch(/render/i);
  });

  it('setStoryboardShotClip stamps an owned video and rejects images / foreign assets', async () => {
    const svc = makeServices();
    const projectId = await newProjectId(svc, 'A');
    const img = await seedAsset(svc, projectId, 'image', 'img1');
    const vid = await seedAsset(svc, projectId, 'video', 'vid1');
    await saveStoryboard(svc, projectId, { storyboard: { shots: [{ id: 's1', prompt: 'p', imageAssetId: img.id }] } });

    expect((await setStoryboardShotClip(svc, projectId, { shotId: 's1', assetId: img.id })).status).toBe(400); // not a video
    const ok = await setStoryboardShotClip(svc, projectId, { shotId: 's1', assetId: vid.id });
    expect(ok.status).toBe(200);
    expect((await getStoryboard(svc, projectId))!.shots[0]!.clipAssetId).toBe(vid.id);

    // Another owner's video is invisible.
    const bPid = await newProjectId(svc, 'B');
    const bVid = await seedAsset(svc, bPid, 'video', 'b-vid');
    expect((await setStoryboardShotClip(svc, projectId, { shotId: 's1', assetId: bVid.id })).status).toBe(404);
  });
});

describe('storyboardToTimeline', () => {
  it('builds clips (clip preferred over still), carries captions, skips assetless shots', async () => {
    const svc = makeServices();
    const projectId = await newProjectId(svc);
    const img = await seedAsset(svc, projectId, 'image', 'img1');
    const vid = await seedAsset(svc, projectId, 'video', 'vid1');
    await saveStoryboard(svc, projectId, { storyboard: { aspectRatio: '16:9', shots: [
      { id: 's1', prompt: 'a', caption: 'From raw steel', imageAssetId: img.id },
      { id: 's2', prompt: 'b', durationSec: 6, imageAssetId: img.id, clipAssetId: vid.id },
      { id: 's3', prompt: 'c' }, // never rendered → skipped
    ] } });

    const r = await storyboardToTimeline(svc, projectId);
    expect(r.status).toBe(200);
    const tl = (r.body as { timeline: { aspectRatio: string; clips: Array<{ id: string; assetId: string; durationSec: number; caption?: string }> } }).timeline;
    expect(tl.aspectRatio).toBe('16:9');
    expect(tl.clips.map((c) => c.id)).toEqual(['s1', 's2']);
    expect(tl.clips[0]).toMatchObject({ assetId: img.id, caption: 'From raw steel', durationSec: 4 });
    expect(tl.clips[1]).toMatchObject({ assetId: vid.id, durationSec: 6 }); // the clip wins over the still
    expect(await getTimeline(svc, projectId)).not.toBeNull();               // persisted
  });

  it('400s when no shots have rendered assets yet', async () => {
    const svc = makeServices();
    const projectId = await newProjectId(svc);
    await saveStoryboard(svc, projectId, { storyboard: { shots: [{ prompt: 'a' }, { prompt: 'b' }] } });
    const r = await storyboardToTimeline(svc, projectId);
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toMatch(/render/i);
  });

  it('synthesizes the voice-over script onto the timeline when a voice provider is available', async () => {
    // The AI binding provides keyless MeloTTS (base64 "ABC") — same mock as the montage tests.
    const svc = buildServices({ falKey: undefined, fetchFn: falFetch(), ai: { run: async () => ({ audio: 'QUJD' }) } });
    const projectId = await newProjectId(svc);
    const img = await seedAsset(svc, projectId, 'image', 'img1');
    await saveStoryboard(svc, projectId, { storyboard: {
      voiceoverScript: 'From raw steel to the first cut.',
      shots: [{ id: 's1', prompt: 'a', imageAssetId: img.id }],
    } });

    const r = await storyboardToTimeline(svc, projectId);
    expect(r.status).toBe(200);
    const tl = (r.body as { timeline: { voiceoverAssetId?: string } }).timeline;
    expect(tl.voiceoverAssetId).toBeTruthy();
    expect(await svc.assets.get(tl.voiceoverAssetId!)).toMatchObject({ type: 'audio' });
  });
});

describe('storyboard over MCP', () => {
  const call = (c: { services: ReturnType<typeof buildServices>; userId: string }, id: number, name: string, args: Record<string, unknown> = {}) =>
    handleMcpMessage(c, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
  type Rpc = { result?: { content?: Array<{ text: string }>; isError?: boolean; tools?: Array<{ name: string }> } };
  const bodyOf = (r: Awaited<ReturnType<typeof handleMcpMessage>>) => (r!.body as Rpc);
  const textOf = (r: Awaited<ReturnType<typeof handleMcpMessage>>) => bodyOf(r).result!.content![0]!.text;

  async function projectFor(services: ReturnType<typeof buildServices>, userId: string, id: number): Promise<string> {
    const created = await call({ services, userId }, id, 'forgecast_create_project', { name: `${userId} proj` });
    return (JSON.parse(textOf(created)) as { project: { id: string } }).project.id;
  }

  it('exposes the six storyboard tools (34 total)', async () => {
    const services = makeServices();
    const b = bodyOf(await handleMcpMessage({ services, userId: 'A' }, { jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    const names = (b.result?.tools ?? []).map((t) => t.name);
    for (const n of [
      'forgecast_get_storyboard', 'forgecast_set_storyboard', 'forgecast_generate_storyboard',
      'forgecast_render_storyboard_shot', 'forgecast_animate_storyboard_shot', 'forgecast_storyboard_to_timeline',
    ]) expect(names).toContain(n);
    expect(names).toHaveLength(37);
  });

  it('set_storyboard round-trips through get_storyboard (normalized)', async () => {
    const services = makeServices();
    const pid = await projectFor(services, 'A', 2);
    const set = await call({ services, userId: 'A' }, 3, 'forgecast_set_storyboard', {
      projectId: pid,
      storyboard: { title: 'Molten', aspectRatio: '16:9', shots: [{ prompt: 'sparks', shotType: 'close-up', durationSec: 99 }] },
    });
    expect(bodyOf(set).result?.isError).toBeFalsy();
    const got = JSON.parse(textOf(await call({ services, userId: 'A' }, 4, 'forgecast_get_storyboard', { projectId: pid }))) as
      { storyboard: { title: string; shots: Array<{ shotType?: string; durationSec: number }> } };
    expect(got.storyboard.title).toBe('Molten');
    expect(got.storyboard.shots[0]).toMatchObject({ shotType: 'close-up', durationSec: 15 }); // clamped
  });

  it("set_storyboard rejects another user's character (ownership denial)", async () => {
    const services = makeServices();
    const aPid = await projectFor(services, 'A', 5);
    const aRef = await seedAsset(services, aPid, 'image', 'a-ref');
    const made = await createCharacter(services, 'A', { name: 'Nova', refAssetIds: [aRef.id] });
    const aCharacter = (made.body as { character: { id: string } }).character.id;

    const bPid = await projectFor(services, 'B', 6);
    const res = await call({ services, userId: 'B' }, 7, 'forgecast_set_storyboard', {
      projectId: bPid, storyboard: { shots: [{ prompt: 'p', characterId: aCharacter }] },
    });
    expect(bodyOf(res).result?.isError).toBe(true);
    expect(textOf(res)).toContain('character not found');
  });

  it('storyboard_to_timeline surfaces the api-layer guidance when nothing is rendered', async () => {
    const services = makeServices();
    const pid = await projectFor(services, 'A', 8);
    await saveStoryboard(services, pid, { storyboard: { shots: [{ prompt: 'p' }] } });
    const r = await call({ services, userId: 'A' }, 9, 'forgecast_storyboard_to_timeline', { projectId: pid });
    expect(bodyOf(r).result?.isError).toBe(true);
    expect(textOf(r)).toMatch(/render/i);
  });
});

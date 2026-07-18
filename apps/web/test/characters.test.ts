import { describe, it, expect, vi } from 'vitest';
import { newAsset } from '@forgecast/core';
import { buildServices } from '../lib/forgecast';
import { createProject, createCharacter, listCharacters, getCharacter, trainCharacter, deleteCharacter, generateImage } from '../lib/api';
import { handleMcpMessage } from '../lib/mcp';

function makeServices(extra: Parameters<typeof buildServices>[0] = {}) {
  const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
    new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } }));
  return buildServices({ fetchFn, ...extra });
}

async function seedPortraits(svc: ReturnType<typeof buildServices>, owner: string): Promise<{ projectId: string; ids: string[] }> {
  const pc = await createProject(svc, { name: 'Cast' }, owner);
  const projectId = (pc.body as { project: { id: string } }).project.id;
  const ids: string[] = [];
  for (const n of [1, 2]) {
    const id = svc.ids.randomId();
    const key = `projects/${projectId}/images/${id}.png`;
    await svc.storage.put(key, new Uint8Array([9, n]), 'image/png');
    await svc.assets.create(newAsset({ projectId, type: 'image', provider: 'fal', storageKey: key, params: {} }, { id, now: svc.ids.nowIso() }));
    ids.push(id);
  }
  return { projectId, ids };
}

describe('characters', () => {
  it('creates a character from owned image assets, copying ref bytes to character storage', async () => {
    const svc = makeServices();
    const { ids } = await seedPortraits(svc, 'A');
    const r = await createCharacter(svc, 'A', { name: 'Nova', description: 'ember-lit founder', refAssetIds: ids });
    expect(r.status).toBe(200);
    const c = (r.body as { character: { id: string; refKeys: string[]; ownerId: string } }).character;
    expect(c.ownerId).toBe('A');
    expect(c.refKeys).toHaveLength(2);
    expect(await svc.storage.get(c.refKeys[0]!)).toBeTruthy();

    const list = await listCharacters(svc, 'A');
    expect((list.body as { count: number }).count).toBe(1);
    // Other owners see nothing and cannot delete.
    expect((await listCharacters(svc, 'B')).body).toMatchObject({ count: 0 });
    expect((await deleteCharacter(svc, 'B', c.id)).status).toBe(404);
    expect((await deleteCharacter(svc, 'A', c.id)).status).toBe(200);
  });

  it('rejects bad inputs: no refs, >4 refs, non-image refs, foreign assets', async () => {
    const svc = makeServices();
    const { projectId, ids } = await seedPortraits(svc, 'A');
    expect((await createCharacter(svc, 'A', { name: 'X', refAssetIds: [] })).status).toBe(400);
    expect((await createCharacter(svc, 'A', { name: 'X', refAssetIds: [ids[0], ids[0], ids[0], ids[0], ids[0]] })).status).toBe(400);
    const vid = svc.ids.randomId();
    await svc.assets.create(newAsset({ projectId, type: 'video', provider: 'x', storageKey: 'v', params: {} }, { id: vid, now: svc.ids.nowIso() }));
    expect((await createCharacter(svc, 'A', { name: 'X', refAssetIds: [vid] })).status).toBe(400);
    // B cannot use A's assets as references.
    expect((await createCharacter(svc, 'B', { name: 'X', refAssetIds: [ids[0]] })).status).toBe(404);
  });

  it('generateImage with characterId: 503 without an edit-capable provider, refs wired with fal', async () => {
    // Keyless (cloudflare-only) services: characters must fail with guidance.
    const keyless = makeServices({ falKey: undefined, ai: { run: async () => ({ image: 'QUJD' }) } });
    const seededA = await seedPortraits(keyless, 'A');
    const created = await createCharacter(keyless, 'A', { name: 'Nova', refAssetIds: seededA.ids });
    const charId = (created.body as { character: { id: string } }).character.id;
    const denied = await generateImage(keyless, seededA.projectId, { prompt: 'on a stage', characterId: charId });
    expect(denied.status).toBe(503);
    expect(((denied.body as { error?: string }).error ?? '')).toMatch(/fal key/i);

    // With fal: the image job carries refImageUrls + the edit-model routing.
    const fetchFn = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      const u = String(url);
      if (u.includes('fal.run')) return new Response(JSON.stringify({ images: [{ url: 'data:image/png;base64,QUJD' }] }), { status: 200 });
      return new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/png' } });
    }) as unknown as typeof fetch;
    const svc = buildServices({ falKey: 'k', fetchFn });
    const seeded = await seedPortraits(svc, 'A');
    const made = await createCharacter(svc, 'A', { name: 'Nova', refAssetIds: seeded.ids });
    const cid = (made.body as { character: { id: string } }).character.id;
    const r = await generateImage(svc, seeded.projectId, { prompt: 'keynote hero shot', characterId: cid });
    expect(r.status).toBe(200);
    const call = (fetchFn as unknown as { mock: { calls: Array<[unknown, { body?: string }?]> } }).mock.calls
      .find((c) => String(c[0]).includes('fal.run'));
    expect(String(call![0])).toContain('nano-banana/edit');
    const body = JSON.parse(call![1]!.body!) as { image_urls?: string[]; prompt: string };
    expect(body.image_urls).toHaveLength(2);
    expect(body.prompt).toContain('Nova');
    // A foreign character id is a 404.
    expect((await generateImage(svc, seeded.projectId, { prompt: 'x', characterId: 'nope' })).status).toBe(404);
  });

  it('trainCharacter: 503 without a fal key, submits refs as a ZIP, polls to ready', async () => {
    // Keyless: actionable guidance instead of a silent failure.
    const keyless = makeServices({ falKey: undefined });
    const seededK = await seedPortraits(keyless, 'A');
    const madeK = await createCharacter(keyless, 'A', { name: 'Nova', refAssetIds: seededK.ids });
    const kid = (madeK.body as { character: { id: string } }).character.id;
    const denied = await trainCharacter(keyless, 'A', kid);
    expect(denied.status).toBe(503);
    expect(((denied.body as { error?: string }).error ?? '')).toMatch(/fal key/i);

    // With fal: submit → training, poll → ready with the LoRA url persisted.
    let phase: 'queued' | 'running' | 'done' = 'queued';
    const fetchFn = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      const u = String(url);
      if (u.includes('flux-lora-fast-training') && !u.includes('/requests/')) {
        return new Response(JSON.stringify({ request_id: 'r1', response_url: 'https://queue.fal.run/fal-ai/flux-lora-fast-training/requests/r1' }), { status: 200 });
      }
      if (u.endsWith('/status')) {
        return new Response(JSON.stringify({ status: phase === 'done' ? 'COMPLETED' : 'IN_PROGRESS' }), { status: 200 });
      }
      if (u.includes('/requests/')) {
        return new Response(JSON.stringify({ diffusers_lora_file: { url: 'https://cdn/nova-lora.safetensors' } }), { status: 200 });
      }
      return new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/png' } });
    }) as unknown as typeof fetch;
    const svc = buildServices({ falKey: 'k', fetchFn });
    const seeded = await seedPortraits(svc, 'A');
    const made = await createCharacter(svc, 'A', { name: 'Nova', refAssetIds: seeded.ids });
    const cid = (made.body as { character: { id: string } }).character.id;

    // B cannot train A's character.
    expect((await trainCharacter(svc, 'B', cid)).status).toBe(404);

    const started = await trainCharacter(svc, 'A', cid);
    expect(started.status).toBe(200);
    expect((started.body as { character: { loraStatus?: string } }).character.loraStatus).toBe('training');
    // The submit body carried a ZIP data URI + the name as trigger word.
    const submit = (fetchFn as unknown as { mock: { calls: Array<[unknown, { body?: string }?]> } }).mock.calls
      .find((c) => String(c[0]).includes('flux-lora-fast-training'));
    const submitBody = JSON.parse(submit![1]!.body!) as { images_data_url: string; trigger_word: string };
    expect(submitBody.images_data_url).toMatch(/^data:application\/zip;base64,/);
    expect(submitBody.trigger_word).toBe('Nova');

    // A second train while in-flight is a 409.
    expect((await trainCharacter(svc, 'A', cid)).status).toBe(409);

    // Reads advance the training by one poll: still processing → unchanged…
    let read = await getCharacter(svc, 'A', cid);
    expect((read.body as { character: { loraStatus?: string } }).character.loraStatus).toBe('training');
    // …then complete → ready, LoRA url stamped, task cleared.
    phase = 'done';
    read = await getCharacter(svc, 'A', cid);
    const done = (read.body as { character: { loraStatus?: string; loraUrl?: string; loraTaskId?: string } }).character;
    expect(done.loraStatus).toBe('ready');
    expect(done.loraUrl).toBe('https://cdn/nova-lora.safetensors');
    expect(done.loraTaskId).toBeUndefined();

    // list also surfaces the trained state.
    const listed = await listCharacters(svc, 'A');
    expect((listed.body as { characters: Array<{ loraStatus?: string }> }).characters[0]!.loraStatus).toBe('ready');
  });

  it('generateImage with a trained character loads the LoRA instead of reference images', async () => {
    const fetchFn = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
      const u = String(url);
      if (u.includes('fal.run')) return new Response(JSON.stringify({ images: [{ url: 'data:image/png;base64,QUJD' }] }), { status: 200 });
      return new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/png' } });
    }) as unknown as typeof fetch;
    const svc = buildServices({ falKey: 'k', fetchFn });
    const seeded = await seedPortraits(svc, 'A');
    const made = await createCharacter(svc, 'A', { name: 'Nova', refAssetIds: seeded.ids });
    const cid = (made.body as { character: { id: string } }).character.id;
    await svc.characters.update(cid, { loraStatus: 'ready', loraUrl: 'https://cdn/nova-lora.safetensors' });

    // The Studio always sends its picker's value — the catalog default must still take the LoRA path.
    const r = await generateImage(svc, seeded.projectId, { prompt: 'keynote hero shot', model: 'fal-ai/nano-banana', aspectRatio: '9:16', characterId: cid });
    expect(r.status).toBe(200);
    const call = (fetchFn as unknown as { mock: { calls: Array<[unknown, { body?: string }?]> } }).mock.calls
      .find((c) => String(c[0]).includes('fal.run'));
    expect(String(call![0])).toContain('flux-lora');
    const body = JSON.parse(call![1]!.body!) as { image_urls?: string[]; loras?: Array<{ path: string }>; image_size?: string; prompt: string };
    expect(body.loras).toEqual([{ path: 'https://cdn/nova-lora.safetensors' }]);
    expect(body.image_urls).toBeUndefined();
    expect(body.image_size).toBe('portrait_16_9');
    expect(body.prompt).toContain('Nova');

    // An explicit model choice falls back to reference conditioning (loras stay off unknown models).
    const r2 = await generateImage(svc, seeded.projectId, { prompt: 'poster', model: 'fal-ai/nano-banana/edit', characterId: cid });
    expect(r2.status).toBe(200);
    const call2 = (fetchFn as unknown as { mock: { calls: Array<[unknown, { body?: string }?]> } }).mock.calls
      .filter((c) => String(c[0]).includes('fal.run')).at(-1);
    const body2 = JSON.parse(call2![1]!.body!) as { image_urls?: string[]; loras?: unknown };
    expect(body2.image_urls).toHaveLength(2);
    expect(body2.loras).toBeUndefined();
  });

  it('MCP: create + list + generate with character, ownership enforced', async () => {
    const services = makeServices({ falKey: 'k' });
    const call = (userId: string, id: number, name: string, args: Record<string, unknown> = {}) =>
      handleMcpMessage({ services, userId }, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
    const text = (r: Awaited<ReturnType<typeof handleMcpMessage>>) =>
      ((r!.body as { result: { content: Array<{ text: string }>; isError?: boolean } }).result);

    const seeded = await seedPortraits(services, 'A');
    const made = text(await call('A', 1, 'forgecast_create_character', { name: 'Nova', refAssetIds: seeded.ids }));
    expect(made.isError).toBeFalsy();
    const cid = (JSON.parse(made.content[0]!.text) as { character: { id: string } }).character.id;

    const listed = JSON.parse(text(await call('A', 2, 'forgecast_list_characters')).content[0]!.text) as { count: number; characters: Array<{ refs: number }> };
    expect(listed.count).toBe(1);
    expect(listed.characters[0]!.refs).toBe(2);

    // B cannot build a character from A's assets, cannot delete A's character.
    expect(text(await call('B', 3, 'forgecast_create_character', { name: 'X', refAssetIds: seeded.ids })).isError).toBe(true);
    expect(text(await call('B', 4, 'forgecast_delete_character', { characterId: cid })).isError).toBe(true);

    const tools = await handleMcpMessage({ services, userId: 'A' }, { jsonrpc: '2.0', id: 5, method: 'tools/list' });
    const names = ((tools!.body as { result: { tools: Array<{ name: string }> } }).result.tools).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['forgecast_create_character', 'forgecast_list_characters', 'forgecast_train_character', 'forgecast_delete_character', 'forgecast_generate_presenter']));
    expect(names).toHaveLength(35);
  });
});

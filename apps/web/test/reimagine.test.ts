import { describe, it, expect, vi } from 'vitest';
import { newAsset } from '@forgecast/core';
import { buildServices } from '../lib/forgecast';
import { createProject, reangleAsset, relightAsset } from '../lib/api';
import { handleMcpMessage } from '../lib/mcp';

/** fal returns a data-URI so the download step needs no second fetch. */
function falServices() {
  const fetchFn = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
    if (String(url).includes('fal.run')) {
      return new Response(JSON.stringify({ images: [{ url: 'data:image/png;base64,QUJD' }] }), { status: 200 });
    }
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } });
  }) as unknown as typeof fetch;
  return { svc: buildServices({ falKey: 'k', fetchFn }), fetchFn };
}

async function seedImage(svc: ReturnType<typeof buildServices>, owner: string, type: 'image' | 'video' = 'image') {
  const pid = (await createProject(svc, { name: 'P' }, owner)).body as { project: { id: string } };
  const projectId = pid.project.id;
  const id = svc.ids.randomId();
  const key = `projects/${projectId}/images/${id}.png`;
  await svc.storage.put(key, new Uint8Array([9, 9]), 'image/png');
  await svc.assets.create(newAsset({ projectId, type, provider: 'fal', storageKey: key, params: {} }, { id, now: svc.ids.nowIso() }));
  return { projectId, id };
}

const falBody = (fetchFn: unknown) =>
  ((fetchFn as { mock: { calls: Array<[unknown, { body?: string }?]> } }).mock.calls
    .find((c) => String(c[0]).includes('fal.run')));

describe('reangle / relight ops', () => {
  it('reangle with a preset routes to the Qwen multi-angle model with image_urls', async () => {
    const { svc, fetchFn } = falServices();
    const { projectId, id } = await seedImage(svc, 'A');
    const r = await reangleAsset(svc, projectId, { assetId: id, preset: 'low-angle' });
    expect(r.status).toBe(200);
    const call = falBody(fetchFn)!;
    expect(String(call[0])).toContain('qwen-image-edit-2509-lora-gallery/multiple-angles');
    const body = JSON.parse(call[1]!.body!) as { image_urls?: string[]; prompt: string };
    expect(body.image_urls).toHaveLength(1);
    expect(body.prompt).toMatch(/low angle/i);
  });

  it('relight always routes to iclight-v2 with a lighting-only instruction (image_url)', async () => {
    const { svc, fetchFn } = falServices();
    const { projectId, id } = await seedImage(svc, 'A');
    const r = await relightAsset(svc, projectId, { assetId: id, preset: 'golden-hour' });
    expect(r.status).toBe(200);
    const call = falBody(fetchFn)!;
    expect(String(call[0])).toContain('iclight-v2');
    const body = JSON.parse(call[1]!.body!) as { image_url?: string; prompt: string };
    expect(body.image_url).toBeTruthy();
    expect(body.prompt).toMatch(/golden-hour/i);
  });

  it('a custom-only reangle uses the default editor (no preset routing)', async () => {
    const { svc, fetchFn } = falServices();
    const { projectId, id } = await seedImage(svc, 'A');
    const r = await reangleAsset(svc, projectId, { assetId: id, instruction: 'orbit 45 degrees to the right' });
    expect(r.status).toBe(200);
    expect(String(falBody(fetchFn)![0])).not.toContain('multiple-angles');
  });

  it('validation: non-image 400, missing preset+instruction 400, foreign asset 404, keyless 503', async () => {
    const { svc } = falServices();
    const vid = await seedImage(svc, 'A', 'video');
    expect((await reangleAsset(svc, vid.projectId, { assetId: vid.id, preset: 'front' })).status).toBe(400);

    const img = await seedImage(svc, 'A');
    expect((await reangleAsset(svc, img.projectId, { assetId: img.id })).status).toBe(400);
    // Asset from another project is not found relative to this project.
    const other = await seedImage(svc, 'A');
    expect((await reangleAsset(svc, img.projectId, { assetId: other.id, preset: 'front' })).status).toBe(404);

    const keyless = buildServices({ falKey: undefined, ai: { run: async () => ({ image: 'QUJD' }) }, fetchFn: vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch });
    const k = await seedImage(keyless, 'A');
    const denied = await relightAsset(keyless, k.projectId, { assetId: k.id, preset: 'noir' });
    expect(denied.status).toBe(503);
    expect(((denied.body as { error?: string }).error ?? '')).toMatch(/FAL_KEY/i);
  });

  it('MCP: reangle/relight tools present (35), ownership enforced', async () => {
    const { svc } = falServices();
    const { id } = await seedImage(svc, 'A');
    const call = (userId: string, n: number, name: string, args: Record<string, unknown>) =>
      handleMcpMessage({ services: svc, userId }, { jsonrpc: '2.0', id: n, method: 'tools/call', params: { name, arguments: args } });
    const res = (r: Awaited<ReturnType<typeof handleMcpMessage>>) => (r!.body as { result: { content: Array<{ text: string }>; isError?: boolean } }).result;

    expect(res(await call('A', 1, 'forgecast_reangle_image', { assetId: id, preset: 'high-angle' })).isError).toBeFalsy();
    // B cannot re-angle A's asset.
    expect(res(await call('B', 2, 'forgecast_relight_image', { assetId: id, preset: 'dawn' })).isError).toBe(true);

    const tools = await handleMcpMessage({ services: svc, userId: 'A' }, { jsonrpc: '2.0', id: 3, method: 'tools/list' });
    const names = ((tools!.body as { result: { tools: Array<{ name: string }> } }).result.tools).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['forgecast_reangle_image', 'forgecast_relight_image']));
    expect(names).toHaveLength(40);
  });
});

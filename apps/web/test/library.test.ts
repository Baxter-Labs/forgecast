import { describe, it, expect, vi } from 'vitest';
import { newAsset } from '@forgecast/core';
import { buildServices } from '../lib/forgecast';
import { createProject, listLibrary, setAssetTags } from '../lib/api';
import { handleMcpMessage } from '../lib/mcp';

function makeServices() {
  const fetchFn = vi.fn(async () => new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/png' } }));
  return buildServices({ fetchFn });
}

async function seedAsset(svc: ReturnType<typeof buildServices>, projectId: string, id: string, now: string, type: 'image' | 'video' = 'image') {
  return svc.assets.create(newAsset({ projectId, type, provider: 'fal', storageKey: `k-${id}`, params: { prompt: `p-${id}` } }, { id, now: `2026-0${now}-01` }));
}

describe('library', () => {
  it('lists every owned asset across projects (newest first) with project name + tags, isolating owners', async () => {
    const svc = makeServices();
    const pA1 = (await createProject(svc, { name: 'Launch' }, 'A')).body as { project: { id: string } };
    const pA2 = (await createProject(svc, { name: 'Ads' }, 'A')).body as { project: { id: string } };
    const pB = (await createProject(svc, { name: 'Other' }, 'B')).body as { project: { id: string } };
    await seedAsset(svc, pA1.project.id, 'a1', '1');
    await seedAsset(svc, pA2.project.id, 'a2', '2', 'video');
    await seedAsset(svc, pB.project.id, 'b1', '3');

    const r = await listLibrary(svc, 'A');
    expect(r.status).toBe(200);
    const body = r.body as { assets: Array<{ id: string; projectName: string | null; tags: string[] }>; tags: string[]; count: number };
    expect(body.count).toBe(2);
    expect(body.assets.map((a) => a.id)).toEqual(['a2', 'a1']); // newest first
    expect(body.assets.find((a) => a.id === 'a1')!.projectName).toBe('Launch');
    expect(body.assets.find((a) => a.id === 'a2')!.projectName).toBe('Ads');

    // B sees only their own asset.
    expect((await listLibrary(svc, 'B')).body).toMatchObject({ count: 1 });
  });

  it('sets, sanitizes, and surfaces tags; foreign assets are 404', async () => {
    const svc = makeServices();
    const p = (await createProject(svc, { name: 'P' }, 'A')).body as { project: { id: string } };
    await seedAsset(svc, p.project.id, 'a1', '1');

    // Trimmed, de-duped (case-insensitive), empties dropped.
    const set = await setAssetTags(svc, 'A', 'a1', { tags: ['  Hero ', 'hero', 'launch', ''] });
    expect(set.status).toBe(200);
    expect((set.body as { asset: { params: { tags: string[] } } }).asset.params.tags).toEqual(['Hero', 'launch']);

    const lib = (await listLibrary(svc, 'A')).body as { tags: string[]; assets: Array<{ tags: string[] }> };
    expect(lib.tags).toEqual(['Hero', 'launch']);
    expect(lib.assets[0]!.tags).toEqual(['Hero', 'launch']);

    // B cannot tag A's asset, and unknown assets are 404.
    expect((await setAssetTags(svc, 'B', 'a1', { tags: ['x'] })).status).toBe(404);
    expect((await setAssetTags(svc, 'A', 'nope', { tags: ['x'] })).status).toBe(404);
  });

  it('MCP forgecast_list_library returns cross-project assets with tags', async () => {
    const svc = makeServices();
    const p1 = (await createProject(svc, { name: 'One' }, 'A')).body as { project: { id: string } };
    const p2 = (await createProject(svc, { name: 'Two' }, 'A')).body as { project: { id: string } };
    await seedAsset(svc, p1.project.id, 'a1', '1');
    await seedAsset(svc, p2.project.id, 'a2', '2');
    await setAssetTags(svc, 'A', 'a2', { tags: ['keep'] });

    const res = await handleMcpMessage({ services: svc, userId: 'A' }, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'forgecast_list_library', arguments: {} } });
    const result = (res!.body as { result: { content: Array<{ text: string }>; isError?: boolean } }).result;
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text) as { count: number; tags: string[]; assets: Array<{ id: string; projectName?: string; tags?: string[] }> };
    expect(parsed.count).toBe(2);
    expect(parsed.tags).toEqual(['keep']);
    expect(parsed.assets.find((a) => a.id === 'a2')!.tags).toEqual(['keep']);
    expect(parsed.assets.find((a) => a.id === 'a1')!.projectName).toBe('One');
  });
});

import { describe, it, expect } from 'vitest';
import { newAsset } from '@forgecast/core';
import { buildServices } from '../lib/forgecast';
import { handleMcpMessage } from '../lib/mcp';
import { mintApiToken, userFromBearer, bearerToken, type AuthConfig } from '../lib/auth';

const cfg: AuthConfig = { clientId: 'x', clientSecret: 'y', secret: 'test-secret', baseUrl: 'http://localhost' };

function ctx(userId = 'u1') { return { services: buildServices({}), userId }; }
type RpcResult = { result?: { content?: Array<{ text: string; isError?: boolean }>; isError?: boolean; tools?: Array<{ name: string }>; capabilities?: unknown; serverInfo?: { name: string } }; error?: { code: number } };
const bodyOf = (r: Awaited<ReturnType<typeof handleMcpMessage>>) => (r!.body as { jsonrpc: string; id: unknown } & RpcResult);
const textOf = (r: Awaited<ReturnType<typeof handleMcpMessage>>) => bodyOf(r).result!.content![0]!.text;

describe('handleMcpMessage', () => {
  it('initialize advertises the tools capability', async () => {
    const b = bodyOf(await handleMcpMessage(ctx(), { jsonrpc: '2.0', id: 1, method: 'initialize' }));
    expect(b.result?.capabilities).toEqual({ tools: {} });
    expect(b.result?.serverInfo?.name).toBe('forgecast');
  });

  it('tools/list returns the curated tools', async () => {
    const b = bodyOf(await handleMcpMessage(ctx(), { jsonrpc: '2.0', id: 2, method: 'tools/list' }));
    const names = (b.result?.tools ?? []).map((t) => t.name);
    expect(names).toContain('forgecast_create_project');
    expect(names).toContain('forgecast_generate_image');
    expect(names).toContain('forgecast_get_job');
  });

  it('notifications get no reply', async () => {
    expect(await handleMcpMessage(ctx(), { jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
  });

  it('unknown method → -32601', async () => {
    const b = bodyOf(await handleMcpMessage(ctx(), { jsonrpc: '2.0', id: 3, method: 'frobnicate' }));
    expect(b.error?.code).toBe(-32601);
  });

  it('tools/call create_project returns the new project', async () => {
    const r = await handleMcpMessage(ctx(), { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'forgecast_create_project', arguments: { name: 'Docu' } } });
    expect(textOf(r)).toContain('Docu');
  });

  it('unknown tool → -32602', async () => {
    const b = bodyOf(await handleMcpMessage(ctx(), { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'nope', arguments: {} } }));
    expect(b.error?.code).toBe(-32602);
  });

  it('enforces project ownership across users (a token can’t touch another user’s project)', async () => {
    const services = buildServices({});
    const created = await handleMcpMessage({ services, userId: 'A' }, { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'forgecast_create_project', arguments: { name: 'A proj' } } });
    const pid = (JSON.parse(textOf(created)) as { project: { id: string } }).project.id;
    const res = await handleMcpMessage({ services, userId: 'B' }, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'forgecast_list_assets', arguments: { projectId: pid } } });
    expect(bodyOf(res).result?.isError).toBe(true);
    expect(textOf(res)).toContain('project not found');
  });
});

describe('elevated MCP toolset', () => {
  const call = (c: { services: ReturnType<typeof buildServices>; userId: string }, id: number, name: string, args: Record<string, unknown> = {}) =>
    handleMcpMessage(c, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

  it('exposes the full workflow toolset (>=14 tools), each with annotations', async () => {
    const b = bodyOf(await handleMcpMessage(ctx(), { jsonrpc: '2.0', id: 20, method: 'tools/list' }));
    const tools = b.result?.tools ?? [];
    const names = tools.map((t) => t.name);
    for (const n of ['forgecast_generate_voiceover', 'forgecast_generate_montage', 'forgecast_narrate_video', 'forgecast_generate_ad_copy', 'forgecast_publish_asset', 'forgecast_search_footage', 'forgecast_get_asset']) {
      expect(names).toContain(n);
    }
    expect(tools.length).toBeGreaterThanOrEqual(14);
    expect(tools.every((t) => (t as { annotations?: unknown }).annotations !== undefined)).toBe(true);
  });

  it('list_projects returns a concise { projects, count } projection', async () => {
    const c = ctx('u1');
    await call(c, 21, 'forgecast_create_project', { name: 'P1' });
    const body = JSON.parse(textOf(await call(c, 22, 'forgecast_list_projects'))) as { projects: Array<{ id: string; name: string }>; count: number };
    expect(body.count).toBe(1);
    expect(body.projects[0]?.name).toBe('P1');
  });

  it('get_asset enforces cross-user ownership (B cannot read A’s asset)', async () => {
    const services = buildServices({});
    const created = await call({ services, userId: 'A' }, 23, 'forgecast_create_project', { name: 'A' });
    const pid = (JSON.parse(textOf(created)) as { project: { id: string } }).project.id;
    await services.assets.create(newAsset({ projectId: pid, type: 'image', provider: 'x', storageKey: 'k', params: {} }, { id: 'a1', now: 'T' }));
    // A can read it; B cannot.
    expect(bodyOf(await call({ services, userId: 'A' }, 24, 'forgecast_get_asset', { assetId: 'a1' })).result?.isError).toBeFalsy();
    const asB = await call({ services, userId: 'B' }, 25, 'forgecast_get_asset', { assetId: 'a1' });
    expect(bodyOf(asB).result?.isError).toBe(true);
    expect(textOf(asB)).toContain('asset not found');
  });

  it('surfaces actionable api errors (ad-copy with no LLM key → LLM guidance)', async () => {
    const c = ctx('u1');
    const pid = (JSON.parse(textOf(await call(c, 26, 'forgecast_create_project', { name: 'P' }))) as { project: { id: string } }).project.id;
    const r = await call(c, 27, 'forgecast_generate_ad_copy', { projectId: pid, brief: 'a new sneaker' });
    expect(bodyOf(r).result?.isError).toBe(true);
    expect(textOf(r).toLowerCase()).toContain('llm');
  });

  it('asset-mutating tools reject another user’s asset (narrate / publish / montage)', async () => {
    const services = buildServices({});
    const aPid = (JSON.parse(textOf(await call({ services, userId: 'A' }, 30, 'forgecast_create_project', { name: 'A' }))) as { project: { id: string } }).project.id;
    await services.assets.create(newAsset({ projectId: aPid, type: 'video', provider: 'x', storageKey: 'k', params: {} }, { id: 'v1', now: 'T' }));
    const bPid = (JSON.parse(textOf(await call({ services, userId: 'B' }, 31, 'forgecast_create_project', { name: 'B' }))) as { project: { id: string } }).project.id;
    // B tries to reach A's asset "v1" through every asset-scoped mutation tool.
    for (const [id, name, args] of [
      [32, 'forgecast_narrate_video', { projectId: bPid, videoAssetId: 'v1', text: 'hi' }],
      [33, 'forgecast_publish_asset', { assetId: 'v1', content: 'x' }],
      [34, 'forgecast_generate_montage', { projectId: bPid, assetIds: ['v1', 'v1'] }],
    ] as const) {
      const res = await call({ services, userId: 'B' }, id, name, args);
      expect(bodyOf(res).result?.isError).toBe(true);
      expect(textOf(res)).toContain('asset not found');
    }
  });
});

describe('API tokens', () => {
  it('mintApiToken → userFromBearer round-trips; junk is rejected', async () => {
    const services = buildServices({});
    await services.users.upsert({ id: 'u9', email: 'x@y.com', createdAt: new Date(0).toISOString() });
    const token = await mintApiToken(cfg, 'u9');
    expect((await userFromBearer(services, cfg, `Bearer ${token}`))?.id).toBe('u9');
    expect(await userFromBearer(services, cfg, 'Bearer garbage')).toBeNull();
    expect(await userFromBearer(services, cfg, null)).toBeNull();
    expect(bearerToken('Bearer abc123')).toBe('abc123');
    expect(bearerToken(null)).toBeNull();
  });
});

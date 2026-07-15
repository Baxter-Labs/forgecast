import { describe, it, expect } from 'vitest';
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

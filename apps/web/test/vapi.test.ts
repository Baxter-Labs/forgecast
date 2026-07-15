import { describe, it, expect, vi, afterEach } from 'vitest';
import { newJob } from '@forgecast/core';
import { handleVapiToolCalls, verifyVapiSecret, type VoiceActions } from '../lib/voice/vapi';
import { makeVoiceActions } from '../lib/voice/actions';
import { buildServices } from '../lib/forgecast';

function actions(): VoiceActions {
  return {
    createContent: vi.fn(async (a) => `made: ${a.brief}`),
    checkJob: vi.fn(async (a) => `job ${a.jobId}`),
    listProjects: vi.fn(async () => 'projects list'),
  };
}

describe('handleVapiToolCalls', () => {
  it('dispatches create_content with object arguments', async () => {
    const a = actions();
    const payload = { message: { toolCalls: [{ id: 'c1', function: { name: 'create_content', arguments: { brief: 'eco sneakers', platforms: ['instagram'] } } }] } };
    const res = await handleVapiToolCalls(payload, a);
    expect(res.results).toEqual([{ toolCallId: 'c1', result: 'made: eco sneakers' }]);
    expect(a.createContent).toHaveBeenCalledWith({ brief: 'eco sneakers', platforms: ['instagram'], publish: undefined });
  });

  it('parses arguments given as a JSON string and uses toolCallId', async () => {
    const a = actions();
    const payload = { message: { toolCalls: [{ toolCallId: 'c2', function: { name: 'check_job', arguments: JSON.stringify({ jobId: 'j1' }) } }] } };
    const res = await handleVapiToolCalls(payload, a);
    expect(res.results[0]).toEqual({ toolCallId: 'c2', result: 'job j1' });
  });

  it('returns an error result for an unknown tool', async () => {
    const res = await handleVapiToolCalls({ message: { toolCalls: [{ id: 'c3', function: { name: 'nope', arguments: {} } }] } }, actions());
    expect(res.results[0]!.result).toMatch(/unknown tool/i);
  });

  it('handles multiple tool calls', async () => {
    const res = await handleVapiToolCalls({ message: { toolCalls: [
      { id: 'a', function: { name: 'list_projects', arguments: {} } },
      { id: 'b', function: { name: 'check_job', arguments: { jobId: 'j9' } } },
    ] } }, actions());
    expect(res.results.map((r) => r.toolCallId)).toEqual(['a', 'b']);
  });
});

describe('verifyVapiSecret (fail-closed auth)', () => {
  const saved = process.env.VAPI_WEBHOOK_SECRET;
  afterEach(() => { if (saved === undefined) delete process.env.VAPI_WEBHOOK_SECRET; else process.env.VAPI_WEBHOOK_SECRET = saved; });

  it('503 when VAPI_WEBHOOK_SECRET is unset — the webhook is disabled', () => {
    delete process.env.VAPI_WEBHOOK_SECRET;
    const r = verifyVapiSecret('anything');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
  });

  it('401 when the x-vapi-secret header is missing or wrong', () => {
    process.env.VAPI_WEBHOOK_SECRET = 's3cret';
    expect((verifyVapiSecret(null) as { ok: false; status: number }).status).toBe(401);
    expect((verifyVapiSecret('wrong') as { ok: false; status: number }).status).toBe(401);
  });

  it('ok only when the header matches', () => {
    process.env.VAPI_WEBHOOK_SECRET = 's3cret';
    expect(verifyVapiSecret('s3cret')).toEqual({ ok: true });
  });
});

describe('makeVoiceActions is owner-scoped (no cross-tenant leak)', () => {
  it('listProjects + checkJob only see the owner’s workspace', async () => {
    const services = buildServices({});
    await services.projects.create({ id: 'p1', name: 'Mine', createdAt: 'T', ownerId: 'owner' });
    await services.projects.create({ id: 'p2', name: 'Theirs', createdAt: 'T', ownerId: 'other' });
    await services.jobs.create(newJob({ projectId: 'p2', kind: 'image', provider: 'x', params: {} }, { id: 'j1', now: 'T' }));

    const owner = makeVoiceActions(services, 'owner');
    const list = await owner.listProjects();
    expect(list).toContain('Mine');
    expect(list).not.toContain('Theirs');
    expect(await owner.checkJob({ jobId: 'j1' })).toContain("couldn't find"); // another owner's job is invisible
  });
});

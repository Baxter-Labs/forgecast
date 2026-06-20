import { describe, it, expect, vi } from 'vitest';
import { handleVapiToolCalls, type VoiceActions } from '../lib/voice/vapi';

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

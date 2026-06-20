import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { makeForgecastActions } from '../lib/agent/forgecast-actions';
import { OpenAiLlmClient } from '../lib/agent/llm';

const savedVideoKey = process.env.FAL_KEY_VIDEO;
const savedKey = process.env.OPENAI_API_KEY;
const savedMontage = process.env.MONTAGE_WORKER_URL;
afterEach(() => {
  if (savedVideoKey === undefined) delete process.env.FAL_KEY_VIDEO; else process.env.FAL_KEY_VIDEO = savedVideoKey;
  if (savedKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = savedKey;
  if (savedMontage === undefined) delete process.env.MONTAGE_WORKER_URL; else process.env.MONTAGE_WORKER_URL = savedMontage;
});

describe('makeForgecastActions', () => {
  it('ensures a project', async () => {
    const svc = buildServices({ falKey: 'k' });
    const actions = makeForgecastActions(svc);
    const pid = await actions.ensureProject('Demo');
    expect((await svc.projects.get(pid))?.name).toBe('Demo');
  });

  it('queues a video job when FAL_KEY_VIDEO is configured', async () => {
    const svc = buildServices({ falVideoKey: 'k', fetchFn: vi.fn(async () => new Response('{}', { status: 200 })) });
    const actions = makeForgecastActions(svc);
    const pid = await actions.ensureProject('P');
    const { jobId } = await actions.generateVideo(pid, 'a fox', '9:16');
    expect(jobId.length).toBeGreaterThan(0);
  });

});

describe('OpenAiLlmClient', () => {
  it('is unavailable without a key and reports content from a mocked response', async () => {
    expect(new OpenAiLlmClient({ apiKey: undefined }).isAvailable()).toBe(false);
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const llm = new OpenAiLlmClient({ apiKey: 'k', fetchFn });
    expect(await llm.complete({ system: 's', user: 'u' })).toBe('hi');
    expect((fetchFn.mock.calls[0] as unknown as unknown[])[0] as string).toContain('/chat/completions');
  });
});

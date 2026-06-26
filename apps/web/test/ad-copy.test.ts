import { describe, it, expect, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, saveBrandKit, generateAdCopy } from '../lib/api';

function makeServices() {
  const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => new Response('', { status: 200 }));
  return buildServices({ fetchFn });
}

async function newProjectId(svc: ReturnType<typeof buildServices>): Promise<string> {
  const pc = await createProject(svc, { name: 'Ad Copy Test' });
  return (pc.body as { project: { id: string } }).project.id;
}

/** A stub LLM that records the prompt it was asked and returns a fixed JSON array. */
function fakeLlm(reply: string, available = true) {
  const complete = vi.fn(async (_input: { system: string; user: string }) => reply);
  return { llm: { isAvailable: () => available, complete }, complete };
}

describe('generateAdCopy', () => {
  it('returns char-limited, A/B-tagged variants for the platform', async () => {
    const svc = makeServices();
    const projectId = await newProjectId(svc);
    const { llm } = fakeLlm('["Forge it. Cast it.", "Own your whole pipeline.", "No lock-in, ever."]');

    const r = await generateAdCopy(svc, projectId, { brief: 'Launch Forgecast', platform: 'twitter', count: 3 }, llm);
    expect(r.status).toBe(200);
    const body = r.body as { platform: string; limit: number; variants: Array<{ id: string; text: string; chars: number }> };
    expect(body.platform).toBe('twitter');
    expect(body.limit).toBe(280);
    expect(body.variants.map((v) => v.id)).toEqual(['A', 'B', 'C']);
    expect(body.variants.every((v) => v.chars <= 280)).toBe(true);
  });

  it('feeds the project brand voice into the prompt', async () => {
    const svc = makeServices();
    const projectId = await newProjectId(svc);
    await saveBrandKit(svc, projectId, { name: 'Forgecast', toneOfVoice: 'bold, terse, builder-to-builder' });
    const { llm, complete } = fakeLlm('["one"]');

    await generateAdCopy(svc, projectId, { brief: 'x', platform: 'linkedin', count: 1 }, llm);
    const sentSystem = complete.mock.calls[0]![0].system;
    expect(sentSystem).toContain('Forgecast');
    expect(sentSystem).toContain('builder-to-builder');
  });

  it('503s when no LLM is configured', async () => {
    const svc = makeServices();
    const projectId = await newProjectId(svc);
    const { llm } = fakeLlm('[]', false);
    const r = await generateAdCopy(svc, projectId, { brief: 'x', platform: 'twitter' }, llm);
    expect(r.status).toBe(503);
  });

  it('400s without a brief', async () => {
    const svc = makeServices();
    const projectId = await newProjectId(svc);
    const { llm } = fakeLlm('[]');
    const r = await generateAdCopy(svc, projectId, { platform: 'twitter' }, llm);
    expect(r.status).toBe(400);
  });

  it('404s for an unknown project', async () => {
    const svc = makeServices();
    const { llm } = fakeLlm('["x"]');
    const r = await generateAdCopy(svc, 'nope', { brief: 'x' }, llm);
    expect(r.status).toBe(404);
  });

  it('defaults to instagram and 3 variants', async () => {
    const svc = makeServices();
    const projectId = await newProjectId(svc);
    const { llm } = fakeLlm('["a","b","c","d"]');
    const r = await generateAdCopy(svc, projectId, { brief: 'launch' }, llm);
    const body = r.body as { platform: string; variants: unknown[] };
    expect(body.platform).toBe('instagram');
    expect(body.variants).toHaveLength(3);
  });
});

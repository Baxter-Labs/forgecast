import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, generateVideo } from '../lib/api';
import { handleMcpMessage } from '../lib/mcp';

const savedVideoKey = process.env.FAL_KEY_VIDEO;
afterEach(() => {
  if (savedVideoKey === undefined) delete process.env.FAL_KEY_VIDEO;
  else process.env.FAL_KEY_VIDEO = savedVideoKey;
});

/** A fal-video mock that also captures the outgoing request body (the submit POST). */
function videoServices() {
  const providerFetch = vi.fn(async () =>
    new Response(JSON.stringify({ request_id: 'abc', response_url: 'https://queue.fal.run/x/requests/abc' }), { status: 200 }),
  );
  const svc = buildServices({ falVideoKey: 'k', fetchFn: providerFetch as unknown as typeof fetch });
  return { svc, providerFetch };
}

/** The prompt sent to the provider = body of the first (submit) POST. */
function sentPrompt(providerFetch: ReturnType<typeof vi.fn>): string {
  const init = providerFetch.mock.calls[0]![1] as { body: string };
  return (JSON.parse(init.body) as { prompt: string }).prompt;
}

async function project(svc: ReturnType<typeof buildServices>) {
  const created = await createProject(svc, { name: 'P' });
  return (created.body as { project: { id: string } }).project.id;
}

describe('api: generateVideo folds cinema direction into the provider prompt', () => {
  it('appends the selected SHOT/LOOK modifiers to the outgoing prompt and stamps provenance', async () => {
    const { svc, providerFetch } = videoServices();
    const pid = await project(svc);
    const r = await generateVideo(svc, pid, { prompt: 'a fox', aspectRatio: '9:16', cinema: { shot: 'close-up', look: 'teal-orange' } });
    expect(r.status).toBe(202);

    const prompt = sentPrompt(providerFetch);
    expect(prompt).toContain('a fox');
    expect(prompt).toContain('shot as a tight close-up');
    expect(prompt).toContain('teal-and-orange cinematic color palette');

    // provenance: the whitelisted ids are stamped onto the job params.
    const job = (r.body as { job: { params: Record<string, unknown> } }).job;
    expect(job.params.cinema).toEqual({ shot: 'close-up', look: 'teal-orange' });
  });

  it('drops unknown cinema ids but keeps valid ones', async () => {
    const { svc, providerFetch } = videoServices();
    const pid = await project(svc);
    const r = await generateVideo(svc, pid, { prompt: 'a fox', cinema: { move: 'not-real', lens: 'portrait-85mm' } });
    expect(r.status).toBe(202);

    const prompt = sentPrompt(providerFetch);
    expect(prompt).toContain('85mm portrait lens with shallow depth of field');
    expect(prompt).not.toContain('not-real');
    expect((r.body as { job: { params: Record<string, unknown> } }).job.params.cinema).toEqual({ lens: 'portrait-85mm' });
  });

  it('leaves the provider prompt untouched and stamps nothing when cinema is absent', async () => {
    const { svc, providerFetch } = videoServices();
    const pid = await project(svc);
    const r = await generateVideo(svc, pid, { prompt: 'a plain fox' });
    expect(r.status).toBe(202);

    expect(sentPrompt(providerFetch)).toBe('a plain fox');
    expect((r.body as { job: { params: Record<string, unknown> } }).job.params.cinema).toBeUndefined();
  });
});

describe('mcp: forgecast_generate_video forwards cinema direction', () => {
  const textOf = (r: Awaited<ReturnType<typeof handleMcpMessage>>) =>
    ((r!.body as { result: { content: { text: string }[] } }).result.content[0]!.text);

  it('forwards shot + look as cinema modifiers into the provider prompt', async () => {
    const { svc, providerFetch } = videoServices();
    const created = await handleMcpMessage({ services: svc, userId: 'A' }, {
      jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'forgecast_create_project', arguments: { name: 'V' } },
    });
    const pid = (JSON.parse(textOf(created)) as { project: { id: string } }).project.id;

    const res = await handleMcpMessage({ services: svc, userId: 'A' }, {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'forgecast_generate_video', arguments: { projectId: pid, prompt: 'a fox', shot: 'wide', look: 'teal-orange' } },
    });
    expect((res!.body as { result: { isError?: boolean } }).result.isError).toBeFalsy();

    const prompt = sentPrompt(providerFetch);
    expect(prompt).toContain('framed as a wide shot');
    expect(prompt).toContain('teal-and-orange cinematic color palette');
  });
});

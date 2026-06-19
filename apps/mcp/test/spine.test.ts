import { describe, it, expect, vi } from 'vitest';
import { SpineClient, SpineError } from '../src/spine';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('SpineClient', () => {
  it('lists and creates projects', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ projects: [{ id: 'p1', name: 'A', createdAt: 'T' }] }));
    const c = new SpineClient({ baseUrl: 'http://api', fetchFn });
    expect((await c.listProjects()).projects).toHaveLength(1);
    expect(fetchFn).toHaveBeenLastCalledWith('http://api/api/projects', undefined);

    const fetch2 = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ project: { id: 'p2', name: 'B', createdAt: 'T' } }, 201));
    const c2 = new SpineClient({ baseUrl: 'http://api', fetchFn: fetch2 });
    const created = await c2.createProject('B');
    expect(created.project.id).toBe('p2');
    const [url, init] = fetch2.mock.calls[0]!;
    expect(url).toBe('http://api/api/projects');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ name: 'B' });
  });

  it('generates an image (returns job + asset) and exposes the asset url', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ job: { id: 'j1', status: 'done' }, asset: { id: 'a1', type: 'image' } }),
    );
    const c = new SpineClient({ baseUrl: 'http://api', fetchFn });
    const r = await c.generateImage('p1', { prompt: 'a fox', width: 512, height: 512 });
    expect(r.asset?.id).toBe('a1');
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://api/api/projects/p1/generate');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ prompt: 'a fox', width: 512 });
    expect(c.assetUrl('a1')).toBe('http://api/api/assets/a1/raw');
  });

  it('starts a short video and reads a job', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ job: { id: 'jv', kind: 'short_video', status: 'queued' } }, 202));
    const c = new SpineClient({ baseUrl: 'http://api', fetchFn });
    const r = await c.generateShortVideo('p1', 'cats in space');
    expect(r.job.id).toBe('jv');
    expect(fetchFn.mock.calls[0]![0]).toBe('http://api/api/projects/p1/generate-video');

    const fetch2 = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ job: { id: 'jv', status: 'running', progress: 0.4 } }));
    const c2 = new SpineClient({ baseUrl: 'http://api', fetchFn: fetch2 });
    expect((await c2.getJob('jv')).job.status).toBe('running');
  });

  it('throws SpineError with the api error message on failure', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ error: 'project not found' }, 404));
    const c = new SpineClient({ baseUrl: 'http://api', fetchFn });
    await expect(c.getJob('nope')).rejects.toBeInstanceOf(SpineError);
    await expect(c.listAssets('nope')).rejects.toThrowError(/project not found/);
  });

  it('defaults the base url and strips a trailing slash', () => {
    const c = new SpineClient({ baseUrl: 'http://api/' });
    expect(c.assetUrl('x')).toBe('http://api/api/assets/x/raw');
  });
});

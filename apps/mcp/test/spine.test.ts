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

  it('publishes an asset and returns the post id', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ published: { postId: 'post_1', status: 'publishing' } }),
    );
    const c = new SpineClient({ baseUrl: 'http://api', fetchFn });
    const r = await c.publishAsset('a1', { content: 'hi', channels: ['instagram'] });
    expect(r.published.postId).toBe('post_1');
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://api/api/assets/a1/publish');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ content: 'hi', channels: ['instagram'] });
  });

  it('generates a video clip and returns the queued job', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ job: { id: 'jv', kind: 'video', status: 'queued' } }, 202),
    );
    const c = new SpineClient({ baseUrl: 'http://api', fetchFn });
    const r = await c.generateVideo('p1', { prompt: 'a fox', aspectRatio: '9:16' });
    expect(r.job.id).toBe('jv');
    expect(r.job.kind).toBe('video');
    expect(r.job.status).toBe('queued');
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://api/api/projects/p1/generate-clip');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ prompt: 'a fox', aspectRatio: '9:16' });
  });

  it('enhances an image asset (POST, no body) and returns job + asset', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ job: { id: 'je', status: 'done' }, asset: { id: 'a2', type: 'image', provider: 'enhance' } }),
    );
    const c = new SpineClient({ baseUrl: 'http://api', fetchFn });
    const r = await c.enhanceAsset('p1', 'a1');
    expect(r.asset?.provider).toBe('enhance');
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://api/api/projects/p1/assets/a1/enhance');
    expect((init as RequestInit).method).toBe('POST');
  });

  it('edits an image asset with a prompt', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ job: { id: 'jd', status: 'done' }, asset: { id: 'a3', type: 'image', provider: 'edit' } }),
    );
    const c = new SpineClient({ baseUrl: 'http://api', fetchFn });
    const r = await c.editAsset('p1', 'a1', 'make it blue');
    expect(r.asset?.provider).toBe('edit');
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://api/api/projects/p1/assets/a1/edit');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ prompt: 'make it blue' });
  });

  it('cuts out an image background', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ job: { id: 'jc', status: 'done' }, asset: { id: 'a4', type: 'image', provider: 'cutout' } }),
    );
    const c = new SpineClient({ baseUrl: 'http://api', fetchFn });
    const r = await c.cutoutAsset('p1', 'a1');
    expect(r.asset?.provider).toBe('cutout');
    expect(fetchFn.mock.calls[0]![0]).toBe('http://api/api/projects/p1/assets/a1/cutout');
  });

  it('narrates a video and returns the queued job', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ job: { id: 'jn', kind: 'narrate', status: 'queued' } }, 202),
    );
    const c = new SpineClient({ baseUrl: 'http://api', fetchFn });
    const r = await c.narrateVideo('p1', { videoAssetId: 'v1', text: 'hello world' });
    expect(r.job.id).toBe('jn');
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://api/api/projects/p1/narrate');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ videoAssetId: 'v1', text: 'hello world' });
  });

  it('generates a montage and returns the queued job', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ job: { id: 'jm', kind: 'montage', status: 'queued' } }, 202),
    );
    const c = new SpineClient({ baseUrl: 'http://api', fetchFn });
    const r = await c.generateMontage('p1', { assetIds: ['a1', 'a2'], aspectRatio: '9:16' });
    expect(r.job.id).toBe('jm');
    expect(r.job.kind).toBe('montage');
    expect(r.job.status).toBe('queued');
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://api/api/projects/p1/generate-montage');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ assetIds: ['a1', 'a2'], aspectRatio: '9:16' });
  });

  it('reports providers + publishers from health (cross-post discovery)', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ ok: true, providers: { image: ['fal'], video: [] }, publishers: ['omnisocials', 'instagram'] }),
    );
    const c = new SpineClient({ baseUrl: 'http://api', fetchFn });
    const h = await c.health();
    expect(h.publishers).toEqual(['omnisocials', 'instagram']);
    expect(h.providers.image).toEqual(['fal']);
    expect(fetchFn.mock.calls[0]![0]).toBe('http://api/api/health');
  });

  it('gets and saves a brand kit', async () => {
    const getFetch = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ brandKit: { name: 'Acme' } }));
    expect((await new SpineClient({ baseUrl: 'http://api', fetchFn: getFetch }).getBrandKit('p1')).brandKit.name).toBe('Acme');
    expect(getFetch.mock.calls[0]![0]).toBe('http://api/api/projects/p1/brand-kit');

    const putFetch = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ brandKit: { name: 'Acme', palette: ['#000'] } }));
    const c = new SpineClient({ baseUrl: 'http://api', fetchFn: putFetch });
    const r = await c.saveBrandKit('p1', { name: 'Acme', palette: ['#000'] });
    expect(r.brandKit.palette).toEqual(['#000']);
    const [url, init] = putFetch.mock.calls[0]!;
    expect(url).toBe('http://api/api/projects/p1/brand-kit');
    expect((init as RequestInit).method).toBe('PUT');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ name: 'Acme', palette: ['#000'] });
  });

  it('creates assets from a website', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ assets: [{ id: 'a1', type: 'image' }], summary: { imported: 1, generated: 2, enhanced: 1 } }),
    );
    const c = new SpineClient({ baseUrl: 'http://api', fetchFn });
    const r = await c.generateFromWebsite('p1', { url: 'https://acme.com', generateCount: 2 });
    expect(r.assets).toHaveLength(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://api/api/projects/p1/from-website');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ url: 'https://acme.com', generateCount: 2 });
  });
});

import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, generateFromWebsite } from '../lib/api';
import type { WebsiteInfo } from '@forgecast/core';

const savedBase = process.env.FORGECAST_BASE_URL;
afterEach(() => {
  if (savedBase === undefined) delete process.env.FORGECAST_BASE_URL;
  else process.env.FORGECAST_BASE_URL = savedBase;
});

function stubSite(images: string[]): WebsiteInfo {
  return { url: 'https://acme.com', title: 'Acme', siteName: 'Acme', description: 'Premium widgets', headings: [], text: 'body', images };
}

// One fetch stub serves: image downloads (import) AND fal.run model calls (generate/enhance).
function makeFetch() {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('fal.run')) {
      return new Response(JSON.stringify({ images: [{ url: 'https://cdn.fal/out.png' }] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    // image download (site images + fal cdn result)
    return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  });
}

async function setup(images: string[]) {
  const fetchFn = makeFetch();
  const svc = buildServices({ falKey: 'k', fetchFn });
  svc.websiteReader = { read: async () => stubSite(images) };
  const created = await createProject(svc, { name: 'WebTest' });
  const pid = (created.body as { project: { id: string } }).project.id;
  return { svc, pid, fetchFn };
}

describe('api: generateFromWebsite', () => {
  it('returns 400 when url is missing', async () => {
    const { svc, pid } = await setup([]);
    const r = await generateFromWebsite(svc, pid, {}, makeFetch());
    expect(r.status).toBe(400);
  });

  it('returns 400 when the reader throws (e.g. SSRF guard / unreachable)', async () => {
    const fetchFn = makeFetch();
    const svc = buildServices({ falKey: 'k', fetchFn });
    svc.websiteReader = { read: async () => { throw new Error('blocked host'); } };
    const created = await createProject(svc, { name: 'Bad' });
    const pid = (created.body as { project: { id: string } }).project.id;
    const r = await generateFromWebsite(svc, pid, { url: 'http://localhost' }, fetchFn);
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toMatch(/could not read website/);
  });

  it('imports site images, generates on-brand images, and enhances imports', async () => {
    delete process.env.FORGECAST_BASE_URL;
    const { svc, pid, fetchFn } = await setup(['https://acme.com/p1.jpg', 'https://acme.com/p2.jpg']);

    const r = await generateFromWebsite(svc, pid, { url: 'https://acme.com', generateCount: 2 }, fetchFn);
    expect(r.status).toBe(200);

    const body = r.body as { assets: { provider: string }[]; summary: { imported: number; generated: number; enhanced: number } };
    expect(body.summary.imported).toBe(2);
    expect(body.summary.generated).toBe(2);
    expect(body.summary.enhanced).toBe(2);

    const providers = body.assets.map((a) => a.provider);
    expect(providers.filter((p) => p === 'web-import')).toHaveLength(2);
    expect(providers.filter((p) => p === 'fal')).toHaveLength(2);     // generated
    expect(providers.filter((p) => p === 'enhance')).toHaveLength(2); // enhanced imports
  });

  it('imports without generating/enhancing when those are disabled', async () => {
    const { svc, pid, fetchFn } = await setup(['https://acme.com/p1.jpg']);
    const r = await generateFromWebsite(svc, pid, { url: 'https://acme.com', generate: false, enhance: false }, fetchFn);
    expect(r.status).toBe(200);
    const body = r.body as { assets: { provider: string }[]; summary: { imported: number; generated: number; enhanced: number } };
    expect(body.summary).toMatchObject({ imported: 1, generated: 0, enhanced: 0 });
    expect(body.assets).toHaveLength(1);
    expect(body.assets[0]!.provider).toBe('web-import');
  });

  it('returns 422 when the site has no usable images and generation is off', async () => {
    const { svc, pid, fetchFn } = await setup([]);
    const r = await generateFromWebsite(svc, pid, { url: 'https://acme.com', generate: false }, fetchFn);
    expect(r.status).toBe(422);
  });
});

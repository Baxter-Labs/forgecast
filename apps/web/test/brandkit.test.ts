import { describe, it, expect, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, saveBrandKit, readBrandKit, deriveBrandKitFromWebsite, getBrandKit, generateImage } from '../lib/api';
import type { WebsiteInfo } from '@forgecast/core';

async function project(svc: ReturnType<typeof buildServices>) {
  const created = await createProject(svc, { name: 'BrandTest' });
  return (created.body as { project: { id: string } }).project.id;
}

describe('api: brand kit persistence', () => {
  it('saves and reads back a sanitized brand kit', async () => {
    const svc = buildServices({ falKey: 'k' });
    const pid = await project(svc);

    const r = await saveBrandKit(svc, pid, {
      name: 'Forgecast',
      tagline: '  Forge it, cast it  ',
      palette: ['#0A0604', '#FF7A1A', 42, ''],
      fonts: { display: 'Bricolage Grotesque' },
      keyMessages: ['You own it', '   ', 'No lock-in'],
      bogus: 'dropped',
    });
    expect(r.status).toBe(200);
    const saved = (r.body as { brandKit: Record<string, unknown> }).brandKit;
    expect(saved).toMatchObject({
      name: 'Forgecast',
      tagline: 'Forge it, cast it',
      palette: ['#0A0604', '#FF7A1A'],
      fonts: { display: 'Bricolage Grotesque' },
      keyMessages: ['You own it', 'No lock-in'],
    });
    expect((saved as { bogus?: unknown }).bogus).toBeUndefined();

    const back = await readBrandKit(svc, pid);
    expect((back.body as { brandKit: { name: string } }).brandKit.name).toBe('Forgecast');
  });

  it('returns an empty kit when none is set, and 404 for a missing project', async () => {
    const svc = buildServices({ falKey: 'k' });
    const pid = await project(svc);
    expect((await readBrandKit(svc, pid)).body).toEqual({ brandKit: {} });
    expect((await saveBrandKit(svc, 'ghost', { name: 'x' })).status).toBe(404);
  });
});

describe('api: deriveBrandKitFromWebsite', () => {
  it('seeds name/tagline/key-messages/notes from the site', async () => {
    const svc = buildServices({ falKey: 'k' });
    svc.websiteReader = {
      read: async (): Promise<WebsiteInfo> => ({
        url: 'https://acme.com',
        title: 'Acme',
        siteName: 'Acme Inc',
        description: 'Premium widgets for builders. Loved worldwide.',
        headings: ['Fast', 'Owned', 'Open'],
        text: 'body',
        images: [],
      }),
    };
    const pid = await project(svc);
    const r = await deriveBrandKitFromWebsite(svc, pid, { url: 'https://acme.com' });
    expect(r.status).toBe(200);
    const kit = (r.body as { brandKit: Record<string, unknown> }).brandKit;
    expect(kit.name).toBe('Acme Inc');
    expect(kit.tagline).toBe('Premium widgets for builders');
    expect(kit.keyMessages).toEqual(['Fast', 'Owned', 'Open']);
    expect(kit.sourceUrl).toBe('https://acme.com');
    // persisted
    expect((await getBrandKit(svc, pid))?.name).toBe('Acme Inc');
  });

  it('400 on missing url', async () => {
    const svc = buildServices({ falKey: 'k' });
    const pid = await project(svc);
    expect((await deriveBrandKitFromWebsite(svc, pid, {})).status).toBe(400);
  });
});

describe('api: generateImage applies the brand kit', () => {
  it('prepends the brand preamble to the generation prompt', async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('fal.run')) {
        return new Response(JSON.stringify({ images: [{ url: 'https://cdn.fal/x.png' }] }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } });
    });
    const svc = buildServices({ falKey: 'k', fetchFn });
    const pid = await project(svc);
    await saveBrandKit(svc, pid, { name: 'Forgecast', palette: ['#FF7A1A'] });

    const r = await generateImage(svc, pid, { prompt: 'a hero shot of sneakers' });
    expect(r.status).toBe(200);
    const sentPrompt = (r.body as { job: { params: { prompt: string } } }).job.params.prompt;
    expect(sentPrompt).toContain('On-brand for brand "Forgecast"');
    expect(sentPrompt).toContain('#FF7A1A');
    expect(sentPrompt.endsWith('a hero shot of sneakers')).toBe(true);
  });

  it('leaves the prompt unchanged when no brand kit is set', async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('fal.run')) {
        return new Response(JSON.stringify({ images: [{ url: 'https://cdn.fal/x.png' }] }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } });
    });
    const svc = buildServices({ falKey: 'k', fetchFn });
    const pid = await project(svc);
    const r = await generateImage(svc, pid, { prompt: 'just a fox' });
    expect((r.body as { job: { params: { prompt: string } } }).job.params.prompt).toBe('just a fox');
  });
});

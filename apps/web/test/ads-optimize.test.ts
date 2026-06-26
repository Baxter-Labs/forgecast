import { describe, it, expect, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, saveBrandKit, optimizeFatiguedCreatives } from '../lib/api';
import type { AdCreativeMetrics, ImageProvider } from '@forgecast/core';

function fakeImageProvider(): ImageProvider {
  return {
    name: 'fal',
    isAvailable: () => true,
    async generateImage(input) { return { url: `https://cdn/${encodeURIComponent(input.prompt).slice(0, 24)}.png` }; },
  };
}

function makeServices(withImage: boolean) {
  const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
    new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } }),
  );
  const svc = buildServices({ falKey: withImage ? 'k' : undefined, fetchFn });
  if (withImage) svc.imageRegistry.register(fakeImageProvider());
  return svc;
}

async function newProjectId(svc: ReturnType<typeof buildServices>): Promise<string> {
  const pc = await createProject(svc, { name: 'Optimize Test' });
  return (pc.body as { project: { id: string } }).project.id;
}

/** A fatiguing creative (sharp CTR decay) + a steady one. */
function metrics(): AdCreativeMetrics[] {
  const out: AdCreativeMetrics[] = [];
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    out.push({ creativeId: 'tired', name: 'Hero', platform: 'meta', date: `2026-06-0${i + 1}`, impressions: 3000, clicks: Math.round(3000 * (0.03 - 0.02 * t)), spend: 50, frequency: 1.4 + 2.4 * t });
    out.push({ creativeId: 'fresh', name: 'Steady', platform: 'meta', date: `2026-06-0${i + 1}`, impressions: 3000, clicks: Math.round(3000 * 0.024), spend: 50 });
  }
  return out;
}

describe('optimizeFatiguedCreatives', () => {
  it('regenerates an on-brand replacement for each fatigued creative when image gen is available', async () => {
    const svc = makeServices(true);
    const projectId = await newProjectId(svc);
    await saveBrandKit(svc, projectId, { name: 'Forgecast', toneOfVoice: 'bold' });

    const r = await optimizeFatiguedCreatives(svc, projectId, { metrics: metrics() });
    expect(r.status).toBe(200);
    const body = r.body as { imageReady: boolean; fatiguedCount: number; regenerated: Array<{ creativeId: string; newAssetId: string }>; optimizations: Array<{ creativeId: string; brief: string }> };
    expect(body.imageReady).toBe(true);
    expect(body.fatiguedCount).toBeGreaterThanOrEqual(1);
    expect(body.regenerated.length).toBeGreaterThanOrEqual(1);
    expect(body.regenerated[0]!.creativeId).toBe('tired');
    expect(body.regenerated[0]!.newAssetId).toBeTruthy();
    // The generated asset really exists in the project.
    const asset = await svc.assets.get(body.regenerated[0]!.newAssetId);
    expect(asset).toBeTruthy();
  });

  it('degrades to a plan (no generation) when image gen is not configured', async () => {
    const svc = makeServices(false);
    const projectId = await newProjectId(svc);
    const r = await optimizeFatiguedCreatives(svc, projectId, { metrics: metrics() });
    expect(r.status).toBe(200);
    const body = r.body as { imageReady: boolean; regenerated: unknown[]; optimizations: Array<{ newAssetId: string | null; brief: string }>; note?: string };
    expect(body.imageReady).toBe(false);
    expect(body.regenerated).toHaveLength(0);
    expect(body.optimizations[0]!.newAssetId).toBeNull();
    expect(body.optimizations[0]!.brief).toMatch(/fresh/i);
    expect(body.note).toMatch(/FAL_KEY/);
  });

  it('404s for an unknown project', async () => {
    const svc = makeServices(true);
    const r = await optimizeFatiguedCreatives(svc, 'nope', { metrics: metrics() });
    expect(r.status).toBe(404);
  });

  it('503s when no metrics and no source are available', async () => {
    const svc = makeServices(true);
    const projectId = await newProjectId(svc);
    const r = await optimizeFatiguedCreatives(svc, projectId, {});
    expect(r.status).toBe(503);
  });
});

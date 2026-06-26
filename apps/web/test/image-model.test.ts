import { describe, it, expect, vi } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, generateImage } from '../lib/api';
import type { ImageProvider, GenerateImageInput } from '@forgecast/core';

/** Build services with a capturing fake `fal` image provider (overrides the real one). */
function makeServices() {
  const captured: GenerateImageInput[] = [];
  const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
    new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } }),
  );
  const svc = buildServices({ falKey: 'k', fetchFn });
  const provider: ImageProvider = {
    name: 'fal',
    isAvailable: () => true,
    async generateImage(input) { captured.push(input); return { url: 'https://cdn/x.png' }; },
  };
  svc.imageRegistry.register(provider);
  return { svc, captured };
}

async function newProjectId(svc: ReturnType<typeof buildServices>): Promise<string> {
  const r = await createProject(svc, { name: 'Image Model Test' });
  return (r.body as { project: { id: string } }).project.id;
}

describe('generateImage — model selection actually reaches the provider', () => {
  it('defaults to Nano Banana and sends aspect_ratio (not image_size)', async () => {
    const { svc, captured } = makeServices();
    const pid = await newProjectId(svc);
    await generateImage(svc, pid, { prompt: 'a fox', aspectRatio: '16:9', width: 1024, height: 576 });
    expect(captured[0]!.model).toBe('fal-ai/nano-banana');
    expect(captured[0]!.extra).toEqual({ aspect_ratio: '16:9' });
    expect(captured[0]!.width).toBeUndefined();
    expect(captured[0]!.height).toBeUndefined();
  });

  it('sends pixel image_size (width/height) for the FLUX family', async () => {
    const { svc, captured } = makeServices();
    const pid = await newProjectId(svc);
    await generateImage(svc, pid, { prompt: 'a fox', model: 'fal-ai/flux/schnell', aspectRatio: '1:1', width: 512, height: 512 });
    expect(captured[0]!.model).toBe('fal-ai/flux/schnell');
    expect(captured[0]!.extra).toBeUndefined();
    expect(captured[0]!.width).toBe(512);
    expect(captured[0]!.height).toBe(512);
  });

  it('clamps an out-of-enum ratio to 1:1 for aspect_ratio models', async () => {
    const { svc, captured } = makeServices();
    const pid = await newProjectId(svc);
    await generateImage(svc, pid, { prompt: 'x', model: 'fal-ai/nano-banana', aspectRatio: '5:11' });
    expect(captured[0]!.extra).toEqual({ aspect_ratio: '1:1' });
  });

  it('records the chosen model on the asset', async () => {
    const { svc } = makeServices();
    const pid = await newProjectId(svc);
    const r = await generateImage(svc, pid, { prompt: 'x' });
    const asset = (r.body as { asset: { params: { model?: string } } }).asset;
    expect(asset.params.model).toBe('fal-ai/nano-banana');
  });
});

import { describe, it, expect } from 'vitest';
import { buildServices } from '../lib/forgecast';

describe('buildServices', () => {
  it('wires a runner with an image handler and a provider registry', () => {
    const svc = buildServices({ falKey: 'k-test' });
    expect(svc.imageRegistry.available()).toContain('fal');
    expect(svc.runner).toBeDefined();
    expect(svc.projects).toBeDefined();
    expect(svc.assets).toBeDefined();
    expect(svc.jobs).toBeDefined();
  });

  it('reports fal unavailable when no key is configured', () => {
    const svc = buildServices({ falKey: undefined });
    expect(svc.imageRegistry.available()).not.toContain('fal');
  });
});

describe('video provider picker (free-first)', () => {
  const runner = { run: async () => ({}) };

  it('keyless with only the AI binding: video is honestly UNAVAILABLE (CF video is partner-billed)', () => {
    const svc = buildServices({ falKey: undefined, falVideoKey: undefined, ai: runner });
    expect(svc.videoProviders).not.toContain('cloudflare');
    expect(svc.videoProviders).not.toContain('hf-spaces');
  });

  it('a free HF token turns on the hf-spaces provider and makes it the default', () => {
    const svc = buildServices({ falKey: undefined, falVideoKey: undefined, hfToken: 'hf_x' });
    expect(svc.videoProviders).toContain('hf-spaces');
    expect(svc.videoProvider.name).toBe('hf-spaces');
  });

  it('a paid fal video key still outranks the free provider', () => {
    const svc = buildServices({ falVideoKey: 'k', hfToken: 'hf_x' });
    expect(svc.videoProvider.name).toBe('fal-video');
  });

  it('an explicit CF_AI_VIDEO_MODEL re-enables the cloudflare provider (billing opt-in)', () => {
    process.env.CF_AI_VIDEO_MODEL = 'vidu/q3-turbo';
    try {
      const svc = buildServices({ falKey: undefined, falVideoKey: undefined, ai: runner });
      expect(svc.videoProviders).toContain('cloudflare');
    } finally {
      delete process.env.CF_AI_VIDEO_MODEL;
    }
  });
});

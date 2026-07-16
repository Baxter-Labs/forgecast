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

describe('voice provider picker', () => {
  const runner = { run: async () => ({ audio: 'QUJD' }) };

  it('keyless: falls through to the Cloudflare (MeloTTS) provider when the AI binding is present', () => {
    const svc = buildServices({ ai: runner, falKey: undefined, voiceKey: undefined });
    expect(svc.voiceProvider.name).toBe('cloudflare');
    expect(svc.voiceAvailable).toBe(true);
  });

  it('a configured fal key still wins over the keyless provider (no silent voice change)', () => {
    const svc = buildServices({ ai: runner, voiceKey: 'k' });
    expect(svc.voiceProvider.name).toBe('fal-tts');
  });

  it('nothing configured: voice is honestly unavailable', () => {
    const svc = buildServices({ falKey: undefined, voiceKey: undefined });
    expect(svc.voiceAvailable).toBe(false);
  });

  it('FORGECAST_VOICE_PROVIDER pins an available provider over the default order', () => {
    process.env.FORGECAST_VOICE_PROVIDER = 'cloudflare';
    try {
      const svc = buildServices({ ai: runner, voiceKey: 'k' });
      expect(svc.voiceProvider.name).toBe('cloudflare');
    } finally {
      delete process.env.FORGECAST_VOICE_PROVIDER;
    }
  });

  it('an unavailable pin falls back to the default order', () => {
    process.env.FORGECAST_VOICE_PROVIDER = 'voxcpm'; // no VOXCPM_URL set
    try {
      const svc = buildServices({ ai: runner, falKey: undefined, voiceKey: undefined });
      expect(svc.voiceProvider.name).toBe('cloudflare');
    } finally {
      delete process.env.FORGECAST_VOICE_PROVIDER;
    }
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

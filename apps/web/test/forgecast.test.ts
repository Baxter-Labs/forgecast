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

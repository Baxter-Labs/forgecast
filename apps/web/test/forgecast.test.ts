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

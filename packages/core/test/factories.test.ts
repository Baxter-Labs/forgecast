import { describe, it, expect } from 'vitest';
import { newProject, newAsset } from '../src/factories';

describe('newProject', () => {
  it('creates a project with injected id and timestamp', () => {
    const p = newProject({ name: 'Launch campaign' }, { id: 'p1', now: '2026-06-17T00:00:00Z' });
    expect(p).toEqual({ id: 'p1', name: 'Launch campaign', createdAt: '2026-06-17T00:00:00Z' });
  });
});

describe('newAsset', () => {
  it('creates a ready asset with injected id and timestamp', () => {
    const a = newAsset(
      { projectId: 'p1', type: 'image', provider: 'fal', storageKey: 'img/1.png', params: { prompt: 'a cat' } },
      { id: 'a1', now: '2026-06-17T00:00:00Z' },
    );
    expect(a).toEqual({
      id: 'a1',
      projectId: 'p1',
      type: 'image',
      provider: 'fal',
      params: { prompt: 'a cat' },
      storageKey: 'img/1.png',
      status: 'ready',
      createdAt: '2026-06-17T00:00:00Z',
    });
  });

  it('defaults params to {} and status to ready', () => {
    const a = newAsset(
      { projectId: 'p1', type: 'image', provider: 'fal', storageKey: 'k' },
      { id: 'a2', now: '2026-06-17T00:00:00Z' },
    );
    expect(a.params).toEqual({});
    expect(a.status).toBe('ready');
  });
});

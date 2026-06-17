import { describe, it, expect } from 'vitest';
import { newJob } from '../src/job';

describe('newJob', () => {
  it('creates a queued job with zero progress', () => {
    const job = newJob(
      { projectId: 'p1', kind: 'image', provider: 'fal', params: { prompt: 'a cat' } },
      { id: 'j1', now: '2026-06-17T00:00:00Z' },
    );
    expect(job).toEqual({
      id: 'j1',
      projectId: 'p1',
      kind: 'image',
      provider: 'fal',
      params: { prompt: 'a cat' },
      status: 'queued',
      progress: 0,
      createdAt: '2026-06-17T00:00:00Z',
      updatedAt: '2026-06-17T00:00:00Z',
    });
  });

  it('defaults params to an empty object', () => {
    const job = newJob(
      { projectId: 'p1', kind: 'short_video', provider: 'mpt' },
      { id: 'j2', now: '2026-06-17T00:00:00Z' },
    );
    expect(job.params).toEqual({});
  });
});

import { describe, it, expect } from 'vitest';
import type { JobHandler } from '@forgecast/core';
import { newJob } from '@forgecast/core';
import { InMemoryJobRepo } from '@forgecast/store';
import { JobRunner } from '../src/index';

describe('JobRunner', () => {
  it('drives a job queued -> running -> done with progress and resultAssetId', async () => {
    const jobs = new InMemoryJobRepo();
    await jobs.create(newJob({ projectId: 'p1', kind: 'image', provider: 'fal' }, { id: 'j1', now: 'T' }));

    const seen: number[] = [];
    const handler: JobHandler = {
      kind: 'image',
      run: async (_job, report) => {
        await report(0.5);
        seen.push(0.5);
        return { assetId: 'a1' };
      },
    };

    const runner = new JobRunner(jobs, [handler]);
    const done = await runner.run('j1');

    expect(done.status).toBe('done');
    expect(done.progress).toBe(1);
    expect(done.resultAssetId).toBe('a1');
    expect(seen).toEqual([0.5]);
  });

  it('marks the job error when the handler throws', async () => {
    const jobs = new InMemoryJobRepo();
    await jobs.create(newJob({ projectId: 'p1', kind: 'image', provider: 'fal' }, { id: 'j2', now: 'T' }));
    const handler: JobHandler = { kind: 'image', run: async () => { throw new Error('boom'); } };
    const runner = new JobRunner(jobs, [handler]);

    const errored = await runner.run('j2');
    expect(errored.status).toBe('error');
    expect(errored.error).toBe('boom');
  });

  it('throws for an unknown job id', async () => {
    const runner = new JobRunner(new InMemoryJobRepo(), []);
    await expect(runner.run('nope')).rejects.toThrowError(/unknown job: nope/i);
  });

  it('marks error when no handler is registered for the job kind', async () => {
    const jobs = new InMemoryJobRepo();
    await jobs.create(newJob({ projectId: 'p1', kind: 'short_video', provider: 'mpt' }, { id: 'j3', now: 'T' }));
    const runner = new JobRunner(jobs, []);
    const errored = await runner.run('j3');
    expect(errored.status).toBe('error');
    expect(errored.error).toMatch(/no handler for job kind: short_video/i);
  });
});

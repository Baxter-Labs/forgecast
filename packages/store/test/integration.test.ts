import { describe, it, expect } from 'vitest';
import { newProject, newAsset, newJob } from '@forgecast/core';
import {
  InMemoryProjectRepo,
  InMemoryAssetRepo,
  InMemoryJobRepo,
  InMemoryStorage,
} from '../src/index';

describe('store integration', () => {
  it('persists a project, stores an image, records an asset, and completes a job', async () => {
    const projects = new InMemoryProjectRepo();
    const assets = new InMemoryAssetRepo();
    const jobs = new InMemoryJobRepo();
    const storage = new InMemoryStorage({ baseUrl: 'mem://forgecast' });

    const project = await projects.create(newProject({ name: 'Demo' }, { id: 'p1', now: 'T' }));

    const job = await jobs.create(
      newJob({ projectId: project.id, kind: 'image', provider: 'fal', params: { prompt: 'a fox' } }, { id: 'j1', now: 'T' }),
    );

    // simulate a worker: store the produced image, record the asset, finish the job
    const stored = await storage.put('img/j1.png', new Uint8Array([1, 2, 3]), 'image/png');
    const asset = await assets.create(
      newAsset(
        { projectId: project.id, type: 'image', provider: 'fal', storageKey: stored.key, params: job.params },
        { id: 'a1', now: 'T' },
      ),
    );
    const done = await jobs.update(job.id, { status: 'done', progress: 1, resultAssetId: asset.id });

    expect(done.status).toBe('done');
    expect(done.resultAssetId).toBe('a1');
    expect(await assets.listByProject('p1')).toEqual([asset]);
    expect(storage.read('img/j1.png')?.contentType).toBe('image/png');
  });
});

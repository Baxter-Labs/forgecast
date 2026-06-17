import { describe, it, expect } from 'vitest';
import type { ProjectRepo } from '../src/repos';
import type { StorageDriver } from '../src/storage';
import { newProject } from '../src/factories';
import type { Project } from '../src/types';

class FakeProjectRepo implements ProjectRepo {
  private items = new Map<string, Project>();
  async create(p: Project) {
    this.items.set(p.id, p);
    return p;
  }
  async get(id: string) {
    return this.items.get(id) ?? null;
  }
  async list() {
    return [...this.items.values()];
  }
}

class FakeStorage implements StorageDriver {
  async put(key: string, _data: Uint8Array, _contentType: string) {
    return { key, url: `mem://${key}` };
  }
  url(key: string) {
    return `mem://${key}`;
  }
}

describe('ProjectRepo contract', () => {
  it('returns null for a missing project and the project after create', async () => {
    const repo = new FakeProjectRepo();
    expect(await repo.get('nope')).toBeNull();
    const p = await repo.create(newProject({ name: 'X' }, { id: 'p1', now: 'T' }));
    expect(await repo.get('p1')).toEqual(p);
    expect(await repo.list()).toEqual([p]);
  });
});

describe('StorageDriver contract', () => {
  it('returns a StoredObject whose url matches url(key)', async () => {
    const s = new FakeStorage();
    const obj = await s.put('img/1.png', new Uint8Array([1, 2, 3]), 'image/png');
    expect(obj).toEqual({ key: 'img/1.png', url: 'mem://img/1.png' });
    expect(s.url('img/1.png')).toBe('mem://img/1.png');
  });
});

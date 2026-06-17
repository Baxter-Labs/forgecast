import type { Job, JobRepo } from '@forgecast/core';

export class InMemoryJobRepo implements JobRepo {
  private readonly items = new Map<string, Job>();

  async create(job: Job): Promise<Job> {
    this.items.set(job.id, job);
    return job;
  }

  async get(id: string): Promise<Job | null> {
    return this.items.get(id) ?? null;
  }

  async update(id: string, patch: Partial<Omit<Job, 'id'>>): Promise<Job> {
    const existing = this.items.get(id);
    if (!existing) throw new Error(`Unknown job: ${id}`);
    const updated: Job = { ...existing, ...patch };
    this.items.set(id, updated);
    return updated;
  }

  async listByProject(projectId: string): Promise<Job[]> {
    return [...this.items.values()].filter((j) => j.projectId === projectId);
  }
}

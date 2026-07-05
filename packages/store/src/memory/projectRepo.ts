import type { Project, ProjectRepo } from '@forgecast/core';

export class InMemoryProjectRepo implements ProjectRepo {
  private readonly items = new Map<string, Project>();

  async create(project: Project): Promise<Project> {
    this.items.set(project.id, project);
    return project;
  }

  async get(id: string): Promise<Project | null> {
    return this.items.get(id) ?? null;
  }

  async list(ownerId?: string): Promise<Project[]> {
    const all = [...this.items.values()];
    if (!ownerId) return all;
    return all.filter((p) => (p.ownerId ?? 'local') === ownerId);
  }
}

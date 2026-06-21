import type { Project, ProjectRepo } from '@forgecast/core';
import { ensureD1Schema, type D1Like } from './db';

interface ProjectRow { id: string; name: string; created_at: string }
const toProject = (r: ProjectRow): Project => ({ id: r.id, name: r.name, createdAt: r.created_at });

export class D1ProjectRepo implements ProjectRepo {
  constructor(private readonly db: D1Like) {}

  async create(p: Project): Promise<Project> {
    await ensureD1Schema(this.db);
    await this.db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').bind(p.id, p.name, p.createdAt).run();
    return p;
  }
  async get(id: string): Promise<Project | null> {
    await ensureD1Schema(this.db);
    const row = await this.db.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first<ProjectRow>();
    return row ? toProject(row) : null;
  }
  async list(): Promise<Project[]> {
    await ensureD1Schema(this.db);
    const { results } = await this.db.prepare('SELECT * FROM projects ORDER BY created_at ASC, id ASC').all<ProjectRow>();
    return results.map(toProject);
  }
}

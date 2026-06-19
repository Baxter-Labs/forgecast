import type { DatabaseSync } from 'node:sqlite';
import type { Project, ProjectRepo } from '@forgecast/core';

interface ProjectRow { id: string; name: string; created_at: string }
const toProject = (r: ProjectRow): Project => ({ id: r.id, name: r.name, createdAt: r.created_at });

export class SqliteProjectRepo implements ProjectRepo {
  constructor(private readonly db: DatabaseSync) {}

  async create(p: Project): Promise<Project> {
    this.db.prepare('INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)').run(p.id, p.name, p.createdAt);
    return p;
  }
  async get(id: string): Promise<Project | null> {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as unknown as ProjectRow | undefined;
    return row ? toProject(row) : null;
  }
  async list(): Promise<Project[]> {
    const rows = this.db.prepare('SELECT * FROM projects ORDER BY created_at ASC, id ASC').all() as unknown as ProjectRow[];
    return rows.map(toProject);
  }
}

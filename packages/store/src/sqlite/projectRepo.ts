import type { DatabaseSync } from 'node:sqlite';
import type { Project, ProjectRepo } from '@forgecast/core';

interface ProjectRow { id: string; name: string; created_at: string; owner_id: string | null }

function toProject(r: ProjectRow): Project {
  const p: Project = { id: r.id, name: r.name, createdAt: r.created_at };
  if (r.owner_id) p.ownerId = r.owner_id;
  return p;
}

export class SqliteProjectRepo implements ProjectRepo {
  constructor(private readonly db: DatabaseSync) {}

  async create(p: Project): Promise<Project> {
    this.db
      .prepare('INSERT INTO projects (id, name, created_at, owner_id) VALUES (?, ?, ?, ?)')
      .run(p.id, p.name, p.createdAt, p.ownerId ?? null);
    return p;
  }
  async get(id: string): Promise<Project | null> {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as unknown as ProjectRow | undefined;
    return row ? toProject(row) : null;
  }
  async list(ownerId?: string): Promise<Project[]> {
    const rows = (ownerId
      ? this.db.prepare("SELECT * FROM projects WHERE COALESCE(owner_id, 'local') = ? ORDER BY created_at ASC, id ASC").all(ownerId)
      : this.db.prepare('SELECT * FROM projects ORDER BY created_at ASC, id ASC').all()) as unknown as ProjectRow[];
    return rows.map(toProject);
  }
}

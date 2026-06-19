import type { DatabaseSync } from 'node:sqlite';
import type { Job, JobRepo, JobKind, JobStatus } from '@forgecast/core';

interface JobRow {
  id: string; project_id: string; kind: string; provider: string; params: string;
  status: string; progress: number; result_asset_id: string | null; error: string | null;
  created_at: string; updated_at: string;
}
const toJob = (r: JobRow): Job => ({
  id: r.id, projectId: r.project_id, kind: r.kind as JobKind, provider: r.provider,
  params: JSON.parse(r.params) as Record<string, unknown>, status: r.status as JobStatus,
  progress: r.progress, resultAssetId: r.result_asset_id ?? undefined, error: r.error ?? undefined,
  createdAt: r.created_at, updatedAt: r.updated_at,
});

export class SqliteJobRepo implements JobRepo {
  constructor(private readonly db: DatabaseSync) {}

  async create(j: Job): Promise<Job> {
    this.db
      .prepare('INSERT INTO jobs (id, project_id, kind, provider, params, status, progress, result_asset_id, error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(j.id, j.projectId, j.kind, j.provider, JSON.stringify(j.params), j.status, j.progress, j.resultAssetId ?? null, j.error ?? null, j.createdAt, j.updatedAt);
    return j;
  }
  async get(id: string): Promise<Job | null> {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as unknown as JobRow | undefined;
    return row ? toJob(row) : null;
  }
  async update(id: string, patch: Partial<Omit<Job, 'id'>>): Promise<Job> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Unknown job: ${id}`);
    const j: Job = { ...existing, ...patch };
    this.db
      .prepare('UPDATE jobs SET project_id=?, kind=?, provider=?, params=?, status=?, progress=?, result_asset_id=?, error=?, created_at=?, updated_at=? WHERE id=?')
      .run(j.projectId, j.kind, j.provider, JSON.stringify(j.params), j.status, j.progress, j.resultAssetId ?? null, j.error ?? null, j.createdAt, j.updatedAt, id);
    return j;
  }
  async listByProject(projectId: string): Promise<Job[]> {
    const rows = this.db.prepare('SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at ASC, id ASC').all(projectId) as unknown as JobRow[];
    return rows.map(toJob);
  }
}

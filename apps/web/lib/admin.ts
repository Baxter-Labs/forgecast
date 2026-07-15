import type { Services } from './forgecast';
import type { ApiResult } from './api';

export interface AdminUserRow {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  createdAt: string;
  /** How many projects this user owns — a lightweight activity signal. */
  projects: number;
}

/**
 * The registered users plus lightweight per-user activity, for the operator's
 * admin dashboard. Newest first (UserRepo.list orders by createdAt desc).
 */
export async function listUsersForAdmin(services: Services): Promise<ApiResult> {
  const users = await services.users.list();
  const rows: AdminUserRow[] = [];
  let totalProjects = 0;
  for (const u of users) {
    const projects = (await services.projects.list(u.id)).length;
    totalProjects += projects;
    const row: AdminUserRow = { id: u.id, email: u.email, createdAt: u.createdAt, projects };
    if (u.name) row.name = u.name;
    if (u.avatarUrl) row.avatarUrl = u.avatarUrl;
    rows.push(row);
  }
  return { status: 200, body: { users: rows, totalUsers: users.length, totalProjects } };
}

import type { Services } from './forgecast';
import { authConfig, sessionUser, type AuthConfig } from './auth';

/**
 * Request guards for multi-tenancy. With auth disabled every request acts as
 * the implicit 'local' operator (today's open self-host behavior). With auth
 * enabled, requests need a valid session, and project-scoped resources must
 * belong to the signed-in user. Unowned rows (pre-auth data) belong to 'local'.
 */

export const LOCAL_OWNER = 'local';

export type GuardResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; body: { error: string } };

const UNAUTHORIZED: GuardResult = { ok: false, status: 401, body: { error: 'sign in required' } };
// Ownership misses read as 404 so resource ids can't be probed for existence.
const NOT_FOUND: GuardResult = { ok: false, status: 404, body: { error: 'not found' } };

/** The acting user id — 'local' when auth is off, the session user when on, 401 otherwise. */
export async function requireUser(
  services: Services,
  cookieHeader: string | null,
  cfg: AuthConfig | null = authConfig(),
): Promise<GuardResult> {
  if (!cfg) return { ok: true, userId: LOCAL_OWNER };
  const user = await sessionUser(services, cfg, cookieHeader);
  return user ? { ok: true, userId: user.id } : UNAUTHORIZED;
}

export async function requireProject(
  services: Services,
  cookieHeader: string | null,
  projectId: string,
  cfg: AuthConfig | null = authConfig(),
): Promise<GuardResult> {
  const who = await requireUser(services, cookieHeader, cfg);
  if (!who.ok) return who;
  const project = await services.projects.get(projectId);
  if (!project || (project.ownerId ?? LOCAL_OWNER) !== who.userId) return NOT_FOUND;
  return who;
}

export async function requireAsset(
  services: Services,
  cookieHeader: string | null,
  assetId: string,
  cfg: AuthConfig | null = authConfig(),
): Promise<GuardResult> {
  const who = await requireUser(services, cookieHeader, cfg);
  if (!who.ok) return who;
  const asset = await services.assets.get(assetId);
  if (!asset) return NOT_FOUND;
  const project = await services.projects.get(asset.projectId);
  if (!project || (project.ownerId ?? LOCAL_OWNER) !== who.userId) return NOT_FOUND;
  return who;
}

export async function requireJob(
  services: Services,
  cookieHeader: string | null,
  jobId: string,
  cfg: AuthConfig | null = authConfig(),
): Promise<GuardResult> {
  const who = await requireUser(services, cookieHeader, cfg);
  if (!who.ok) return who;
  const job = await services.jobs.get(jobId);
  if (!job) return NOT_FOUND;
  const project = await services.projects.get(job.projectId);
  if (!project || (project.ownerId ?? LOCAL_OWNER) !== who.userId) return NOT_FOUND;
  return who;
}

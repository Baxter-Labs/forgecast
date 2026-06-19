import { newProject, newJob } from '@forgecast/core';
import type { Services } from './forgecast';

export interface ApiResult {
  status: number;
  body: unknown;
}

export async function createProject(services: Services, input: unknown): Promise<ApiResult> {
  const name = (input as { name?: unknown } | null)?.name;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return { status: 400, body: { error: 'name is required' } };
  }
  const project = await services.projects.create(
    newProject({ name }, { id: services.ids.randomId(), now: services.ids.nowIso() }),
  );
  return { status: 201, body: { project } };
}

export async function listProjects(services: Services): Promise<ApiResult> {
  return { status: 200, body: { projects: await services.projects.list() } };
}

export async function generateImage(services: Services, projectId: string, input: unknown): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };

  const fields = (input ?? {}) as { prompt?: unknown; provider?: unknown; width?: unknown; height?: unknown };
  if (typeof fields.prompt !== 'string' || fields.prompt.trim().length === 0) {
    return { status: 400, body: { error: 'prompt is required' } };
  }

  const providerName = typeof fields.provider === 'string' && fields.provider.length > 0 ? fields.provider : 'fal';
  const params: Record<string, unknown> = { prompt: fields.prompt };
  if (typeof fields.width === 'number') params.width = fields.width;
  if (typeof fields.height === 'number') params.height = fields.height;

  const job = await services.jobs.create(
    newJob(
      { projectId, kind: 'image', provider: providerName, params },
      { id: services.ids.randomId(), now: services.ids.nowIso() },
    ),
  );
  const finished = await services.runner.run(job.id);
  const asset = finished.resultAssetId ? await services.assets.get(finished.resultAssetId) : null;
  return { status: 200, body: { job: finished, asset } };
}

export async function getJob(services: Services, jobId: string): Promise<ApiResult> {
  const job = await services.jobs.get(jobId);
  if (!job) return { status: 404, body: { error: 'job not found' } };
  return { status: 200, body: { job } };
}

export async function listAssets(services: Services, projectId: string): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  return { status: 200, body: { assets: await services.assets.listByProject(projectId) } };
}

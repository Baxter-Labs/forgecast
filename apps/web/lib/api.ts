import { newProject, newJob } from '@forgecast/core';
import type { MontageSpec } from '@forgecast/core';
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

export async function getAssetBytes(
  services: Services,
  assetId: string,
): Promise<{ data: Uint8Array; contentType: string } | null> {
  const asset = await services.assets.get(assetId);
  if (!asset) return null;
  return services.storage.get(asset.storageKey);
}

export async function generateShortVideo(services: Services, projectId: string, input: unknown): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  if (!services.videoWorker.isAvailable()) {
    return { status: 503, body: { error: 'short-video worker not configured (set FORGECAST_VIDEO_WORKER_URL)' } };
  }
  const fields = (input ?? {}) as { subject?: unknown; prompt?: unknown };
  const subject = typeof fields.subject === 'string' ? fields.subject : typeof fields.prompt === 'string' ? fields.prompt : '';
  if (subject.trim().length === 0) return { status: 400, body: { error: 'subject is required' } };

  const job = await services.jobs.create(
    newJob(
      { projectId, kind: 'short_video', provider: 'moneyprinter', params: { subject } },
      { id: services.ids.randomId(), now: services.ids.nowIso() },
    ),
  );
  // Long-running: run in the background (works in the persistent self-hosted Node server);
  // the client polls GET /api/jobs/:id for completion.
  void services.runner.run(job.id).catch(() => {});
  return { status: 202, body: { job } };
}

export async function generateVideo(services: Services, projectId: string, input: unknown): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  if (!services.videoProvider.isAvailable()) {
    return { status: 503, body: { error: 'video provider not configured (set PIXVERSE_API_KEY)' } };
  }
  const fields = (input ?? {}) as { prompt?: unknown; aspectRatio?: unknown; duration?: unknown; quality?: unknown; model?: unknown };
  if (typeof fields.prompt !== 'string' || fields.prompt.trim().length === 0) {
    return { status: 400, body: { error: 'prompt is required' } };
  }
  const params: Record<string, unknown> = { prompt: fields.prompt };
  if (typeof fields.aspectRatio === 'string') params.aspectRatio = fields.aspectRatio;
  if (typeof fields.duration === 'number') params.duration = fields.duration;
  if (typeof fields.quality === 'string') params.quality = fields.quality;
  if (typeof fields.model === 'string') params.model = fields.model;

  const job = await services.jobs.create(
    newJob({ projectId, kind: 'video', provider: services.videoProvider.name, params }, { id: services.ids.randomId(), now: services.ids.nowIso() }),
  );
  void services.runner.run(job.id).catch(() => {});
  return { status: 202, body: { job } };
}

async function buildSpecFromAssets(services: Services, assetIds: string[], aspectRatio: string, base: string): Promise<MontageSpec | null> {
  const scenes = [];
  for (const id of assetIds) {
    const asset = await services.assets.get(id);
    if (!asset) continue;
    scenes.push({ url: `${base.replace(/\/$/, '')}/api/assets/${id}/raw`, kind: asset.type === 'video' ? 'video' as const : 'image' as const, durationSec: 4 });
  }
  return scenes.length > 0 ? { scenes, aspectRatio } : null;
}

export async function generateMontage(services: Services, projectId: string, input: unknown): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  if (!services.montageWorker.isAvailable()) {
    return { status: 503, body: { error: 'montage worker not configured (set MONTAGE_WORKER_URL)' } };
  }
  const fields = (input ?? {}) as { spec?: MontageSpec; assetIds?: unknown; aspectRatio?: unknown };
  const aspectRatio = typeof fields.aspectRatio === 'string' ? fields.aspectRatio : '9:16';

  let spec = fields.spec;
  if (!spec && Array.isArray(fields.assetIds)) {
    const base = process.env.FORGECAST_BASE_URL;
    if (!base) return { status: 503, body: { error: 'set FORGECAST_BASE_URL so the montage worker can fetch your media' } };
    const ids = fields.assetIds.filter((x): x is string => typeof x === 'string');
    spec = (await buildSpecFromAssets(services, ids, aspectRatio, base)) ?? undefined;
  }
  if (!spec || !Array.isArray(spec.scenes) || spec.scenes.length === 0) {
    return { status: 400, body: { error: 'a "spec" with scenes, or "assetIds", is required' } };
  }

  const job = await services.jobs.create(
    newJob({ projectId, kind: 'montage', provider: 'remotion', params: { spec } }, { id: services.ids.randomId(), now: services.ids.nowIso() }),
  );
  void services.runner.run(job.id).catch(() => {});
  return { status: 202, body: { job } };
}

export async function publishAsset(services: Services, assetId: string, input: unknown): Promise<ApiResult> {
  const asset = await services.assets.get(assetId);
  if (!asset) return { status: 404, body: { error: 'asset not found' } };

  const fields = (input ?? {}) as { content?: unknown; channels?: unknown; publisher?: unknown };
  if (typeof fields.content !== 'string' || fields.content.trim().length === 0) {
    return { status: 400, body: { error: 'content (caption) is required' } };
  }
  const publisherName = typeof fields.publisher === 'string' && fields.publisher.length > 0 ? fields.publisher : 'omnisocials';
  const available = services.publishers.available();
  if (!available.includes(publisherName)) {
    return { status: 503, body: { error: `publisher "${publisherName}" not configured`, availablePublishers: available } };
  }
  const channels = Array.isArray(fields.channels)
    ? fields.channels.filter((c): c is string => typeof c === 'string')
    : undefined;
  const base = process.env.FORGECAST_BASE_URL;
  const mediaUrls = base ? [`${base.replace(/\/$/, '')}/api/assets/${assetId}/raw`] : undefined;

  try {
    const result = await services.publishers.get(publisherName).publish({ content: fields.content, channels, mediaUrls });
    return { status: 200, body: { published: result } };
  } catch (e) {
    return { status: 502, body: { error: `publish failed: ${e instanceof Error ? e.message : String(e)}` } };
  }
}

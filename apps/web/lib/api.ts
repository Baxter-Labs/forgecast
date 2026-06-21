import { newProject, newJob, newAsset } from '@forgecast/core';
import type { MontageSpec, Job, VideoGenTask } from '@forgecast/core';
import { videoModelById } from '@forgecast/catalog';
import type { Services } from './forgecast';
import { runBackground } from './cf-env';

// Reserved job-param key holding the provider's async task reference (response_url).
// Stripped before it ever lands on the produced asset's params.
const VIDEO_TASK_KEY = '__videoTaskId';

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

// Advance an in-flight video job by one provider poll. This is driven by the
// client polling GET /api/jobs/:id, so each request stays short — the right model
// for Cloudflare Workers, which terminate long-lived background work after the
// response is sent. On completion the video is downloaded and stored to R2.
async function advanceVideoJob(services: Services, job: Job): Promise<Job> {
  const taskId = job.params[VIDEO_TASK_KEY];
  if (typeof taskId !== 'string' || taskId.length === 0) return job;

  let task: VideoGenTask;
  try {
    task = await services.videoProvider.getTask(taskId);
  } catch {
    return job; // transient — the next poll retries
  }
  if (task.state === 'failed') {
    return services.jobs.update(job.id, { status: 'error', error: 'video provider reported failure', updatedAt: services.ids.nowIso() });
  }
  if (task.state !== 'complete' || !task.videoUrl) return job;

  const res = await fetch(task.videoUrl);
  if (!res.ok) return job; // transient download failure — retry next poll
  const bytes = new Uint8Array(await res.arrayBuffer());
  const id = services.ids.randomId();
  const key = `projects/${job.projectId}/videos/${id}.mp4`;
  const stored = await services.storage.put(key, bytes, 'video/mp4');

  const assetParams = { ...job.params };
  delete assetParams[VIDEO_TASK_KEY];
  const asset = await services.assets.create(
    newAsset({ projectId: job.projectId, type: 'video', provider: job.provider, storageKey: stored.key, params: assetParams }, { id, now: services.ids.nowIso() }),
  );
  return services.jobs.update(job.id, { status: 'done', progress: 1, resultAssetId: asset.id, updatedAt: services.ids.nowIso() });
}

export async function getJob(services: Services, jobId: string): Promise<ApiResult> {
  let job = await services.jobs.get(jobId);
  if (!job) return { status: 404, body: { error: 'job not found' } };
  if (job.kind === 'video' && job.status === 'running') {
    job = await advanceVideoJob(services, job);
  }
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
  // Long-running: run in the background. On Workers `ctx.waitUntil` keeps the job
  // alive past the 202 response; the client polls GET /api/jobs/:id for completion.
  runBackground(services.runner.run(job.id));
  return { status: 202, body: { job } };
}

export async function generateVideo(services: Services, projectId: string, input: unknown): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  if (!services.videoProvider.isAvailable()) {
    return { status: 503, body: { error: 'video provider not configured (set FAL_KEY_VIDEO)' } };
  }
  const fields = (input ?? {}) as {
    prompt?: unknown;
    aspectRatio?: unknown;
    duration?: unknown;
    quality?: unknown;
    model?: unknown;
    imageAssetId?: unknown;
    imageUrl?: unknown;
  };
  if (typeof fields.prompt !== 'string' || fields.prompt.trim().length === 0) {
    return { status: 400, body: { error: 'prompt is required' } };
  }

  const modelId = typeof fields.model === 'string' ? fields.model : undefined;
  const modelDef = modelId ? videoModelById(modelId) : undefined;

  // Resolve image source for image-to-video models
  let resolvedImageUrl: string | undefined;
  if (modelDef?.mode === 'image-to-video') {
    if (typeof fields.imageAssetId === 'string' && fields.imageAssetId.length > 0) {
      const base = process.env.FORGECAST_BASE_URL;
      if (!base) return { status: 503, body: { error: 'set FORGECAST_BASE_URL so image-to-video can resolve asset URLs' } };
      const asset = await services.assets.get(fields.imageAssetId);
      if (!asset) return { status: 404, body: { error: `asset ${fields.imageAssetId} not found` } };
      resolvedImageUrl = `${base.replace(/\/$/, '')}/api/assets/${fields.imageAssetId}/raw`;
    } else if (typeof fields.imageUrl === 'string' && fields.imageUrl.length > 0) {
      resolvedImageUrl = fields.imageUrl;
    } else {
      return { status: 400, body: { error: 'image-to-video needs a source image (imageAssetId)' } };
    }
  }

  const params: Record<string, unknown> = { prompt: fields.prompt };
  if (typeof fields.aspectRatio === 'string') params.aspectRatio = fields.aspectRatio;
  if (typeof fields.duration === 'number') params.duration = fields.duration;
  if (typeof fields.quality === 'string') params.quality = fields.quality;
  if (modelId) params.model = modelId;
  if (resolvedImageUrl) params.imageUrl = resolvedImageUrl;
  if (modelDef?.params) params.extra = modelDef.params;

  const job = await services.jobs.create(
    newJob({ projectId, kind: 'video', provider: services.videoProvider.name, params }, { id: services.ids.randomId(), now: services.ids.nowIso() }),
  );

  // Submit to the provider synchronously (a fast queue POST), then let the client
  // drive completion via GET /api/jobs/:id (see advanceVideoJob). This keeps each
  // request short so heavy/slow models complete reliably on Cloudflare Workers,
  // which kill background work once the response is returned.
  try {
    const { taskId } = await services.videoProvider.create({
      prompt: fields.prompt,
      aspectRatio: typeof fields.aspectRatio === 'string' ? fields.aspectRatio : undefined,
      duration: typeof fields.duration === 'number' ? fields.duration : undefined,
      quality: typeof fields.quality === 'string' ? fields.quality : undefined,
      model: modelId,
      imageUrl: resolvedImageUrl,
      extra: modelDef?.params,
    });
    const running = await services.jobs.update(job.id, {
      status: 'running',
      progress: 0.05,
      params: { ...params, [VIDEO_TASK_KEY]: taskId },
      updatedAt: services.ids.nowIso(),
    });
    return { status: 202, body: { job: running } };
  } catch (e) {
    const errored = await services.jobs.update(job.id, {
      status: 'error',
      error: e instanceof Error ? e.message : String(e),
      updatedAt: services.ids.nowIso(),
    });
    return { status: 202, body: { job: errored } };
  }
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
  if (!services.montageAvailable) {
    return { status: 503, body: { error: 'montage not configured (set MONTAGE_WORKER_URL, or ensure the bundled ffmpeg is available)' } };
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
  runBackground(services.runner.run(job.id));
  return { status: 202, body: { job } };
}

export async function generateVoiceover(services: Services, projectId: string, input: unknown): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  if (!services.voiceAvailable) {
    return { status: 503, body: { error: 'voice-over not configured (set FAL_KEY_VOICE or FAL_KEY)' } };
  }
  const fields = (input ?? {}) as { text?: unknown; voice?: unknown; model?: unknown };
  if (typeof fields.text !== 'string' || fields.text.trim().length === 0) {
    return { status: 400, body: { error: 'text is required' } };
  }
  const params: Record<string, unknown> = { text: fields.text };
  if (typeof fields.voice === 'string') params.voice = fields.voice;
  if (typeof fields.model === 'string') params.model = fields.model;

  const job = await services.jobs.create(
    newJob({ projectId, kind: 'voiceover', provider: services.voiceProvider.name, params }, { id: services.ids.randomId(), now: services.ids.nowIso() }),
  );
  runBackground(services.runner.run(job.id));
  return { status: 202, body: { job } };
}

export async function generateNarratedVideo(services: Services, projectId: string, input: unknown): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  if (!services.voiceAvailable) {
    return { status: 503, body: { error: 'narrate not configured (set FAL_KEY_VOICE or FAL_KEY)' } };
  }
  const fields = (input ?? {}) as { text?: unknown; voice?: unknown; videoAssetId?: unknown; videoUrl?: unknown };
  if (typeof fields.text !== 'string' || fields.text.trim().length === 0) {
    return { status: 400, body: { error: 'text is required' } };
  }
  const hasSource =
    (typeof fields.videoAssetId === 'string' && fields.videoAssetId.length > 0) ||
    (typeof fields.videoUrl === 'string' && fields.videoUrl.length > 0);
  if (!hasSource) {
    return { status: 400, body: { error: 'videoAssetId or videoUrl is required' } };
  }
  const params: Record<string, unknown> = { text: fields.text };
  if (typeof fields.videoAssetId === 'string') params.videoAssetId = fields.videoAssetId;
  if (typeof fields.videoUrl === 'string') params.videoUrl = fields.videoUrl;
  if (typeof fields.voice === 'string') params.voice = fields.voice;

  const job = await services.jobs.create(
    newJob({ projectId, kind: 'narrate', provider: 'narrate', params }, { id: services.ids.randomId(), now: services.ids.nowIso() }),
  );
  runBackground(services.runner.run(job.id));
  return { status: 202, body: { job } };
}

export async function generatePresenter(services: Services, projectId: string, input: unknown): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  if (!services.presenterAvailable) {
    return { status: 503, body: { error: 'presenter not configured — needs FAL_KEY (image), a voice key, and FAL_KEY_VIDEO (OmniHuman)' } };
  }

  const fields = (input ?? {}) as {
    imagePrompt?: unknown;
    imageUrl?: unknown;
    text?: unknown;
    audioUrl?: unknown;
    voice?: unknown;
  };

  const hasImage =
    (typeof fields.imagePrompt === 'string' && fields.imagePrompt.length > 0) ||
    (typeof fields.imageUrl === 'string' && fields.imageUrl.length > 0);
  const hasAudio =
    (typeof fields.text === 'string' && fields.text.length > 0) ||
    (typeof fields.audioUrl === 'string' && fields.audioUrl.length > 0);

  if (!hasImage) return { status: 400, body: { error: 'imagePrompt or imageUrl is required' } };
  if (!hasAudio) return { status: 400, body: { error: 'text or audioUrl is required' } };

  const params: Record<string, unknown> = {};
  if (typeof fields.imagePrompt === 'string') params.imagePrompt = fields.imagePrompt;
  if (typeof fields.imageUrl === 'string') params.imageUrl = fields.imageUrl;
  if (typeof fields.text === 'string') params.text = fields.text;
  if (typeof fields.audioUrl === 'string') params.audioUrl = fields.audioUrl;
  if (typeof fields.voice === 'string') params.voice = fields.voice;

  const job = await services.jobs.create(
    newJob(
      { projectId, kind: 'presenter', provider: services.presenterProvider.name, params },
      { id: services.ids.randomId(), now: services.ids.nowIso() },
    ),
  );
  runBackground(services.runner.run(job.id));
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

import { newProject, newJob, newAsset, applyBrandKit, platformCopySpec, buildAdCopyPrompt, parseAdCopyVariants, auditAds, isAdCreativeMetrics, checkContent, normalizeTimeline, emptyTimeline, normalizeStoryboard, emptyStoryboard, buildStoryboardPrompt, parseStoryboardPlan, storyboardShotPrompt, MAX_STORYBOARD_SHOTS, ANGLE_PRESETS, LIGHT_PRESETS, composeReimagineInstruction } from '@forgecast/core';
import type { MontageSpec, MontageScene, Job, VideoGenTask, BrandKit, AdCreativeMetrics, ShortVideoOptions, EditorTimeline, EditorClip, Character, Storyboard, ReimaginePreset } from '@forgecast/core';
import { MAX_CHARACTER_REFS } from '@forgecast/core';
import { videoModelById, imageModelById, defaultImageModelId } from '@forgecast/catalog';
import type { Services } from './forgecast';
import { makeLlmClient } from './agent/llm';
import { runBackground } from './cf-env';
import { LOCAL_OWNER } from './auth-guard';

/** Minimal shape `generateAdCopy` needs from an LLM client (injectable for tests). */
type AdCopyLlm = { isAvailable(): boolean; complete(input: { system: string; user: string }): Promise<string> };

/** Operator-configurable extra blocklist (comma-separated) for the content guardrails. */
function contentBlocklist(): string[] {
  return (process.env.CONTENT_BLOCKLIST ?? '').split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Run a user prompt/brief/script through the content guardrails. Returns a 400
 * ApiResult when it's blocked (so callers `if (blocked) return blocked;`), else null.
 */
export function guardText(text: string): ApiResult | null {
  const r = checkContent(text, contentBlocklist());
  if (r.ok) return null;
  return { status: 400, body: { error: `blocked by content policy — ${r.reason}`, category: r.category } };
}

// Reserved job-param key holding the provider's async task reference (response_url).
// Stripped before it ever lands on the produced asset's params.
const VIDEO_TASK_KEY = '__videoTaskId';
// Same, for the remote montage worker (Remotion): submit-then-poll so a long render
// completes across short client polls, never relying on a Worker background task.
const MONTAGE_TASK_KEY = '__montageTaskId';

export interface ApiResult {
  status: number;
  body: unknown;
}

export async function createProject(services: Services, input: unknown, ownerId?: string): Promise<ApiResult> {
  const name = (input as { name?: unknown } | null)?.name;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return { status: 400, body: { error: 'name is required' } };
  }
  const fields: { name: string; ownerId?: string } = { name };
  if (ownerId && ownerId !== 'local') fields.ownerId = ownerId;
  const project = await services.projects.create(
    newProject(fields, { id: services.ids.randomId(), now: services.ids.nowIso() }),
  );
  return { status: 201, body: { project } };
}

export async function listProjects(services: Services, ownerId?: string): Promise<ApiResult> {
  return { status: 200, body: { projects: await services.projects.list(ownerId) } };
}

export async function generateImage(services: Services, projectId: string, input: unknown): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };

  const fields = (input ?? {}) as { prompt?: unknown; provider?: unknown; model?: unknown; aspectRatio?: unknown; width?: unknown; height?: unknown; characterId?: unknown };
  if (typeof fields.prompt !== 'string' || fields.prompt.trim().length === 0) {
    return { status: 400, body: { error: 'prompt is required' } };
  }
  const blockedImage = guardText(fields.prompt); if (blockedImage) return blockedImage;

  // Optional cast member: resolve the character (same owner as this project) into
  // reference URLs + a persona line; identity holds across every generation.
  let character: Character | null = null;
  if (typeof fields.characterId === 'string' && fields.characterId.length > 0) {
    const resolved = await ownedCharacter(services, project.ownerId, fields.characterId);
    if ('status' in resolved) return resolved;
    character = resolved.character;
  }

  const availableImage = services.imageRegistry.available();
  // Default to the keyless Cloudflare Workers AI provider when available (the
  // on-deploy free tier); otherwise fall back to fal. An explicit `provider` wins.
  const defaultProvider = availableImage.includes('cloudflare') ? 'cloudflare' : 'fal';
  const requested = typeof fields.provider === 'string' && fields.provider.length > 0 ? fields.provider : defaultProvider;
  let providerName = requested;
  if (!availableImage.includes(providerName)) {
    // The requested provider isn't configured. If it's just the default, use whatever
    // IS available (e.g. a BYO OpenAI/SD key). An explicit unavailable request → 503.
    if (requested === defaultProvider && availableImage.length > 0) providerName = availableImage[0]!;
    else return { status: 503, body: { error: `image provider '${requested}' not configured` } };
  }
  // Ground the generation in the project's brand kit (no-op when none is set).
  const promptWithCast = character
    ? `${fields.prompt} — featuring ${character.name}${character.description ? ` (${character.description})` : ''}, the exact person in the reference images; keep their face and identity perfectly consistent`
    : fields.prompt;
  const brandedPrompt = applyBrandKit(await getBrandKit(services, projectId), promptWithCast);

  const params: Record<string, unknown> = { prompt: brandedPrompt };
  if (character) {
    if (providerName !== 'fal') {
      return { status: 503, body: { error: 'characters need an edit-capable image provider — add a fal key (Settings → keys), then generate with this character' } };
    }
    params.refImageUrls = await characterRefUrls(services, character);
    params.characterId = character.id;
  }
  if (providerName === 'fal') {
    // Resolve the model (default: Nano Banana) and emit the size param its family
    // expects: an `aspect_ratio` enum for the Gemini/Nano-Banana family, else pixels.
    const modelId = typeof fields.model === 'string' && fields.model.length > 0 ? fields.model : defaultImageModelId;
    const catalogModel = imageModelById(modelId);
    params.model = modelId;
    if (catalogModel?.sizing === 'aspect_ratio') {
      const ratio = typeof fields.aspectRatio === 'string' && catalogModel.aspectRatios.includes(fields.aspectRatio)
        ? fields.aspectRatio
        : '1:1';
      params.extra = { aspect_ratio: ratio };
    } else {
      if (typeof fields.width === 'number') params.width = fields.width;
      if (typeof fields.height === 'number') params.height = fields.height;
    }
  } else if (providerName === 'cloudflare') {
    // FLUX.1 [schnell]: prompt only (fixed size; no model picker). The brand kit is
    // already folded into the prompt above.
  } else {
    // Self-hosted / other provider: raw prompt + pixel dimensions (+ optional checkpoint).
    if (typeof fields.model === 'string' && fields.model.length > 0) params.model = fields.model;
    if (typeof fields.width === 'number') params.width = fields.width;
    if (typeof fields.height === 'number') params.height = fields.height;
  }

  // Character refs need an edit-capable endpoint: when the user didn't pick a
  // model explicitly, route the default onto the multi-reference editor.
  if (character && providerName === 'fal' && !(typeof fields.model === 'string' && fields.model.length > 0)) {
    params.model = 'fal-ai/nano-banana/edit';
  }

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
    // Resolve the provider that created THIS job (keyless Cloudflare, fal, …) so the
    // taskId is polled by the right adapter; fall back to the default.
    const provider = services.videoRegistry.has(job.provider) ? services.videoRegistry.get(job.provider) : services.videoProvider;
    task = await provider.getTask(taskId);
  } catch {
    return job; // transient — the next poll retries
  }
  if (task.state === 'failed') {
    return services.jobs.update(job.id, { status: 'error', error: task.error ?? 'video provider reported failure', updatedAt: services.ids.nowIso() });
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

// Advance an in-flight montage job by one worker poll — client-driven (like video),
// so a long Remotion render completes across short requests instead of a Worker
// background task that Cloudflare kills once the response is sent.
async function advanceMontageJob(services: Services, job: Job): Promise<Job> {
  const taskId = job.params[MONTAGE_TASK_KEY];
  if (typeof taskId !== 'string' || taskId.length === 0) return job;

  let task: VideoGenTask;
  try {
    task = await services.montageWorker.getTask(taskId);
  } catch {
    return job; // transient — the next poll retries
  }
  if (task.state === 'failed') {
    return services.jobs.update(job.id, { status: 'error', error: 'montage worker reported failure', updatedAt: services.ids.nowIso() });
  }
  if (task.state !== 'complete' || !task.videoUrl) return job;

  const res = await services.fetchFn(task.videoUrl);
  if (!res.ok) return job; // transient download failure — retry next poll
  const bytes = new Uint8Array(await res.arrayBuffer());
  const id = services.ids.randomId();
  const key = `projects/${job.projectId}/videos/${id}.mp4`;
  const stored = await services.storage.put(key, bytes, 'video/mp4');

  const assetParams = { ...job.params };
  delete assetParams[MONTAGE_TASK_KEY];
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
  } else if (job.kind === 'montage' && job.status === 'running' && typeof job.params[MONTAGE_TASK_KEY] === 'string') {
    job = await advanceMontageJob(services, job);
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

// Single-asset metadata (incl. projectId) so the standalone editor page can load
// an asset by id from its route without listing a whole project.
export async function getAsset(services: Services, assetId: string): Promise<ApiResult> {
  const asset = await services.assets.get(assetId);
  if (!asset) return { status: 404, body: { error: 'asset not found' } };
  return { status: 200, body: { asset } };
}

// ── Brand Kit ───────────────────────────────────────────────────────────────
// Stored per project as a JSON object in the storage driver (no schema change),
// and folded into generation prompts so outputs come out on-brand.
const brandKitKey = (projectId: string): string => `projects/${projectId}/brand-kit.json`;

function sanitizeBrandKit(input: unknown): BrandKit {
  const o = (input ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined);
  const strArr = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim()) : undefined;

  const kit: BrandKit = {};
  const name = str(o.name); if (name) kit.name = name;
  const tagline = str(o.tagline); if (tagline) kit.tagline = tagline;
  const palette = strArr(o.palette); if (palette && palette.length) kit.palette = palette.slice(0, 8);
  const fonts = o.fonts as { display?: unknown; body?: unknown } | undefined;
  const display = str(fonts?.display); const body = str(fonts?.body);
  if (display || body) kit.fonts = { ...(display ? { display } : {}), ...(body ? { body } : {}) };
  const tone = str(o.toneOfVoice); if (tone) kit.toneOfVoice = tone;
  const keyMessages = strArr(o.keyMessages); if (keyMessages && keyMessages.length) kit.keyMessages = keyMessages.slice(0, 8);
  const logoAssetId = str(o.logoAssetId); if (logoAssetId) kit.logoAssetId = logoAssetId;
  const notes = str(o.notes); if (notes) kit.notes = notes;
  const sourceUrl = str(o.sourceUrl); if (sourceUrl) kit.sourceUrl = sourceUrl;
  return kit;
}

/** Loads a project's brand kit from storage, or null if none is set. */
export async function getBrandKit(services: Services, projectId: string): Promise<BrandKit | null> {
  const stored = await services.storage.get(brandKitKey(projectId));
  if (!stored) return null;
  try {
    return JSON.parse(new TextDecoder().decode(stored.data)) as BrandKit;
  } catch {
    return null;
  }
}

export async function readBrandKit(services: Services, projectId: string): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  return { status: 200, body: { brandKit: (await getBrandKit(services, projectId)) ?? {} } };
}

export async function saveBrandKit(services: Services, projectId: string, input: unknown): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  const kit = sanitizeBrandKit(input);
  const bytes = new TextEncoder().encode(JSON.stringify(kit));
  await services.storage.put(brandKitKey(projectId), bytes, 'application/json');
  return { status: 200, body: { brandKit: kit } };
}

/**
 * Generate N platform-aware, character-limited, A/B-tagged ad-copy variants for a
 * brief — grounded in the project's brand voice. The create-side complement to
 * NotFair-style RSA copy: write the caption/copy, ready to drop into a cross-post.
 * Uses the agent LLM (OpenAI by default; Claude via FORGECAST_AGENT_LLM=anthropic).
 */
export async function generateAdCopy(
  services: Services,
  projectId: string,
  input: unknown,
  llm: AdCopyLlm = makeLlmClient(),
): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };

  const fields = (input ?? {}) as { brief?: unknown; platform?: unknown; count?: unknown };
  if (typeof fields.brief !== 'string' || fields.brief.trim().length === 0) {
    return { status: 400, body: { error: 'brief is required' } };
  }
  const blockedAdCopy = guardText(fields.brief); if (blockedAdCopy) return blockedAdCopy;
  if (!llm.isAvailable()) {
    return {
      status: 503,
      body: { error: 'agent LLM not configured (set OPENAI_API_KEY; or FORGECAST_AGENT_LLM=anthropic with ANTHROPIC_API_KEY for Claude)' },
    };
  }

  const spec = platformCopySpec(typeof fields.platform === 'string' ? fields.platform : 'instagram');
  const count =
    typeof fields.count === 'number' && Number.isFinite(fields.count)
      ? Math.min(5, Math.max(1, Math.round(fields.count)))
      : 3;
  const brandKit = await getBrandKit(services, projectId);
  const { system, user } = buildAdCopyPrompt({ brief: fields.brief, spec, count, brandKit });

  let raw: string;
  try {
    raw = await llm.complete({ system, user });
  } catch (e) {
    return { status: 502, body: { error: `ad-copy generation failed: ${e instanceof Error ? e.message : String(e)}` } };
  }

  const variants = parseAdCopyVariants(raw, spec, count);
  if (variants.length === 0) return { status: 502, body: { error: 'no ad-copy variants returned' } };

  return { status: 200, body: { platform: spec.platform, label: spec.label, limit: spec.limit, variants } };
}

// ── Ads measure→optimize: insights, fatigue, audit ───────────────────────────

interface AdsMetricsInput { metrics?: unknown; source?: unknown; sinceDays?: unknown }

/** Validate + coerce a caller-supplied metrics array into clean AdCreativeMetrics rows. */
function sanitizeAdMetrics(rows: unknown[]): AdCreativeMetrics[] {
  const out: AdCreativeMetrics[] = [];
  for (const r of rows) {
    if (!isAdCreativeMetrics(r)) continue;
    out.push({
      creativeId: String(r.creativeId),
      name: typeof r.name === 'string' ? r.name : undefined,
      platform: typeof r.platform === 'string' ? r.platform : undefined,
      date: String(r.date),
      impressions: Math.max(0, r.impressions),
      clicks: Math.max(0, r.clicks),
      spend: Math.max(0, r.spend),
      conversions: typeof r.conversions === 'number' ? Math.max(0, r.conversions) : undefined,
      frequency: typeof r.frequency === 'number' ? r.frequency : undefined,
    });
  }
  return out;
}

type ResolvedMetrics = { ok: true; metrics: AdCreativeMetrics[]; source: string } | { ok: false; result: ApiResult };

/**
 * Get ad metrics either from the request body (keyless — `metrics: [...]`) or by
 * pulling from a connected provider (`source: 'meta'|'google'`, else the first
 * configured one). Keeps every ads endpoint usable with or without credentials.
 */
async function resolveAdMetrics(services: Services, input: AdsMetricsInput): Promise<ResolvedMetrics> {
  if (Array.isArray(input.metrics)) {
    const metrics = sanitizeAdMetrics(input.metrics);
    if (metrics.length === 0) {
      return { ok: false, result: { status: 400, body: { error: 'metrics had no valid rows — each needs creativeId, date, impressions, clicks, spend' } } };
    }
    return { ok: true, metrics, source: 'provided' };
  }

  const requested = typeof input.source === 'string' && input.source.trim() ? input.source.trim() : undefined;
  const chosen = requested ?? services.insights.available()[0];
  if (!chosen) {
    return { ok: false, result: { status: 503, body: { error: 'no metrics provided and no ads source configured — pass `metrics`, or set META_ADS_* / GOOGLE_ADS_* to auto-pull' } } };
  }
  if (!services.insights.has(chosen)) {
    return { ok: false, result: { status: 400, body: { error: `unknown ads source '${chosen}'` } } };
  }
  const provider = services.insights.get(chosen);
  if (!provider.isAvailable()) {
    return { ok: false, result: { status: 503, body: { error: `ads source '${chosen}' not configured` } } };
  }
  const sinceDays = typeof input.sinceDays === 'number' && Number.isFinite(input.sinceDays) ? input.sinceDays : undefined;
  try {
    const metrics = await provider.fetchInsights({ sinceDays });
    return { ok: true, metrics, source: chosen };
  } catch (e) {
    return { ok: false, result: { status: 502, body: { error: `ads insights fetch failed: ${e instanceof Error ? e.message : String(e)}` } } };
  }
}

/** Raw per-creative, per-day ad metrics — pulled from a connected source or echoed back. */
export async function getAdsInsights(services: Services, input: unknown): Promise<ApiResult> {
  const resolved = await resolveAdMetrics(services, (input ?? {}) as AdsMetricsInput);
  if (!resolved.ok) return resolved.result;
  return { status: 200, body: { source: resolved.source, count: resolved.metrics.length, metrics: resolved.metrics } };
}

/** Full account audit: health-dimension scores, per-creative fatigue, and recommendations. */
export async function runAdsAudit(services: Services, input: unknown): Promise<ApiResult> {
  const resolved = await resolveAdMetrics(services, (input ?? {}) as AdsMetricsInput);
  if (!resolved.ok) return resolved.result;
  return { status: 200, body: { source: resolved.source, audit: auditAds(resolved.metrics) } };
}

// ── Real-footage search (OpenMontage-style: find motion clips by topic) ───────

/** Search a footage source (default: the first configured, e.g. Pexels) for real clips. */
export async function searchFootage(services: Services, input: unknown): Promise<ApiResult> {
  const fields = (input ?? {}) as { query?: unknown; source?: unknown; perPage?: unknown; orientation?: unknown };
  if (typeof fields.query !== 'string' || fields.query.trim().length === 0) {
    return { status: 400, body: { error: 'query is required' } };
  }
  const requested = typeof fields.source === 'string' && fields.source.trim() ? fields.source.trim() : undefined;
  const chosen = requested ?? services.footage.available()[0];
  if (!chosen) {
    return { status: 503, body: { error: 'no footage source configured (set PEXELS_API_KEY)' } };
  }
  if (!services.footage.has(chosen)) return { status: 400, body: { error: `unknown footage source '${chosen}'` } };
  const provider = services.footage.get(chosen);
  if (!provider.isAvailable()) return { status: 503, body: { error: `footage source '${chosen}' not configured` } };

  const perPage = typeof fields.perPage === 'number' && Number.isFinite(fields.perPage) ? Math.min(40, Math.max(1, Math.round(fields.perPage))) : 12;
  const orientation = fields.orientation === 'portrait' || fields.orientation === 'landscape' || fields.orientation === 'square' ? fields.orientation : undefined;
  try {
    const clips = await provider.search({ query: fields.query, perPage, orientation });
    return { status: 200, body: { source: chosen, count: clips.length, clips } };
  } catch (e) {
    return { status: 502, body: { error: `footage search failed: ${e instanceof Error ? e.message : String(e)}` } };
  }
}

/** Download a footage clip by URL into the project as a video asset (ready to montage). */
export async function importFootage(services: Services, projectId: string, input: unknown): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };

  const fields = (input ?? {}) as { url?: unknown; query?: unknown; source?: unknown };
  if (typeof fields.url !== 'string' || !/^https?:\/\//i.test(fields.url)) {
    return { status: 400, body: { error: 'a valid footage url is required' } };
  }

  let res: Response;
  try {
    res = await services.fetchFn(fields.url);
  } catch (e) {
    return { status: 502, body: { error: `footage download failed: ${e instanceof Error ? e.message : String(e)}` } };
  }
  if (!res.ok) return { status: 502, body: { error: `footage download failed (${res.status})` } };

  const bytes = new Uint8Array(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') ?? 'video/mp4';
  const id = services.ids.randomId();
  const ext = contentType.includes('webm') ? 'webm' : 'mp4';
  const key = `projects/${projectId}/videos/${id}.${ext}`;
  const stored = await services.storage.put(key, bytes, contentType);

  const params: Record<string, unknown> = {
    prompt: typeof fields.query === 'string' && fields.query.trim() ? fields.query : 'imported footage',
    source: typeof fields.source === 'string' ? fields.source : 'footage',
    importedFrom: fields.url,
  };
  const asset = await services.assets.create(
    newAsset({ projectId, type: 'video', provider: 'footage', storageKey: stored.key, params }, { id, now: services.ids.nowIso() }),
  );
  return { status: 200, body: { asset } };
}

/** The refresh brief for a fatigued creative — kept generic so generateImage's brand-kit
 * preamble does the on-brand grounding. */
function refreshBrief(name: string | undefined, reason: string | undefined): string {
  const subject = name ? ` to replace "${name}"` : '';
  const why = reason ? ` It fatigued — ${reason.replace(/\.$/, '')}.` : '';
  return `A fresh, scroll-stopping ad creative${subject}. Keep the same product and brand, but take a new visual angle: different composition, camera angle, and lighting.${why}`;
}

/**
 * Close the loop: audit the metrics, find fatigued creatives, and regenerate an
 * on-brand replacement image for each (reusing generateImage, which folds in the
 * project brand kit). Degrades gracefully to a refresh *plan* when image
 * generation isn't configured, so it's useful even without a fal key.
 */
export async function optimizeFatiguedCreatives(services: Services, projectId: string, input: unknown): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };

  const fields = (input ?? {}) as AdsMetricsInput & { max?: unknown };
  const resolved = await resolveAdMetrics(services, fields);
  if (!resolved.ok) return resolved.result;

  const audit = auditAds(resolved.metrics);
  const fatigued = audit.fatigue.filter((f) => f.status === 'fatigued');
  const max = typeof fields.max === 'number' && Number.isFinite(fields.max) ? Math.min(10, Math.max(1, Math.round(fields.max))) : 3;
  const imageReady = services.imageRegistry.available().includes('fal');

  const optimizations: Array<{ creativeId: string; name?: string; score: number; reasons: string[]; brief: string; newAssetId: string | null }> = [];
  for (const f of fatigued.slice(0, max)) {
    const brief = refreshBrief(f.name, f.reasons[0]);
    let newAssetId: string | null = null;
    if (imageReady) {
      const r = await generateImage(services, projectId, { prompt: brief });
      const body = r.body as { asset?: { id?: string } | null };
      newAssetId = body.asset?.id ?? null;
    }
    optimizations.push({ creativeId: f.creativeId, name: f.name, score: f.score, reasons: f.reasons, brief, newAssetId });
  }

  return {
    status: 200,
    body: {
      source: resolved.source,
      score: audit.score,
      grade: audit.grade,
      fatiguedCount: fatigued.length,
      imageReady,
      regenerated: optimizations.filter((o) => o.newAssetId),
      optimizations,
      recommendations: audit.recommendations,
      ...(imageReady ? {} : { note: 'Image generation not configured (set FAL_KEY) — returned the refresh plan without generating new creatives.' }),
    },
  };
}

/** Seeds a brand kit from a website (name/tagline/key-messages/notes), merging
 * over any existing kit. Colors/fonts are left for the user to fill in. */
export async function deriveBrandKitFromWebsite(
  services: Services,
  projectId: string,
  input: { url?: unknown },
): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  if (typeof input.url !== 'string' || input.url.trim().length === 0) {
    return { status: 400, body: { error: 'a website url is required' } };
  }

  let site;
  try {
    site = await services.websiteReader.read(input.url);
  } catch (e) {
    return { status: 400, body: { error: `could not read website: ${e instanceof Error ? e.message : String(e)}` } };
  }

  const existing = (await getBrandKit(services, projectId)) ?? {};
  const desc = (site.description ?? '').trim();
  const firstSentence = desc ? desc.split(/[.!?]/)[0]?.trim() : undefined;
  const headings = (site.headings ?? []).slice(0, 5);

  const merged: BrandKit = {
    ...existing,
    name: existing.name ?? site.siteName ?? site.title,
    tagline: existing.tagline ?? firstSentence,
    keyMessages: existing.keyMessages ?? (headings.length ? headings : undefined),
    notes: existing.notes ?? (desc || undefined),
    sourceUrl: site.url,
  };
  const kit = sanitizeBrandKit(merged);
  const bytes = new TextEncoder().encode(JSON.stringify(kit));
  await services.storage.put(brandKitKey(projectId), bytes, 'application/json');
  return { status: 200, body: { brandKit: kit, derivedFrom: site.url } };
}

// Base64-encode bytes in a way that works on both Node (Buffer) and the edge
// runtime (no Buffer — chunked String.fromCharCode + btoa, chunked to avoid the
// arg-count limit on very large assets).
function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Resolves an asset to a URL an external consumer (fal.ai models, the montage
 * worker, ffmpeg) can actually fetch.
 *
 * - When FORGECAST_BASE_URL points at a publicly reachable deployment, we hand
 *   out `${base}/api/assets/{id}/raw` so the provider streams the bytes from us
 *   (cheapest — no re-upload).
 * - Otherwise (the common local-dev case, where fal's servers can't reach your
 *   laptop) we inline the bytes as a `data:` URI. fal's image models, the
 *   image-to-video endpoint, and ffmpeg all accept data URIs, so enhance / edit
 *   / animate / montage work with nothing but a fal key — no public tunnel.
 *
 * Returns null only when the asset has no stored bytes.
 */
async function resolveAssetUrl(services: Services, assetId: string): Promise<string | null> {
  const base = process.env.FORGECAST_BASE_URL;
  if (base && base.trim().length > 0) {
    return `${base.replace(/\/$/, '')}/api/assets/${assetId}/raw`;
  }
  const got = await getAssetBytes(services, assetId);
  if (!got) return null;
  return `data:${got.contentType};base64,${toBase64(got.data)}`;
}

const SHORT_ASPECTS = new Set(['9:16', '16:9', '1:1']);
const SHORT_SOURCES = new Set(['pexels', 'pixabay', 'local']);
const SHORT_CONCAT = new Set(['random', 'sequential']);
const SHORT_TRANSITIONS = new Set(['none', 'Shuffle', 'FadeIn', 'FadeOut', 'SlideIn', 'SlideOut']);
const SHORT_SUB_POS = new Set(['top', 'center', 'bottom', 'custom']);

function clampNum(v: unknown, min: number, max: number): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  return Math.min(max, Math.max(min, v));
}

/** Validate + clamp untrusted short-video options into a typed ShortVideoOptions. */
function sanitizeShortVideoOptions(input: unknown): ShortVideoOptions | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const o = input as Record<string, unknown>;
  const out: ShortVideoOptions = {};
  if (typeof o.aspect === 'string' && SHORT_ASPECTS.has(o.aspect)) out.aspect = o.aspect as ShortVideoOptions['aspect'];
  if (typeof o.script === 'string' && o.script.trim().length > 0) out.script = o.script;
  if (Array.isArray(o.terms)) {
    const t = o.terms.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
    if (t.length > 0) out.terms = t;
  }
  const cd = clampNum(o.clipDuration, 1, 30); if (cd !== undefined) out.clipDuration = Math.round(cd);
  const ct = clampNum(o.count, 1, 10); if (ct !== undefined) out.count = Math.round(ct);
  if (typeof o.source === 'string' && SHORT_SOURCES.has(o.source)) out.source = o.source as ShortVideoOptions['source'];
  if (typeof o.concatMode === 'string' && SHORT_CONCAT.has(o.concatMode)) out.concatMode = o.concatMode as ShortVideoOptions['concatMode'];
  if (typeof o.transition === 'string' && SHORT_TRANSITIONS.has(o.transition)) out.transition = o.transition as ShortVideoOptions['transition'];
  if (typeof o.voiceName === 'string') out.voiceName = o.voiceName;
  const vv = clampNum(o.voiceVolume, 0, 5); if (vv !== undefined) out.voiceVolume = vv;
  const vr = clampNum(o.voiceRate, 0.5, 2); if (vr !== undefined) out.voiceRate = vr;
  if (typeof o.bgmType === 'string') out.bgmType = o.bgmType;
  const bv = clampNum(o.bgmVolume, 0, 1); if (bv !== undefined) out.bgmVolume = bv;
  if (typeof o.subtitles === 'boolean') out.subtitles = o.subtitles;
  if (typeof o.subtitlePosition === 'string' && SHORT_SUB_POS.has(o.subtitlePosition)) out.subtitlePosition = o.subtitlePosition as ShortVideoOptions['subtitlePosition'];
  if (typeof o.fontName === 'string') out.fontName = o.fontName;
  if (typeof o.textColor === 'string') out.textColor = o.textColor;
  const fs = clampNum(o.fontSize, 10, 200); if (fs !== undefined) out.fontSize = Math.round(fs);
  if (typeof o.strokeColor === 'string') out.strokeColor = o.strokeColor;
  const sw = clampNum(o.strokeWidth, 0, 10); if (sw !== undefined) out.strokeWidth = sw;
  const pn = clampNum(o.paragraphs, 1, 10); if (pn !== undefined) out.paragraphs = Math.round(pn);
  return Object.keys(out).length > 0 ? out : undefined;
}

export async function generateShortVideo(services: Services, projectId: string, input: unknown): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  if (!services.videoWorker.isAvailable()) {
    return { status: 503, body: { error: 'short-video worker not configured (set FORGECAST_VIDEO_WORKER_URL)' } };
  }
  const fields = (input ?? {}) as { subject?: unknown; prompt?: unknown; options?: unknown };
  const rawSubject = typeof fields.subject === 'string' ? fields.subject : typeof fields.prompt === 'string' ? fields.prompt : '';
  if (rawSubject.trim().length === 0) return { status: 400, body: { error: 'subject is required' } };
  const blockedShort = guardText(rawSubject); if (blockedShort) return blockedShort;
  // Ground the short video in the project's brand kit (no-op when none is set).
  const subject = applyBrandKit(await getBrandKit(services, projectId), rawSubject);
  const options = sanitizeShortVideoOptions(fields.options);

  const params: Record<string, unknown> = { subject };
  if (options) params.options = options;
  const job = await services.jobs.create(
    newJob(
      { projectId, kind: 'short_video', provider: 'moneyprinter', params },
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
  const fields = (input ?? {}) as {
    prompt?: unknown;
    provider?: unknown;
    aspectRatio?: unknown;
    duration?: unknown;
    quality?: unknown;
    model?: unknown;
    imageAssetId?: unknown;
    imageUrl?: unknown;
    characterId?: unknown;
  };
  if (typeof fields.prompt !== 'string' || fields.prompt.trim().length === 0) {
    return { status: 400, body: { error: 'prompt is required' } };
  }
  const blockedVideo = guardText(fields.prompt); if (blockedVideo) return blockedVideo;

  // Optional cast member: identity holds by driving image-to-video from the
  // character's portrait (unless the caller supplied an explicit source frame).
  if (typeof fields.characterId === 'string' && fields.characterId.length > 0) {
    const resolved = await ownedCharacter(services, project.ownerId, fields.characterId);
    if ('status' in resolved) return resolved;
    const cast = resolved.character;
    if (!(typeof fields.imageUrl === 'string' && fields.imageUrl.length > 0) && !(typeof fields.imageAssetId === 'string' && fields.imageAssetId.length > 0)) {
      const refs = await characterRefUrls(services, cast);
      if (refs.length === 0) return { status: 400, body: { error: 'character has no stored reference images' } };
      fields.imageUrl = refs[0];
    }
    fields.prompt = `${fields.prompt} — featuring ${cast.name}${cast.description ? ` (${cast.description})` : ''}; keep the person from the source image identical`;
  }

  // Resolve the video provider: keyless Cloudflare by default, BYO fal/Replicate (or
  // an explicit `provider`) "on top". Each job records its provider so polling resolves
  // back to the right adapter (see advanceVideoJob).
  const availableVideo = services.videoProviders;
  if (availableVideo.length === 0) {
    return { status: 503, body: { error: 'no video provider configured — add a FREE Hugging Face token for free open-model video (huggingface.co/settings/tokens, Settings → Keys), bring a fal/Replicate key, run SkyReels on your own GPU (SKYREELS_URL), or render a stills-reel montage (free, unlimited)' } };
  }
  const defaultVideo = services.videoProvider.name;
  const requestedVideo = typeof fields.provider === 'string' && fields.provider.length > 0 ? fields.provider : defaultVideo;
  let videoProviderName = requestedVideo;
  if (!availableVideo.includes(videoProviderName)) {
    if (requestedVideo === defaultVideo) videoProviderName = availableVideo[0]!;
    else return { status: 503, body: { error: `video provider '${requestedVideo}' not configured` } };
  }
  const videoProvider = services.videoRegistry.get(videoProviderName);

  // Cloudflare uses its own video catalog (Vidu, etc.), not fal ids — ignore any fal
  // model/boost that came from the UI so an unknown-to-CF model id can't 404 the request.
  const isCloudflareVideo = videoProviderName === 'cloudflare';
  const modelId = !isCloudflareVideo && typeof fields.model === 'string' ? fields.model : undefined;
  const modelDef = modelId ? videoModelById(modelId) : undefined;

  // Resolve image source for image-to-video models
  let resolvedImageUrl: string | undefined;
  if (modelDef?.mode === 'image-to-video') {
    if (typeof fields.imageAssetId === 'string' && fields.imageAssetId.length > 0) {
      const asset = await services.assets.get(fields.imageAssetId);
      if (!asset) return { status: 404, body: { error: `asset ${fields.imageAssetId} not found` } };
      const url = await resolveAssetUrl(services, fields.imageAssetId);
      if (!url) return { status: 404, body: { error: `asset ${fields.imageAssetId} has no stored bytes` } };
      resolvedImageUrl = url;
    } else if (typeof fields.imageUrl === 'string' && fields.imageUrl.length > 0) {
      resolvedImageUrl = fields.imageUrl;
    } else {
      return { status: 400, body: { error: 'image-to-video needs a source image (imageAssetId)' } };
    }
  }

  // Ground the video in the project's brand kit (no-op when none is set).
  const brandedPrompt = applyBrandKit(await getBrandKit(services, projectId), fields.prompt as string);
  const params: Record<string, unknown> = { prompt: brandedPrompt };
  if (typeof fields.aspectRatio === 'string') params.aspectRatio = fields.aspectRatio;
  if (typeof fields.duration === 'number') params.duration = fields.duration;
  if (typeof fields.quality === 'string') params.quality = fields.quality;
  if (modelId) params.model = modelId;
  if (resolvedImageUrl) params.imageUrl = resolvedImageUrl;
  if (modelDef?.params) params.extra = modelDef.params;

  const job = await services.jobs.create(
    newJob({ projectId, kind: 'video', provider: videoProviderName, params }, { id: services.ids.randomId(), now: services.ids.nowIso() }),
  );

  // Submit to the provider synchronously (a fast queue POST), then let the client
  // drive completion via GET /api/jobs/:id (see advanceVideoJob). This keeps each
  // request short so heavy/slow models complete reliably on Cloudflare Workers,
  // which kill background work once the response is returned.
  try {
    const { taskId } = await videoProvider.create({
      prompt: brandedPrompt,
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

async function buildSpecFromAssets(services: Services, assetIds: string[], aspectRatio: string, durationSec = 4): Promise<MontageSpec | null> {
  const scenes = [];
  for (const id of assetIds) {
    const asset = await services.assets.get(id);
    if (!asset) continue;
    const url = await resolveAssetUrl(services, id);
    if (!url) continue;
    const kind = asset.type === 'video' ? 'video' as const : 'image' as const;
    // Gentle push-in on stills by default (the free "virtual camera").
    scenes.push({ url, kind, durationSec, cameraPreset: kind === 'image' ? 'zoom-in' as const : 'none' as const });
  }
  return scenes.length > 0 ? { scenes, aspectRatio } : null;
}

// ── Timeline video editor (agent- and UI-drivable; renders via the montage pipeline) ──

const timelineKey = (projectId: string): string => `projects/${projectId}/timeline.json`;

/** Load a project's saved timeline (or null if none). */
export async function getTimeline(services: Services, projectId: string): Promise<EditorTimeline | null> {
  const stored = await services.storage.get(timelineKey(projectId));
  if (!stored) return null;
  try {
    return normalizeTimeline(JSON.parse(new TextDecoder().decode(stored.data)), services.ids.randomId);
  } catch {
    return null;
  }
}

/** Read the timeline for the editor (empty timeline when none saved yet). */
export async function readTimeline(services: Services, projectId: string): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  return { status: 200, body: { timeline: (await getTimeline(services, projectId)) ?? emptyTimeline() } };
}

/**
 * Cross-tenant guard: every EXISTING asset a timeline references (clips, music,
 * voice-over) must belong to the same owner as the timeline's project. Missing
 * ids keep their historical skip-at-render behavior; a foreign id is rejected
 * as not-found so nothing leaks about other tenants' assets.
 */
async function foreignTimelineAsset(services: Services, projectOwner: string | undefined, timeline: EditorTimeline): Promise<string | null> {
  const ids = [...timeline.clips.map((c) => c.assetId), timeline.musicAssetId, timeline.voiceoverAssetId]
    .filter((x): x is string => typeof x === 'string' && x.length > 0);
  for (const id of ids) {
    const asset = await services.assets.get(id);
    if (!asset) continue;
    const owner = (await services.projects.get(asset.projectId))?.ownerId ?? LOCAL_OWNER;
    if (owner !== (projectOwner ?? LOCAL_OWNER)) return id;
  }
  return null;
}

/** Save (normalize + persist) a timeline for a project. */
export async function saveTimeline(services: Services, projectId: string, input: unknown): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  const fields = (input ?? {}) as { timeline?: unknown };
  const timeline = normalizeTimeline(fields.timeline ?? input, services.ids.randomId);
  const foreign = await foreignTimelineAsset(services, project.ownerId, timeline);
  if (foreign) return { status: 400, body: { error: `asset not found: ${foreign}` } };
  await services.storage.put(timelineKey(projectId), new TextEncoder().encode(JSON.stringify(timeline)), 'application/json');
  return { status: 200, body: { timeline } };
}

/** Resolve a timeline into a renderable MontageSpec (each clip → a scene). */
export async function buildTimelineSpec(services: Services, timeline: EditorTimeline): Promise<MontageSpec | null> {
  const scenes: MontageScene[] = [];
  for (const clip of timeline.clips) {
    const asset = await services.assets.get(clip.assetId);
    if (!asset) continue;
    const url = await resolveAssetUrl(services, clip.assetId);
    if (!url) continue;
    const scene: MontageScene = { url, kind: asset.type === 'video' ? 'video' : 'image', durationSec: clip.durationSec };
    if (clip.caption) scene.caption = clip.caption;
    if (clip.transition) scene.transition = clip.transition;
    // Default virtual-camera move: a gentle push-in keeps stills alive. Defaulted
    // here (not in the worker) so every spec is explicit and old specs render unchanged.
    scene.cameraPreset = clip.cameraPreset ?? (scene.kind === 'image' ? 'zoom-in' : 'none');
    scenes.push(scene);
  }
  if (scenes.length === 0) return null;
  const spec: MontageSpec = { scenes, aspectRatio: timeline.aspectRatio };
  if (timeline.fps) spec.fps = timeline.fps;
  if (timeline.musicAssetId) {
    const musicUrl = await resolveAssetUrl(services, timeline.musicAssetId);
    if (musicUrl) spec.musicUrl = musicUrl;
  }
  if (timeline.voiceoverAssetId) {
    const voiceoverUrl = await resolveAssetUrl(services, timeline.voiceoverAssetId);
    if (voiceoverUrl) spec.voiceoverUrl = voiceoverUrl;
  }
  return spec;
}

/**
 * Synthesizes a narration script into an audio asset (via the active voice
 * provider, synchronously — same in-request pattern as image generation) and
 * returns its resolvable URL (for a MontageSpec) plus the asset id (for a
 * timeline's voiceoverAssetId). Errors are returned as ApiResults.
 */
async function synthesizeVoiceoverUrl(services: Services, projectId: string, text: string): Promise<{ url: string; assetId: string } | ApiResult> {
  if (!services.voiceAvailable) {
    return { status: 503, body: { error: 'voiceoverText given but voice-over is not available — on Cloudflare it is keyless (AI binding); elsewhere set VOXCPM_URL or FAL_KEY_VOICE, or pass voiceoverAssetId instead' } };
  }
  const blocked = guardText(text);
  if (blocked) return blocked;
  const vjob = await services.jobs.create(
    newJob({ projectId, kind: 'voiceover', provider: services.voiceProvider.name, params: { text } }, { id: services.ids.randomId(), now: services.ids.nowIso() }),
  );
  const finished = await services.runner.run(vjob.id);
  if (finished.status !== 'done' || !finished.resultAssetId) {
    return { status: 502, body: { error: `voice-over synthesis failed${finished.error ? `: ${finished.error}` : ''}` } };
  }
  const url = await resolveAssetUrl(services, finished.resultAssetId);
  if (!url) return { status: 502, body: { error: 'synthesized voice-over has no stored audio' } };
  return { url, assetId: finished.resultAssetId };
}

/** Kick off a montage job. The remote Remotion worker is submit-then-poll (the client
 *  drives completion via GET /api/jobs/:id — Cloudflare-safe for long renders); the local
 *  in-process ffmpeg path renders in a background task (Node only). */
async function submitMontage(services: Services, job: Job, spec: MontageSpec): Promise<ApiResult> {
  if (services.montageWorker.isAvailable()) {
    try {
      const { taskId } = await services.montageWorker.render(spec);
      const running = await services.jobs.update(job.id, {
        status: 'running',
        progress: 0.05,
        params: { ...job.params, [MONTAGE_TASK_KEY]: taskId },
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
  runBackground(services.runner.run(job.id));
  return { status: 202, body: { job } };
}

/** Render a timeline into a finished video via the montage renderer (async job). */
export async function renderTimeline(services: Services, projectId: string, input: unknown): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  if (!services.montageAvailable) {
    return { status: 503, body: { error: 'montage not configured (set MONTAGE_WORKER_URL, or ensure the bundled ffmpeg is available)' } };
  }
  // Render the timeline passed in, or the project's saved one.
  const fields = (input ?? {}) as { timeline?: unknown };
  const timeline = fields.timeline !== undefined
    ? normalizeTimeline(fields.timeline, services.ids.randomId)
    : ((await getTimeline(services, projectId)) ?? emptyTimeline());
  if (timeline.clips.length === 0) return { status: 400, body: { error: 'timeline has no clips to render' } };
  const foreignRender = await foreignTimelineAsset(services, project.ownerId, timeline);
  if (foreignRender) return { status: 400, body: { error: `asset not found: ${foreignRender}` } };

  const spec = await buildTimelineSpec(services, timeline);
  if (!spec) return { status: 400, body: { error: 'timeline clips could not be resolved to assets' } };

  const job = await services.jobs.create(
    newJob({ projectId, kind: 'montage', provider: 'remotion', params: { spec } }, { id: services.ids.randomId(), now: services.ids.nowIso() }),
  );
  return submitMontage(services, job, spec);
}

export async function generateMontage(services: Services, projectId: string, input: unknown): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  if (!services.montageAvailable) {
    return { status: 503, body: { error: 'montage not configured (set MONTAGE_WORKER_URL, or ensure the bundled ffmpeg is available)' } };
  }
  const fields = (input ?? {}) as { spec?: MontageSpec; assetIds?: unknown; aspectRatio?: unknown; durationSec?: unknown; voiceoverAssetId?: unknown; voiceoverText?: unknown };
  const aspectRatio = typeof fields.aspectRatio === 'string' ? fields.aspectRatio : '9:16';
  const rawDurationSec = typeof fields.durationSec === 'number' ? fields.durationSec : 4;
  const durationSec = Math.min(10, Math.max(1, rawDurationSec));

  let spec = fields.spec;
  if (!spec && Array.isArray(fields.assetIds)) {
    const ids = fields.assetIds.filter((x): x is string => typeof x === 'string');
    spec = (await buildSpecFromAssets(services, ids, aspectRatio, durationSec)) ?? undefined;
  }
  if (!spec || !Array.isArray(spec.scenes) || spec.scenes.length === 0) {
    return { status: 400, body: { error: 'a "spec" with scenes, or "assetIds", is required' } };
  }

  // Optional narration: an existing audio asset, or a script synthesized on the spot.
  if (typeof fields.voiceoverAssetId === 'string' && fields.voiceoverAssetId.length > 0) {
    const url = await resolveAssetUrl(services, fields.voiceoverAssetId);
    if (!url) return { status: 400, body: { error: 'voiceoverAssetId could not be resolved to stored audio' } };
    spec = { ...spec, voiceoverUrl: url };
  } else if (typeof fields.voiceoverText === 'string' && fields.voiceoverText.trim().length > 0) {
    const synthesized = await synthesizeVoiceoverUrl(services, projectId, fields.voiceoverText);
    if (!('url' in synthesized)) return synthesized;
    spec = { ...spec, voiceoverUrl: synthesized.url };
  }

  const job = await services.jobs.create(
    newJob({ projectId, kind: 'montage', provider: 'remotion', params: { spec } }, { id: services.ids.randomId(), now: services.ids.nowIso() }),
  );
  return submitMontage(services, job, spec);
}

export async function generateVoiceover(services: Services, projectId: string, input: unknown): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  if (!services.voiceAvailable) {
    return { status: 503, body: { error: 'voice-over not configured — on Cloudflare it is keyless (AI binding); elsewhere set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_API_TOKEN, run VoxCPM (VOXCPM_URL), or set FAL_KEY_VOICE / FAL_KEY' } };
  }
  const fields = (input ?? {}) as { text?: unknown; voice?: unknown; model?: unknown };
  if (typeof fields.text !== 'string' || fields.text.trim().length === 0) {
    return { status: 400, body: { error: 'text is required' } };
  }
  const blockedVoice = guardText(fields.text); if (blockedVoice) return blockedVoice;
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
  if (!services.narrateAvailable) {
    return { status: 503, body: { error: 'narrate not available here — it needs a voice provider + local ffmpeg, which the Cloudflare Workers deploy cannot run (use voice-over + montage, or run Forgecast on a Node host)' } };
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
    characterId?: unknown;
  };

  // Optional cast member: their portrait becomes the talking face.
  if (typeof fields.characterId === 'string' && fields.characterId.length > 0) {
    const resolved = await ownedCharacter(services, project.ownerId, fields.characterId);
    if ('status' in resolved) return resolved;
    if (!(typeof fields.imageUrl === 'string' && fields.imageUrl.length > 0)) {
      const refs = await characterRefUrls(services, resolved.character);
      if (refs.length === 0) return { status: 400, body: { error: 'character has no stored reference images' } };
      fields.imageUrl = refs[0];
    }
  }

  const hasImage =
    (typeof fields.imagePrompt === 'string' && fields.imagePrompt.length > 0) ||
    (typeof fields.imageUrl === 'string' && fields.imageUrl.length > 0);
  const hasAudio =
    (typeof fields.text === 'string' && fields.text.length > 0) ||
    (typeof fields.audioUrl === 'string' && fields.audioUrl.length > 0);

  if (!hasImage) return { status: 400, body: { error: 'imagePrompt or imageUrl is required' } };
  if (!hasAudio) return { status: 400, body: { error: 'text or audioUrl is required' } };
  if (typeof fields.imagePrompt === 'string') { const b = guardText(fields.imagePrompt); if (b) return b; }
  if (typeof fields.text === 'string') { const b = guardText(fields.text); if (b) return b; }

  const params: Record<string, unknown> = {};
  // Ground the presenter's look in the project's brand kit (no-op when none is set).
  if (typeof fields.imagePrompt === 'string') params.imagePrompt = applyBrandKit(await getBrandKit(services, projectId), fields.imagePrompt);
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

export async function uploadAsset(
  services: Services,
  projectId: string,
  input: { bytes: Uint8Array; contentType: string; filename?: string },
): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  if (input.bytes.length === 0) return { status: 400, body: { error: 'file is empty' } };

  let type: 'image' | 'video';
  if (input.contentType.startsWith('image/')) {
    type = 'image';
  } else if (input.contentType.startsWith('video/')) {
    type = 'video';
  } else {
    return { status: 400, body: { error: 'only image or video uploads are supported' } };
  }

  const extMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
  };
  const defaultExt = type === 'video' ? 'mp4' : 'png';
  const ext = extMap[input.contentType] ?? defaultExt;

  const id = services.ids.randomId();
  const key = `projects/${projectId}/uploads/${id}.${ext}`;
  const stored = await services.storage.put(key, input.bytes, input.contentType);

  const asset = await services.assets.create(
    newAsset(
      {
        projectId,
        type,
        provider: 'upload',
        storageKey: stored.key,
        params: { prompt: input.filename ?? 'uploaded', filename: input.filename, uploaded: true },
      },
      { id, now: services.ids.nowIso() },
    ),
  );
  return { status: 201, body: { asset } };
}

// Build a batch of assets from a product website: import the real images found on
// the page, generate a few on-brand AI images grounded in the site copy, and
// enhance the (often low-res) imported images. Bounded for serverless: ≤6 imports,
// ≤4 generations, ≤4 enhancements. The image-download fetch is injectable for tests.
export async function generateFromWebsite(
  services: Services,
  projectId: string,
  input: { url?: unknown; generate?: unknown; generateCount?: unknown; enhance?: unknown },
  fetchFn: typeof fetch = fetch,
): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  if (typeof input.url !== 'string' || input.url.trim().length === 0) {
    return { status: 400, body: { error: 'a website url is required' } };
  }

  let site;
  try {
    site = await services.websiteReader.read(input.url);
  } catch (e) {
    return { status: 400, body: { error: `could not read website: ${e instanceof Error ? e.message : String(e)}` } };
  }

  const wantGenerate = input.generate !== false;
  const generateCount = Math.min(4, Math.max(0, typeof input.generateCount === 'number' ? Math.round(input.generateCount) : 2));
  const wantEnhance = input.enhance !== false;
  const falReady = services.imageRegistry.available().includes('fal');

  const created: unknown[] = [];
  const importedIds: string[] = [];

  // 1. Import the real product images from the site.
  const extByType = (ct: string): string =>
    ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : ct.includes('gif') ? 'gif' : 'jpg';
  for (const imgUrl of (site.images ?? []).slice(0, 6)) {
    try {
      const res = await fetchFn(imgUrl);
      if (!res.ok) continue;
      const ct = res.headers.get('content-type') ?? 'image/jpeg';
      if (!ct.startsWith('image/')) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length === 0) continue;
      const id = services.ids.randomId();
      const key = `projects/${projectId}/web-import/${id}.${extByType(ct)}`;
      const stored = await services.storage.put(key, bytes, ct);
      const asset = await services.assets.create(
        newAsset(
          { projectId, type: 'image', provider: 'web-import', storageKey: stored.key, params: { prompt: site.title ?? input.url, sourceUrl: imgUrl, fromWebsite: input.url } },
          { id, now: services.ids.nowIso() },
        ),
      );
      importedIds.push(asset.id);
      created.push(asset);
    } catch {
      // skip an individual bad image
    }
  }

  // 2. Generate on-brand AI images grounded in the site copy.
  if (wantGenerate && falReady && generateCount > 0) {
    const brand = site.siteName ?? site.title ?? 'the brand';
    const desc = (site.description ?? site.text ?? '').slice(0, 240);
    const angles = [
      `Hero product shot for ${brand}. ${desc} Clean studio lighting, premium, on-brand.`,
      `Lifestyle scene featuring ${brand}'s product in use. ${desc} Natural light, aspirational.`,
      `Bold, social-ready promo image for ${brand}. ${desc} High contrast, scroll-stopping.`,
      `Minimal flat-lay of ${brand}'s product in brand colors. ${desc}`,
    ];
    for (let i = 0; i < generateCount; i++) {
      const prompt = angles[i % angles.length] ?? `On-brand product image for ${brand}.`;
      const r = await generateImage(services, projectId, { prompt });
      const a = (r.body as { asset?: unknown }).asset;
      if (a) created.push(a);
    }
  }

  // 3. Enhance the imported (often low-res) site images.
  let enhancedCount = 0;
  if (wantEnhance && falReady) {
    for (const id of importedIds.slice(0, 4)) {
      const r = await enhanceAsset(services, projectId, { assetId: id });
      const a = (r.body as { asset?: unknown }).asset;
      if (a) { created.push(a); enhancedCount++; }
    }
  }

  if (created.length === 0) {
    return { status: 422, body: { error: 'no assets could be created from that website — no usable images were found; set FAL_KEY to also generate on-brand images' } };
  }

  return {
    status: 200,
    body: {
      assets: created,
      summary: {
        url: site.url,
        title: site.title ?? null,
        imported: importedIds.length,
        generated: wantGenerate && falReady ? generateCount : 0,
        enhanced: enhancedCount,
      },
    },
  };
}

export async function enhanceAsset(
  services: Services,
  projectId: string,
  input: { assetId?: string },
): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  if (!input.assetId) return { status: 400, body: { error: 'assetId is required' } };

  const asset = await services.assets.get(input.assetId);
  if (!asset) return { status: 404, body: { error: 'asset not found' } };
  if (asset.type !== 'image') return { status: 400, body: { error: 'only image assets can be enhanced' } };

  if (!services.imageRegistry.available().includes('fal')) {
    return { status: 503, body: { error: 'image provider not configured (set FAL_KEY)' } };
  }

  const imageUrl = await resolveAssetUrl(services, input.assetId);
  if (!imageUrl) return { status: 404, body: { error: 'asset has no stored bytes' } };

  const job = await services.jobs.create(
    newJob(
      { projectId, kind: 'enhance', provider: 'fal', params: { imageUrl, sourceAssetId: input.assetId } },
      { id: services.ids.randomId(), now: services.ids.nowIso() },
    ),
  );
  const finished = await services.runner.run(job.id);
  const newAssetResult = finished.resultAssetId ? await services.assets.get(finished.resultAssetId) : null;
  return { status: 200, body: { job: finished, asset: newAssetResult } };
}

export async function removeBackgroundAsset(
  services: Services,
  projectId: string,
  input: { assetId?: string },
): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  if (!input.assetId) return { status: 400, body: { error: 'assetId is required' } };

  const asset = await services.assets.get(input.assetId);
  if (!asset) return { status: 404, body: { error: 'asset not found' } };
  if (asset.type !== 'image') return { status: 400, body: { error: 'only image assets can have their background removed' } };

  if (!services.imageRegistry.available().includes('fal')) {
    return { status: 503, body: { error: 'image provider not configured (set FAL_KEY)' } };
  }

  const imageUrl = await resolveAssetUrl(services, input.assetId);
  if (!imageUrl) return { status: 404, body: { error: 'asset has no stored bytes' } };

  const job = await services.jobs.create(
    newJob(
      { projectId, kind: 'cutout', provider: 'fal', params: { imageUrl, sourceAssetId: input.assetId } },
      { id: services.ids.randomId(), now: services.ids.nowIso() },
    ),
  );
  const finished = await services.runner.run(job.id);
  const newAssetResult = finished.resultAssetId ? await services.assets.get(finished.resultAssetId) : null;
  return { status: 200, body: { job: finished, asset: newAssetResult } };
}

export async function editAsset(
  services: Services,
  projectId: string,
  input: { assetId?: string; prompt?: unknown },
): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  if (!input.assetId) return { status: 400, body: { error: 'assetId is required' } };

  const asset = await services.assets.get(input.assetId);
  if (!asset) return { status: 404, body: { error: 'asset not found' } };
  if (asset.type !== 'image') return { status: 400, body: { error: 'only image assets can be edited' } };

  if (!services.imageRegistry.available().includes('fal')) {
    return { status: 503, body: { error: 'image provider not configured (set FAL_KEY)' } };
  }

  if (typeof input.prompt !== 'string' || input.prompt.trim().length === 0) {
    return { status: 400, body: { error: 'an edit instruction (prompt) is required' } };
  }

  const imageUrl = await resolveAssetUrl(services, input.assetId);
  if (!imageUrl) return { status: 404, body: { error: 'asset has no stored bytes' } };

  const job = await services.jobs.create(
    newJob(
      { projectId, kind: 'edit', provider: 'fal', params: { imageUrl, prompt: input.prompt, sourceAssetId: input.assetId } },
      { id: services.ids.randomId(), now: services.ids.nowIso() },
    ),
  );
  const finished = await services.runner.run(job.id);
  const newAssetResult = finished.resultAssetId ? await services.assets.get(finished.resultAssetId) : null;
  return { status: 200, body: { job: finished, asset: newAssetResult } };
}

// ── Re-angle & Re-light (Higgsfield-Relight-class ops on still images) ────────
// Both compose a precise edit instruction from a house preset and/or a custom
// instruction, then reuse the existing `edit` job pipeline — only the model
// routing differs per op.

/** Camera re-angling: a LoRA endpoint purpose-trained for multi-angle re-shots. */
// The base Qwen-Image-Edit-2509 is INSTRUCTION-driven (required: prompt + image_urls),
// so our natural-language angle presets actually apply. The .../multiple-angles LoRA
// endpoint has NO prompt field (angle is set by discrete params) — it would ignore the
// preset instruction entirely. The /qwen-image-edit-2509/ regex in editImage still
// matches this id, keeping the plural image_urls mapping.
const REANGLE_MODEL = 'fal-ai/qwen-image-edit-2509';
/** Scene relighting: IC-Light v2 (prompt + image_url → relit image). */
const RELIGHT_MODEL = 'fal-ai/iclight-v2';

async function reimagineAsset(
  services: Services,
  projectId: string,
  input: { assetId?: string; preset?: unknown; instruction?: unknown },
  cfg: {
    op: 'reangle' | 'relight';
    presets: readonly ReimaginePreset[];
    typeError: string;
    /** Model for the edit job; undefined → the edit handler's default editor. */
    model: (fromPreset: boolean) => string | undefined;
  },
): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  if (!input.assetId) return { status: 400, body: { error: 'assetId is required' } };

  const asset = await services.assets.get(input.assetId);
  // A foreign asset (another project's) is indistinguishable from a missing one.
  if (!asset || asset.projectId !== projectId) return { status: 404, body: { error: 'asset not found' } };
  if (asset.type !== 'image') return { status: 400, body: { error: cfg.typeError } };

  if (!services.imageRegistry.available().includes('fal')) {
    return { status: 503, body: { error: 'image provider not configured (set FAL_KEY)' } };
  }

  const preset = typeof input.preset === 'string' && input.preset.length > 0 ? input.preset : undefined;
  const custom = typeof input.instruction === 'string' ? input.instruction : undefined;
  if (custom) {
    const blocked = guardText(custom);
    if (blocked) return blocked;
  }
  const composed = composeReimagineInstruction(cfg.presets, { preset, instruction: custom });
  if (!composed.ok) return { status: 400, body: { error: composed.error } };

  const imageUrl = await resolveAssetUrl(services, input.assetId);
  if (!imageUrl) return { status: 404, body: { error: 'asset has no stored bytes' } };

  const model = cfg.model(composed.fromPreset);
  const job = await services.jobs.create(
    newJob(
      {
        projectId,
        kind: 'edit',
        provider: 'fal',
        params: {
          imageUrl,
          prompt: composed.instruction,
          sourceAssetId: input.assetId,
          op: cfg.op,
          ...(preset ? { preset } : {}),
          ...(model ? { model } : {}),
        },
      },
      { id: services.ids.randomId(), now: services.ids.nowIso() },
    ),
  );
  const finished = await services.runner.run(job.id);
  const newAssetResult = finished.resultAssetId ? await services.assets.get(finished.resultAssetId) : null;
  return { status: 200, body: { job: finished, asset: newAssetResult } };
}

/**
 * Re-shoot an image from a different camera angle (subject, scene and lighting
 * held constant). A preset routes to the multi-angle LoRA editor; a custom-only
 * instruction runs on the default instruction editor.
 */
export async function reangleAsset(
  services: Services,
  projectId: string,
  input: { assetId?: string; preset?: unknown; instruction?: unknown },
): Promise<ApiResult> {
  return reimagineAsset(services, projectId, input, {
    op: 'reangle',
    presets: ANGLE_PRESETS,
    typeError: 'only image assets can be re-angled',
    model: (fromPreset) => (fromPreset ? REANGLE_MODEL : undefined),
  });
}

/**
 * Relight an image's scene (subject, composition and camera held constant).
 * Always routes to the dedicated relighting model.
 */
export async function relightAsset(
  services: Services,
  projectId: string,
  input: { assetId?: string; preset?: unknown; instruction?: unknown },
): Promise<ApiResult> {
  return reimagineAsset(services, projectId, input, {
    op: 'relight',
    presets: LIGHT_PRESETS,
    typeError: 'only image assets can be relit',
    model: () => RELIGHT_MODEL,
  });
}

// Produces N alternate takes of an image by re-running the edit model with
// variation instructions — "give me options" in one click. Thin layer over the
// existing edit job; each variation is its own new image asset.
export async function generateVariations(
  services: Services,
  projectId: string,
  input: { assetId?: string; count?: number },
): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  if (!input.assetId) return { status: 400, body: { error: 'assetId is required' } };

  const asset = await services.assets.get(input.assetId);
  if (!asset) return { status: 404, body: { error: 'asset not found' } };
  if (asset.type !== 'image') return { status: 400, body: { error: 'only image assets can have variations' } };

  if (!services.imageRegistry.available().includes('fal')) {
    return { status: 503, body: { error: 'image provider not configured (set FAL_KEY)' } };
  }

  const imageUrl = await resolveAssetUrl(services, input.assetId);
  if (!imageUrl) return { status: 404, body: { error: 'asset has no stored bytes' } };

  const count = Math.min(4, Math.max(1, typeof input.count === 'number' ? Math.round(input.count) : 3));
  const assets = [];
  for (let i = 1; i <= count; i++) {
    const prompt = `Create a fresh variation of this image: keep the same subject, product, and brand, but change the composition, camera angle, and lighting. Variation ${i} of ${count}.`;
    const job = await services.jobs.create(
      newJob(
        { projectId, kind: 'edit', provider: 'fal', params: { imageUrl, prompt, sourceAssetId: input.assetId, variation: true } },
        { id: services.ids.randomId(), now: services.ids.nowIso() },
      ),
    );
    const finished = await services.runner.run(job.id);
    if (finished.resultAssetId) {
      const a = await services.assets.get(finished.resultAssetId);
      if (a) assets.push(a);
    }
  }
  if (assets.length === 0) return { status: 502, body: { error: 'variation generation failed' } };
  return { status: 200, body: { assets } };
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

// ── Characters — persistent cast, reusable across projects + modalities ──────

/** Resolve a character the given owner can use, or an ApiResult error. */
async function ownedCharacter(services: Services, projectOwner: string | undefined, characterId: string): Promise<{ character: Character } | ApiResult> {
  const character = await services.characters.get(characterId);
  if (!character || character.ownerId !== (projectOwner ?? LOCAL_OWNER)) {
    return { status: 404, body: { error: `character not found: ${characterId}` } };
  }
  return { character };
}

/** Reference portraits as provider-fetchable URLs (public route when a base URL exists, else data URIs). */
async function characterRefUrls(services: Services, character: Character): Promise<string[]> {
  const base = process.env.FORGECAST_BASE_URL?.replace(/\/$/, '');
  if (base) return character.refKeys.map((_, i) => `${base}/api/characters/${character.id}/refs/${i}`);
  const urls: string[] = [];
  for (const key of character.refKeys) {
    const got = await services.storage.get(key);
    if (got) urls.push(`data:${got.contentType};base64,${toBase64(got.data)}`);
  }
  return urls;
}

/** Raw bytes of one reference portrait (serves the public refs route). */
export async function getCharacterRefBytes(services: Services, characterId: string, index: number): Promise<{ data: Uint8Array; contentType: string } | null> {
  const character = await services.characters.get(characterId);
  const key = character?.refKeys[index];
  if (!key) return null;
  return services.storage.get(key);
}

/**
 * Create a character from 1–4 already-uploaded IMAGE assets (the references).
 * Bytes are copied into character-owned storage so deleting the source assets
 * later never breaks the cast.
 */
export async function createCharacter(services: Services, ownerId: string, input: unknown): Promise<ApiResult> {
  const fields = (input ?? {}) as { name?: unknown; description?: unknown; refAssetIds?: unknown };
  if (typeof fields.name !== 'string' || fields.name.trim().length === 0 || fields.name.length > 80) {
    return { status: 400, body: { error: 'a character name (1–80 chars) is required' } };
  }
  const description = typeof fields.description === 'string' && fields.description.trim().length > 0 ? fields.description.slice(0, 500) : undefined;
  const blocked = guardText(`${fields.name} ${description ?? ''}`); if (blocked) return blocked;

  const refAssetIds = Array.isArray(fields.refAssetIds) ? fields.refAssetIds.filter((x): x is string => typeof x === 'string') : [];
  if (refAssetIds.length < 1 || refAssetIds.length > MAX_CHARACTER_REFS) {
    return { status: 400, body: { error: `1–${MAX_CHARACTER_REFS} reference image assets are required (upload portraits first, then pass their asset ids)` } };
  }

  const id = services.ids.randomId();
  const refKeys: string[] = [];
  for (const assetId of refAssetIds) {
    const asset = await services.assets.get(assetId);
    const owner = asset ? ((await services.projects.get(asset.projectId))?.ownerId ?? LOCAL_OWNER) : undefined;
    if (!asset || owner !== (ownerId ?? LOCAL_OWNER)) return { status: 404, body: { error: `asset not found: ${assetId}` } };
    if (asset.type !== 'image') return { status: 400, body: { error: `reference must be an image asset: ${assetId}` } };
    const bytes = await getAssetBytes(services, assetId);
    if (!bytes) return { status: 400, body: { error: `asset has no stored bytes: ${assetId}` } };
    const key = `characters/${id}/ref-${refKeys.length}`;
    await services.storage.put(key, bytes.data, bytes.contentType);
    refKeys.push(key);
  }

  const character = await services.characters.create({
    id, ownerId: ownerId ?? LOCAL_OWNER, name: fields.name.trim(), refKeys,
    ...(description ? { description } : {}), createdAt: services.ids.nowIso(),
  });
  return { status: 200, body: { character } };
}

export async function listCharacters(services: Services, ownerId: string): Promise<ApiResult> {
  const characters = await services.characters.listByOwner(ownerId ?? LOCAL_OWNER);
  return { status: 200, body: { characters, count: characters.length } };
}

export async function getCharacter(services: Services, ownerId: string, characterId: string): Promise<ApiResult> {
  const resolved = await ownedCharacter(services, ownerId, characterId);
  if ('status' in resolved) return resolved;
  return { status: 200, body: { character: resolved.character } };
}

export async function deleteCharacter(services: Services, ownerId: string, characterId: string): Promise<ApiResult> {
  const resolved = await ownedCharacter(services, ownerId, characterId);
  if ('status' in resolved) return resolved;
  await services.characters.delete(characterId);
  return { status: 200, body: { ok: true } };
}

// ── Storyboard / Director — brief → LLM shot list → stills → clips → timeline ──
// Persisted like the timeline: one JSON document per project in the storage
// driver (no schema change). The board is drivable by the Studio UI and MCP.

const storyboardKey = (projectId: string): string => `projects/${projectId}/storyboard.json`;

/** Load a project's saved storyboard (or null if none). */
export async function getStoryboard(services: Services, projectId: string): Promise<Storyboard | null> {
  const stored = await services.storage.get(storyboardKey(projectId));
  if (!stored) return null;
  try {
    return normalizeStoryboard(JSON.parse(new TextDecoder().decode(stored.data)), services.ids.randomId);
  } catch {
    return null;
  }
}

async function putStoryboard(services: Services, projectId: string, storyboard: Storyboard): Promise<void> {
  await services.storage.put(storyboardKey(projectId), new TextEncoder().encode(JSON.stringify(storyboard)), 'application/json');
}

/** Read the storyboard for the board UI (empty storyboard when none saved yet). */
export async function readStoryboard(services: Services, projectId: string): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  return { status: 200, body: { storyboard: (await getStoryboard(services, projectId)) ?? emptyStoryboard() } };
}

/**
 * Cross-tenant guard (the storyboard sibling of foreignTimelineAsset): every
 * EXISTING character or asset a storyboard references must belong to the same
 * owner as the storyboard's project. Missing ids keep their skip-at-render
 * behavior; a foreign id is rejected as not-found so nothing leaks about other
 * tenants. Returns the rejection message, or null when the board is clean.
 */
async function foreignStoryboardRef(services: Services, projectOwner: string | undefined, storyboard: Storyboard): Promise<string | null> {
  const owner = projectOwner ?? LOCAL_OWNER;
  for (const shot of storyboard.shots) {
    if (shot.characterId) {
      const character = await services.characters.get(shot.characterId);
      if (character && character.ownerId !== owner) return `character not found: ${shot.characterId}`;
    }
    for (const id of [shot.imageAssetId, shot.clipAssetId]) {
      if (!id) continue;
      const asset = await services.assets.get(id);
      if (!asset) continue;
      const assetOwner = (await services.projects.get(asset.projectId))?.ownerId ?? LOCAL_OWNER;
      if (assetOwner !== owner) return `asset not found: ${id}`;
    }
  }
  return null;
}

/** Save (normalize + persist) a storyboard for a project. */
export async function saveStoryboard(services: Services, projectId: string, input: unknown): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  const fields = (input ?? {}) as { storyboard?: unknown };
  const storyboard = normalizeStoryboard(fields.storyboard ?? input, services.ids.randomId);
  const foreign = await foreignStoryboardRef(services, project.ownerId, storyboard);
  if (foreign) return { status: 400, body: { error: foreign } };
  await putStoryboard(services, projectId, storyboard);
  return { status: 200, body: { storyboard } };
}

/**
 * The DIRECTOR: plan a storyboard from a brief with the agent LLM — a cinematic
 * shot list (prompt/caption/shotType/duration) plus a voice-over script, saved
 * as the project's storyboard. When a cast member is given, their id is stamped
 * onto every shot so each rendered frame holds their identity.
 */
export async function generateStoryboard(
  services: Services,
  projectId: string,
  input: unknown,
  llm: AdCopyLlm = makeLlmClient(),
): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };

  const fields = (input ?? {}) as { brief?: unknown; shotCount?: unknown; characterId?: unknown; aspectRatio?: unknown };
  if (typeof fields.brief !== 'string' || fields.brief.trim().length === 0) {
    return { status: 400, body: { error: 'brief is required' } };
  }
  const blockedStoryboard = guardText(fields.brief); if (blockedStoryboard) return blockedStoryboard;
  if (!llm.isAvailable()) {
    return {
      status: 503,
      body: { error: 'agent LLM not configured (set OPENAI_API_KEY; or FORGECAST_AGENT_LLM=anthropic with ANTHROPIC_API_KEY for Claude)' },
    };
  }

  // Optional cast member: resolved up-front (same owner as the project) so a
  // foreign id fails fast, then stamped onto every planned shot.
  let character: Character | null = null;
  if (typeof fields.characterId === 'string' && fields.characterId.length > 0) {
    const resolved = await ownedCharacter(services, project.ownerId, fields.characterId);
    if ('status' in resolved) return resolved;
    character = resolved.character;
  }

  const shotCount =
    typeof fields.shotCount === 'number' && Number.isFinite(fields.shotCount)
      ? Math.min(MAX_STORYBOARD_SHOTS, Math.max(1, Math.round(fields.shotCount)))
      : 6;
  const aspectRatio = typeof fields.aspectRatio === 'string' ? fields.aspectRatio : '9:16';
  const brandKit = await getBrandKit(services, projectId);
  const { system, user } = buildStoryboardPrompt({
    brief: fields.brief, shotCount, aspectRatio, brandKit,
    ...(character ? { characterName: character.name } : {}),
  });

  let raw: string;
  try {
    raw = await llm.complete({ system, user });
  } catch (e) {
    return { status: 502, body: { error: `storyboard planning failed: ${e instanceof Error ? e.message : String(e)}` } };
  }

  const plan = parseStoryboardPlan(raw);
  const storyboard = normalizeStoryboard({
    title: plan.title ?? fields.brief.trim().slice(0, 80),
    brief: fields.brief,
    aspectRatio,
    ...(plan.voiceoverScript ? { voiceoverScript: plan.voiceoverScript } : {}),
    shots: plan.shots,
  }, services.ids.randomId);
  if (storyboard.shots.length === 0) return { status: 502, body: { error: 'no storyboard shots returned' } };
  if (character) for (const shot of storyboard.shots) shot.characterId = character.id;

  await putStoryboard(services, projectId, storyboard);
  return { status: 200, body: { storyboard } };
}

/** Look up the saved storyboard + one shot, or an ApiResult error. */
async function ownedStoryboardShot(
  services: Services,
  projectId: string,
  shotId: unknown,
): Promise<{ storyboard: Storyboard; shot: Storyboard['shots'][number] } | ApiResult> {
  if (typeof shotId !== 'string' || shotId.length === 0) return { status: 400, body: { error: 'shotId is required' } };
  const storyboard = await getStoryboard(services, projectId);
  if (!storyboard) return { status: 404, body: { error: 'no storyboard saved — generate or save one first' } };
  const shot = storyboard.shots.find((s) => s.id === shotId);
  if (!shot) return { status: 404, body: { error: `shot not found: ${shotId}` } };
  return { storyboard, shot };
}

/**
 * Render one shot's still frame: the shot's prompt (with shotType/cameraAngle
 * folded in) → generateImage with the shot's cast member + the storyboard's
 * aspect ratio. Synchronous; stamps the shot's imageAssetId on success.
 */
export async function renderStoryboardShot(services: Services, projectId: string, input: unknown): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  const found = await ownedStoryboardShot(services, projectId, (input as { shotId?: unknown } | null)?.shotId);
  if ('status' in found) return found;
  const { storyboard, shot } = found;

  const r = await generateImage(services, projectId, {
    prompt: storyboardShotPrompt(shot),
    aspectRatio: storyboard.aspectRatio,
    ...(shot.characterId ? { characterId: shot.characterId } : {}),
  });
  if (r.status !== 200) return r;
  const body = r.body as { job?: { error?: string }; asset?: { id: string } | null };
  if (!body.asset) return { status: 502, body: { error: body.job?.error ?? 'shot render produced no image' } };

  shot.imageAssetId = body.asset.id;
  await putStoryboard(services, projectId, storyboard);
  return { status: 200, body: { shot, asset: body.asset } };
}

// The default image-to-video model for animating a storyboard still (the same
// model the Studio's per-asset Animate action uses).
const STORYBOARD_I2V_MODEL = 'fal-ai/wan-pro/image-to-video';

/**
 * Animate a rendered shot (image-to-video from its still). ASYNC — 202 + job;
 * when the job completes, the caller stamps job.resultAssetId onto the shot via
 * setStoryboardShotClip (UI route) / a storyboard update (MCP).
 */
export async function animateStoryboardShot(services: Services, projectId: string, input: unknown): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  const found = await ownedStoryboardShot(services, projectId, (input as { shotId?: unknown } | null)?.shotId);
  if ('status' in found) return found;
  const { storyboard, shot } = found;
  if (!shot.imageAssetId) {
    return { status: 400, body: { error: 'shot has no rendered frame yet — render the still first, then animate it' } };
  }

  return generateVideo(services, projectId, {
    prompt: `${storyboardShotPrompt(shot)} — subtle natural cinematic motion, gentle camera move`,
    model: STORYBOARD_I2V_MODEL,
    imageAssetId: shot.imageAssetId,
    aspectRatio: storyboard.aspectRatio,
    ...(shot.characterId ? { characterId: shot.characterId } : {}),
  });
}

/**
 * Stamp a completed animate job's video asset onto a shot (clipAssetId). The
 * asset must be a video owned by the project's owner.
 */
export async function setStoryboardShotClip(services: Services, projectId: string, input: unknown): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  const fields = (input ?? {}) as { shotId?: unknown; assetId?: unknown };
  if (typeof fields.assetId !== 'string' || fields.assetId.length === 0) {
    return { status: 400, body: { error: 'assetId is required (the finished animate job\'s resultAssetId)' } };
  }
  const found = await ownedStoryboardShot(services, projectId, fields.shotId);
  if ('status' in found) return found;
  const { storyboard, shot } = found;

  const asset = await services.assets.get(fields.assetId);
  const assetOwner = asset ? ((await services.projects.get(asset.projectId))?.ownerId ?? LOCAL_OWNER) : undefined;
  if (!asset || assetOwner !== (project.ownerId ?? LOCAL_OWNER)) {
    return { status: 404, body: { error: `asset not found: ${fields.assetId}` } };
  }
  if (asset.type !== 'video') return { status: 400, body: { error: 'clip must be a video asset (the animate job result)' } };

  shot.clipAssetId = asset.id;
  await putStoryboard(services, projectId, storyboard);
  return { status: 200, body: { shot } };
}

/**
 * Assemble the storyboard onto the project's editor timeline: every shot with a
 * rendered asset becomes a clip (animated clip preferred over the still; stills
 * pick up the default gentle zoom-in at render time), captions carry over, and
 * the voiceoverScript (when present and a voice provider is available) is
 * synthesized onto the timeline's narration track. Saves + returns the timeline.
 */
export async function storyboardToTimeline(services: Services, projectId: string): Promise<ApiResult> {
  const project = await services.projects.get(projectId);
  if (!project) return { status: 404, body: { error: 'project not found' } };
  const storyboard = await getStoryboard(services, projectId);
  if (!storyboard) return { status: 404, body: { error: 'no storyboard saved — generate or save one first' } };

  const clips: EditorClip[] = [];
  for (const shot of storyboard.shots) {
    const assetId = shot.clipAssetId ?? shot.imageAssetId;
    if (!assetId) continue; // not rendered yet — skip
    clips.push({ id: shot.id, assetId, durationSec: shot.durationSec, ...(shot.caption ? { caption: shot.caption } : {}) });
  }
  if (clips.length === 0) {
    return { status: 400, body: { error: 'no shots have rendered assets yet — render each shot\'s frame (and optionally animate it) first' } };
  }

  const timeline: EditorTimeline = { aspectRatio: storyboard.aspectRatio, clips };
  if (storyboard.voiceoverScript && services.voiceAvailable) {
    const synthesized = await synthesizeVoiceoverUrl(services, projectId, storyboard.voiceoverScript);
    if (!('url' in synthesized)) return synthesized;
    timeline.voiceoverAssetId = synthesized.assetId;
  }

  // saveTimeline re-normalizes and runs the timeline's own cross-tenant guard.
  return saveTimeline(services, projectId, { timeline });
}

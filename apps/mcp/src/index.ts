#!/usr/bin/env -S npx tsx
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SpineClient, SpineError } from './spine.js';
import { CHARACTER_LIMIT } from './constants.js';

const client = new SpineClient();

const server = new McpServer({
  name: 'forgecast-mcp-server',
  version: '0.1.0',
});

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function ok(data: unknown): { content: [{ type: 'text'; text: string }] } {
  const raw = JSON.stringify(data, null, 2);
  const text = raw.length > CHARACTER_LIMIT ? raw.slice(0, CHARACTER_LIMIT) + '\n…[truncated]' : raw;
  return { content: [{ type: 'text' as const, text }] };
}

function fail(err: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  let message: string;
  if (err instanceof SpineError) {
    const apiUrl = process.env['FORGECAST_API_URL'] ?? 'http://localhost:3210';
    message =
      `Forgecast API error (HTTP ${err.status}): ${err.message}\n\n` +
      `Is the Forgecast app running and reachable at ${apiUrl}?\n` +
      `Set FORGECAST_API_URL if it is running on a different port.`;
  } else if (err instanceof Error) {
    message = err.message;
  } else {
    message = String(err);
  }
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tools
// ──────────────────────────────────────────────────────────────────────────────

// 1. forgecast_health
server.registerTool(
  'forgecast_health',
  {
    title: 'Forgecast Health Check',
    description:
      'Checks whether the Forgecast spine API is reachable and reports what is configured. ' +
      'Call this FIRST to discover which capabilities are available.\n\n' +
      'Returns: `{ ok, providers, publishers }`\n' +
      '- `providers` — configured generation providers per modality: `image`, `video`, ' +
      '`montage`, `voice`, `transcribe`, `presenter` (each an array; empty = that key/worker ' +
      'is not set on the server).\n' +
      '- `publishers` — the social channels available for **cross-posting** (e.g. ' +
      '`["omnisocials","instagram","linkedin","youtube"]`). Use these exact names as the ' +
      '`channels`/`publisher` args of `forgecast_publish_asset`. An empty array means no ' +
      'publisher is configured (set OMNISOCIALS_API_KEY or the per-network tokens on the server).\n\n' +
      'Example: `{ "ok": true, "providers": { "image": ["fal"], "video": [] }, "publishers": ["omnisocials"] }`\n\n' +
      'Error guidance: If this call fails, verify the Forgecast web app is running at FORGECAST_API_URL.',
    inputSchema: z.object({}).strict(),
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => {
    try {
      return ok(await client.health());
    } catch (e) {
      return fail(e);
    }
  },
);

// 2. forgecast_list_projects
server.registerTool(
  'forgecast_list_projects',
  {
    title: 'List Forgecast Projects',
    description:
      'Returns all projects in the Forgecast workspace.\n\n' +
      'Returns: `{ projects: Array<{ id, name, createdAt }> }`\n\n' +
      'Example: `{ "projects": [{ "id": "p_abc", "name": "My Film", "createdAt": "2024-01-01T00:00:00Z" }] }`\n\n' +
      'Error guidance: If the call fails with a connection error, ensure the Forgecast ' +
      'app is running and FORGECAST_API_URL is set correctly.',
    inputSchema: z.object({}).strict(),
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => {
    try {
      return ok(await client.listProjects());
    } catch (e) {
      return fail(e);
    }
  },
);

// 3. forgecast_create_project
server.registerTool(
  'forgecast_create_project',
  {
    title: 'Create Forgecast Project',
    description:
      'Creates a new Forgecast project with the given name.\n\n' +
      'Args:\n' +
      '  name (string, 1–100 chars): The human-readable project name.\n\n' +
      'Returns: `{ project: { id, name, createdAt } }`\n\n' +
      'Example: `forgecast_create_project({ name: "Space Documentary" })`\n' +
      '→ `{ "project": { "id": "p_xyz", "name": "Space Documentary", "createdAt": "…" } }`\n\n' +
      'Error guidance: A 400 error usually means the name is invalid. ' +
      'A connection error means the Forgecast app is not running.',
    inputSchema: z.object({ name: z.string().min(1).max(100) }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ name }) => {
    try {
      return ok(await client.createProject(name));
    } catch (e) {
      return fail(e);
    }
  },
);

// 4. forgecast_generate_image
server.registerTool(
  'forgecast_generate_image',
  {
    title: 'Generate Image',
    description:
      'Generates an image for the specified project using the configured AI image provider.\n\n' +
      'Args:\n' +
      '  project_id (string): ID of an existing project (obtain from forgecast_list_projects).\n' +
      '  prompt (string): Description of the image to generate.\n' +
      '  model (string, optional): Provider-specific model identifier (fal default: Nano Banana).\n' +
      '  provider (string, optional): "fal" (default, cloud) or "stablediffusion" (self-hosted, free — needs SD_WEBUI_URL).\n' +
      '  width (number, optional): Output width in pixels.\n' +
      '  height (number, optional): Output height in pixels.\n\n' +
      'Returns: `{ job: { id, status, error? }, asset: { id, type, url } | null }`\n' +
      'The `url` field is a direct download URL for the generated image bytes.\n\n' +
      'Example: `forgecast_generate_image({ project_id: "p_xyz", prompt: "a red fox at sunset", width: 1024, height: 1024 })`\n\n' +
      'Error guidance: A 404 means the project does not exist. A 503 means the chosen `provider` is not configured ' +
      '(see forgecast_health → providers.image; fal needs FAL_KEY, stablediffusion needs SD_WEBUI_URL).',
    inputSchema: z
      .object({
        project_id: z.string(),
        prompt: z.string(),
        model: z.string().optional(),
        provider: z.string().optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      })
      .strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ project_id, prompt, model, provider, width, height }) => {
    try {
      const result = await client.generateImage(project_id, { prompt, model, provider, width, height });
      const enriched = {
        job: result.job,
        asset: result.asset
          ? { ...result.asset, url: client.assetUrl(result.asset.id) }
          : null,
      };
      return ok(enriched);
    } catch (e) {
      return fail(e);
    }
  },
);

// 5. forgecast_generate_short_video
server.registerTool(
  'forgecast_generate_short_video',
  {
    title: 'Generate Short Video (topic → captioned vertical clip)',
    description:
      'Starts an ASYNC MoneyPrinterTurbo short-video job: a topic → LLM script → ' +
      'stock footage (Pexels/Pixabay) → TTS narration → **burned-in styled captions** → ' +
      'background music → a finished vertical clip. Fire-and-forget; poll `forgecast_get_job`.\n\n' +
      'Args:\n' +
      '  project_id (string), subject (string — the topic).\n' +
      '  options (object, optional): aspect ("9:16" default / "16:9" / "1:1"), subtitles (bool, ' +
      'default on) + subtitlePosition/fontSize/textColor/strokeColor, count (1–10, batch), ' +
      'clipDuration (sec), source ("pexels"/"pixabay"/"local"), voiceName, bgmType/bgmVolume, ' +
      'script (your own narration), terms (search terms), paragraphs (1–10 script length), ' +
      'transition, concatMode.\n\n' +
      'Returns: `{ job: { id, kind, status } }`. Then poll `forgecast_get_job` until "done".\n\n' +
      'Error guidance: A 503 means FORGECAST_VIDEO_WORKER_URL is not configured (run the ' +
      'MoneyPrinterTurbo worker — see workers/shorts). A 404 means the project does not exist.',
    inputSchema: z.object({
      project_id: z.string(),
      subject: z.string(),
      options: z.object({
        aspect: z.enum(['9:16', '16:9', '1:1']).optional(),
        script: z.string().optional(),
        terms: z.array(z.string()).optional(),
        clipDuration: z.number().optional(),
        count: z.number().int().min(1).max(10).optional(),
        source: z.enum(['pexels', 'pixabay', 'local']).optional(),
        concatMode: z.enum(['random', 'sequential']).optional(),
        transition: z.enum(['none', 'Shuffle', 'FadeIn', 'FadeOut', 'SlideIn', 'SlideOut']).optional(),
        voiceName: z.string().optional(),
        voiceVolume: z.number().optional(),
        voiceRate: z.number().optional(),
        bgmType: z.string().optional(),
        bgmVolume: z.number().optional(),
        subtitles: z.boolean().optional(),
        subtitlePosition: z.enum(['top', 'center', 'bottom', 'custom']).optional(),
        fontName: z.string().optional(),
        textColor: z.string().optional(),
        fontSize: z.number().optional(),
        strokeColor: z.string().optional(),
        strokeWidth: z.number().optional(),
        paragraphs: z.number().int().min(1).max(10).optional(),
      }).strict().optional(),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ project_id, subject, options }) => {
    try {
      return ok(await client.generateShortVideo(project_id, subject, options));
    } catch (e) {
      return fail(e);
    }
  },
);

// 6. forgecast_get_job
server.registerTool(
  'forgecast_get_job',
  {
    title: 'Get Job Status',
    description:
      'Retrieves the current status and progress of a Forgecast job by its ID.\n\n' +
      'Args:\n' +
      '  job_id (string): The job ID returned by forgecast_generate_image or forgecast_generate_short_video.\n\n' +
      'Returns: `{ job: { id, kind, status, progress?, resultAssetId?, error? } }`\n' +
      'status values: "queued" | "running" | "done" | "failed"\n' +
      'progress is a float 0–1 when available.\n\n' +
      'Example: `forgecast_get_job({ job_id: "j_abc" })`\n' +
      '→ `{ "job": { "id": "j_abc", "status": "running", "progress": 0.42 } }`\n\n' +
      'Error guidance: A 404 means the job ID is invalid or expired.',
    inputSchema: z.object({ job_id: z.string() }).strict(),
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ job_id }) => {
    try {
      return ok(await client.getJob(job_id));
    } catch (e) {
      return fail(e);
    }
  },
);

// 7. forgecast_list_assets
server.registerTool(
  'forgecast_list_assets',
  {
    title: 'List Project Assets',
    description:
      'Lists all generated assets for the specified project, including a direct download URL for each.\n\n' +
      'Args:\n' +
      '  project_id (string): ID of an existing project.\n\n' +
      'Returns: `{ assets: Array<{ id, type, url, provider?, createdAt? }> }`\n' +
      'The `url` field on each asset is a direct URL to download the raw bytes.\n\n' +
      'Example: `forgecast_list_assets({ project_id: "p_xyz" })`\n' +
      '→ `{ "assets": [{ "id": "a_1", "type": "image", "url": "http://localhost:3210/api/assets/a_1/raw" }] }`\n\n' +
      'Error guidance: A 404 means the project does not exist.',
    inputSchema: z.object({ project_id: z.string() }).strict(),
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ project_id }) => {
    try {
      const result = await client.listAssets(project_id);
      const enriched = {
        assets: result.assets.map((a) => ({ ...a, url: client.assetUrl(a.id) })),
      };
      return ok(enriched);
    } catch (e) {
      return fail(e);
    }
  },
);

// 8. forgecast_generate_video
server.registerTool(
  'forgecast_generate_video',
  {
    title: 'Generate Video Clip (Pixverse)',
    description:
      'Generates an AI video CLIP via Pixverse for the specified project. ' +
      'This is ASYNC — it immediately returns a queued job. ' +
      'Tell the caller to poll `forgecast_get_job` with the returned job ID to track progress.\n\n' +
      'Args:\n' +
      '  project_id (string): ID of an existing project (obtain from forgecast_list_projects).\n' +
      '  prompt (string, 1+ chars): Description of the video to generate.\n' +
      '  aspect_ratio (string, optional): Aspect ratio of the video (e.g. "16:9", "9:16", "1:1").\n' +
      '  duration (number, optional): Duration of the video in seconds.\n' +
      '  quality (string, optional): Video quality (e.g. "720p", "1080p").\n\n' +
      'Returns: `{ job: { id, kind, status } }` where status is "queued".\n\n' +
      'Example: `forgecast_generate_video({ project_id: "p_xyz", prompt: "a fox running at sunset", aspect_ratio: "9:16" })`\n' +
      '→ `{ "job": { "id": "j_abc", "kind": "video", "status": "queued" } }`\n' +
      'Then poll: `forgecast_get_job({ job_id: "j_abc" })` until status = "done".\n\n' +
      'Error guidance: A 503 means PIXVERSE_API_KEY is not configured on the Forgecast app. ' +
      'A 404 means the project does not exist. ' +
      'A 400 means the prompt is missing or empty.',
    inputSchema: z
      .object({
        project_id: z.string(),
        prompt: z.string().min(1),
        aspect_ratio: z.string().optional(),
        duration: z.number().optional(),
        quality: z.string().optional(),
      })
      .strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ project_id, prompt, aspect_ratio, duration, quality }) => {
    try {
      return ok(await client.generateVideo(project_id, { prompt, aspectRatio: aspect_ratio, duration, quality }));
    } catch (e) {
      return fail(e);
    }
  },
);

// 9. forgecast_generate_montage
server.registerTool(
  'forgecast_generate_montage',
  {
    title: 'Generate Video Montage (Remotion)',
    description:
      'Stitches a project\'s generated assets into a longer-form video montage using Remotion. ' +
      'This is ASYNC — it immediately returns a queued job. ' +
      'Poll `forgecast_get_job` with the returned job ID to track progress.\n\n' +
      'Args:\n' +
      '  project_id (string): ID of an existing project (obtain from forgecast_list_projects).\n' +
      '  asset_ids (string[], min 1): IDs of the project assets to stitch together, in order.\n' +
      '  aspect_ratio (string, optional): Aspect ratio of the output video (e.g. "9:16", "16:9", "1:1"). Defaults to "9:16".\n\n' +
      'Returns: `{ job: { id, kind, status } }` where status is "queued".\n\n' +
      'Example: `forgecast_generate_montage({ project_id: "p_xyz", asset_ids: ["a_1", "a_2", "a_3"], aspect_ratio: "9:16" })`\n' +
      '→ `{ "job": { "id": "j_abc", "kind": "montage", "status": "queued" } }`\n' +
      'Then poll: `forgecast_get_job({ job_id: "j_abc" })` until status = "done".\n\n' +
      'Error guidance: A 503 means MONTAGE_WORKER_URL or FORGECAST_BASE_URL is not configured on the Forgecast app — ' +
      'both environment variables must be set. A 404 means the project does not exist. ' +
      'A 400 means no valid asset IDs were provided.',
    inputSchema: z
      .object({
        project_id: z.string(),
        asset_ids: z.array(z.string()).min(1),
        aspect_ratio: z.string().optional(),
      })
      .strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ project_id, asset_ids, aspect_ratio }) => {
    try {
      return ok(await client.generateMontage(project_id, { assetIds: asset_ids, aspectRatio: aspect_ratio }));
    } catch (e) {
      return fail(e);
    }
  },
);

// 10. forgecast_enhance_image
server.registerTool(
  'forgecast_enhance_image',
  {
    title: 'Enhance / Upscale Image',
    description:
      'Upscales and sharpens an existing image asset (fal clarity-upscaler), producing a new, higher-resolution ' +
      'image asset. SYNCHRONOUS — returns the finished job and the new asset.\n\n' +
      'Args:\n' +
      '  project_id (string): ID of the project the asset belongs to.\n' +
      '  asset_id (string): ID of an existing IMAGE asset to enhance.\n\n' +
      'Returns: `{ job, asset }` where asset is the new enhanced image (provider "enhance").\n\n' +
      'Error guidance: 503 means no FAL_KEY is configured. 400 means the asset is not an image. 404 means the project or asset does not exist.',
    inputSchema: z.object({ project_id: z.string(), asset_id: z.string() }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ project_id, asset_id }) => {
    try {
      return ok(await client.enhanceAsset(project_id, asset_id));
    } catch (e) {
      return fail(e);
    }
  },
);

// 11. forgecast_edit_image
server.registerTool(
  'forgecast_edit_image',
  {
    title: 'Edit Image (instruction)',
    description:
      'Edits an existing image asset from a natural-language instruction (fal flux-kontext), producing a new image ' +
      'asset. SYNCHRONOUS — returns the finished job and the new asset.\n\n' +
      'Args:\n' +
      '  project_id (string): ID of the project the asset belongs to.\n' +
      '  asset_id (string): ID of an existing IMAGE asset to edit.\n' +
      '  prompt (string): The edit instruction, e.g. "make the background a sunset".\n\n' +
      'Returns: `{ job, asset }` where asset is the new edited image (provider "edit").\n\n' +
      'Error guidance: 503 means no FAL_KEY is configured. 400 means a missing prompt or non-image asset. 404 means the project or asset does not exist.',
    inputSchema: z.object({ project_id: z.string(), asset_id: z.string(), prompt: z.string().min(1) }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ project_id, asset_id, prompt }) => {
    try {
      return ok(await client.editAsset(project_id, asset_id, prompt));
    } catch (e) {
      return fail(e);
    }
  },
);

// 12. forgecast_cutout_image
server.registerTool(
  'forgecast_cutout_image',
  {
    title: 'Remove Background (cutout)',
    description:
      'Removes the background from an existing image asset (fal birefnet), producing a clean transparent-PNG ' +
      'cutout of the subject as a new image asset. SYNCHRONOUS — returns the finished job and the new asset.\n\n' +
      'Args:\n' +
      '  project_id (string): ID of the project the asset belongs to.\n' +
      '  asset_id (string): ID of an existing IMAGE asset to cut out.\n\n' +
      'Returns: `{ job, asset }` where asset is the new transparent cutout (provider "cutout").\n\n' +
      'Error guidance: 503 means no FAL_KEY is configured. 400 means the asset is not an image. 404 means the project or asset does not exist.',
    inputSchema: z.object({ project_id: z.string(), asset_id: z.string() }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ project_id, asset_id }) => {
    try {
      return ok(await client.cutoutAsset(project_id, asset_id));
    } catch (e) {
      return fail(e);
    }
  },
);

// 13. forgecast_narrate_video
server.registerTool(
  'forgecast_narrate_video',
  {
    title: 'Narrate Video (add voice-over)',
    description:
      'Synthesizes a spoken voice-over (VoxCPM-2, or fal TTS) and muxes it onto an existing video asset, producing ' +
      'a new narrated video asset. This is ASYNC — it returns a queued job; poll `forgecast_get_job`.\n\n' +
      'Args:\n' +
      '  project_id (string): ID of the project the asset belongs to.\n' +
      '  video_asset_id (string): ID of an existing VIDEO asset to narrate.\n' +
      '  text (string): The voice-over script.\n' +
      '  voice (string, optional): Voice id/name for the TTS provider.\n\n' +
      'Returns: `{ job }` with status "queued". Poll `forgecast_get_job({ job_id })` until "done".\n\n' +
      'Error guidance: 503 means no voice provider is configured (run the VoxCPM-2 worker or set a fal voice key). 400 means a missing script or source. 404 means the project does not exist.',
    inputSchema: z
      .object({ project_id: z.string(), video_asset_id: z.string(), text: z.string().min(1), voice: z.string().optional() })
      .strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ project_id, video_asset_id, text, voice }) => {
    try {
      return ok(await client.narrateVideo(project_id, { videoAssetId: video_asset_id, text, voice }));
    } catch (e) {
      return fail(e);
    }
  },
);

// 14. forgecast_publish_asset
server.registerTool(
  'forgecast_publish_asset',
  {
    title: 'Publish / Cross-post Asset',
    description:
      'Publishes (cross-posts) a generated asset\'s media + caption to one or more social channels at once.\n\n' +
      'Discover the available channels first with `forgecast_health` → `publishers`; pass those names in `channels` ' +
      'to fan out a single post across them (e.g. `["instagram","linkedin","youtube"]`). The fast path is the ' +
      'OmniSocials publisher (one key → 10+ networks); per-network publishers (instagram/linkedin/youtube) work too.\n\n' +
      'Args:\n' +
      '  asset_id (string): ID of the asset to post (from `forgecast_list_assets`).\n' +
      '  content (string): caption / body text.\n' +
      '  channels (string[], optional): which networks to cross-post to (from health.publishers).\n' +
      '  publisher (string, optional): publisher to route through. Defaults to "omnisocials".\n\n' +
      'Returns: `{ published: { postId, status } }`\n\n' +
      'Requirements: a publisher must be configured on the app (e.g. OMNISOCIALS_API_KEY), and the app must be ' +
      'publicly reachable (set FORGECAST_BASE_URL) so the network can fetch the media.\n\n' +
      'Error guidance: 503 = no publisher configured (the error lists `availablePublishers`); 404 = asset not found.',
    inputSchema: z.object({
      asset_id: z.string(),
      content: z.string().min(1),
      channels: z.array(z.string()).optional(),
      publisher: z.string().optional(),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ asset_id, content, channels, publisher }) => {
    try {
      return ok(await client.publishAsset(asset_id, { content, channels, publisher }));
    } catch (e) {
      return fail(e);
    }
  },
);

// 15. forgecast_get_brand_kit
server.registerTool(
  'forgecast_get_brand_kit',
  {
    title: 'Get Brand Kit',
    description:
      'Returns a project\'s brand kit — the identity (name, tagline, palette, fonts, tone, key messages, notes) ' +
      'that grounds every generation so images and video come out on-brand.\n\n' +
      'Args: project_id (string).\n' +
      'Returns: `{ brandKit: {...} }` (an empty object `{}` when none is set yet).',
    inputSchema: z.object({ project_id: z.string() }).strict(),
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ project_id }) => {
    try { return ok(await client.getBrandKit(project_id)); } catch (e) { return fail(e); }
  },
);

// 16. forgecast_set_brand_kit
server.registerTool(
  'forgecast_set_brand_kit',
  {
    title: 'Set Brand Kit',
    description:
      'Saves a project\'s brand kit. From then on, every image and video generated in that project is grounded ' +
      'in this identity automatically (the fields are folded into the generation prompt).\n\n' +
      'Args (all optional): name, tagline, palette (hex colors), fonts {display, body}, tone_of_voice, ' +
      'key_messages (string[]), notes. Replaces the stored kit wholesale.\n' +
      'Returns: `{ brandKit: {...} }` (the sanitized, saved kit).',
    inputSchema: z.object({
      project_id: z.string(),
      name: z.string().optional(),
      tagline: z.string().optional(),
      palette: z.array(z.string()).optional(),
      fonts: z.object({ display: z.string().optional(), body: z.string().optional() }).optional(),
      tone_of_voice: z.string().optional(),
      key_messages: z.array(z.string()).optional(),
      notes: z.string().optional(),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ project_id, tone_of_voice, key_messages, ...rest }) => {
    try {
      return ok(await client.saveBrandKit(project_id, { ...rest, toneOfVoice: tone_of_voice, keyMessages: key_messages }));
    } catch (e) {
      return fail(e);
    }
  },
);

// 17. forgecast_brand_kit_from_website
server.registerTool(
  'forgecast_brand_kit_from_website',
  {
    title: 'Derive Brand Kit from a Website',
    description:
      'Reads a brand\'s website and seeds the project brand kit from it (name, tagline, key messages, notes). ' +
      'Colors and fonts are left for you to fill in via `forgecast_set_brand_kit`.\n\n' +
      'Args: project_id (string), url (string).\n' +
      'Returns: `{ brandKit, derivedFrom }`. 400 if the URL is missing or unreadable.',
    inputSchema: z.object({ project_id: z.string(), url: z.string() }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ project_id, url }) => {
    try { return ok(await client.brandKitFromWebsite(project_id, url)); } catch (e) { return fail(e); }
  },
);

// 18. forgecast_generate_from_website
server.registerTool(
  'forgecast_generate_from_website',
  {
    title: 'Create Assets from a Website',
    description:
      'Turns a product/brand URL into ready-to-post assets in one call: imports the real product images found on ' +
      'the page, generates on-brand AI images grounded in the site copy, and enhances the imports. SYNCHRONOUS — ' +
      'returns the created assets.\n\n' +
      'Args: project_id (string), url (string), generate (bool, default true), generate_count (1-4, default 2), ' +
      'enhance (bool, default true).\n' +
      'Returns: `{ assets: [...], summary: { imported, generated, enhanced } }`. Image generation/enhancement need ' +
      'FAL_KEY on the server; importing works without it.',
    inputSchema: z.object({
      project_id: z.string(),
      url: z.string(),
      generate: z.boolean().optional(),
      generate_count: z.number().int().min(1).max(4).optional(),
      enhance: z.boolean().optional(),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ project_id, url, generate, generate_count, enhance }) => {
    try {
      return ok(await client.generateFromWebsite(project_id, { url, generate, generateCount: generate_count, enhance }));
    } catch (e) {
      return fail(e);
    }
  },
);

// 19. forgecast_agent_plan
server.registerTool(
  'forgecast_agent_plan',
  {
    title: 'Agent — Plan a Campaign',
    description:
      'Hands a one-line brief to the Forgecast content agent, which researches and returns a concrete, on-trend ' +
      'CONTENT PLAN (concept, per-platform captions, and the image/video assets + an optional montage it would ' +
      'produce). Nothing is generated yet — this is the "PLAN" step you can review, then run with ' +
      '`forgecast_agent_execute`.\n\n' +
      'Tip: if the brief contains a product URL or domain, the agent reads the site and grounds the plan in the ' +
      'real brand.\n\n' +
      'Args: brief (string — the goal/idea, optionally with a product URL), platforms (string[], optional, e.g. ' +
      '["instagram","linkedin"]; defaults to instagram).\n' +
      'Returns: `{ plan }`.\n\n' +
      'Requires an agent LLM on the server (set OPENAI_API_KEY, or FORGECAST_AGENT_LLM=anthropic + ' +
      'ANTHROPIC_API_KEY). A 503 means none is configured.',
    inputSchema: z.object({ brief: z.string().min(1), platforms: z.array(z.string()).optional() }).strict(),
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ brief, platforms }) => {
    try { return ok(await client.agentPlan(brief, platforms)); } catch (e) { return fail(e); }
  },
);

// 20. forgecast_agent_execute
server.registerTool(
  'forgecast_agent_execute',
  {
    title: 'Agent — Execute a Plan',
    description:
      'Produces a content plan (from `forgecast_agent_plan`): generates its images and video, and — when ' +
      '`publish` is true — cross-posts them to the plan\'s platforms. Images come back as assets; video and ' +
      'montage come back as async jobs to poll with `forgecast_get_job`.\n\n' +
      'Args: plan (object — pass the `plan` returned by forgecast_agent_plan verbatim), project_id (string, ' +
      'optional — produce into this existing project; omit to create one), project_name (string, optional), ' +
      'publish (bool, optional — also cross-post the results).\n' +
      'Returns: `{ result: { projectId, assetIds, videoJobIds, montageJobIds, published } }`.',
    inputSchema: z.object({
      plan: z.record(z.string(), z.unknown()),
      project_id: z.string().optional(),
      project_name: z.string().optional(),
      publish: z.boolean().optional(),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ plan, project_id, project_name, publish }) => {
    try {
      return ok(await client.agentExecute({ plan, projectId: project_id, projectName: project_name, publish }));
    } catch (e) {
      return fail(e);
    }
  },
);

// 21. forgecast_agent_run
server.registerTool(
  'forgecast_agent_run',
  {
    title: 'Agent — Auto-run (brief → finished assets)',
    description:
      'The autonomous "AUTO-RUN": hand the agent a brief and it brainstorms AND produces in one shot — deciding ' +
      'per video whether to make b-roll or a talking-head AI presenter, generating the images and clips, and (if ' +
      'the brief includes a product URL) reading the site first. Best for "just make me a campaign about X".\n\n' +
      'Args: brief (string), project_id (string, optional — produce into this project; omit to create one), ' +
      'platforms (string[], optional).\n' +
      'Returns: `{ result: { imageAssetIds, videoJobIds, presenterJobIds, steps, summary } }`. Images are ready ' +
      'immediately; poll video/presenter job ids with `forgecast_get_job`, then `forgecast_publish_asset` to ' +
      'cross-post.\n\n' +
      'Requires an agent LLM on the server (OPENAI_API_KEY, or FORGECAST_AGENT_LLM=anthropic + ANTHROPIC_API_KEY). ' +
      'A 503 means none is configured.',
    inputSchema: z.object({
      brief: z.string().min(1),
      project_id: z.string().optional(),
      platforms: z.array(z.string()).optional(),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ brief, project_id, platforms }) => {
    try { return ok(await client.agentRun({ brief, projectId: project_id, platforms })); } catch (e) { return fail(e); }
  },
);

// 22. forgecast_generate_ad_copy
server.registerTool(
  'forgecast_generate_ad_copy',
  {
    title: 'Generate ad copy (platform-aware, A/B variants)',
    description:
      'Write N high-converting, on-brand ad-copy variants for a brief, each tagged A/B/C and guaranteed to fit the ' +
      "target platform's character limit (Instagram 2200, LinkedIn 3000, X/Twitter 280, Facebook 2200, TikTok " +
      '2200, YouTube 5000, Google RSA 90). Grounded in the project brand kit (tone of voice, key messages), so the ' +
      'copy sounds like the brand. Pick a variant and pass its text as `content` to `forgecast_publish_asset` to ' +
      'cross-post.\n\n' +
      'Args: project_id (string), brief (string), platform (string, optional — default instagram; x aliases ' +
      'twitter), count (1–5, optional — default 3).\n' +
      'Returns: `{ platform, label, limit, variants: [{ id, text, chars }] }`.\n\n' +
      'Requires an agent LLM on the server (OPENAI_API_KEY, or FORGECAST_AGENT_LLM=anthropic + ANTHROPIC_API_KEY). ' +
      'A 503 means none is configured.',
    inputSchema: z.object({
      project_id: z.string(),
      brief: z.string().min(1),
      platform: z.string().optional(),
      count: z.number().int().min(1).max(5).optional(),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ project_id, brief, platform, count }) => {
    try { return ok(await client.generateAdCopy(project_id, { brief, platform, count })); } catch (e) { return fail(e); }
  },
);

const metricsSchema = z
  .array(
    z.object({
      creativeId: z.string(),
      name: z.string().optional(),
      platform: z.string().optional(),
      date: z.string(),
      impressions: z.number(),
      clicks: z.number(),
      spend: z.number(),
      conversions: z.number().optional(),
      frequency: z.number().optional(),
    }),
  )
  .optional();

// 23. forgecast_ads_audit
server.registerTool(
  'forgecast_ads_audit',
  {
    title: 'Audit ad performance (fatigue + health score)',
    description:
      'The measure side of the loop: audit ad-account performance and get a 0–100 health score + letter grade ' +
      'across dimensions (CTR health, creative freshness, spend efficiency, conversion rate, spend ' +
      'concentration), a per-creative **creative-fatigue** diagnosis (CTR decay + frequency saturation + rising ' +
      'CPA), and prioritized recommendations.\n\n' +
      'Two ways to feed it: **(a) keyless** — pass `metrics` (an array of per-creative, per-day rows: ' +
      'creativeId, date, impressions, clicks, spend, and optionally conversions/frequency/name); or **(b) auto-pull** ' +
      '— omit `metrics` and set `source` (meta|google) to pull from a connected account (needs META_ADS_* / ' +
      'GOOGLE_ADS_* on the server).\n' +
      'Returns: `{ source, audit: { score, grade, totals, dimensions[], fatigue[], recommendations[] } }`. ' +
      'Pair the fatigue list with `forgecast_generate_image` + `forgecast_publish_asset` to refresh tired creatives.',
    inputSchema: z.object({
      metrics: metricsSchema,
      source: z.string().optional(),
      sinceDays: z.number().int().positive().optional(),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  async ({ metrics, source, sinceDays }) => {
    try { return ok(await client.adsAudit({ metrics, source, sinceDays })); } catch (e) { return fail(e); }
  },
);

// 24. forgecast_ads_insights
server.registerTool(
  'forgecast_ads_insights',
  {
    title: 'Pull raw ad metrics',
    description:
      'Fetch normalized per-creative, per-day ad metrics from a connected account (`source`: meta|google; needs ' +
      'META_ADS_* / GOOGLE_ADS_* on the server), or echo back `metrics` you pass in. Returns ' +
      '`{ source, count, metrics[] }`. Use `forgecast_ads_audit` to score and diagnose them.',
    inputSchema: z.object({
      metrics: metricsSchema,
      source: z.string().optional(),
      sinceDays: z.number().int().positive().optional(),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  async ({ metrics, source, sinceDays }) => {
    try { return ok(await client.adsInsights({ metrics, source, sinceDays })); } catch (e) { return fail(e); }
  },
);

// 25. forgecast_optimize_creatives
server.registerTool(
  'forgecast_optimize_creatives',
  {
    title: 'Close the loop — regenerate fatigued creatives on-brand',
    description:
      'The optimize step: audit the metrics, find **fatigued** creatives, and regenerate a fresh, on-brand ' +
      'replacement image for each (grounded in the project brand kit), into the given project. Feed it the same ' +
      'way as `forgecast_ads_audit` — keyless `metrics`, or a connected `source` (meta|google).\n\n' +
      'Args: project_id (string — produce the new creatives here), metrics (optional rows) OR source (meta|google), ' +
      'max (1–10, optional — how many of the worst to refresh, default 3).\n' +
      'Returns: `{ source, score, grade, fatiguedCount, imageReady, regenerated: [{ creativeId, newAssetId }], ' +
      'optimizations[] }`. When image generation is not configured (no FAL_KEY), it returns the refresh *plan* ' +
      '(briefs) without generating. Then `forgecast_publish_asset` the new creatives to cross-post them.',
    inputSchema: z.object({
      project_id: z.string(),
      metrics: metricsSchema,
      source: z.string().optional(),
      sinceDays: z.number().int().positive().optional(),
      max: z.number().int().min(1).max(10).optional(),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ project_id, metrics, source, sinceDays, max }) => {
    try { return ok(await client.optimizeCreatives(project_id, { metrics, source, sinceDays, max })); } catch (e) { return fail(e); }
  },
);

// 26. forgecast_search_footage
server.registerTool(
  'forgecast_search_footage',
  {
    title: 'Search real stock footage by topic',
    description:
      'Find real, copyright-free **motion footage** by topic from an open source (Pexels) — the OpenMontage-style ' +
      'way to assemble a montage from actual footage instead of generated clips. Returns clips with direct video ' +
      'URLs you can import with `forgecast_import_footage`, then montage with `forgecast_generate_montage`.\n\n' +
      'Args: query (string), orientation ("portrait"/"landscape"/"square", optional), per_page (1–40, optional), ' +
      'source (optional; default the first configured).\n' +
      'Returns: `{ source, count, clips: [{ id, url, thumbnailUrl, width, height, durationSec, author, pageUrl }] }`.\n' +
      'A 503 means no footage source is configured (set PEXELS_API_KEY on the server).',
    inputSchema: z.object({
      query: z.string().min(1),
      orientation: z.enum(['portrait', 'landscape', 'square']).optional(),
      per_page: z.number().int().min(1).max(40).optional(),
      source: z.string().optional(),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  async ({ query, orientation, per_page, source }) => {
    try { return ok(await client.searchFootage({ query, orientation, perPage: per_page, source })); } catch (e) { return fail(e); }
  },
);

// 27. forgecast_import_footage
server.registerTool(
  'forgecast_import_footage',
  {
    title: 'Import a footage clip into a project',
    description:
      'Download a footage clip (a `url` from `forgecast_search_footage`) into a project as a video asset — ready to ' +
      'montage, narrate, or cross-post. Returns `{ asset }`.\n\n' +
      'Args: project_id (string), url (string — direct video URL), query (string, optional — labels the asset), ' +
      'source (string, optional).',
    inputSchema: z.object({
      project_id: z.string(),
      url: z.string().url(),
      query: z.string().optional(),
      source: z.string().optional(),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ project_id, url, query, source }) => {
    try { return ok(await client.importFootage(project_id, { url, query, source })); } catch (e) { return fail(e); }
  },
);

const timelineSchema = z.object({
  aspectRatio: z.string().optional(),
  fps: z.number().int().min(1).max(60).optional(),
  musicAssetId: z.string().optional(),
  clips: z.array(z.object({
    id: z.string().optional(),
    assetId: z.string(),
    durationSec: z.number(),
    trimStartSec: z.number().optional(),
    caption: z.string().optional(),
    transition: z.enum(['fade', 'slide', 'none']).optional(),
  })),
});

// 28. forgecast_get_timeline
server.registerTool(
  'forgecast_get_timeline',
  {
    title: 'Get the project video-editor timeline',
    description:
      'Read a project\'s **timeline** — the ordered list of clips (each referencing an image/video asset with a ' +
      'duration, optional caption + transition) that renders into a finished video. Returns an empty timeline if ' +
      'none exists yet. Use `forgecast_list_assets` to find asset ids to place on it.',
    inputSchema: z.object({ project_id: z.string() }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  async ({ project_id }) => {
    try { return ok(await client.getTimeline(project_id)); } catch (e) { return fail(e); }
  },
);

// 29. forgecast_set_timeline
server.registerTool(
  'forgecast_set_timeline',
  {
    title: 'Set the project video-editor timeline',
    description:
      'Build or edit a project\'s **timeline** — arrange its assets into a video. Pass the full timeline: ' +
      '`aspectRatio` (9:16 default), optional `fps`/`musicAssetId`, and `clips` (each: `assetId`, `durationSec`, ' +
      'optional `caption`, `transition` (fade|slide|none), `trimStartSec`). Invalid clips are dropped and ids are ' +
      'assigned. This is the agent-drivable video editor — set the timeline, then `forgecast_render_timeline`.',
    inputSchema: z.object({ project_id: z.string(), timeline: timelineSchema }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ project_id, timeline }) => {
    try { return ok(await client.setTimeline(project_id, timeline)); } catch (e) { return fail(e); }
  },
);

// 30. forgecast_render_timeline
server.registerTool(
  'forgecast_render_timeline',
  {
    title: 'Render the timeline into a finished video',
    description:
      'Render a project\'s **timeline** into a finished video via the montage engine (Remotion / in-process ffmpeg). ' +
      'Renders the saved timeline, or a `timeline` you pass inline. ASYNC — returns a queued job; poll ' +
      '`forgecast_get_job`, then the video asset is in the gallery. A 503 means montage isn\'t available; a 400 ' +
      'means the timeline is empty.',
    inputSchema: z.object({ project_id: z.string(), timeline: timelineSchema.optional() }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ project_id, timeline }) => {
    try { return ok(await client.renderTimeline(project_id, timeline)); } catch (e) { return fail(e); }
  },
);

// ──────────────────────────────────────────────────────────────────────────────
// Entry point
// ──────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('forgecast-mcp-server running on stdio');
}

main().catch((err: unknown) => {
  console.error('Fatal:', err);
  process.exit(1);
});

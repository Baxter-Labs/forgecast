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
      'Checks whether the Forgecast spine API is reachable and returns the list of ' +
      'configured image providers.\n\n' +
      'Returns: `{ ok: boolean, providers: { image: string[] } }`\n' +
      '`providers.image` lists every image provider that has been configured (e.g. ' +
      '"fal"). An empty array means no FAL_KEY has been set on the server.\n\n' +
      'Example response: `{ "ok": true, "providers": { "image": ["fal"] } }`\n\n' +
      'Error guidance: If this call fails, verify that the Forgecast web app is ' +
      'running at FORGECAST_API_URL.',
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
      '  model (string, optional): Provider-specific model identifier.\n' +
      '  width (number, optional): Output width in pixels.\n' +
      '  height (number, optional): Output height in pixels.\n\n' +
      'Returns: `{ job: { id, status, error? }, asset: { id, type, url } | null }`\n' +
      'The `url` field is a direct download URL for the generated image bytes.\n\n' +
      'Example: `forgecast_generate_image({ project_id: "p_xyz", prompt: "a red fox at sunset", width: 1024, height: 1024 })`\n\n' +
      'Error guidance: A 404 means the project does not exist. ' +
      'If providers.image is empty (see forgecast_health), no FAL_KEY is configured on the server.',
    inputSchema: z
      .object({
        project_id: z.string(),
        prompt: z.string(),
        model: z.string().optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      })
      .strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ project_id, prompt, model, width, height }) => {
    try {
      const result = await client.generateImage(project_id, { prompt, model, width, height });
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
    title: 'Generate Short Video',
    description:
      'Starts an ASYNC short-video generation job for the specified project. ' +
      'This is a fire-and-forget call — it immediately returns a queued job. ' +
      'Poll `forgecast_get_job` with the returned job ID to track progress.\n\n' +
      'Args:\n' +
      '  project_id (string): ID of an existing project.\n' +
      '  subject (string): Topic or description for the short video.\n\n' +
      'Returns: `{ job: { id, kind, status } }` where status is "queued".\n\n' +
      'Example: `forgecast_generate_short_video({ project_id: "p_xyz", subject: "cats in space" })`\n' +
      '→ `{ "job": { "id": "j_abc", "kind": "short_video", "status": "queued" } }`\n' +
      'Then poll: `forgecast_get_job({ job_id: "j_abc" })` until status = "done".\n\n' +
      'Error guidance: A 503 means FORGECAST_VIDEO_WORKER_URL is not configured on ' +
      'the Forgecast app. A 404 means the project does not exist.',
    inputSchema: z.object({ project_id: z.string(), subject: z.string() }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ project_id, subject }) => {
    try {
      return ok(await client.generateShortVideo(project_id, subject));
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

// 8. forgecast_publish_asset
server.registerTool(
  'forgecast_publish_asset',
  {
    title: 'Publish Asset',
    description:
      'Publishes a generated asset\'s media and caption to social platforms via the configured publisher ' +
      '(default: omnisocials).\n\n' +
      'Args:\n' +
      '  asset_id (string): ID of the asset to publish.\n' +
      '  content (string): Caption or body text for the post.\n' +
      '  channels (string[], optional): Social channels to target (e.g. ["instagram", "twitter"]).\n' +
      '  publisher (string, optional): Publisher name to use. Defaults to "omnisocials".\n\n' +
      'Returns: `{ published: { postId, status } }`\n\n' +
      'Requirements: The publisher must be configured on the app (set OMNISOCIALS_API_KEY for omnisocials). ' +
      'The app must also be publicly reachable (set FORGECAST_BASE_URL) so the publisher can fetch the media.\n\n' +
      'Error guidance: A 503 means no publisher is configured — set OMNISOCIALS_API_KEY on the Forgecast server. ' +
      'A 404 means the asset does not exist.',
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

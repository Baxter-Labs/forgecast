import type { Services } from './forgecast';
import type { ApiResult } from './api';
import { LOCAL_OWNER } from './auth-guard';
import {
  createProject, listProjects, generateImage, generateVideo, generateVoiceover,
  generateMontage, generateNarratedVideo, generateAdCopy, publishAsset,
  searchFootage, listAssets, getAsset, getJob,
} from './api';

/**
 * A hosted, per-user MCP endpoint: Claude / ChatGPT / Cursor connect by URL and drive
 * Forgecast with the AI the user already pays for. Implemented as plain JSON-RPC over
 * HTTP (MCP "Streamable HTTP", single-message, no server-initiated stream) so it runs
 * on the Cloudflare Worker with no SDK.
 *
 * Agent-centric design (see the mcp-builder guidelines):
 *  - Workflow tools over raw endpoints: the full create → generate → assemble → cast loop.
 *  - Limited-context output: list tools return concise, high-signal projections, not raw
 *    dumps, and every response is truncated to a token budget.
 *  - Actionable errors: `unwrap` surfaces the api layer's guidance messages (e.g. "montage
 *    not configured (set MONTAGE_WORKER_URL…)") straight to the agent as tool errors.
 *  - Per-user + ownership-guarded: every call runs on the token's user; project- and
 *    asset-scoped tools verify ownership, so a token never touches another user's work.
 */

const PROTOCOL_VERSION = '2024-11-05';
const MAX_TEXT = 12000;

export interface JsonRpcMessage {
  jsonrpc: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface McpReply { status: number; body: unknown }

type ToolCtx = { services: Services; userId: string };
type ToolHandler = (ctx: ToolCtx, args: Record<string, unknown>) => Promise<unknown>;
interface ToolAnnotations { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean }
interface McpTool { name: string; description: string; inputSchema: Record<string, unknown>; annotations: ToolAnnotations; handler: ToolHandler }

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const strArr = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined);

/** Surface the api layer's {status, body} as either the body (2xx) or an actionable throw. */
function unwrap(r: ApiResult): unknown {
  if (r.status >= 400) {
    const msg = (r.body as { error?: string })?.error ?? `request failed (HTTP ${r.status})`;
    throw new Error(msg);
  }
  return r.body;
}

/** Resolve a project the user owns, or throw (so a token can't act on others' projects). */
async function ownedProjectId(services: Services, userId: string, projectId: unknown): Promise<string> {
  const id = str(projectId);
  if (!id) throw new Error('projectId is required — call forgecast_list_projects or forgecast_create_project first');
  const project = await services.projects.get(id);
  if (!project || (project.ownerId ?? LOCAL_OWNER) !== userId) throw new Error(`project not found: ${id}`);
  return id;
}

/** Resolve an asset the user owns (via its project), or throw. Returns the asset row. */
async function ownedAsset(services: Services, userId: string, assetId: unknown): Promise<{ id: string; projectId: string; type: string; params?: Record<string, unknown> }> {
  const id = str(assetId);
  if (!id) throw new Error('assetId is required — call forgecast_list_assets to find one');
  const asset = await services.assets.get(id);
  if (!asset) throw new Error(`asset not found: ${id}`);
  const project = await services.projects.get(asset.projectId);
  if (!project || (project.ownerId ?? LOCAL_OWNER) !== userId) throw new Error(`asset not found: ${id}`);
  return asset as { id: string; projectId: string; type: string; params?: Record<string, unknown> };
}

const obj = (properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});

const P = {
  projectId: { type: 'string', description: 'A project id from forgecast_list_projects / forgecast_create_project.' },
  prompt: { type: 'string', description: 'What to generate, in natural language.' },
  aspectRatio: { type: 'string', enum: ['1:1', '16:9', '9:16', '4:3', '3:4'], description: 'Frame ratio (default 1:1 image / 9:16 video).' },
} as const;

const rawUrl = (assetId: string): string | undefined => {
  const base = process.env.FORGECAST_BASE_URL?.replace(/\/$/, '');
  return base ? `${base}/api/assets/${assetId}/raw` : undefined;
};

// Concise projections — high-signal fields only, so the agent's context isn't flooded.
const projectRow = (p: { id: string; name: string; createdAt: string }) => ({ id: p.id, name: p.name, createdAt: p.createdAt });
const assetRow = (a: { id: string; type: string; provider?: string; createdAt?: string; params?: { prompt?: string; text?: string } }) => ({
  id: a.id, type: a.type, provider: a.provider,
  ...(a.params?.prompt ? { prompt: a.params.prompt } : a.params?.text ? { text: a.params.text } : {}),
  url: rawUrl(a.id),
});

const TOOLS: McpTool[] = [
  {
    name: 'forgecast_health',
    description:
      'Report what Forgecast can do right now for the connected user: available generation providers per modality (image/video) and the social channels available for publishing. Call this FIRST to discover capabilities. Returns { ok, providers: { image[], video[] }, publishers[] }.',
    inputSchema: obj({}),
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async ({ services }) => ({
      ok: true,
      providers: { image: services.imageRegistry.available(), video: services.videoProviders },
      publishers: services.publishers.available(),
    }),
  },
  {
    name: 'forgecast_list_projects',
    description: 'List your Forgecast projects (concise: id, name, createdAt). Projects are the containers every asset and job belong to. Returns { projects[], count }.',
    inputSchema: obj({}),
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async ({ services, userId }) => {
      const body = unwrap(await listProjects(services, userId)) as { projects: Array<{ id: string; name: string; createdAt: string }> };
      return { projects: body.projects.map(projectRow), count: body.projects.length };
    },
  },
  {
    name: 'forgecast_create_project',
    description: 'Create a new Forgecast project to hold a campaign’s assets. Args: name (1–100 chars). Returns { project: { id, name, createdAt } }.',
    inputSchema: obj({ name: { type: 'string', description: 'Human-readable project name.' } }, ['name']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async ({ services, userId }, args) => unwrap(await createProject(services, { name: str(args.name) }, userId)),
  },
  {
    name: 'forgecast_generate_image',
    description:
      'Generate an image in a project (keyless by default via Cloudflare Workers AI; a fal model is used when the fal provider is active). Synchronous — returns the finished asset. Args: projectId, prompt, aspectRatio?. Returns { job, asset }.',
    inputSchema: obj({ projectId: P.projectId, prompt: P.prompt, aspectRatio: P.aspectRatio }, ['projectId', 'prompt']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async ({ services, userId }, args) => {
      const pid = await ownedProjectId(services, userId, args.projectId);
      // Forward only declared fields — never raw args (nothing validates args against the schema).
      return unwrap(await generateImage(services, pid, { prompt: str(args.prompt), aspectRatio: str(args.aspectRatio) }));
    },
  },
  {
    name: 'forgecast_generate_video',
    description:
      'Start a text-to-video generation in a project (keyless by default). ASYNC — returns a job at status "running"; poll forgecast_get_job with the returned job.id until status is "done", then read resultAssetId. Args: projectId, prompt, aspectRatio?, duration?.',
    inputSchema: obj({ projectId: P.projectId, prompt: P.prompt, aspectRatio: P.aspectRatio, duration: { type: 'number', description: 'Clip length in seconds.' } }, ['projectId', 'prompt']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async ({ services, userId }, args) => {
      const pid = await ownedProjectId(services, userId, args.projectId);
      // Text-to-video only: forward only declared fields so an injected imageAssetId/imageUrl
      // can't pull another user's asset as the i2v source frame.
      return unwrap(await generateVideo(services, pid, { prompt: str(args.prompt), aspectRatio: str(args.aspectRatio), duration: num(args.duration) }));
    },
  },
  {
    name: 'forgecast_generate_voiceover',
    description:
      'Generate a spoken voice-over (text-to-speech) in a project. ASYNC — poll forgecast_get_job. Args: projectId, text, voice? (a named voice; omit for the default). Returns a job. Requires a voice provider (503 with guidance otherwise).',
    inputSchema: obj({ projectId: P.projectId, text: { type: 'string', description: 'The words to speak.' }, voice: { type: 'string', description: 'Optional named voice.' } }, ['projectId', 'text']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async ({ services, userId }, args) => {
      const pid = await ownedProjectId(services, userId, args.projectId);
      return unwrap(await generateVoiceover(services, pid, { text: str(args.text), voice: str(args.voice) }));
    },
  },
  {
    name: 'forgecast_generate_montage',
    description:
      'Stitch several of the project’s existing video assets into one longer montage clip. ASYNC — poll forgecast_get_job. Args: projectId, assetIds (>=2 video asset ids from forgecast_list_assets), aspectRatio?. Requires montage configured (503 with guidance otherwise).',
    inputSchema: obj({ projectId: P.projectId, assetIds: { type: 'array', items: { type: 'string' }, minItems: 2, description: 'Two or more video asset ids to stitch, in order.' }, aspectRatio: P.aspectRatio }, ['projectId', 'assetIds']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async ({ services, userId }, args) => {
      const pid = await ownedProjectId(services, userId, args.projectId);
      const ids = Array.isArray(args.assetIds) ? args.assetIds.filter((x): x is string => typeof x === 'string') : [];
      for (const id of ids) await ownedAsset(services, userId, id); // every clip must belong to the caller
      return unwrap(await generateMontage(services, pid, { assetIds: ids, aspectRatio: args.aspectRatio }));
    },
  },
  {
    name: 'forgecast_narrate_video',
    description:
      'Add an AI voice-over onto an existing video asset (mux). ASYNC — poll forgecast_get_job. Args: projectId, videoAssetId (a video asset you own), text (script), voice?.',
    inputSchema: obj({ projectId: P.projectId, videoAssetId: { type: 'string', description: 'The video asset to narrate.' }, text: { type: 'string', description: 'The narration script.' }, voice: { type: 'string' } }, ['projectId', 'videoAssetId', 'text']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async ({ services, userId }, args) => {
      const pid = await ownedProjectId(services, userId, args.projectId);
      await ownedAsset(services, userId, args.videoAssetId);
      return unwrap(await generateNarratedVideo(services, pid, { videoAssetId: str(args.videoAssetId), text: str(args.text), voice: str(args.voice) }));
    },
  },
  {
    name: 'forgecast_generate_ad_copy',
    description:
      'Write platform-aware, character-limited, A/B-tagged ad copy for a brief. Synchronous. Args: projectId, brief, platform? (instagram|linkedin|x|facebook|tiktok|youtube|google, default instagram), count? (1–5, default 3). Returns { platform, label, limit, variants[] }. Requires an agent LLM key (503 with guidance otherwise).',
    inputSchema: obj({ projectId: P.projectId, brief: { type: 'string', description: 'What the ad is about.' }, platform: { type: 'string' }, count: { type: 'number' } }, ['projectId', 'brief']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async ({ services, userId }, args) => {
      const pid = await ownedProjectId(services, userId, args.projectId);
      return unwrap(await generateAdCopy(services, pid, { brief: str(args.brief), platform: str(args.platform), count: num(args.count) }));
    },
  },
  {
    name: 'forgecast_publish_asset',
    description:
      'Cross-post an asset (image/video) to social channels with a caption. This POSTS PUBLICLY on the connected accounts. Args: assetId (an asset you own), content (the caption), channels? (e.g. ["instagram","linkedin"]; from forgecast_health publishers), publisher? (default omnisocials). Returns { published }.',
    inputSchema: obj({ assetId: { type: 'string' }, content: { type: 'string', description: 'The caption/post text.' }, channels: { type: 'array', items: { type: 'string' } }, publisher: { type: 'string' } }, ['assetId', 'content']),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async ({ services, userId }, args) => {
      await ownedAsset(services, userId, args.assetId);
      return unwrap(await publishAsset(services, str(args.assetId)!, { content: str(args.content), channels: strArr(args.channels), publisher: str(args.publisher) }));
    },
  },
  {
    name: 'forgecast_search_footage',
    description:
      'Search real stock footage by topic (Pexels) to import into montages. Read-only. Args: query, perPage? (default 10), orientation? (landscape|portrait|square). Returns { clips[] } with preview + download urls. Requires PEXELS_API_KEY on the server (503 otherwise).',
    inputSchema: obj({ query: { type: 'string' }, perPage: { type: 'number' }, orientation: { type: 'string', enum: ['landscape', 'portrait', 'square'] } }, ['query']),
    annotations: { readOnlyHint: true, openWorldHint: true },
    handler: async ({ services }, args) => unwrap(await searchFootage(services, args)),
  },
  {
    name: 'forgecast_list_assets',
    description: 'List the generated assets in a project (concise: id, type, provider, prompt/text, url). Args: projectId. Returns { assets[], count }.',
    inputSchema: obj({ projectId: P.projectId }, ['projectId']),
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async ({ services, userId }, args) => {
      const pid = await ownedProjectId(services, userId, args.projectId);
      const body = unwrap(await listAssets(services, pid)) as { assets: Array<Parameters<typeof assetRow>[0]> };
      return { assets: body.assets.map(assetRow), count: body.assets.length };
    },
  },
  {
    name: 'forgecast_get_asset',
    description: 'Get one asset’s details plus a ready-to-use download url (`/api/assets/:id/raw`). Read-only. Args: assetId. Returns { asset, url }.',
    inputSchema: obj({ assetId: { type: 'string' } }, ['assetId']),
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async ({ services, userId }, args) => {
      const asset = await ownedAsset(services, userId, args.assetId);
      const body = unwrap(await getAsset(services, asset.id)) as { asset: unknown };
      return { asset: body.asset, url: rawUrl(asset.id) };
    },
  },
  {
    name: 'forgecast_get_job',
    description:
      'Check an async job’s status. Video / voice-over / montage / narrate jobs are asynchronous — poll this until status is "done" (then read resultAssetId) or "error" (read error). Read-only. Args: jobId. Returns the job.',
    inputSchema: obj({ jobId: { type: 'string' } }, ['jobId']),
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async ({ services, userId }, args) => {
      const job = await services.jobs.get(str(args.jobId) ?? '');
      if (!job) throw new Error(`job not found: ${str(args.jobId) ?? '(none)'}`);
      await ownedProjectId(services, userId, job.projectId); // ownership via the job's project
      return unwrap(await getJob(services, job.id));
    },
  },
];

const toolByName = new Map(TOOLS.map((t) => [t.name, t]));

/** Handle one JSON-RPC message. Returns null for notifications (no response is sent). */
export async function handleMcpMessage(ctx: ToolCtx, msg: JsonRpcMessage): Promise<McpReply | null> {
  const id = msg.id ?? null;
  const reply = (result: unknown): McpReply => ({ status: 200, body: { jsonrpc: '2.0', id, result } });
  const error = (code: number, message: string): McpReply => ({ status: 200, body: { jsonrpc: '2.0', id, error: { code, message } } });

  switch (msg.method) {
    case 'initialize':
      return reply({ protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'forgecast', version: '1.0.0' } });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations })) });
    case 'tools/call': {
      const name = str(msg.params?.name);
      const tool = name ? toolByName.get(name) : undefined;
      if (!tool) return error(-32602, `unknown tool: ${name ?? '(none)'}. Call tools/list for the available tools.`);
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const data = await tool.handler(ctx, args);
        const text = JSON.stringify(data, null, 2);
        return reply({ content: [{ type: 'text', text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n…[truncated — narrow the request]` : text }] });
      } catch (e) {
        return reply({ content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true });
      }
    }
    default:
      if (typeof msg.method === 'string' && msg.method.startsWith('notifications/')) return null;
      return error(-32601, `method not found: ${msg.method ?? '(none)'}`);
  }
}

/** Tool names, for docs + tests. */
export const MCP_TOOL_NAMES = TOOLS.map((t) => t.name);

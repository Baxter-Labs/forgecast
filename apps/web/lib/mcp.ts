import type { Services } from './forgecast';
import { LOCAL_OWNER } from './auth-guard';
import { createProject, listProjects, generateImage, generateVideo, listAssets, getJob } from './api';

/**
 * A hosted, per-user MCP endpoint: Claude / ChatGPT / Cursor connect by URL and drive
 * Forgecast with the AI the user already pays for. Implemented as plain JSON-RPC over
 * HTTP (MCP "Streamable HTTP", single-message, no server-initiated stream) so it runs
 * on the Cloudflare Worker with no SDK. Every call is scoped to the token's user, and
 * project-scoped tools enforce ownership — a token never touches another user's work.
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
interface McpTool { name: string; description: string; inputSchema: Record<string, unknown>; handler: ToolHandler }

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

/** Resolve a project the user owns, or throw (so a token can't act on others' projects). */
async function ownedProjectId(services: Services, userId: string, projectId: unknown): Promise<string> {
  const id = str(projectId);
  if (!id) throw new Error('projectId is required');
  const project = await services.projects.get(id);
  if (!project || (project.ownerId ?? LOCAL_OWNER) !== userId) throw new Error('project not found');
  return id;
}

const obj = (properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});

const TOOLS: McpTool[] = [
  {
    name: 'forgecast_health',
    description: 'What Forgecast can do right now: available generation providers (image/video) and publish channels. Call this first.',
    inputSchema: obj({}),
    handler: async ({ services }) => ({
      ok: true,
      providers: { image: services.imageRegistry.available(), video: services.videoProviders },
      publishers: services.publishers.available(),
    }),
  },
  {
    name: 'forgecast_list_projects',
    description: 'List your Forgecast projects (id, name, createdAt).',
    inputSchema: obj({}),
    handler: async ({ services, userId }) => (await listProjects(services, userId)).body,
  },
  {
    name: 'forgecast_create_project',
    description: 'Create a new Forgecast project. Args: name (1–100 chars).',
    inputSchema: obj({ name: { type: 'string', description: 'Project name' } }, ['name']),
    handler: async ({ services, userId }, args) => (await createProject(services, { name: str(args.name) }, userId)).body,
  },
  {
    name: 'forgecast_generate_image',
    description: 'Generate an image in a project (keyless by default). Args: projectId, prompt, aspectRatio?, provider?. Returns the finished asset synchronously.',
    inputSchema: obj(
      { projectId: { type: 'string' }, prompt: { type: 'string' }, aspectRatio: { type: 'string' }, provider: { type: 'string' } },
      ['projectId', 'prompt'],
    ),
    handler: async ({ services, userId }, args) => {
      const pid = await ownedProjectId(services, userId, args.projectId);
      return (await generateImage(services, pid, args)).body;
    },
  },
  {
    name: 'forgecast_generate_video',
    description: 'Start a video generation in a project (keyless by default). Args: projectId, prompt, aspectRatio?, duration?. Async — poll forgecast_get_job with the returned job id.',
    inputSchema: obj(
      { projectId: { type: 'string' }, prompt: { type: 'string' }, aspectRatio: { type: 'string' }, duration: { type: 'number' } },
      ['projectId', 'prompt'],
    ),
    handler: async ({ services, userId }, args) => {
      const pid = await ownedProjectId(services, userId, args.projectId);
      return (await generateVideo(services, pid, args)).body;
    },
  },
  {
    name: 'forgecast_list_assets',
    description: 'List the generated assets in a project. Args: projectId.',
    inputSchema: obj({ projectId: { type: 'string' } }, ['projectId']),
    handler: async ({ services, userId }, args) => {
      const pid = await ownedProjectId(services, userId, args.projectId);
      return (await listAssets(services, pid)).body;
    },
  },
  {
    name: 'forgecast_get_job',
    description: 'Check a job’s status (video/montage are async — poll until status is "done", then read resultAssetId). Args: jobId.',
    inputSchema: obj({ jobId: { type: 'string' } }, ['jobId']),
    handler: async ({ services, userId }, args) => {
      const job = await services.jobs.get(str(args.jobId) ?? '');
      if (!job) throw new Error('job not found');
      await ownedProjectId(services, userId, job.projectId); // ownership via the job's project
      return (await getJob(services, job.id)).body;
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
      return reply({ protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'forgecast', version: '0.1.0' } });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
    case 'tools/call': {
      const name = str(msg.params?.name);
      const tool = name ? toolByName.get(name) : undefined;
      if (!tool) return error(-32602, `unknown tool: ${name ?? '(none)'}`);
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const data = await tool.handler(ctx, args);
        const text = JSON.stringify(data, null, 2);
        return reply({ content: [{ type: 'text', text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n…[truncated]` : text }] });
      } catch (e) {
        return reply({ content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true });
      }
    }
    default:
      // Notifications (e.g. notifications/initialized) carry no id and expect no reply.
      if (typeof msg.method === 'string' && msg.method.startsWith('notifications/')) return null;
      return error(-32601, `method not found: ${msg.method ?? '(none)'}`);
  }
}

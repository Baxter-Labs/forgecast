export interface VoiceActions {
  createContent(args: { brief: string; platforms?: string[]; publish?: boolean }): Promise<string>;
  checkJob(args: { jobId: string }): Promise<string>;
  listProjects(): Promise<string>;
}

interface VapiToolCall { id?: string; toolCallId?: string; function?: { name?: string; arguments?: unknown } }
interface VapiPayload { message?: { toolCalls?: VapiToolCall[]; toolCallList?: VapiToolCall[] } }

export interface VapiToolResult { toolCallId: string; result: string }

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') { try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; } }
  return {};
}

async function dispatch(name: string, args: Record<string, unknown>, actions: VoiceActions): Promise<string> {
  switch (name) {
    case 'create_content':
      return actions.createContent({
        brief: typeof args.brief === 'string' ? args.brief : '',
        platforms: Array.isArray(args.platforms) ? args.platforms.filter((p): p is string => typeof p === 'string') : undefined,
        publish: typeof args.publish === 'boolean' ? args.publish : undefined,
      });
    case 'check_job':
      return actions.checkJob({ jobId: typeof args.jobId === 'string' ? args.jobId : String(args.jobId ?? '') });
    case 'list_projects':
      return actions.listProjects();
    default:
      return `Unknown tool: ${name}`;
  }
}

export async function handleVapiToolCalls(payload: VapiPayload, actions: VoiceActions): Promise<{ results: VapiToolResult[] }> {
  const calls = payload?.message?.toolCalls ?? payload?.message?.toolCallList ?? [];
  const results = await Promise.all(
    calls.map(async (c): Promise<VapiToolResult> => {
      const toolCallId = c.toolCallId ?? c.id ?? '';
      const name = c.function?.name ?? '';
      try {
        return { toolCallId, result: await dispatch(name, parseArgs(c.function?.arguments), actions) };
      } catch (e) {
        return { toolCallId, result: `Error: ${e instanceof Error ? e.message : String(e)}` };
      }
    }),
  );
  return { results };
}

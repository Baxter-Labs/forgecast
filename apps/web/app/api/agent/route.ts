import { NextResponse } from 'next/server';
import { ContentAgent, ToolCallingAgent, type ContentPlan } from '@forgecast/agent';
import { getServices, getServicesForUser } from '@/lib/forgecast';
import { requireUser, requireProject } from '@/lib/auth-guard';
import { guardText } from '@/lib/api';
import { makeForgecastActions } from '@/lib/agent/forgecast-actions';
import { makeLlmClient } from '@/lib/agent/llm';
import { resolveOwnerKeys } from '@/lib/keys';
import { maybeTrendTool } from '@/lib/agent/trends';

function msg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { mode?: string; brief?: string; platforms?: string[]; plan?: ContentPlan; projectId?: string; projectName?: string; publish?: boolean }
    | null;
  if (!body?.mode) return NextResponse.json({ error: 'mode is required (plan|execute)' }, { status: 400 });

  // Multi-tenancy: a session is required (when auth is enabled), and generating
  // into a project requires owning that project.
  const who = body.projectId
    ? await requireProject(getServices(), req.headers.get('cookie'), body.projectId)
    : await requireUser(getServices(), req.headers.get('cookie'));
  if (!who.ok) return NextResponse.json(who.body, { status: who.status });

  // BYO keys: run providers AND the agent brain on the owner's keys when set.
  const services = await getServicesForUser(who.userId);
  const ownKeys = await resolveOwnerKeys(services, who.userId);

  // Content guardrails — block a disallowed brief before the agent plans/produces anything.
  if (typeof body.brief === 'string' && body.brief.length > 0) {
    const blocked = guardText(body.brief);
    if (blocked) return NextResponse.json(blocked.body, { status: blocked.status });
  }

  const llm = makeLlmClient({ openaiKey: ownKeys.openai, anthropicKey: ownKeys.anthropic });
  const agent = new ContentAgent({ llm, forgecast: makeForgecastActions(services), trends: maybeTrendTool() });

  if (body.mode === 'plan') {
    if (!llm.isAvailable()) return NextResponse.json({ error: 'agent LLM not configured (set OPENAI_API_KEY; or FORGECAST_AGENT_LLM=anthropic with ANTHROPIC_API_KEY for Claude)' }, { status: 503 });
    if (typeof body.brief !== 'string' || body.brief.trim().length === 0) return NextResponse.json({ error: 'brief is required' }, { status: 400 });
    try {
      // Detect a URL/domain in the brief and pre-fetch website context to enrich planning.
      const urlMatch = body.brief.match(/\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[\S]*)?/i);
      let planBrief = body.brief;
      if (urlMatch) {
        try {
          const { summary } = await makeForgecastActions(services).readWebsite(urlMatch[0]);
          planBrief = `Website context:\n${summary}\n\nBrief: ${body.brief}`;
        } catch {
          // On error, proceed with the original brief unchanged.
        }
      }
      const plan = await agent.plan(planBrief, body.platforms ?? ['instagram']);
      return NextResponse.json({ plan });
    } catch (e) {
      return NextResponse.json({ error: `planning failed: ${msg(e)}` }, { status: 502 });
    }
  }

  if (body.mode === 'execute') {
    if (!body.plan) return NextResponse.json({ error: 'plan is required for execute' }, { status: 400 });
    try {
      const result = await agent.execute(body.plan, { projectId: body.projectId, projectName: body.projectName, publish: body.publish });
      return NextResponse.json({ result });
    } catch (e) {
      return NextResponse.json({ error: `execute failed: ${msg(e)}` }, { status: 502 });
    }
  }

  if (body.mode === 'agentic') {
    if (!llm.isAvailable() || !llm.chat) {
      return NextResponse.json({ error: 'agent LLM not configured (set OPENAI_API_KEY; or FORGECAST_AGENT_LLM=anthropic with ANTHROPIC_API_KEY for Claude)' }, { status: 503 });
    }
    if (typeof body.brief !== 'string' || body.brief.trim().length === 0) {
      return NextResponse.json({ error: 'brief is required' }, { status: 400 });
    }
    try {
      const toolAgent = new ToolCallingAgent({ llm, forgecast: makeForgecastActions(services), trends: maybeTrendTool() });
      const result = await toolAgent.run(body.brief, { projectId: body.projectId, platforms: body.platforms });
      return NextResponse.json({ result });
    } catch (e) {
      return NextResponse.json({ error: `agentic run failed: ${msg(e)}` }, { status: 502 });
    }
  }

  return NextResponse.json({ error: `unknown mode: ${body.mode}` }, { status: 400 });
}

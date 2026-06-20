import { NextResponse } from 'next/server';
import { ContentAgent, type ContentPlan } from '@forgecast/agent';
import { getServices } from '@/lib/forgecast';
import { makeForgecastActions } from '@/lib/agent/forgecast-actions';
import { OpenAiLlmClient } from '@/lib/agent/llm';

function msg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { mode?: string; brief?: string; platforms?: string[]; plan?: ContentPlan; projectName?: string; publish?: boolean }
    | null;
  if (!body?.mode) return NextResponse.json({ error: 'mode is required (plan|execute)' }, { status: 400 });

  const llm = new OpenAiLlmClient();
  const agent = new ContentAgent({ llm, forgecast: makeForgecastActions(getServices()) });

  if (body.mode === 'plan') {
    if (!llm.isAvailable()) return NextResponse.json({ error: 'agent LLM not configured (set OPENAI_API_KEY)' }, { status: 503 });
    if (typeof body.brief !== 'string' || body.brief.trim().length === 0) return NextResponse.json({ error: 'brief is required' }, { status: 400 });
    try {
      const plan = await agent.plan(body.brief, body.platforms ?? ['instagram']);
      return NextResponse.json({ plan });
    } catch (e) {
      return NextResponse.json({ error: `planning failed: ${msg(e)}` }, { status: 502 });
    }
  }

  if (body.mode === 'execute') {
    if (!body.plan) return NextResponse.json({ error: 'plan is required for execute' }, { status: 400 });
    try {
      const result = await agent.execute(body.plan, { projectName: body.projectName, publish: body.publish });
      return NextResponse.json({ result });
    } catch (e) {
      return NextResponse.json({ error: `execute failed: ${msg(e)}` }, { status: 502 });
    }
  }

  return NextResponse.json({ error: `unknown mode: ${body.mode}` }, { status: 400 });
}

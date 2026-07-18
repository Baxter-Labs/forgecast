import { NextResponse } from 'next/server';
import { getServices, getServicesForUser } from '@/lib/forgecast';
import { generateAdCopy } from '@/lib/api';
import { requireProject } from '@/lib/auth-guard';
import { resolveOwnerKeys } from '@/lib/keys';
import { makeLlmClient } from '@/lib/agent/llm';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const guard = await requireProject(getServices(), req.headers.get('cookie'), id);
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const services = await getServicesForUser(guard.userId);
  const ownKeys = await resolveOwnerKeys(services, guard.userId);
  const llm = makeLlmClient({ openaiKey: ownKeys.openai, anthropicKey: ownKeys.anthropic });
  const body = await req.json().catch(() => ({}));
  const r = await generateAdCopy(services, id, body, llm);
  return NextResponse.json(r.body, { status: r.status });
}

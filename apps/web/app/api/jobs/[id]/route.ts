import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { getJob } from '@/lib/api';
import { requireJob } from '@/lib/auth-guard';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const guard = await requireJob(getServices(), req.headers.get('cookie'), id);
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const r = await getJob(getServices(), id);
  return NextResponse.json(r.body, { status: r.status });
}

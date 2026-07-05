import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { publishAsset } from '@/lib/api';
import { requireAsset } from '@/lib/auth-guard';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const guard = await requireAsset(getServices(), req.headers.get('cookie'), id);
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const input = await req.json().catch(() => null);
  const r = await publishAsset(getServices(), id, input);
  return NextResponse.json(r.body, { status: r.status });
}

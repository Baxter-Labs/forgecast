import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { renderTimeline } from '@/lib/api';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const r = await renderTimeline(getServices(), id, body);
  return NextResponse.json(r.body, { status: r.status });
}

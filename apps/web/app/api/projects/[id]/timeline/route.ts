import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { readTimeline, saveTimeline } from '@/lib/api';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await readTimeline(getServices(), id);
  return NextResponse.json(r.body, { status: r.status });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const r = await saveTimeline(getServices(), id, body);
  return NextResponse.json(r.body, { status: r.status });
}

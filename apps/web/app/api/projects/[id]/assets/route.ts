import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { listAssets, clearAssets } from '@/lib/api';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await listAssets(getServices(), id);
  return NextResponse.json(r.body, { status: r.status });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await clearAssets(getServices(), id);
  return NextResponse.json(r.body, { status: r.status });
}

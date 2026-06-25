import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { getAsset } from '@/lib/api';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await getAsset(getServices(), id);
  return NextResponse.json(r.body, { status: r.status });
}

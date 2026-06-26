import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { generateVariations } from '@/lib/api';

export async function POST(req: Request, ctx: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { count?: number };
  const r = await generateVariations(getServices(), id, { assetId, count: body.count });
  return NextResponse.json(r.body, { status: r.status });
}

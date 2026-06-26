import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { editAsset } from '@/lib/api';

export async function POST(req: Request, ctx: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await ctx.params;
  const body = await req.json().catch(() => ({})) as { prompt?: unknown };
  const r = await editAsset(getServices(), id, { assetId, prompt: body.prompt });
  return NextResponse.json(r.body, { status: r.status });
}

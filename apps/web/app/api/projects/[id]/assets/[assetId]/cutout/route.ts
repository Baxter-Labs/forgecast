import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { removeBackgroundAsset } from '@/lib/api';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await ctx.params;
  const r = await removeBackgroundAsset(getServices(), id, { assetId });
  return NextResponse.json(r.body, { status: r.status });
}

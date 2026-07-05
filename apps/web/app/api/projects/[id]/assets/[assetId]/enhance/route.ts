import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { enhanceAsset } from '@/lib/api';
import { requireAsset } from '@/lib/auth-guard';

export async function POST(req: Request, ctx: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await ctx.params;
  const guard = await requireAsset(getServices(), req.headers.get('cookie'), assetId);
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const r = await enhanceAsset(getServices(), id, { assetId });
  return NextResponse.json(r.body, { status: r.status });
}

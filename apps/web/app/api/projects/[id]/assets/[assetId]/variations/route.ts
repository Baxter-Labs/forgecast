import { NextResponse } from 'next/server';
import { getServices, getServicesForUser } from '@/lib/forgecast';
import { generateVariations } from '@/lib/api';
import { requireAsset } from '@/lib/auth-guard';

export async function POST(req: Request, ctx: { params: Promise<{ id: string; assetId: string }> }) {
  const { id, assetId } = await ctx.params;
  const guard = await requireAsset(getServices(), req.headers.get('cookie'), assetId);
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const services = await getServicesForUser(guard.userId);
  const body = (await req.json().catch(() => ({}))) as { count?: number };
  const r = await generateVariations(services, id, { assetId, count: body.count });
  return NextResponse.json(r.body, { status: r.status });
}

import { NextResponse } from 'next/server';
import { getServices, getServicesForUser } from '@/lib/forgecast';
import { requireAsset } from '@/lib/auth-guard';
import { setAssetTags } from '@/lib/api';

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const guard = await requireAsset(getServices(), req.headers.get('cookie'), id);
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const services = await getServicesForUser(guard.userId);
  const input = await req.json().catch(() => null);
  const r = await setAssetTags(services, guard.userId, id, input);
  return NextResponse.json(r.body, { status: r.status });
}

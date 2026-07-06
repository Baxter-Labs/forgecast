import { NextResponse } from 'next/server';
import { getServices, getServicesForUser } from '@/lib/forgecast';
import { listAssets } from '@/lib/api';
import { requireProject } from '@/lib/auth-guard';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const guard = await requireProject(getServices(), req.headers.get('cookie'), id);
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const services = await getServicesForUser(guard.userId);
  const r = await listAssets(services, id);
  return NextResponse.json(r.body, { status: r.status });
}

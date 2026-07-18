import { NextResponse } from 'next/server';
import { getServices, getServicesForUser } from '@/lib/forgecast';
import { animateStoryboardShot } from '@/lib/api';
import { requireProject } from '@/lib/auth-guard';

export async function POST(req: Request, ctx: { params: Promise<{ id: string; shotId: string }> }) {
  const { id, shotId } = await ctx.params;
  const guard = await requireProject(getServices(), req.headers.get('cookie'), id);
  if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });
  const services = await getServicesForUser(guard.userId);
  const r = await animateStoryboardShot(services, id, { shotId });
  return NextResponse.json(r.body, { status: r.status });
}

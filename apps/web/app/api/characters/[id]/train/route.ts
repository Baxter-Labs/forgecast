import { NextResponse } from 'next/server';
import { getServices, getServicesForUser } from '@/lib/forgecast';
import { requireUser } from '@/lib/auth-guard';
import { trainCharacter } from '@/lib/api';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const who = await requireUser(getServices(), req.headers.get('cookie'));
  if (!who.ok) return NextResponse.json(who.body, { status: who.status });
  const services = await getServicesForUser(who.userId);
  const r = await trainCharacter(services, who.userId, id);
  return NextResponse.json(r.body, { status: r.status });
}

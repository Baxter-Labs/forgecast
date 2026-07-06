import { NextResponse } from 'next/server';
import { getServices, getServicesForUser } from '@/lib/forgecast';
import { requireUser } from '@/lib/auth-guard';
import { createProject, listProjects } from '@/lib/api';

export async function GET(req: Request) {
  const who = await requireUser(getServices(), req.headers.get('cookie'));
  if (!who.ok) return NextResponse.json(who.body, { status: who.status });
  const services = await getServicesForUser(who.userId);
  const r = await listProjects(services, who.userId);
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: Request) {
  const who = await requireUser(getServices(), req.headers.get('cookie'));
  if (!who.ok) return NextResponse.json(who.body, { status: who.status });
  const services = await getServicesForUser(who.userId);
  const input = await req.json().catch(() => null);
  const r = await createProject(services, input, who.userId);
  return NextResponse.json(r.body, { status: r.status });
}

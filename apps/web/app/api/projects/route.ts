import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { requireUser } from '@/lib/auth-guard';
import { createProject, listProjects } from '@/lib/api';

export async function GET(req: Request) {
  const who = await requireUser(getServices(), req.headers.get('cookie'));
  if (!who.ok) return NextResponse.json(who.body, { status: who.status });
  const r = await listProjects(getServices(), who.userId);
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: Request) {
  const who = await requireUser(getServices(), req.headers.get('cookie'));
  if (!who.ok) return NextResponse.json(who.body, { status: who.status });
  const input = await req.json().catch(() => null);
  const r = await createProject(getServices(), input, who.userId);
  return NextResponse.json(r.body, { status: r.status });
}

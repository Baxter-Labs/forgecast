import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { createProject, listProjects } from '@/lib/api';

export async function GET() {
  const r = await listProjects(getServices());
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: Request) {
  const input = await req.json().catch(() => null);
  const r = await createProject(getServices(), input);
  return NextResponse.json(r.body, { status: r.status });
}

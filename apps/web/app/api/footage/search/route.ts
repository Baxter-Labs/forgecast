import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { searchFootage } from '@/lib/api';
import { requireUser } from '@/lib/auth-guard';

export async function POST(req: Request) {
  const who = await requireUser(getServices(), req.headers.get('cookie'));
  if (!who.ok) return NextResponse.json(who.body, { status: who.status });
  const body = await req.json().catch(() => ({}));
  const r = await searchFootage(getServices(), body);
  return NextResponse.json(r.body, { status: r.status });
}

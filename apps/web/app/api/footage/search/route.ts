import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { searchFootage } from '@/lib/api';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await searchFootage(getServices(), body);
  return NextResponse.json(r.body, { status: r.status });
}

import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { getAdsInsights } from '@/lib/api';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await getAdsInsights(getServices(), body);
  return NextResponse.json(r.body, { status: r.status });
}

import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { generateFromWebsite } from '@/lib/api';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    url?: string; generate?: boolean; generateCount?: number; enhance?: boolean;
  };
  const r = await generateFromWebsite(getServices(), id, body);
  return NextResponse.json(r.body, { status: r.status });
}

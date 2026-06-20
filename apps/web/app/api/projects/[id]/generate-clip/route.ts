import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { generateVideo } from '@/lib/api';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const input = await req.json().catch(() => null);
  const r = await generateVideo(getServices(), id, input);
  return NextResponse.json(r.body, { status: r.status });
}

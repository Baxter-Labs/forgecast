import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { generateMontage } from '@/lib/api';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const input = await req.json().catch(() => null);
  const r = await generateMontage(getServices(), id, input);
  return NextResponse.json(r.body, { status: r.status });
}

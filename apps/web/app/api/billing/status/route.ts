import { NextResponse } from 'next/server';
import { isPro } from '@/lib/billing/entitlements';

export async function GET() {
  return NextResponse.json({ pro: isPro() });
}

import { NextResponse } from 'next/server';
import { getServices, getServicesForUser } from '@/lib/forgecast';
import { runAdsAudit } from '@/lib/api';
import { requireUser } from '@/lib/auth-guard';

export async function POST(req: Request) {
  const who = await requireUser(getServices(), req.headers.get('cookie'));
  if (!who.ok) return NextResponse.json(who.body, { status: who.status });
  const services = await getServicesForUser(who.userId);
  const body = await req.json().catch(() => ({}));
  const r = await runAdsAudit(services, body);
  return NextResponse.json(r.body, { status: r.status });
}

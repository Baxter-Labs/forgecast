import { NextResponse } from 'next/server';
import { getServices, invalidateUserServices } from '@/lib/forgecast';
import { requireUser } from '@/lib/auth-guard';
import { listKeyStatuses, setUserKey, clearUserKey } from '@/lib/keys';

/** BYO provider keys, managed from the Studio. Values never leave the server. */

export async function GET(req: Request) {
  const who = await requireUser(getServices(), req.headers.get('cookie'));
  if (!who.ok) return NextResponse.json(who.body, { status: who.status });
  const r = await listKeyStatuses(getServices(), who.userId);
  return NextResponse.json(r.body, { status: r.status });
}

export async function PUT(req: Request) {
  const who = await requireUser(getServices(), req.headers.get('cookie'));
  if (!who.ok) return NextResponse.json(who.body, { status: who.status });
  const input = await req.json().catch(() => null);
  const r = await setUserKey(getServices(), who.userId, input);
  if (r.status === 200) invalidateUserServices(who.userId);
  return NextResponse.json(r.body, { status: r.status });
}

export async function DELETE(req: Request) {
  const who = await requireUser(getServices(), req.headers.get('cookie'));
  if (!who.ok) return NextResponse.json(who.body, { status: who.status });
  const input = await req.json().catch(() => null);
  const r = await clearUserKey(getServices(), who.userId, input);
  if (r.status === 200) invalidateUserServices(who.userId);
  return NextResponse.json(r.body, { status: r.status });
}

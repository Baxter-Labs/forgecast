import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { requireAdmin } from '@/lib/auth-guard';
import { listUsersForAdmin } from '@/lib/admin';

// Admin-only: the full user list is PII, so this is gated to ADMIN_EMAILS
// (fail closed — no admins configured means no access).
export async function GET(req: Request) {
  const services = getServices();
  const who = await requireAdmin(services, req.headers.get('cookie'));
  if (!who.ok) return NextResponse.json(who.body, { status: who.status });
  const r = await listUsersForAdmin(services);
  return NextResponse.json(r.body, { status: r.status });
}

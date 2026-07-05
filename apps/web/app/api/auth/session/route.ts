import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { authConfig, sessionUser } from '@/lib/auth';

/** Who am I? `{ enabled, user }` — user is null when signed out or auth is off. */
export async function GET(req: Request) {
  const cfg = authConfig();
  const user = await sessionUser(getServices(), cfg, req.headers.get('cookie'));
  return NextResponse.json({ enabled: Boolean(cfg), user });
}

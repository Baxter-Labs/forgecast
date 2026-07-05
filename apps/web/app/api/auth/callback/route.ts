import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { authConfig, completeGoogleAuth, clearCookie, OAUTH_COOKIE } from '@/lib/auth';

/** Google redirects back here; on success a session cookie is issued. */
export async function GET(req: Request) {
  const cfg = authConfig();
  if (!cfg) return NextResponse.json({ error: 'auth not configured' }, { status: 503 });

  const result = await completeGoogleAuth(getServices(), cfg, new URL(req.url), req.headers.get('cookie'));
  const headers = new Headers();
  headers.append('set-cookie', clearCookie(OAUTH_COOKIE, '/api/auth'));

  if (!result.ok) {
    headers.set('location', `/signin?error=${encodeURIComponent(result.error)}`);
    return new NextResponse(null, { status: 302, headers });
  }
  headers.append('set-cookie', result.setCookie);
  headers.set('location', '/');
  return new NextResponse(null, { status: 302, headers });
}

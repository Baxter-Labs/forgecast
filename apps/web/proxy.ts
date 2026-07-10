import { NextResponse, type NextRequest } from 'next/server';
import { verifySession } from '@forgecast/core';
import { authConfig, SESSION_COOKIE } from '@/lib/auth';

/**
 * Edge auth gate for the app pages. When sign-in is enabled (the auth env vars
 * are set), an unauthenticated request to a protected page is redirected to
 * /signin BEFORE the page renders — no flash of protected UI, and the gate holds
 * even with JS disabled. In the open self-host mode (auth vars unset) this is a
 * no-op. API routes keep their own per-request guards; this only covers pages.
 *
 * verifySession is pure WebCrypto, so this runs on the Cloudflare Worker / edge.
 */
export async function proxy(req: NextRequest) {
  const cfg = authConfig();
  if (!cfg) return NextResponse.next(); // open mode — nothing to gate

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token, cfg.secret, Math.floor(Date.now() / 1000)) : null;
  if (session) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/signin';
  url.search = '';
  return NextResponse.redirect(url);
}

// Only the app pages. /signin, /api/*, and static assets are intentionally excluded.
export const config = {
  matcher: ['/', '/editor/:path*', '/edit/:path*'],
};

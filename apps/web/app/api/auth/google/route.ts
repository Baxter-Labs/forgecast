import { NextResponse } from 'next/server';
import { authConfig, startGoogleAuth } from '@/lib/auth';

/** Kicks off the Google sign-in (redirects to the consent screen). */
export async function GET() {
  const cfg = authConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: 'auth not configured (set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and AUTH_SECRET)' },
      { status: 503 },
    );
  }
  const { location, setCookie } = await startGoogleAuth(cfg);
  return new NextResponse(null, { status: 302, headers: { location, 'set-cookie': setCookie } });
}

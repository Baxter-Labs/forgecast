import { NextResponse } from 'next/server';
import { clearCookie, SESSION_COOKIE } from '@/lib/auth';

/** Signs out by clearing the session cookie (sessions are stateless). */
export async function POST() {
  return NextResponse.json({ ok: true }, { headers: { 'set-cookie': clearCookie(SESSION_COOKIE) } });
}

import { newUser, signSession, verifySession, type UserRecord } from '@forgecast/core';
import type { Services } from './forgecast';

/**
 * Hand-rolled Google OAuth (authorization-code + PKCE) and cookie sessions.
 * No auth SDK — raw injectable fetch like every other provider in the repo,
 * so the whole flow is offline-mock-testable.
 *
 * Env-gated: with GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / AUTH_SECRET unset
 * the platform stays the open single-operator tool it is today.
 */

export interface AuthConfig {
  clientId: string;
  clientSecret: string;
  /** HMAC key for session cookies (32+ random bytes recommended). */
  secret: string;
  /** Absolute origin used to build the OAuth redirect_uri. */
  baseUrl: string;
}

export const SESSION_COOKIE = 'fc_session';
export const OAUTH_COOKIE = 'fc_oauth';
export const SESSION_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export function authConfig(env: Record<string, string | undefined> = process.env): AuthConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const secret = env.AUTH_SECRET;
  if (!clientId || !clientSecret || !secret) return null;
  const baseUrl = (env.FORGECAST_BASE_URL ?? 'http://localhost:3210').replace(/\/+$/, '');
  return { clientId, clientSecret, secret, baseUrl };
}

// ── PKCE + state ──────────────────────────────────────────────────────────────

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return toBase64Url(buf);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return toBase64Url(new Uint8Array(digest));
}

export function redirectUri(cfg: AuthConfig): string {
  return `${cfg.baseUrl}/api/auth/callback`;
}

export function googleAuthUrl(cfg: AuthConfig, state: string, challenge: string): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri(cfg),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'online',
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

// ── Google exchanges (injectable fetch) ───────────────────────────────────────

export async function exchangeCode(fetchFn: typeof fetch, cfg: AuthConfig, code: string, verifier: string): Promise<string | null> {
  const res = await fetchFn(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri(cfg),
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }).toString(),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const body = (await res.json().catch(() => null)) as { access_token?: string } | null;
  return body?.access_token ?? null;
}

export interface GoogleProfile { email: string; name?: string; picture?: string }

export async function fetchGoogleUser(fetchFn: typeof fetch, accessToken: string): Promise<GoogleProfile | null> {
  const res = await fetchFn(GOOGLE_USERINFO_URL, { headers: { authorization: `Bearer ${accessToken}` } }).catch(() => null);
  if (!res || !res.ok) return null;
  const body = (await res.json().catch(() => null)) as { email?: string; name?: string; picture?: string } | null;
  if (!body?.email) return null;
  const profile: GoogleProfile = { email: body.email };
  if (body.name) profile.name = body.name;
  if (body.picture) profile.picture = body.picture;
  return profile;
}

// ── Cookies ───────────────────────────────────────────────────────────────────

export function cookieValue(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=') || null;
  }
  return null;
}

function secureFlag(cfg: AuthConfig): string {
  return cfg.baseUrl.startsWith('https://') ? '; Secure' : '';
}

export function sessionSetCookie(cfg: AuthConfig, token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SEC}${secureFlag(cfg)}`;
}

export function oauthSetCookie(cfg: AuthConfig, state: string, verifier: string): string {
  return `${OAUTH_COOKIE}=${state}.${verifier}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600${secureFlag(cfg)}`;
}

export function clearCookie(name: string, path = '/'): string {
  return `${name}=; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// ── Route orchestration (thin route handlers call these) ─────────────────────

export interface StartAuthResult { location: string; setCookie: string }

export async function startGoogleAuth(cfg: AuthConfig): Promise<StartAuthResult> {
  const state = randomToken(16);
  const verifier = randomToken(32);
  const challenge = await pkceChallenge(verifier);
  return { location: googleAuthUrl(cfg, state, challenge), setCookie: oauthSetCookie(cfg, state, verifier) };
}

export type CallbackResult =
  | { ok: true; user: UserRecord; setCookie: string }
  | { ok: false; error: string };

export async function completeGoogleAuth(
  services: Services,
  cfg: AuthConfig,
  url: URL,
  cookieHeader: string | null,
): Promise<CallbackResult> {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return { ok: false, error: 'missing code or state' };

  const stored = cookieValue(cookieHeader, OAUTH_COOKIE);
  const dot = stored?.indexOf('.') ?? -1;
  if (!stored || dot <= 0) return { ok: false, error: 'missing auth state — start again' };
  const storedState = stored.slice(0, dot);
  const verifier = stored.slice(dot + 1);
  if (storedState !== state) return { ok: false, error: 'state mismatch' };

  const accessToken = await exchangeCode(services.fetchFn, cfg, code, verifier);
  if (!accessToken) return { ok: false, error: 'code exchange failed' };

  const profile = await fetchGoogleUser(services.fetchFn, accessToken);
  if (!profile) return { ok: false, error: 'could not read the Google profile' };

  const fields: { email: string; name?: string; avatarUrl?: string } = { email: profile.email };
  if (profile.name) fields.name = profile.name;
  if (profile.picture) fields.avatarUrl = profile.picture;
  const user = await services.users.upsert(
    newUser(fields, { id: services.ids.randomId(), now: services.ids.nowIso() }),
  );

  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  const token = await signSession({ uid: user.id, exp }, cfg.secret);
  return { ok: true, user, setCookie: sessionSetCookie(cfg, token) };
}

/** The signed-in user for a request, or null (invalid/absent cookie or auth disabled). */
export async function sessionUser(services: Services, cfg: AuthConfig | null, cookieHeader: string | null): Promise<UserRecord | null> {
  if (!cfg) return null;
  const token = cookieValue(cookieHeader, SESSION_COOKIE);
  if (!token) return null;
  const payload = await verifySession(token, cfg.secret, Math.floor(Date.now() / 1000));
  if (!payload) return null;
  return services.users.get(payload.uid);
}

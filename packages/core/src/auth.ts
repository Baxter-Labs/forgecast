/**
 * Authentication primitives: the user record + repo contract, and stateless
 * HMAC-signed session tokens. Pure WebCrypto (no node imports) so the same
 * code runs on Node and Cloudflare Workers; I/O-free and fully unit-testable.
 */

export interface UserRecord {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface UserRepo {
  get(id: string): Promise<UserRecord | null>;
  getByEmail(email: string): Promise<UserRecord | null>;
  /** Insert, or refresh profile fields of the user with the same email (id/createdAt kept). */
  upsert(user: UserRecord): Promise<UserRecord>;
  /** All users, newest first — for operator/admin views. */
  list(): Promise<UserRecord[]>;
}

export function newUser(
  fields: { email: string; name?: string; avatarUrl?: string },
  deps: { id: string; now: string },
): UserRecord {
  const user: UserRecord = { id: deps.id, email: fields.email.toLowerCase(), createdAt: deps.now };
  if (fields.name) user.name = fields.name;
  if (fields.avatarUrl) user.avatarUrl = fields.avatarUrl;
  return user;
}

// ── Stateless session tokens ──────────────────────────────────────────────────
// token = base64url(JSON payload) + '.' + base64url(HMAC-SHA256(secret, payloadPart))

export interface SessionPayload {
  uid: string;
  /** Expiry, unix seconds. */
  exp: number;
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function hmacBase64Url(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return toBase64Url(new Uint8Array(sig));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  return `${body}.${await hmacBase64Url(secret, body)}`;
}

/** Returns the payload when the signature is valid and not expired; null otherwise. */
export async function verifySession(token: string, secret: string, nowSec: number): Promise<SessionPayload | null> {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacBase64Url(secret, body);
  if (!constantTimeEqual(sig, expected)) return null;
  const raw = fromBase64Url(body);
  if (!raw) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(raw)) as SessionPayload;
    if (typeof payload.uid !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp <= nowSec) return null;
    return payload;
  } catch {
    return null;
  }
}
